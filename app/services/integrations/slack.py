from typing import Any, Dict

import httpx


async def post_webhook(*, webhook_url: str, text: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(webhook_url, json={"text": text})
        r.raise_for_status()
        # Slack webhooks return "ok" plain text typically
        return {"ok": True, "response_text": r.text}

