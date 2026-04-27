import asyncio
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text

from app.config import LOG_LEVEL, OPENAI_API_KEY
from app.models import SessionLocal
from app.services.cache_service import redis_client
from app.services.chat_service import create_session, add_message, get_chat_history
from app.services.embedding_service import _has_openai_key as openai_key_ok
from app.services.events import (
    EventType,
    emit,
    get_event_stats,
    init_event_tables,
    list_events,
    list_webhooks,
    register_webhook,
    delete_webhook,
    retry_dlq_events,
    run_dispatcher,
)
from app.services.file_processor import process_file
from app.services.integrations.jira import (
    create_issue as jira_create_issue,
    search_issues as jira_search_issues,
)
from app.services.integrations.slack import post_webhook as slack_post_webhook
from app.services.rag_pipeline import (
    evaluate_queries,
    ingest_document,
    ingest_documents,
    query_rag,
    query_rag_stream,
)

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("rag_ai_platform")

app = FastAPI(title="rag-ai-platform", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    init_event_tables()
    asyncio.create_task(run_dispatcher(interval_seconds=5.0))
    logger.info("RAG AI Platform v2 started.")


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class EvaluationItem(BaseModel):
    question: str
    expected_answer: Optional[str] = None


class JiraCreateIssueRequest(BaseModel):
    base_url: str
    email: str
    api_token: str
    project_key: str
    summary: str
    description: str = ""
    issue_type: str = "Task"


class JiraSearchRequest(BaseModel):
    base_url: str
    email: str
    api_token: str
    jql: str
    max_results: int = 20


class SlackWebhookRequest(BaseModel):
    webhook_url: str
    text: str


class WebhookRegisterRequest(BaseModel):
    url: str
    event_types: List[str] = []
    secret: Optional[str] = None


class EmitEventRequest(BaseModel):
    event_type: str
    payload: dict = {}


# ---------------------------------------------------------------------------
# Core (fallback home kept minimal; React app serves at :3000)
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def home():
    return "<html><body><h2>RAG AI Platform API is running. Open the frontend at port 3000.</h2></body></html>"


# ---------------------------------------------------------------------------
# Document ingestion
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), doc_id: Optional[str] = None):
    content = await file.read()
    text = process_file(content, file.filename)
    if not text:
        return {"error": "Failed to process file or unsupported format"}
    document_id = ingest_document(text, doc_id=doc_id)
    emit(EventType.DOCUMENT_INGESTED, {"doc_id": document_id, "filename": file.filename})
    logger.info("Uploaded document %s via /upload", document_id)
    return {"message": "Document processed successfully", "doc_id": document_id}


@app.post("/ingest")
async def ingest_files(files: List[UploadFile] = File(...)):
    documents = []
    failed_files = []
    filenames = []
    for file in files:
        content = await file.read()
        text = process_file(content, file.filename)
        if text:
            documents.append(text)
            filenames.append(file.filename)
        else:
            failed_files.append(file.filename)

    doc_ids = ingest_documents(documents)
    emit(EventType.UPLOAD_COMPLETED, {"doc_ids": doc_ids, "filenames": filenames, "failed": failed_files})
    logger.info("Ingestion complete: %s files, %s failed", len(doc_ids), len(failed_files))
    return {
        "message": "Documents processed successfully",
        "doc_ids": doc_ids,
        "failed_files": failed_files,
    }


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

@app.get("/query")
def ask_question(q: str, stream: bool = False):
    if stream:
        return StreamingResponse(query_rag_stream(q), media_type="text/plain")
    payload = query_rag(q, include_sources=True)
    return payload


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@app.post("/chat/session")
def create_chat_session():
    session_id = create_session()
    return {"session_id": session_id}


@app.get("/chat/history/{session_id}")
def get_history(session_id: str):
    history = get_chat_history(session_id)
    return {"history": history}


@app.api_route("/chat/query", methods=["GET", "POST"])
def chat_query(session_id: str, q: str, stream: bool = False):
    add_message(session_id, "user", q)
    emit(EventType.CHAT_MESSAGE, {"session_id": session_id, "role": "user", "content": q})

    if stream:
        def stream_with_save():
            full_answer = ""
            for chunk in query_rag_stream(q):
                full_answer += chunk
                yield chunk
            add_message(session_id, "assistant", full_answer)
            emit(EventType.CHAT_RESPONSE, {"session_id": session_id, "role": "assistant", "content": full_answer})
        return StreamingResponse(stream_with_save(), media_type="text/plain")

    payload = query_rag(q, include_sources=True)
    add_message(session_id, "assistant", payload.get("answer"))
    emit(EventType.CHAT_RESPONSE, {"session_id": session_id, "role": "assistant", "content": payload.get("answer")})
    return payload


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@app.post("/evaluate")
def evaluate(queries: List[EvaluationItem]):
    logger.info("Running evaluation for %s queries", len(queries))
    return evaluate_queries([q.dict() for q in queries])


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    db_ok = False
    redis_ok = False
    openai_configured = openai_key_ok()

    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Health DB check failed: %s", exc)

    try:
        redis_client.ping()
        redis_ok = True
    except Exception as exc:
        logger.warning("Health Redis check failed: %s", exc)

    if not db_ok:
        emit(EventType.HEALTH_DEGRADED, {"check": "database", "ok": False})

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "checks": {
            "database": db_ok,
            "redis": redis_ok,
            "openai_configured": openai_configured,
            "fallback_mode": not openai_configured,
        },
    }


# ---------------------------------------------------------------------------
# Integrations – Jira / Slack
# ---------------------------------------------------------------------------

@app.post("/integrations/jira/issue")
async def integrations_jira_create_issue(req: JiraCreateIssueRequest):
    try:
        result = await jira_create_issue(
            base_url=req.base_url,
            email=req.email,
            api_token=req.api_token,
            project_key=req.project_key,
            summary=req.summary,
            description=req.description,
            issue_type=req.issue_type,
        )
        emit(EventType.JIRA_ISSUE_CREATED, {"key": result.get("key"), "summary": req.summary})
        return {"ok": True, "result": result}
    except Exception as exc:
        logger.exception("Jira create issue failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/integrations/jira/search")
async def integrations_jira_search(req: JiraSearchRequest):
    try:
        result = await jira_search_issues(
            base_url=req.base_url,
            email=req.email,
            api_token=req.api_token,
            jql=req.jql,
            max_results=req.max_results,
        )
        return {"ok": True, "result": result}
    except Exception as exc:
        logger.exception("Jira search failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/integrations/slack/webhook")
async def integrations_slack_webhook(req: SlackWebhookRequest):
    try:
        result = await slack_post_webhook(webhook_url=req.webhook_url, text=req.text)
        emit(EventType.SLACK_NOTIFIED, {"text": req.text[:200]})
        return {"ok": True, "result": result}
    except Exception as exc:
        logger.exception("Slack webhook failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Events API (producer + monitoring)
# ---------------------------------------------------------------------------

@app.post("/events/emit")
def events_emit(req: EmitEventRequest):
    event_id = emit(req.event_type, req.payload)
    return {"event_id": event_id}


@app.get("/events")
def events_list(limit: int = 50, status: Optional[str] = None, dlq: Optional[bool] = None):
    return {"events": list_events(limit=limit, status=status, dlq=dlq)}


@app.get("/events/stats")
def events_stats():
    return get_event_stats()


@app.post("/events/dlq/retry")
def events_dlq_retry():
    count = retry_dlq_events()
    return {"retried": count}


# ---------------------------------------------------------------------------
# Webhook registry
# ---------------------------------------------------------------------------

@app.post("/webhooks")
def webhooks_register(req: WebhookRegisterRequest):
    wid = register_webhook(url=req.url, event_types=req.event_types, secret=req.secret)
    return {"id": wid, "ok": True}


@app.get("/webhooks")
def webhooks_list():
    return {"webhooks": list_webhooks()}


@app.delete("/webhooks/{webhook_id}")
def webhooks_delete(webhook_id: int):
    delete_webhook(webhook_id)
    return {"ok": True}
