"""
Event system: producer, in-process delivery queue, async webhook dispatcher,
retry logic, dead-letter queue, and monitoring helpers.

Design:
- Events are written to the `events` table (Postgres) immediately.
- A background asyncio task drains pending events and POSTs them to registered
  webhook endpoints.
- Failed deliveries are retried up to MAX_RETRIES with exponential backoff.
- Events that exhaust retries are moved to the dead-letter queue (dlq=True flag).
"""
import asyncio
import json
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models (separate Base so we don't collide with app.models)
# ---------------------------------------------------------------------------

EventBase = declarative_base()


class EventRecord(EventBase):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, unique=True, index=True, nullable=False)
    event_type = Column(String, nullable=False, index=True)
    payload_json = Column(Text, nullable=False)
    status = Column(String, default="pending", index=True)  # pending | delivered | failed | dlq
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    error = Column(Text, nullable=True)
    dlq = Column(Boolean, default=False, index=True)


class WebhookEndpoint(EventBase):
    __tablename__ = "webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False)
    event_types_json = Column(Text, default="[]")  # JSON list; empty = all types
    secret = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False)


_engine = create_engine(DATABASE_URL)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

MAX_RETRIES = 5
BASE_BACKOFF_SECONDS = 2


# ---------------------------------------------------------------------------
# DB init (called on startup)
# ---------------------------------------------------------------------------

def init_event_tables():
    try:
        EventBase.metadata.create_all(bind=_engine)
        logger.info("Event tables ready.")
    except Exception as exc:
        logger.error("Could not create event tables: %s", exc)


# ---------------------------------------------------------------------------
# Event types
# ---------------------------------------------------------------------------

class EventType(str, Enum):
    DOCUMENT_INGESTED = "document.ingested"
    CHAT_MESSAGE = "chat.message"
    CHAT_RESPONSE = "chat.response"
    UPLOAD_COMPLETED = "upload.completed"
    JIRA_ISSUE_CREATED = "jira.issue.created"
    SLACK_NOTIFIED = "slack.notified"
    HEALTH_DEGRADED = "system.health_degraded"
    CUSTOM = "custom"


# ---------------------------------------------------------------------------
# Produce / emit
# ---------------------------------------------------------------------------

def emit(event_type: str, payload: Dict[str, Any]) -> str:
    """Write a new event to the DB. Returns the event_id."""
    event_id = str(uuid4())
    now = datetime.utcnow()
    db = _Session()
    try:
        record = EventRecord(
            event_id=event_id,
            event_type=event_type,
            payload_json=json.dumps(payload),
            status="pending",
            attempts=0,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.commit()
        logger.debug("Event emitted: %s (%s)", event_id, event_type)
    except Exception as exc:
        logger.error("Failed to emit event %s: %s", event_id, exc)
        db.rollback()
    finally:
        db.close()
    return event_id


# ---------------------------------------------------------------------------
# Webhook registration
# ---------------------------------------------------------------------------

def register_webhook(url: str, event_types: Optional[List[str]] = None, secret: Optional[str] = None) -> int:
    db = _Session()
    try:
        ep = WebhookEndpoint(
            url=url,
            event_types_json=json.dumps(event_types or []),
            secret=secret,
            active=True,
            created_at=datetime.utcnow(),
        )
        db.add(ep)
        db.commit()
        db.refresh(ep)
        logger.info("Registered webhook %s (id=%s)", url, ep.id)
        return ep.id
    except Exception as exc:
        db.rollback()
        logger.error("Failed to register webhook: %s", exc)
        raise
    finally:
        db.close()


def list_webhooks() -> List[Dict]:
    db = _Session()
    try:
        rows = db.query(WebhookEndpoint).filter(WebhookEndpoint.active == True).all()
        return [
            {
                "id": r.id,
                "url": r.url,
                "event_types": json.loads(r.event_types_json or "[]"),
                "active": r.active,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    finally:
        db.close()


def delete_webhook(webhook_id: int):
    db = _Session()
    try:
        ep = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == webhook_id).first()
        if ep:
            ep.active = False
            db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------

async def _deliver_to_endpoint(event: EventRecord, endpoint: WebhookEndpoint) -> bool:
    headers = {"Content-Type": "application/json", "X-Event-Type": event.event_type, "X-Event-ID": event.event_id}
    if endpoint.secret:
        headers["X-Webhook-Secret"] = endpoint.secret
    body = {
        "event_id": event.event_id,
        "event_type": event.event_type,
        "payload": json.loads(event.payload_json),
        "timestamp": event.created_at.isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(endpoint.url, json=body, headers=headers)
            r.raise_for_status()
            return True
    except Exception as exc:
        logger.warning("Webhook delivery failed to %s: %s", endpoint.url, exc)
        return False


async def _process_event(record: EventRecord):
    db = _Session()
    try:
        endpoints = (
            db.query(WebhookEndpoint)
            .filter(WebhookEndpoint.active == True)
            .all()
        )
        # Filter endpoints that subscribe to this event type
        applicable = []
        for ep in endpoints:
            types = json.loads(ep.event_types_json or "[]")
            if not types or record.event_type in types:
                applicable.append(ep)

        if not applicable:
            record.status = "delivered"
            record.updated_at = datetime.utcnow()
            db.merge(record)
            db.commit()
            return

        success = all([await _deliver_to_endpoint(record, ep) for ep in applicable])

        record.attempts = (record.attempts or 0) + 1
        record.updated_at = datetime.utcnow()

        if success:
            record.status = "delivered"
        elif record.attempts >= MAX_RETRIES:
            record.status = "dlq"
            record.dlq = True
            logger.error("Event %s moved to DLQ after %s attempts.", record.event_id, record.attempts)
        else:
            record.status = "pending"  # will be retried

        db.merge(record)
        db.commit()
    except Exception as exc:
        logger.exception("Error processing event %s: %s", record.event_id, exc)
        db.rollback()
    finally:
        db.close()


async def run_dispatcher(interval_seconds: float = 5.0):
    """Background task: drain pending events continuously."""
    logger.info("Event dispatcher started (interval=%ss).", interval_seconds)
    while True:
        try:
            db = _Session()
            try:
                pending = (
                    db.query(EventRecord)
                    .filter(EventRecord.status == "pending", EventRecord.dlq == False)
                    .order_by(EventRecord.created_at)
                    .limit(50)
                    .all()
                )
            finally:
                db.close()

            for record in pending:
                await _process_event(record)

        except Exception as exc:
            logger.exception("Dispatcher loop error: %s", exc)

        await asyncio.sleep(interval_seconds)


# ---------------------------------------------------------------------------
# Monitoring helpers
# ---------------------------------------------------------------------------

def get_event_stats() -> Dict[str, Any]:
    db = _Session()
    try:
        from sqlalchemy import func
        rows = db.query(EventRecord.status, func.count(EventRecord.id)).group_by(EventRecord.status).all()
        stats = {r[0]: r[1] for r in rows}
        dlq_count = db.query(EventRecord).filter(EventRecord.dlq == True).count()
        return {"by_status": stats, "dlq_count": dlq_count}
    finally:
        db.close()


def list_events(limit: int = 50, status: Optional[str] = None, dlq: Optional[bool] = None) -> List[Dict]:
    db = _Session()
    try:
        q = db.query(EventRecord)
        if status:
            q = q.filter(EventRecord.status == status)
        if dlq is not None:
            q = q.filter(EventRecord.dlq == dlq)
        rows = q.order_by(EventRecord.created_at.desc()).limit(limit).all()
        return [
            {
                "event_id": r.event_id,
                "event_type": r.event_type,
                "status": r.status,
                "attempts": r.attempts,
                "dlq": r.dlq,
                "error": r.error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    finally:
        db.close()


def retry_dlq_events():
    """Reset DLQ events back to pending so they'll be retried."""
    db = _Session()
    try:
        rows = db.query(EventRecord).filter(EventRecord.dlq == True, EventRecord.status == "dlq").all()
        count = 0
        for r in rows:
            r.dlq = False
            r.status = "pending"
            r.attempts = 0
            r.updated_at = datetime.utcnow()
            count += 1
        db.commit()
        logger.info("Retried %s DLQ events.", count)
        return count
    finally:
        db.close()
