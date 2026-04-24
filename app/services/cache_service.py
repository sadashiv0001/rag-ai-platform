import logging
from redis import Redis
from app.config import REDIS_URL, QUERY_CACHE_TTL

logger = logging.getLogger(__name__)
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)


def get_cached_answer(query):
    if not query:
        return None
    key = f"query_cache:{query.strip().lower()}"
    try:
        return redis_client.get(key)
    except Exception as exc:
        logger.warning("Redis unavailable for get_cached_answer: %s", exc)
        return None


def set_cached_answer(query, answer):
    if not query or answer is None:
        return
    key = f"query_cache:{query.strip().lower()}"
    try:
        redis_client.set(key, answer, ex=QUERY_CACHE_TTL)
    except Exception as exc:
        logger.warning("Redis unavailable for set_cached_answer: %s", exc)
