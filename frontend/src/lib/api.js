import { getRuntimeConfig } from "./config";

export function getApiBase() {
  return getRuntimeConfig().apiBase;
}

export async function createChatSession() {
  const r = await fetch(`${getApiBase()}/chat/session`, { method: "POST" });
  if (!r.ok) throw new Error(`Session create failed (${r.status})`);
  return await r.json();
}

export async function uploadDocuments(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch(`${getApiBase()}/ingest`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  return await r.json();
}

export async function chatQuery({ sessionId, q, stream, signal }) {
  if (stream) {
    const url = `${getApiBase()}/chat/query?session_id=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(q)}&stream=true`;
    const r = await fetch(url, { method: "GET", signal });
    if (!r.ok) throw new Error(`Chat failed (${r.status})`);
    return r;
  }
  const url = `${getApiBase()}/chat/query?session_id=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { method: "POST", signal });
  if (!r.ok) throw new Error(`Chat failed (${r.status})`);
  return await r.json();
}

export async function fetchHealth() {
  const r = await fetch(`${getApiBase()}/health`);
  if (!r.ok) return { status: "unreachable", checks: {} };
  return await r.json();
}

export async function fetchEventStats() {
  const r = await fetch(`${getApiBase()}/events/stats`);
  if (!r.ok) return {};
  return await r.json();
}

export async function fetchEvents({ limit = 50, status, dlq } = {}) {
  const params = new URLSearchParams({ limit });
  if (status) params.set("status", status);
  if (dlq !== undefined) params.set("dlq", String(dlq));
  const r = await fetch(`${getApiBase()}/events?${params}`);
  if (!r.ok) return { events: [] };
  return await r.json();
}

export async function retryDlqEvents() {
  const r = await fetch(`${getApiBase()}/events/dlq/retry`, { method: "POST" });
  if (!r.ok) throw new Error("Retry failed");
  return await r.json();
}

export async function emitCustomEvent(eventType, payload) {
  const r = await fetch(`${getApiBase()}/events/emit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, payload }),
  });
  if (!r.ok) throw new Error("Emit failed");
  return await r.json();
}

export async function fetchWebhooks() {
  const r = await fetch(`${getApiBase()}/webhooks`);
  if (!r.ok) return { webhooks: [] };
  return await r.json();
}

export async function registerWebhook({ url, event_types = [], secret }) {
  const r = await fetch(`${getApiBase()}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, event_types, secret }),
  });
  if (!r.ok) throw new Error("Register webhook failed");
  return await r.json();
}

export async function deleteWebhook(id) {
  const r = await fetch(`${getApiBase()}/webhooks/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete webhook failed");
  return await r.json();
}
