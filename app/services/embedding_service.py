import logging
import numpy as np
from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL, VECTOR_DIM

logger = logging.getLogger(__name__)


def _has_openai_key() -> bool:
    return bool(OPENAI_API_KEY and OPENAI_API_KEY.strip() and OPENAI_API_KEY != "your_openai_api_key_here")


def get_embeddings(texts):
    if not _has_openai_key():
        logger.warning("OpenAI key not configured — using deterministic dummy embeddings.")
        # Deterministic hash-based embeddings so the same text always maps to the same vector
        result = []
        for text in texts:
            seed = abs(hash(text or "")) % (2**31)
            rng = np.random.default_rng(seed)
            result.append(rng.random(VECTOR_DIM).tolist())
        return result

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts,
        )
        return [r.embedding for r in response.data]
    except Exception as exc:
        logger.warning("OpenAI embeddings failed: %s. Using dummy embeddings.", exc)
        return [np.random.rand(VECTOR_DIM).tolist() for _ in texts]
