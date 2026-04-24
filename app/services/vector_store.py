import faiss
import numpy as np
import logging
from app.config import VECTOR_DIM

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self, dim=VECTOR_DIM):
        self.index = faiss.IndexFlatL2(dim)
        self.items = []

    def add(self, embeddings, metadata):
        if len(embeddings) != len(metadata):
            logger.warning("Embedding count does not match metadata count.")

        self.index.add(np.array(embeddings).astype("float32"))
        self.items.extend(metadata)

    def search(self, query_embedding, k=3):
        if self.index.ntotal == 0:
            return []

        k = min(k, self.index.ntotal)
        D, I = self.index.search(
            np.array([query_embedding]).astype("float32"), k
        )

        return [self.items[i] for i in I[0] if i != -1]
