# rag-ai-platform

Retrieval-Augmented Generation (RAG) service built with FastAPI, OpenAI embeddings, and an in-memory FAISS vector store.

## Project structure

- `app/`
  - `main.py` - FastAPI application exposing upload and query endpoints
  - `config.py` - environment configuration
  - `services/` - document ingestion, embedding, vector store, and LLM query logic
  - `utils/` - helper functions for text chunking
- `requirements.txt` - Python dependencies
- `.env.example` - sample environment variables
- `.gitignore` - ignores virtual environment and temporary files

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Set your OpenAI key in `.env`:

   ```text
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. Create or reuse a virtual environment and install dependencies:

   ```bash
   python3.10 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. Run the API:

   ```bash
   source venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Usage

- Upload a text document:

  ```bash
  curl -X POST "http://127.0.0.1:8000/upload" -F "file=@app/data/sample.txt"
  ```

- Ask a question:

  ```bash
  curl "http://127.0.0.1:8000/query?q=your+question"
  ```

## Notes

- Uploaded documents are split into chunks and stored in memory for similarity search.
- This implementation is intended for development and demo use.
- Restarting the app clears the in-memory vector store.

## Dependencies

- `fastapi`
- `uvicorn`
- `openai`
- `faiss-cpu`
- `tiktoken`
- `python-dotenv`
- `pydantic`
- `numpy`
- `python-multipart`
