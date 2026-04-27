import React, { useEffect } from "react";

export default function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onClose?.(), 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <div className="toastMessage">{message}</div>
      <button className="toastClose" onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  );
}

