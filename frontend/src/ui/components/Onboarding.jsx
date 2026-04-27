import React, { useState, useEffect } from "react";
import { fetchHealth } from "../../lib/api";
import { saveUser } from "../../lib/storage";

const STEPS = ["name", "wizard", "done"];

function HealthCheck({ checks, loading }) {
  if (loading) return <div className="muted" style={{ fontSize: 13 }}>Checking services...</div>;
  const rows = [
    { key: "database", label: "Database (Postgres/pgvector)" },
    { key: "redis", label: "Redis cache" },
    { key: "openai_configured", label: "OpenAI API key" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map(({ key, label }) => {
        const ok = checks?.[key];
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>{ok ? "✅" : "⚠️"}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
            <span className={`statusBadge ${ok ? "ok" : "warn"}`}>{ok ? "Ready" : "Not set"}</span>
          </div>
        );
      })}
      {checks && !checks.openai_configured && (
        <div
          className="card"
          style={{ boxShadow: "none", background: "rgba(255,200,50,.08)", borderColor: "rgba(255,200,50,.25)" }}
        >
          <div className="cardInner" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>
            <strong>No OpenAI key detected</strong> — that's fine! The app will use a built-in offline fallback
            for chat responses. You can still upload documents, search content, and use Jira/Slack integrations.
            Set <code style={{ background: "rgba(0,0,0,.25)", padding: "2px 6px", borderRadius: 8 }}>OPENAI_API_KEY</code> in your{" "}
            <code style={{ background: "rgba(0,0,0,.25)", padding: "2px 6px", borderRadius: 8 }}>.env</code> to unlock AI-powered answers.
          </div>
        </div>
      )}
    </div>
  );
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState("name");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    if (step === "wizard") {
      setHealthLoading(true);
      fetchHealth()
        .then((h) => setHealth(h))
        .catch(() => setHealth({ status: "unreachable", checks: {} }))
        .finally(() => setHealthLoading(false));
    }
  }, [step]);

  function submitName() {
    if (!name.trim()) {
      setNameError("Please enter your name to continue.");
      return;
    }
    if (name.trim().length < 2) {
      setNameError("Name must be at least 2 characters.");
      return;
    }
    setNameError("");
    setStep("wizard");
  }

  function finish() {
    const user = { name: name.trim(), onboardedAt: new Date().toISOString() };
    saveUser(user);
    onComplete(user);
  }

  return (
    <div className="onboardingOverlay">
      <div className="onboardingCard card">
        <div className="cardInner" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {STEPS.slice(0, 2).map((s, i) => (
              <div
                key={s}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: step === s || (step === "wizard" && i === 1) || (step === "done" && i <= 1)
                    ? "var(--accent)"
                    : "rgba(255,255,255,.2)",
                }}
              />
            ))}
          </div>

          {step === "name" && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36 }}>👋</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>Welcome!</div>
                <div className="muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                  RAG AI Platform is ready. What should I call you?
                </div>
              </div>
              <input
                className="fieldInput"
                placeholder="Your name"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitName()}
              />
              {nameError && (
                <div style={{ color: "var(--danger)", fontSize: 13 }}>{nameError}</div>
              )}
              <button className="btn btnPrimary" onClick={submitName} style={{ width: "100%" }}>
                Continue
              </button>
            </>
          )}

          {step === "wizard" && (
            <>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>Hi, {name.trim()}! 👋</div>
                <div className="muted" style={{ marginTop: 4, lineHeight: 1.7, fontSize: 14 }}>
                  Here's a quick check of your setup. You can skip this and configure later in Settings.
                </div>
              </div>

              <HealthCheck checks={health?.checks} loading={healthLoading} />

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="btn" onClick={finish} style={{ flex: 1 }}>
                  Skip for now
                </button>
                <button className="btn btnPrimary" onClick={finish} style={{ flex: 1 }}>
                  Let's go!
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
