import base64
from typing import Any, Dict, Optional

import httpx


def _basic_auth_header(email: str, api_token: str) -> str:
    raw = f"{email}:{api_token}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("utf-8")


async def create_issue(
    *,
    base_url: str,
    email: str,
    api_token: str,
    project_key: str,
    summary: str,
    description: str,
    issue_type: str = "Task",
) -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/rest/api/3/issue"
    headers = {
        "Authorization": _basic_auth_header(email, api_token),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description or ""}],
                    }
                ],
            },
            "issuetype": {"name": issue_type},
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        return r.json()


async def search_issues(
    *,
    base_url: str,
    email: str,
    api_token: str,
    jql: str,
    max_results: int = 20,
) -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/rest/api/3/search"
    headers = {
        "Authorization": _basic_auth_header(email, api_token),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "jql": jql,
        "maxResults": max_results,
        "fields": ["summary", "status", "assignee", "created", "updated"],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        return r.json()

