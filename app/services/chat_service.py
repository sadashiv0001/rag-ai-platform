import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import ChatSession, ChatMessage, SessionLocal
from uuid import uuid4

logger = logging.getLogger(__name__)

def create_session(session_id=None):
    db: Session = SessionLocal()
    try:
        session_id = session_id or str(uuid4())
        session = ChatSession(session_id=session_id, created_at=datetime.utcnow())
        db.add(session)
        db.commit()
        return session_id
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        db.rollback()
        return None
    finally:
        db.close()

def add_message(session_id, role, content):
    db: Session = SessionLocal()
    try:
        session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if not session:
            session_id = create_session(session_id)
            session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()

        message = ChatMessage(
            session_id=session.id,
            role=role,
            content=content,
            created_at=datetime.utcnow()
        )
        db.add(message)
        db.commit()
    except Exception as e:
        logger.error(f"Error adding message: {e}")
        db.rollback()
    finally:
        db.close()

def get_chat_history(session_id):
    db: Session = SessionLocal()
    try:
        session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if not session:
            return []

        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at).all()
        return [{"role": msg.role, "content": msg.content, "timestamp": msg.created_at.isoformat()} for msg in messages]
    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        return []
    finally:
        db.close()