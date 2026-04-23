import React from "react";

export default function App() {
  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: "#00ffd5", fontSize: 42, marginBottom: 20 }}>
          DASHBOARD EC
        </h1>

        <button
          onClick={() => alert("FUNCIONANDO")}
          style={{
            background: "#00ff9f",
            color: "#000",
            padding: "14px 24px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          Atualizar CSV
        </button>
      </div>
    </div>
  );
}