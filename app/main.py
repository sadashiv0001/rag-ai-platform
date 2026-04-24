from fastapi import FastAPI, UploadFile, File
from app.services.rag_pipeline import ingest_document, query_rag

app = FastAPI()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode("utf-8")

    ingest_document(text)
    return {"message": "Document processed successfully"}

@app.get("/query")
def ask_question(q: str):
    response = query_rag(q)
    return {"answer": response}