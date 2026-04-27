import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChatSession, uploadDocuments, chatQuery, getApiBase } from "../../lib/api";
import { loadState, saveState } from "../../lib/storage";
import Toast from "../components/Toast";
import { jiraCreateIssue, jiraSearch, slackWebhook } from "../../lib/integrationsApi";

function uuid() {
  return crypto?.randomUUID?.() || `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function looksLikeQuotaOrStreamFailure(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("streaming is currently unavailable") ||
    t.includes("api quota") ||
    t.includes("insufficient_quota") ||
    t.includes("rate limit") ||
    t.includes("[error]")
  );
}

function renderPlain(content) {
  // Simple safe rendering (no HTML). Code blocks are shown in a <pre>.
  // This intentionally avoids full markdown parsing for safety.
  const parts = String(content ?? "").split("```");
  if (parts.length === 1) return <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>;

  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    const isCode = i % 2 === 1;
    if (isCode) {
      nodes.push(
        <pre key={i} className="codeBlock">
          <code>{parts[i].trim()}</code>
        </pre>
      );
    } else if (parts[i]) {
      nodes.push(
        <span key={i} style={{ whiteSpace: "pre-wrap" }}>
          {parts[i]}
        </span>
      );
    }
  }
  return <>{nodes}</>;
}

export default function ChatPage({ user }) {
  const initial = useMemo(() => {
    const saved = loadState();
    if (saved && saved.chats && saved.activeChatId) {
      return {
        ...saved,
        settings: {
          stream: true,
          showSources: true,
          ...(saved.settings || {}),
          integrations: {
            jira: { base_url: "", email: "", api_token: "", project_key: "", ...(saved.settings?.integrations?.jira || {}) },
            slack: { webhook_url: "", ...(saved.settings?.integrations?.slack || {}) },
          },
        },
      };
    }
    const firstId = uuid();
    return {
      chats: [
        {
          id: firstId,
          title: "New chat",
          sessionId: null,
          createdAt: nowIso(),
          messages: [],
        },
      ],
      activeChatId: firstId,
      settings: {
        stream: true,
        showSources: true,
        integrations: {
          jira: { base_url: "", email: "", api_token: "", project_key: "" },
          slack: { webhook_url: "" },
        },
      },
    };
  }, []);

  const [state, setState] = useState(initial);
  const [toast, setToast] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [composer, setComposer] = useState("");
  const [uploadStatus, setUploadStatus] = useState("Upload documents to improve answers.");
  const [activeTab, setActiveTab] = useState("chat"); // chat | tasks | settings

  const [taskSummary, setTaskSummary] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskJql, setTaskJql] = useState("order by updated DESC");
  const [taskResults, setTaskResults] = useState(null);

  const abortRef = useRef(null);
  const messagesEndRef = useRef(null);

  const activeChat = useMemo(
    () => state.chats.find((c) => c.id === state.activeChatId) || state.chats[0],
    [state]
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages?.length]);

  async function ensureSession(chat) {
    if (chat.sessionId) return chat.sessionId;
    const data = await createChatSession();
    const sessionId = data.session_id;
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === chat.id ? { ...c, sessionId } : c)),
    }));
    return sessionId;
  }

  function newChat() {
    const id = uuid();
    setState((s) => ({
      ...s,
      chats: [
        {
          id,
          title: "New chat",
          sessionId: null,
          createdAt: nowIso(),
          messages: [],
        },
        ...s.chats,
      ],
      activeChatId: id,
    }));
    setComposer("");
    setUploadStatus("Upload documents to improve answers.");
  }

  function deleteChat(id) {
    setState((s) => {
      const remaining = s.chats.filter((c) => c.id !== id);
      const nextActive = s.activeChatId === id ? (remaining[0]?.id || null) : s.activeChatId;
      return {
        ...s,
        chats: remaining.length ? remaining : s.chats,
        activeChatId: nextActive || s.activeChatId,
      };
    });
  }

  function renameChat(id) {
    const name = prompt("Rename chat");
    if (!name) return;
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === id ? { ...c, title: name.slice(0, 60) } : c)),
    }));
  }

  function setSetting(key, value) {
    setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
  }

  function setIntegration(kind, patch) {
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        integrations: {
          ...s.settings.integrations,
          [kind]: { ...(s.settings.integrations?.[kind] || {}), ...patch },
        },
      },
    }));
  }

  async function onUpload(files) {
    if (!files || files.length === 0) return;
    setUploadStatus(`Selected: ${Array.from(files).map((f) => f.name).join(", ")}`);
    try {
      const res = await uploadDocuments(files);
      const okCount = Array.isArray(res.doc_ids) ? res.doc_ids.length : 0;
      const failed = Array.isArray(res.failed_files) ? res.failed_files : [];
      let msg = okCount > 0 ? `Uploaded ${okCount} documents.` : "No documents were ingested.";
      if (failed.length) msg += ` Failed: ${failed.join(", ")}`;
      setUploadStatus(msg);
      setToast({ type: okCount > 0 ? "info" : "error", message: msg });
    } catch (e) {
      setToast({ type: "error", message: e.message || "Upload failed" });
      setUploadStatus("Upload failed.");
    }
  }

  async function send() {
    const text = composer.trim();
    if (!text) return;
    if (isSending) return;

    setIsSending(true);
    setComposer("");

    const userMsg = { id: uuid(), role: "user", content: text, createdAt: nowIso() };
    const assistantMsgId = uuid();
    const typingMsg = { id: assistantMsgId, role: "assistant", content: "", createdAt: nowIso(), typing: true };

    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === activeChat.id ? { ...c, messages: [...c.messages, userMsg, typingMsg] } : c
      ),
    }));

    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const sessionId = await ensureSession(activeChat);
      const stream = !!state.settings.stream;

      if (stream) {
        const r = await chatQuery({ sessionId, q: text, stream: true, signal: controller.signal });
        const reader = r.body?.getReader();
        if (!reader) throw new Error("Streaming not supported by response.");

        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setState((s) => ({
            ...s,
            chats: s.chats.map((c) =>
              c.id === activeChat.id
                ? {
                    ...c,
                    messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, content: full } : m)),
                  }
                : c
            ),
          }));
        }

        if (!looksLikeQuotaOrStreamFailure(full)) {
          setState((s) => ({
            ...s,
            chats: s.chats.map((c) =>
              c.id === activeChat.id
                ? {
                    ...c,
                    title: c.title === "New chat" ? text.slice(0, 40) : c.title,
                    messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, typing: false } : m)),
                  }
                : c
            ),
          }));
          setIsSending(false);
          return;
        }

        setToast({ type: "error", message: "Streaming failed; retrying without streaming…" });
      }

      const data = await chatQuery({ sessionId, q: text, stream: false, signal: controller.signal });
      let answer = data.answer || "No answer returned.";
      if (state.settings.showSources && Array.isArray(data.sources) && data.sources.length > 0) {
        const lines = data.sources
          .slice(0, 5)
          .map((s, i) => `${i + 1}. ${s.doc_id || "unknown-doc"}#${s.chunk_id || ""}`);
        answer += `\n\nSources:\n${lines.join("\n")}`;
      }

      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                title: c.title === "New chat" ? text.slice(0, 40) : c.title,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: answer, typing: false } : m
                ),
              }
            : c
        ),
      }));
    } catch (e) {
      const msg = e?.name === "AbortError" ? "Stopped." : e.message || "Request failed.";
      setToast({ type: e?.name === "AbortError" ? "info" : "error", message: msg });
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: msg, typing: false } : m
                ),
              }
            : c
        ),
      }));
    } finally {
      setIsSending(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard
      ?.writeText?.(String(text ?? ""))
      .then(() => setToast({ type: "info", message: "Copied to clipboard." }))
      .catch(() => setToast({ type: "error", message: "Copy failed." }));
  }

  async function regenerate() {
    if (isSending) return;
    const msgs = activeChat?.messages || [];
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser?.content) {
      setToast({ type: "error", message: "Nothing to regenerate yet." });
      return;
    }
    setComposer(String(lastUser.content));
    await Promise.resolve();
    // Immediately send without requiring the user to hit Send again
    setComposer("");
    // Use direct call so it doesn't depend on composer state
    const text = String(lastUser.content);
    setIsSending(true);

    const userMsg = { id: uuid(), role: "user", content: text, createdAt: nowIso() };
    const assistantMsgId = uuid();
    const typingMsg = { id: assistantMsgId, role: "assistant", content: "", createdAt: nowIso(), typing: true };

    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === activeChat.id ? { ...c, messages: [...c.messages, userMsg, typingMsg] } : c
      ),
    }));

    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const sessionId = await ensureSession(activeChat);
      const stream = !!state.settings.stream;

      if (stream) {
        const r = await chatQuery({ sessionId, q: text, stream: true, signal: controller.signal });
        const reader = r.body?.getReader();
        if (!reader) throw new Error("Streaming not supported by response.");

        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setState((s) => ({
            ...s,
            chats: s.chats.map((c) =>
              c.id === activeChat.id
                ? { ...c, messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, content: full } : m)) }
                : c
            ),
          }));
        }

        if (!looksLikeQuotaOrStreamFailure(full)) {
          setState((s) => ({
            ...s,
            chats: s.chats.map((c) =>
              c.id === activeChat.id ? { ...c, messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, typing: false } : m)) } : c
            ),
          }));
          setIsSending(false);
          return;
        }
        setToast({ type: "error", message: "Streaming failed; retrying without streaming…" });
      }

      const data = await chatQuery({ sessionId, q: text, stream: false, signal: controller.signal });
      let answer = data.answer || "No answer returned.";
      if (state.settings.showSources && Array.isArray(data.sources) && data.sources.length > 0) {
        const lines = data.sources.slice(0, 5).map((s, i) => `${i + 1}. ${s.doc_id || "unknown-doc"}#${s.chunk_id || ""}`);
        answer += `\n\nSources:\n${lines.join("\n")}`;
      }

      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === activeChat.id
            ? { ...c, messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, content: answer, typing: false } : m)) }
            : c
        ),
      }));
    } catch (e) {
      const msg = e?.name === "AbortError" ? "Stopped." : e.message || "Request failed.";
      setToast({ type: e?.name === "AbortError" ? "info" : "error", message: msg });
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === activeChat.id ? { ...c, messages: c.messages.map((m) => (m.id === assistantMsgId ? { ...m, content: msg, typing: false } : m)) } : c
        ),
      }));
    } finally {
      setIsSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort?.();
  }

  async function createJiraTask() {
    const jira = state.settings.integrations?.jira || {};
    if (!jira.base_url || !jira.email || !jira.api_token || !jira.project_key) {
      setToast({ type: "error", message: "Please fill Jira settings first (base URL, email, API token, project key)." });
      setActiveTab("settings");
      return;
    }
    if (!taskSummary.trim()) {
      setToast({ type: "error", message: "Task summary is required." });
      return;
    }
    try {
      const res = await jiraCreateIssue({
        base_url: jira.base_url,
        email: jira.email,
        api_token: jira.api_token,
        project_key: jira.project_key,
        summary: taskSummary.trim(),
        description: taskDescription || "",
        issue_type: "Task",
      });
      const key = res?.result?.key;
      setToast({ type: "info", message: key ? `Jira task created: ${key}` : "Jira task created." });
      if (state.settings.integrations?.slack?.webhook_url) {
        try {
          await slackWebhook({
            webhook_url: state.settings.integrations.slack.webhook_url,
            text: key ? `Created Jira task ${key}: ${taskSummary.trim()}` : `Created Jira task: ${taskSummary.trim()}`,
          });
        } catch (e) {
          setToast({ type: "error", message: `Slack notify failed: ${e.message}` });
        }
      }
    } catch (e) {
      setToast({ type: "error", message: `Jira create failed: ${e.message}` });
    }
  }

  async function pullJiraTasks() {
    const jira = state.settings.integrations?.jira || {};
    if (!jira.base_url || !jira.email || !jira.api_token) {
      setToast({ type: "error", message: "Please fill Jira settings first." });
      setActiveTab("settings");
      return;
    }
    try {
      const res = await jiraSearch({
        base_url: jira.base_url,
        email: jira.email,
        api_token: jira.api_token,
        jql: taskJql,
        max_results: 20,
      });
      setTaskResults(res?.result || null);
      setToast({ type: "info", message: "Pulled tasks from Jira." });
    } catch (e) {
      setToast({ type: "error", message: `Jira pull failed: ${e.message}` });
    }
  }

  return (
    <div className="chatLayout">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <aside className="chatSidebar">
        <div className="sidebarTop">
          <button className="btn btnPrimary" onClick={newChat}>
            New chat
          </button>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            API: <span style={{ color: "var(--text)" }}>{getApiBase()}</span>
          </div>
        </div>

        <div className="chatList" role="list">
          {state.chats.map((c) => (
            <div
              key={c.id}
              className={`chatListItem ${c.id === state.activeChatId ? "active" : ""}`}
              onClick={() => setState((s) => ({ ...s, activeChatId: c.id }))}
              role="listitem"
            >
              <div className="chatTitle">{c.title}</div>
              <div className="chatActions">
                <button className="iconBtn" onClick={(e) => (e.stopPropagation(), renameChat(c.id))} title="Rename">
                  ✎
                </button>
                <button className="iconBtn" onClick={(e) => (e.stopPropagation(), deleteChat(c.id))} title="Delete">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebarBottom card" style={{ boxShadow: "none" }}>
          <div className="cardInner">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Settings</div>
            <label className="settingRow">
              <input
                type="checkbox"
                checked={!!state.settings.stream}
                onChange={(e) => setSetting("stream", e.target.checked)}
              />
              <span>Streaming</span>
            </label>
            <label className="settingRow">
              <input
                type="checkbox"
                checked={!!state.settings.showSources}
                onChange={(e) => setSetting("showSources", e.target.checked)}
              />
              <span>Show sources</span>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn" onClick={() => setActiveTab("settings")}>
                Integration settings
              </button>
              <button className="btn btnPrimary" onClick={() => setActiveTab("tasks")}>
                Tasks (Jira/Slack)
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
              Note: credentials are saved in your browser (localStorage). Use a demo token.
            </div>
          </div>
        </div>
      </aside>

      <section className="chatMain">
        <div className="chatHeader">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontWeight: 900 }}>{activeChat?.title || "Chat"}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {uploadStatus}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="tabs">
              <button className={`tabBtn ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>
                Chat
              </button>
              <button className={`tabBtn ${activeTab === "tasks" ? "active" : ""}`} onClick={() => setActiveTab("tasks")}>
                Tasks
              </button>
              <button
                className={`tabBtn ${activeTab === "settings" ? "active" : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                Settings
              </button>
            </div>
            <label className="fileBtn">
              Upload
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.plt,.txt"
                onChange={(e) => onUpload(e.target.files)}
              />
            </label>
            {isSending ? (
              <button className="btn btnDanger" onClick={stop}>
                Stop
              </button>
            ) : (
              <button className="btn" onClick={regenerate}>
                Regenerate
              </button>
            )}
          </div>
        </div>

        {activeTab === "chat" ? (
          <>
            <div className="chatMessages">
              {activeChat?.messages?.length ? (
                activeChat.messages.map((m) => (
                  <div key={m.id} className={`msg ${m.role}`}>
                    <div className="msgAvatar">{m.role === "user" ? "You" : "AI"}</div>
                    <div className="msgBubble">
                      {m.typing && !m.content ? <span className="muted">Thinking…</span> : renderPlain(m.content)}
                      {m.role === "assistant" && !m.typing ? (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="iconBtn" onClick={() => copyToClipboard(m.content)}>
                            Copy
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="emptyState">
                  <div style={{ fontSize: 38, marginBottom: 10 }}>💬</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>
                    {user?.name ? `Hi ${user.name}!` : "Hello!"} How can I help?
                  </div>
                  <div className="muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                    Upload a document (PDF, CSV, Excel…), then ask me anything about it.
                    No OpenAI key? I'll still respond using an offline fallback.
                  </div>
                  <div className="tags" style={{ marginTop: 12 }}>
                    {["Summarise my document", "Extract key figures", "Compare sections", "Create a Jira task"].map((s) => (
                      <button
                        key={s}
                        className="tag"
                        style={{ cursor: "pointer" }}
                        onClick={() => { setComposer(s); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chatComposer">
              <textarea
                className="composer"
                value={composer}
                placeholder="Message RAG AI…"
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className="btn btnPrimary" onClick={send} disabled={isSending}>
                Send
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "settings" ? (
          <div className="pane">
            <div className="paneInner">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Integrations Settings</div>
              <div className="muted" style={{ lineHeight: 1.6 }}>
                These values are stored in your browser. For production, prefer server-side secrets / OAuth.
              </div>

              <div className="formGrid">
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardInner">
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Jira (Cloud)</div>
                    <label className="field">
                      <div className="fieldLabel">Base URL</div>
                      <input
                        className="fieldInput"
                        placeholder="https://your-domain.atlassian.net"
                        value={state.settings.integrations.jira.base_url}
                        onChange={(e) => setIntegration("jira", { base_url: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Email</div>
                      <input
                        className="fieldInput"
                        placeholder="you@company.com"
                        value={state.settings.integrations.jira.email}
                        onChange={(e) => setIntegration("jira", { email: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">API token</div>
                      <input
                        className="fieldInput"
                        type="password"
                        placeholder="Jira API token"
                        value={state.settings.integrations.jira.api_token}
                        onChange={(e) => setIntegration("jira", { api_token: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Project key</div>
                      <input
                        className="fieldInput"
                        placeholder="PROJ"
                        value={state.settings.integrations.jira.project_key}
                        onChange={(e) => setIntegration("jira", { project_key: e.target.value })}
                      />
                    </label>
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardInner">
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Slack</div>
                    <label className="field">
                      <div className="fieldLabel">Incoming webhook URL</div>
                      <input
                        className="fieldInput"
                        type="password"
                        placeholder="https://hooks.slack.com/services/…"
                        value={state.settings.integrations.slack.webhook_url}
                        onChange={(e) => setIntegration("slack", { webhook_url: e.target.value })}
                      />
                    </label>
                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      When you create a Jira task, we’ll post a Slack message if this is configured.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "tasks" ? (
          <div className="pane">
            <div className="paneInner">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Tasks (Jira + Slack)</div>
              <div className="muted" style={{ lineHeight: 1.6 }}>
                Create a Jira issue, optionally notify Slack, and pull tasks via JQL.
              </div>

              <div className="formGrid">
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardInner">
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Create task</div>
                    <label className="field">
                      <div className="fieldLabel">Summary</div>
                      <input className="fieldInput" value={taskSummary} onChange={(e) => setTaskSummary(e.target.value)} />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Description</div>
                      <textarea
                        className="fieldInput"
                        style={{ minHeight: 120, resize: "vertical" }}
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                      />
                    </label>
                    <button className="btn btnPrimary" onClick={createJiraTask}>
                      Create in Jira (and notify Slack)
                    </button>
                  </div>
                </div>

                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="cardInner">
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Pull tasks</div>
                    <label className="field">
                      <div className="fieldLabel">JQL</div>
                      <input className="fieldInput" value={taskJql} onChange={(e) => setTaskJql(e.target.value)} />
                    </label>
                    <button className="btn" onClick={pullJiraTasks}>
                      Pull from Jira
                    </button>

                    {taskResults ? (
                      <div style={{ marginTop: 12 }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Found {taskResults.total ?? 0} issues
                        </div>
                        <div className="taskList">
                          {(taskResults.issues || []).slice(0, 20).map((it) => (
                            <div key={it.id} className="taskItem">
                              <div style={{ fontWeight: 900 }}>{it.key}</div>
                              <div className="muted" style={{ fontSize: 13 }}>
                                {it.fields?.summary}
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {it.fields?.status?.name || "Unknown status"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

