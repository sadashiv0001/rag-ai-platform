import React, { useEffect, useMemo, useState } from 'react';

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

export default function HomePage() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/profile.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const links = useMemo(() => safeArray(profile?.links), [profile]);
  const skills = useMemo(() => safeArray(profile?.skills), [profile]);
  const featured = useMemo(() => safeArray(profile?.featuredProjects), [profile]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card">
        <div className="cardInner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="pill">Public showcase</div>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.05 }}>
                {profile?.name || 'Your Name'}
              </div>
              <div className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 820 }}>
                {profile?.tagline ||
                  'I build production-ready AI products (RAG, APIs, and modern web UIs).'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <a className="btn btnPrimary" href="/demo">
                  Try the Live Demo
                </a>
                <a className="btn" href="/architecture">
                  See Architecture
                </a>
              </div>
            </div>

            <div style={{ minWidth: 260 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Links
              </div>
              <div className="tags">
                {links.length === 0 ? (
                  <span className="tag">Edit `frontend/profile.json`</span>
                ) : (
                  links.map((l) => (
                    <a
                      key={l.href}
                      className="tag"
                      style={{ textDecoration: 'none' }}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {l.label}
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid3">
        <div className="card">
          <div className="cardInner">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>What this demonstrates</div>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>RAG ingestion & retrieval with pgvector</li>
              <li>FastAPI + Redis caching + session history</li>
              <li>Streaming UX and citations/sources</li>
              <li>Dockerized local stack and deploy-ready shape</li>
            </ul>
          </div>
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="cardInner">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Skills</div>
            <div className="grid3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {skills.length === 0 ? (
                <div className="muted">Add skills in `frontend/profile.json`.</div>
              ) : (
                skills.map((s) => (
                  <div key={s.group} className="card" style={{ boxShadow: 'none' }}>
                    <div className="cardInner">
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>{s.group}</div>
                      <div className="tags">
                        {safeArray(s.items).map((it) => (
                          <span key={it} className="tag">
                            {it}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Featured</div>
          <div className="grid3">
            {featured.length === 0 ? (
              <div className="muted">Add featured projects in `frontend/profile.json`.</div>
            ) : (
              featured.map((p) => (
                <div key={p.name} className="card" style={{ boxShadow: 'none' }}>
                  <div className="cardInner">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{p.name}</div>
                    <div className="muted" style={{ lineHeight: 1.6 }}>
                      {p.description}
                    </div>
                    <ul className="muted" style={{ margin: '10px 0 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                      {safeArray(p.highlights).slice(0, 4).map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 12 }}>
                      <a className="btn btnPrimary" href={p.ctaHref || '/demo'}>
                        {p.ctaLabel || 'Open'}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

