import logging
import random
from openai import OpenAI
from app.config import OPENAI_API_KEY, LLM_MODEL

logger = logging.getLogger(__name__)

_GREETINGS = {"hi", "hello", "hey", "howdy", "yo", "sup"}
_THANKS = {"thanks", "thank you", "thx", "ty", "cheers"}
_HOW_ARE_YOU = {"how are you", "how r u", "how are you doing"}

_FALLBACK_TIPS = [
    "Try uploading a PDF, CSV, or Excel file — I can answer questions about its content once ingested.",
    "I can summarise, compare, or extract data from the documents you upload.",
    "Supported file formats: PDF, Excel (.xlsx/.xls), CSV, PLT, and plain-text (.txt).",
    "Ask me anything about your uploaded documents — I search the most relevant chunks for you.",
    "Tip: upload multiple files at once using the Upload button and I'll have context from all of them.",
]


def _rule_based_fallback(query: str, context: str) -> str:
    """
    Simple rule-based fallback used when OpenAI is unavailable.
    Returns a helpful reply without hitting any external API.
    """
    q = query.strip().lower().rstrip("?!.")

    if q in _GREETINGS:
        return "Hey! I'm the RAG AI assistant. I can answer questions about the documents you've uploaded. Try uploading a file first!"

    if q in _THANKS:
        return "You're welcome! Let me know if you have any more questions about your documents."

    if q in _HOW_ARE_YOU:
        return "I'm doing great, thanks for asking! Ready to help you explore your documents."

    if any(kw in q for kw in ["what can you do", "help", "capabilities", "features"]):
        return (
            "I'm a Retrieval-Augmented Generation (RAG) assistant. "
            "Upload a PDF, CSV, Excel, or TXT file and ask me anything about it. "
            "I retrieve the most relevant passages and craft an answer. "
            "You can also create Jira tasks and send Slack notifications from the Tasks panel."
        )

    if context.strip():
        # We have retrieved context but no LLM — summarise simply
        first_chunk = context[:600].strip().replace("\n", " ")
        tip = random.choice(_FALLBACK_TIPS)
        return (
            "[Offline fallback - OpenAI unavailable]\n\n"
            "Here is the most relevant excerpt from your documents:\n\n"
            f'"{first_chunk}..."\n\n'
            f"Tip: {tip}"
        )

    tip = random.choice(_FALLBACK_TIPS)
    return (
        "[Offline fallback - OpenAI unavailable]\n\n"
        f'I couldn\'t find relevant content for "{query}". '
        "Make sure you've uploaded a document first.\n\n"
        f"Tip: {tip}"
    )


def _has_openai_key() -> bool:
    return bool(OPENAI_API_KEY and OPENAI_API_KEY.strip() and OPENAI_API_KEY != "your_openai_api_key_here")


def _get_client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY)


def build_prompt(context, query):
    return f"""Answer the question using the context below.

Context:
{context}

Question:
{query}
"""


def generate_answer(context, query):
    if not _has_openai_key():
        logger.info("OpenAI key not configured — using rule-based fallback.")
        return _rule_based_fallback(query, context)

    prompt = build_prompt(context, query)
    try:
        response = _get_client().chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        return response.choices[0].message.content
    except Exception as exc:
        logger.warning("OpenAI LLM failed: %s. Using rule-based fallback.", exc)
        return _rule_based_fallback(query, context)


def generate_answer_stream(context, query):
    if not _has_openai_key():
        logger.info("OpenAI key not configured — streaming rule-based fallback.")
        yield _rule_based_fallback(query, context)
        return

    prompt = build_prompt(context, query)
    try:
        response = _get_client().chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            stream=True,
        )
        for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content
    except Exception as exc:
        logger.exception("Streaming generation failed: %s", exc)
        yield _rule_based_fallback(query, context)
