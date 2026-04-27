import React, { useCallback, useEffect, useState } from "react";
import {
  fetchEventStats,
  fetchEvents,
  retryDlqEvents,
  fetchWebhooks,
  registerWebhook,
  deleteWebhook,
  emitCustomEvent,
} from "../../lib/api";
import Toast from "../components/Toast";

const STATUS_COLOR = {
  pending: "rgba(255,200,50,.25)",
  delivered: "rgba(16,163,127,.20)",
  failed: "rgba(255,90,106,.22)",
  dlq: "rgba(255,90,106,.35)",
};

export default function MonitoringPage() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterDlq, setFilterDlq] = useState(false);

  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookTypes, setNewWebhookTypes] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState("");

  const [emitType, setEmitType] = useState("custom");
  const [emitPayload, setEmitPayload] = useState('{"message": "hello"}');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e, w] = await Promise.all([
        fetchEventStats(),
        fetchEvents({ limit: 50, status: filterStatus || undefined, dlq: filterDlq || undefined }),
        fetchWebhooks(),
      ]);
      setStats(s);
      setEvents(Array.isArray(e.events) ? e.events : []);
      setWebhooks(Array.isArray(w.webhooks) ? w.webhooks : []);
    } catch (err) {
      setToast({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterDlq]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function onRetryDlq() {
    try {
      const res = await retryDlqEvents();
      setToast({ type: "info", message: `Retried ${res.retried} DLQ events.` });
      refresh();
    } catch (e) {
      setToast({ type: "error", message: e.message });
    }
  }

  async function onRegisterWebhook() {
    if (!newWebhookUrl.trim()) {
      setToast({ type: "error", message: "Webhook URL is required." });
      return;
    }
    try {
      const types = newWebhookTypes.trim()
        ? newWebhookTypes.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      await registerWebhook({ url: newWebhookUrl.trim(), event_types: types, secret: newWebhookSecret || undefined });
      setNewWebhookUrl("");
      setNewWebhookTypes("");
      setNewWebhookSecret("");
      setToast({ type: "info", message: "Webhook registered." });
      refresh();
    } catch (e) {
      setToast({ type: "error", message: e.message });
    }
  }

  async function onDeleteWebhook(id) {
    try {
      await deleteWebhook(id);
      setToast({ type: "info", message: "Webhook removed." });
      refresh();
    } catch (e) {
      setToast({ type: "error", message: e.message });
    }
  }

  async function onEmitEvent() {
    try {
      let payload = {};
      try {
        payload = JSON.parse(emitPayload);
      } catch {
        setToast({ type: "error", message: "Payload must be valid JSON." });
        return;
      }
      const res = await emitCustomEvent(emitType, payload);
      setToast({ type: "info", message: `Event emitted: ${res.event_id}` });
      refresh();
    } catch (e) {
      setToast({ type: "error", message: e.message });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Stats */}
      <div className="card">
        <div className="cardInner">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Event System</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
              <button className="btn btnDanger" onClick={onRetryDlq}>Retry DLQ</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            {stats &&
              Object.entries(stats.by_status || {}).map(([status, count]) => (
                <div key={status} className="card" style={{ boxShadow: "none", background: STATUS_COLOR[status] || "rgba(255,255,255,.04)", minWidth: 110, textAlign: "center" }}>
                  <div className="cardInner">
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{count}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{status}</div>
                  </div>
                </div>
              ))}
            {stats && (
              <div className="card" style={{ boxShadow: "none", background: "rgba(255,90,106,.18)", minWidth: 110, textAlign: "center" }}>
                <div className="cardInner">
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.dlq_count ?? 0}</div>
                  <div className="muted" style={{ fontSize: 12 }}>DLQ total</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        {/* Events log */}
        <div className="card">
          <div className="cardInner">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Event Log</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <select
                className="fieldInput"
                style={{ width: "auto" }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="dlq">DLQ</option>
              </select>
              <label className="settingRow" style={{ margin: 0 }}>
                <input type="checkbox" checked={filterDlq} onChange={(e) => setFilterDlq(e.target.checked)} />
                <span>DLQ only</span>
              </label>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {events.length === 0 && <div className="muted">No events yet. They'll appear here as you use the app.</div>}
              {events.map((ev) => (
                <div
                  key={ev.event_id}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: ev.dlq ? "rgba(255,90,106,.10)" : STATUS_COLOR[ev.status] || "rgba(0,0,0,.12)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900, fontSize: 13 }}>{ev.event_type}</span>
                    <span className={`statusBadge ${ev.status === "delivered" ? "ok" : "warn"}`}>{ev.status}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {ev.event_id.slice(0, 8)} · attempts: {ev.attempts} · {ev.created_at?.slice(0, 19)}
                  </div>
                  {ev.error && <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{ev.error}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Emit event */}
          <div className="card">
            <div className="cardInner">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Emit Event</div>
              <label className="field">
                <div className="fieldLabel">Event type</div>
                <input className="fieldInput" value={emitType} onChange={(e) => setEmitType(e.target.value)} />
              </label>
              <label className="field">
                <div className="fieldLabel">Payload (JSON)</div>
                <textarea
                  className="fieldInput"
                  style={{ minHeight: 80, resize: "vertical", fontFamily: "monospace" }}
                  value={emitPayload}
                  onChange={(e) => setEmitPayload(e.target.value)}
                />
              </label>
              <button className="btn btnPrimary" onClick={onEmitEvent}>Emit</button>
            </div>
          </div>

          {/* Webhooks */}
          <div className="card">
            <div className="cardInner">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Webhooks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {webhooks.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No webhooks registered.</div>}
                {webhooks.map((w) => (
                  <div key={w.id} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.12)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, wordBreak: "break-all" }}>{w.url}</span>
                      <button className="iconBtn" onClick={() => onDeleteWebhook(w.id)}>✕</button>
                    </div>
                    {w.event_types?.length > 0 && (
                      <div className="muted" style={{ fontSize: 11 }}>Types: {w.event_types.join(", ")}</div>
                    )}
                  </div>
                ))}
              </div>
              <label className="field">
                <div className="fieldLabel">Webhook URL</div>
                <input className="fieldInput" value={newWebhookUrl} placeholder="https://example.com/hook" onChange={(e) => setNewWebhookUrl(e.target.value)} />
              </label>
              <label className="field">
                <div className="fieldLabel">Event types (comma-separated, empty = all)</div>
                <input className="fieldInput" value={newWebhookTypes} placeholder="chat.message, upload.completed" onChange={(e) => setNewWebhookTypes(e.target.value)} />
              </label>
              <label className="field">
                <div className="fieldLabel">Secret (optional)</div>
                <input className="fieldInput" type="password" value={newWebhookSecret} onChange={(e) => setNewWebhookSecret(e.target.value)} />
              </label>
              <button className="btn" onClick={onRegisterWebhook}>Register webhook</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
