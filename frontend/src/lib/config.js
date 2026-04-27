export function getRuntimeConfig() {
  // runtime-config.js may define window.__RAG__ at runtime
  const w = window;
  const fromWindow = w && w.__RAG__ && typeof w.__RAG__ === "object" ? w.__RAG__ : {};
  return {
    apiBase: typeof fromWindow.apiBase === "string" ? fromWindow.apiBase.replace(/\/$/, "") : "http://localhost:8000",
  };
}

