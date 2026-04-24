from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)

def get_embeddings(texts):
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts
    )
    return [r.embedding for r in response.data]