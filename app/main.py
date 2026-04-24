import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from app.services.rag_pipeline import (
    ingest_document,
    ingest_documents,
    query_rag,
    query_rag_stream,
    evaluate_queries,
)
from app.services.file_processor import process_file
from app.config import LOG_LEVEL

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("rag_ai_platform")
app = FastAPI(title="rag-ai-platform")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


class EvaluationItem(BaseModel):
    question: str
    expected_answer: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/upload")
async def upload_file(file: UploadFile = File(...), doc_id: Optional[str] = None):
    content = await file.read()
    text = process_file(content, file.filename)
    if not text:
        return {"error": "Failed to process file or unsupported format"}

    document_id = ingest_document(text, doc_id=doc_id)
    logger.info("Uploaded document %s via /upload", document_id)
    return {"message": "Document processed successfully", "doc_id": document_id}


@app.post("/ingest")
async def ingest_files(files: List[UploadFile] = File(...)):
    documents = []
    for file in files:
        content = await file.read()
        text = process_file(content, file.filename)
        if text:
            documents.append(text)

    doc_ids = ingest_documents(documents)
    logger.info("Multipart document ingestion complete: %s files", len(doc_ids))
    return {"message": "Documents processed successfully", "doc_ids": doc_ids}


@app.get("/query")
def ask_question(q: str, stream: bool = False):
    if stream:
        return StreamingResponse(query_rag_stream(q), media_type="text/plain")

    answer = query_rag(q)
    return {"answer": answer}


@app.post("/evaluate")
def evaluate(queries: List[EvaluationItem]):
    logger.info("Running evaluation hook for %s questions", len(queries))
    return evaluate_queries([query.dict() for query in queries])

