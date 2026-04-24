import logging
from openai import OpenAI
from app.config import OPENAI_API_KEY, LLM_MODEL

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

def build_prompt(context, query):
    return f"""
Answer the question using the context below.

Context:
{context}

Question:
{query}
"""


def generate_answer(context, query):
    prompt = build_prompt(context, query)
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    return response.choices[0].message.content


def generate_answer_stream(context, query):
    prompt = build_prompt(context, query)
    try:
        with client.chat.completions.stream(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        ) as stream:
            for event in stream:
                delta = getattr(event, "delta", None) or {}
                event_type = getattr(event, "type", "")
                if event_type == "response.delta":
                    content = delta.get("content", "")
                    if content:
                        yield content
                elif event_type == "response.error":
                    error = getattr(event, "error", "")
                    yield f"[error] {error}\n"
    except Exception as exc:
        logger.exception("Streaming generation failed: %s", exc)
        yield f"Streaming failed: {exc}\n"
