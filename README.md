# rag-ai-platform

A Dockerized Retrieval-Augmented Generation (RAG) platform built with FastAPI, OpenAI embeddings, PostgreSQL + pgvector, Redis caching, and an isolated frontend. Supports PDF, Excel, CSV, PLT, and text uploads with chat session memory.

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
- `sample_data/sample.txt` - sample document for upload testing

## Setup

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Set your OpenAI API key and database URL in `.env`:

   ```text
   OPENAI_API_KEY=your_openai_api_key_here
   DATABASE_URL=postgresql://rag_user:rag_password@localhost:5432/rag_db
   ```

3. Create and activate a Python virtual environment, then install dependencies:

   ```bash
   python3.10 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. Use the provided sample file to test ingestion:

   ```bash
   cat sample_data/sample.txt
   ```

   Upload `sample_data/sample.txt` using the frontend upload panel.

4. Run the API locally:

   ```bash
   source venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Or run using Docker Compose (recommended):

   ```bash
   docker compose up --build
   ```

6. Open your browser to `http://localhost:3000` for the ChatGPT-like frontend.

7. The backend is available at `http://localhost:8000`.

## Endpoints

- Web interface: `http://localhost:3000`
- Upload a single document: `POST /upload`
- Upload multiple documents: `POST /ingest`
- Query the RAG service: `GET /query?q=your+question`
- Stream a long-form response: `GET /query?q=your+question&stream=true`
- Create chat session: `POST /chat/session`
- Get chat history: `GET /chat/history/{session_id}`
- Chat query with history: `POST /chat/query?session_id={id}&q=your+question`
- Run an evaluation hook: `POST /evaluate`

## Supported File Types

- **PDF**: Text extraction from PDF documents
- **Excel**: Text extraction from .xlsx and .xls files
- **CSV**: Text extraction from .csv files
- **PLT**: Text extraction from .plt files
- **Text**: Plain text files (.txt)

## Production Features

- RAG-based architecture with persistent vector storage (PostgreSQL + pgvector)
- Chat history and session management
- Vector search (pgvector)
- Redis caching (low latency)
- Dockerized deployment with isolated frontend
- Streaming support
- Modular microservice design
- ChatGPT-like web interface
- Multi-format document ingestion

## Performance Optimizations

- Query caching (Redis)
- Efficient chunking
- Token optimization

## Notes

- Document ingestion splits text into chunks and stores embeddings in PostgreSQL with pgvector.
- Chat history is persisted in PostgreSQL for session continuity.
- Redis is used for query caching and low-latency repeat responses.
- Streaming responses are supported via the `/query?stream=true` endpoint.
- The web interface at `http://localhost:3000` provides a ChatGPT-like experience with chat history.
- Restarting the app preserves documents and chat history in PostgreSQL.
- If you encounter "AI service unavailable" messages, it means the OpenAI API quota is exceeded. Please check your API key and billing, or use a different key.
