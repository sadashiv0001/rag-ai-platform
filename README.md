# rag-ai-platform

A robust Retrieval-Augmented Generation (RAG) platform built with FastAPI, OpenAI embeddings, FAISS vector search, Redis caching, and Docker deployment. Supports PDF, Excel, audio transcription, and web-based chat interface.

## Project structure

- `app/`
  - `main.py` - FastAPI API with upload, ingest, query, and evaluation endpoints
  - `config.py` - environment-driven configuration and logging setup
  - `services/` - document ingestion, vector store, caching, LLM generation, file processing, and evaluation hooks
  - `utils/` - text chunking utilities
  - `templates/` - HTML templates for web interface
  - `static/` - static files for web interface
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

6. Open your browser to `http://localhost:8000` for the web interface.

## Endpoints

- Web interface: `GET /`
- Upload a single document: `POST /upload`
- Upload multiple documents: `POST /ingest`
- Query the RAG service: `GET /query?q=your+question`
- Stream a long-form response: `GET /query?q=your+question&stream=true`
- Run an evaluation hook: `POST /evaluate`

## Supported File Types

- **PDF**: Text extraction from PDF documents
- **Excel**: Text extraction from .xlsx and .xls files
- **Audio**: Transcription using OpenAI Whisper (.mp3, .wav, .m4a, .flac)
- **Text**: Plain text files (.txt)

## Production Features

- RAG-based architecture
- Vector search (FAISS)
- Redis caching (low latency)
- Dockerized deployment
- Streaming support
- Modular microservice design
- Web-based chat interface
- Multi-format document ingestion
- Audio transcription

## Performance Optimizations

- Query caching (Redis)
- Efficient chunking
- Token optimization

## Notes

- Document ingestion splits text into chunks and indexes them in FAISS.
- Redis is used for query caching and low-latency repeat responses.
- Streaming responses are supported via the `/query?stream=true` endpoint.
- The web interface allows easy file uploads and chatting.
- Restarting the app clears the in-memory FAISS index, but cached query results remain in Redis.
