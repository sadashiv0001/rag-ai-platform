# rag-ai-platform (v2)

A Dockerized Retrieval-Augmented Generation (RAG) platform built with **FastAPI**, **OpenAI embeddings**, **PostgreSQL + pgvector**, **Redis caching**, and a lightweight **portfolio + live demo frontend**.

This repo is designed to be both:
- a **public skills showcase** (landing page with skills/projects/links), and
- a **real, runnable RAG product demo** (upload docs → chat with retrieval + session memory).

## Screenshots (add yours)
- Landing page: `frontend/` (Home)
- Live demo: `frontend/` (Demo chat)

## Project structure

- `app/`
  - `main.py` - FastAPI API with upload, ingest, query, chat, and evaluation endpoints
  - `config.py` - environment-driven configuration and logging setup
  - `services/` - document ingestion, vector store, caching, LLM generation, file processing, and evaluation hooks
  - `utils/` - text chunking utilities
  - `templates/` - HTML templates for web interface
  - `static/` - static files for web interface
- `frontend/`
  - React (Vite) app for **ChatGPT-like** UX (sidebar chats, streaming, tasks)
  - `public/profile.json` - your portfolio content (skills/projects/links)
  - `public/runtime-config.js` - runtime API base configuration for hosted deployments
- `requirements.txt` - Python dependencies
- `.env.example` - sample environment variables
- `Dockerfile` - container image build definition
- `docker-compose.yml` - local deployment with Redis
- `.dockerignore` - Docker ignored files
- `sample_data/sample.txt` - sample document for upload testing

## What this showcases (skills)
- **Backend/API**: FastAPI endpoints, streaming, session persistence, health checks
- **RAG**: chunking + embeddings + vector search (pgvector)
- **Infra**: Docker Compose stack, Redis cache, database migrations
- **Frontend**: product-like demo UX (upload status, streaming toggle, sources)

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

4. Use the provided sample file to test ingestion:

   ```bash
   cat sample_data/sample.txt
   ```

   Upload `sample_data/sample.txt` using the frontend upload panel.

5. Run the API locally:

   ```bash
   source venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

6. Or run using Docker Compose (recommended):

   ```bash
   docker compose up --build
   ```

7. Open your browser to `http://localhost:3000` for the portfolio + live demo frontend.

8. The backend is available at `http://localhost:8000`.

## Endpoints

- Web interface: `http://localhost:3000`
- Upload a single document: `POST /upload`
- Upload multiple documents: `POST /ingest`
- Query the RAG service: `GET /query?q=your+question`
- Stream a long-form response: `GET /query?q=your+question&stream=true`
- Create chat session: `POST /chat/session`
- Get chat history: `GET /chat/history/{session_id}`
- Chat query with history (returns `answer` + `sources`): `POST /chat/query?session_id={id}&q=your+question`
- Stream chat answer (text stream): `GET /chat/query?session_id={id}&q=your+question&stream=true`
- Health check: `GET /health`
- Jira create issue: `POST /integrations/jira/issue`
- Jira search issues: `POST /integrations/jira/search`
- Slack webhook: `POST /integrations/slack/webhook`
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
- Portfolio landing + ChatGPT-like demo interface
- Multi-format document ingestion

## Performance Optimizations

- Query caching (Redis)
- Efficient chunking
- Token optimization

## Frontend config (API base)
The UI reads the API base from `frontend/public/runtime-config.js` (runtime-configurable), which sets:

```js
window.__RAG__ = window.__RAG__ || { apiBase: "http://localhost:8000" };
```

For hosted deployments, override `frontend/public/runtime-config.js` to point at your public API domain.

## Customize the public portfolio
Edit:
- `frontend/public/profile.json` (name, tagline, skills, featured projects, links)

## Jira + Slack tasks (ChatGPT-like “Tasks” panel)
The demo includes a **Tasks** tab (in the chat UI) that can:
- create a Jira issue (Task)
- pull issues via JQL
- optionally notify Slack via an incoming webhook when a Jira task is created

### Configure (in the UI)
Open the demo, go to **Settings → Integrations** and fill:
- **Jira**: Base URL, Email, API token, Project key
- **Slack**: Incoming webhook URL (optional)

Security note: this demo stores credentials in your browser (localStorage) for convenience. For production, use server-side secrets and OAuth.

## Hosted deployment (recommended pattern)
One simple production approach:
- **Frontend**: host `frontend/` on a static host (or run the included Nginx container)
- **API**: host the FastAPI container (Render/Fly.io/etc.)
- **DB**: managed Postgres with pgvector
- **Redis**: managed Redis (optional; app degrades gracefully if Redis is unavailable)

Then set `window.__RAG__.apiBase` in `frontend/public/runtime-config.js` to your API URL (or bake it into the deployment).

## Notes

- Document ingestion splits text into chunks and stores embeddings in PostgreSQL with pgvector.
- Chat history is persisted in PostgreSQL for session continuity.
- Redis is used for query caching and low-latency repeat responses.
- Streaming responses are supported via the `/query?stream=true` endpoint.
- The web interface at `http://localhost:3000` provides a portfolio landing + ChatGPT-like demo experience.
- Restarting the app preserves documents and chat history in PostgreSQL.
- If you encounter "AI service unavailable" messages, it means the OpenAI API quota is exceeded. Please check your API key and billing, or use a different key.
