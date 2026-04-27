import { getApiBase } from "./api";

async function postJson(path, body) {
  const r = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function jiraCreateIssue(req) {
  return await postJson("/integrations/jira/issue", req);
}

export async function jiraSearch(req) {
  return await postJson("/integrations/jira/search", req);
}

export async function slackWebhook(req) {
  return await postJson("/integrations/slack/webhook", req);
}

