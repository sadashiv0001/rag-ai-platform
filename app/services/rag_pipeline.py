import logging
import time
from uuid import uuid4
from app.utils.chunking import chunk_text
from app.services.embedding_service import get_embeddings
from app.services.vector_store import VectorStore
from app.services.llm_service import generate_answer, generate_answer_stream
from app.services.cache_service import get_cached_answer, set_cached_answer

logger = logging.getLogger(__name__)
vector_store = VectorStore()

def _build_metadata(chunks, doc_id):
    return [
        {
            "doc_id": doc_id,
            "chunk_id": f"{doc_id}-{idx}",
            "text": chunk,
        }
        for idx, chunk in enumerate(chunks)
    ]


def ingest_document(text, doc_id=None):
    if not text or not text.strip():
        logger.warning("Empty document ignored during ingestion.")
        return None

    doc_id = doc_id or str(uuid4())
    chunks = chunk_text(text)
    embeddings = get_embeddings(chunks)
    metadata = _build_metadata(chunks, doc_id)
    vector_store.add(embeddings, metadata)
    logger.info("Ingested document %s with %s chunks.", doc_id, len(chunks))
    return doc_id


def ingest_documents(texts):
    doc_ids = []
    for text in texts:
        doc_id = ingest_document(text)
        if doc_id:
            doc_ids.append(doc_id)
    return doc_ids


def _build_sources(relevant_items):
    sources = []
    for item in relevant_items:
        sources.append(
            {
                "doc_id": item.get("doc_id"),
                "chunk_id": item.get("chunk_id"),
                "preview": (item.get("text") or item.get("content") or "")[:240],
            }
        )
    return sources


def query_rag(query, use_cache=True, return_cache=False, include_sources=False):
    if not query or not query.strip():
        if include_sources:
            empty = {"answer": "Please provide a question to ask.", "sources": []}
            return (empty, False) if return_cache else empty
        return ("Please provide a question to ask.", False) if return_cache else "Please provide a question to ask."

    cached_answer = get_cached_answer(query) if use_cache else None
    if cached_answer is not None:
        logger.info("Cache hit for query: %s", query)
        if include_sources:
            payload = {"answer": cached_answer, "sources": [], "cache_hit": True}
            return (payload, True) if return_cache else payload
        return (cached_answer, True) if return_cache else cached_answer

    query_embedding = get_embeddings([query])[0]
    relevant_items = vector_store.search(query_embedding)

    if not relevant_items:
        logger.info("No relevant content for query: %s", query)
        if include_sources:
            payload = {"answer": "No relevant content found. Please ingest a document first.", "sources": []}
            return (payload, False) if return_cache else payload
        return ("No relevant content found. Please ingest a document first.", False) if return_cache else "No relevant content found. Please ingest a document first."

    context = "\n\n".join([(item.get("text") or item.get("content") or "") for item in relevant_items])
    answer = generate_answer(context, query)

    if use_cache:
        set_cached_answer(query, answer)

    logger.info("Query processed; retrieved %s chunks.", len(relevant_items))
    if include_sources:
        payload = {"answer": answer, "sources": _build_sources(relevant_items), "cache_hit": False}
        return (payload, False) if return_cache else payload
    return (answer, False) if return_cache else answer


def query_rag_stream(query):
    if not query or not query.strip():
        yield "Please provide a question to ask."
        return

    query_embedding = get_embeddings([query])[0]
    relevant_items = vector_store.search(query_embedding)

    if not relevant_items:
        yield "No relevant content found. Please ingest a document first."
        return

    context = "\n\n".join([item["text"] for item in relevant_items])
    yield from generate_answer_stream(context, query)


def evaluate_queries(items):
    results = []
    total_time = 0.0
    cache_hits = 0
    quality_score = 0.0

    for item in items:
        question = item.get("question", "").strip()
        expected_answer = item.get("expected_answer")
        if not question:
            continue

        start_time = time.perf_counter()
        answer, cache_hit = query_rag(question, use_cache=True, return_cache=True)
        elapsed = time.perf_counter() - start_time
        total_time += elapsed
        cache_hits += 1 if cache_hit else 0

        match_score = 0.0
        if expected_answer:
            match_score = 1.0 if expected_answer.lower() in answer.lower() else 0.0
            quality_score += match_score

        results.append(
            {
                "question": question,
                "answer": answer,
                "cache_hit": cache_hit,
                "latency_seconds": round(elapsed, 3),
                "expected_match": match_score,
            }
        )

    count = len(results)
    summary = {
        "total_queries": count,
        "cache_hits": cache_hits,
        "cache_hit_rate": round(cache_hits / count, 3) if count else 0.0,
        "average_latency_seconds": round(total_time / count, 3) if count else 0.0,
        "average_expected_match": round(quality_score / count, 3) if count else 0.0,
    }

    return {"summary": summary, "details": results}
