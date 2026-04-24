import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
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
from app.services.chat_service import create_session, add_message, get_chat_history
from app.config import LOG_LEVEL

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("rag_ai_platform")
app = FastAPI(title="rag-ai-platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")


class EvaluationItem(BaseModel):
    question: str
    expected_answer: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
def home():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG AI Platform</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .upload-section { margin-bottom: 20px; }
        .chat-section { margin-top: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background-color: #e3f2fd; }
        .bot { background-color: #f5f5f5; }
        #chat-messages { height: 400px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; }
        input[type="text"] { width: 70%; padding: 10px; }
        button { padding: 10px 20px; margin-left: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>RAG AI Platform</h1>

        <div class="upload-section">
            <h2>Upload Documents</h2>
            <input type="file" id="file-input" multiple accept=".pdf,.xlsx,.xls,.csv,.plt,.txt">
            <button onclick="uploadFiles()">Upload</button>
            <p id="upload-status"></p>
        </div>

        <div class="chat-section">
            <h2>Chat</h2>
            <div id="chat-messages"></div>
            <input type="text" id="message-input" placeholder="Ask a question..." onkeypress="handleKeyPress(event)">
            <button onclick="sendMessage()">Send</button>
            <button onclick="clearChat()">Clear Chat</button>
        </div>
    </div>

    <script>
        async function uploadFiles() {
            const files = document.getElementById('file-input').files;
            if (files.length === 0) {
                alert('Please select files to upload.');
                return;
            }

            const formData = new FormData();
            for (let file of files) {
                formData.append('files', file);
            }

            try {
                const response = await fetch('/ingest', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                document.getElementById('upload-status').textContent = `Uploaded ${result.doc_ids.length} documents successfully.`;
            } catch (error) {
                document.getElementById('upload-status').textContent = 'Upload failed: ' + error.message;
            }
        }

        async function sendMessage() {
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            if (!message) return;

            addMessage('user', message);
            input.value = '';

            try {
                const response = await fetch(`/query?q=${encodeURIComponent(message)}`);
                const result = await response.json();
                addMessage('bot', result.answer);
            } catch (error) {
                addMessage('bot', 'Error: ' + error.message);
            }
        }

        function addMessage(sender, text) {
            const messages = document.getElementById('chat-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}`;
            messageDiv.textContent = text;
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }

        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        function clearChat() {
            document.getElementById('chat-messages').innerHTML = '';
        }
    </script>
</body>
</html>
"""


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


@app.post("/chat/session")
def create_chat_session():
    session_id = create_session()
    return {"session_id": session_id}


@app.get("/chat/history/{session_id}")
def get_history(session_id: str):
    history = get_chat_history(session_id)
    return {"history": history}


@app.post("/chat/query")
def chat_query(session_id: str, q: str, stream: bool = False):
    add_message(session_id, "user", q)
    
    if stream:
        def stream_with_save():
            full_answer = ""
            for chunk in query_rag_stream(q):
                full_answer += chunk
                yield chunk
            add_message(session_id, "assistant", full_answer)
        return StreamingResponse(stream_with_save(), media_type="text/plain")

    answer = query_rag(q)
    add_message(session_id, "assistant", answer)
    return {"answer": answer}

