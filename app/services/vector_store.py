import faiss
import numpy as np

class VectorStore:
    def __init__(self, dim=1536):
        self.index = faiss.IndexFlatL2(dim)
        self.texts = []

    def add(self, embeddings, texts):
        self.index.add(np.array(embeddings).astype("float32"))
        self.texts.extend(texts)

    def search(self, query_embedding, k=3):
        if self.index.ntotal == 0:
            return []

        k = min(k, self.index.ntotal)
        D, I = self.index.search(
            np.array([query_embedding]).astype("float32"), k
        )

        return [self.texts[i] for i in I[0] if i != -1]
