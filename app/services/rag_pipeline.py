from app.utils.chunking import chunk_text
from app.services.embedding_service import get_embeddings
from app.services.vector_store import VectorStore
from app.services.llm_service import generate_answer

vector_store = VectorStore()

def ingest_document(text):
    chunks = chunk_text(text)
    embeddings = get_embeddings(chunks)
    vector_store.add(embeddings, chunks)

def query_rag(query):
    if not query or not query.strip():
        return "Please provide a question to ask."

    query_embedding = get_embeddings([query])[0]
    relevant_chunks = vector_store.search(query_embedding)

    if not relevant_chunks:
        return "No relevant content found. Please ingest a document first."

    context = "\n".join(relevant_chunks)
    answer = generate_answer(context, query)

    return answer
