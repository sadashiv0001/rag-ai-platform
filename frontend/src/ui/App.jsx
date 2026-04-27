import React, { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ArchitecturePage from "./pages/ArchitecturePage.jsx";
import MonitoringPage from "./pages/MonitoringPage.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { loadUser, clearUser } from "../lib/storage.js";

export default function App() {
  const [user, setUser] = useState(() => loadUser());

  function onOnboardingComplete(u) {
    setUser(u);
  }

  function logout() {
    clearUser();
    setUser(null);
  }

  if (!user) {
    return <Onboarding onComplete={onOnboardingComplete} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brandRow">
            <div className="brand">RAG AI Platform</div>
            <div className="brandSubtitle">Portfolio + Live Demo</div>
          </div>
          <nav className="nav">
            <NavLink className={({ isActive }) => `navLink ${isActive ? "active" : ""}`} to="/" end>
              Home
            </NavLink>
            <NavLink className={({ isActive }) => `navLink ${isActive ? "active" : ""}`} to="/demo">
              Chat
            </NavLink>
            <NavLink className={({ isActive }) => `navLink ${isActive ? "active" : ""}`} to="/monitor">
              Events
            </NavLink>
            <NavLink className={({ isActive }) => `navLink ${isActive ? "active" : ""}`} to="/architecture">
              Architecture
            </NavLink>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pill" style={{ gap: 6 }}>
              <span style={{ fontSize: 16 }}>👤</span>
              <span style={{ fontWeight: 700 }}>{user.name}</span>
            </div>
            <button className="btn" onClick={logout} style={{ padding: "6px 10px", fontSize: 12 }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/demo" element={<ChatPage user={user} />} />
          <Route path="/monitor" element={<MonitoringPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
        </Routes>
      </main>
    </div>
  );
}
