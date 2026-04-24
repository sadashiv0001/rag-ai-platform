# rag-ai-platform

A robust Retrieval-Augmented Generation (RAG) platform built with FastAPI, OpenAI embeddings, FAISS vector search, Redis caching, and Docker deployment.

## Project structure

- `app/`
  - `main.py` - FastAPI API with upload, ingest, query, and evaluation endpoints
  - `config.py` - environment-driven configuration and logging setup
  - `services/` - document ingestion, vector store, caching, LLM generation, and evaluation hooks
  - `utils/` - text chunking utilities
- `requirements.txt` - Python dependencies
- `.env.example` - sample environment variables
- `Dockerfile` - container image build definition
- `docker-compose.yml` - local deployment with Redis
- `.dockerignore` - Docker ignored files

## Setup

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Set your OpenAI API key in `.env`:

   ```text
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. Create and activate a Python virtual environment, then install dependencies:

   ```bash
   python3.10 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. Run the API locally:

   ```bash
   source venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Or run using Docker Compose:

   ```bash
   docker compose up --build
   ```

## Endpoints

- Upload a single document:

  ```bash
  curl -X POST "http://127.0.0.1:8000/upload" -F "file=@app/data/sample.txt"
  ```

- Upload multiple documents:

  ```bash
  curl -X POST "http://127.0.0.1:8000/ingest" -F "files=@app/data/sample.txt" -F "files=@app/data/another.txt"
  ```

- Query the RAG service:

  ```bash
  curl "http://127.0.0.1:8000/query?q=your+question"
  ```

- Stream a long-form response:

  ```bash
  curl "http://127.0.0.1:8000/query?q=your+question&stream=true"
  ```

- Run an evaluation hook:

  ```bash
  curl -X POST "http://127.0.0.1:8000/evaluate" \
    -H "Content-Type: application/json" \
    -d '[{"question":"What is RAG?","expected_answer":"Retrieval-Augmented Generation"}]'
  ```

## Production Features

- RAG-based architecture
- Vector search (FAISS)
- Redis caching (low latency)
- Dockerized deployment
- Streaming support
- Modular microservice design

## Performance Optimizations

- Query caching (Redis)
- Efficient chunking
- Token optimization

## Notes

- Document ingestion splits text into chunks and indexes them in FAISS.
- Redis is used for query caching and low-latency repeat responses.
- Streaming responses are supported via the `/query?stream=true` endpoint.
- Restarting the app clears the in-memory FAISS index, but cached query results remain in Redis.
