import React from 'react';

export default function ArchitecturePage() {
  return (
    <div className="card">
      <div className="cardInner" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="pill">Architecture</div>
        <div style={{ fontSize: 26, fontWeight: 900 }}>How it works</div>
        <div className="muted" style={{ lineHeight: 1.7 }}>
          Frontend → FastAPI → (Redis cache) + (Postgres/pgvector) → LLM/Embeddings.
        </div>

        <div
          className="card"
          style={{
            boxShadow: 'none',
            background: 'rgba(0,0,0,.16)',
            borderColor: 'rgba(255,255,255,.12)',
          }}
        >
          <div className="cardInner" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            {['Frontend', 'FastAPI', 'Redis', 'Postgres/pgvector', 'OpenAI'].map((n, i) => (
              <React.Fragment key={n}>
                <span className="tag" style={{ color: 'var(--text)' }}>
                  {n}
                </span>
                {i < 4 ? <span className="muted">→</span> : null}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="muted" style={{ lineHeight: 1.7 }}>
          Tip: upload a PDF/CSV/XLSX and ask questions to see retrieval in action. If streaming fails due to quota,
          the UI can fall back to non-stream answers.
        </div>
      </div>
    </div>
  );
}

