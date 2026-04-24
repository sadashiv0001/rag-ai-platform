import logging
from sqlalchemy.orm import Session
from app.models import Document, SessionLocal
from app.config import VECTOR_DIM
import json

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self):
        pass

    def add(self, embeddings, metadata):
        db: Session = SessionLocal()
        try:
            for emb, meta in zip(embeddings, metadata):
                doc = Document(
                    content=meta.get("content", ""),
                    metadata=json.dumps(meta),
                    embedding=emb
                )
                db.add(doc)
            db.commit()
        except Exception as e:
            logger.error(f"Error adding to vector store: {e}")
            db.rollback()
        finally:
            db.close()

    def search(self, query_embedding, k=3):
        db: Session = SessionLocal()
        try:
            # Use cosine similarity or L2 distance
            results = db.query(Document).order_by(Document.embedding.cosine_distance(query_embedding)).limit(k).all()
            return [{"content": doc.content, **json.loads(doc.metadata)} for doc in results]
        except Exception as e:
            logger.error(f"Error searching vector store: {e}")
            return []
        finally:
            db.close()
