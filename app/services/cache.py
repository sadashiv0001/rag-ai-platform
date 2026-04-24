import redis
import hashlib

r = redis.Redis(host='localhost', port=6379, db=0)

def get_cache_key(query):
    return hashlib.md5(query.encode()).hexdigest()

def get_cached_response(query):
    key = get_cache_key(query)
    return r.get(key)

def set_cached_response(query, response):
    key = get_cache_key(query)
    r.setex(key, 3600, response)  # cache 1 hour