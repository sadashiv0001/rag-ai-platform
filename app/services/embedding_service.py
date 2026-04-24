import logging
import numpy as np
from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL, VECTOR_DIM

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

def get_embeddings(texts):
    try:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts
        )
        return [r.embedding for r in response.data]
    except Exception as exc:
        logger.warning("OpenAI embeddings failed: %s. Using dummy embeddings.", exc)
        # Return dummy embeddings for testing
        return [np.random.rand(VECTOR_DIM).tolist() for _ in texts]