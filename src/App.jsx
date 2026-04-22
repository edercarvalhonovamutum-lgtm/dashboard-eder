import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

function money(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

function toNumberBR(value) {
  if (value === null || value === undefined) return 0;
  const txt = String(value).trim();
  if (!txt) return 0;
  const cleaned = txt.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const txt = String(raw).trim().split(" ")[0];
  const parts = txt.split("/");
  if (parts.length !== 3) return null;

  const dd = String(parts[0]).padStart(2, "0");
  const mm = String(parts[1]).padStart(2, "0");
  const yyyy = String(parts[2]);

  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    shortDate: `${dd}/${mm}/${yyyy}`,
    monthKey: `${yyyy}-${mm}`,
  };
}

function getWeekdayName(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const names = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return names[dt.getDay()];
}

function previousMonth(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(y, m - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function businessDaysRemaining(monthKey) {
  if (!monthKey) return 0;

  const [y, m] = monthKey.split("-").map(Number);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (monthKey !== currentMonthKey) return 0;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(y, m, 0);

  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function statusInfo(progress) {
  if (progress >= 100) return { label: "TARGET ACHIEVED", color: "#00ff88" };
  if (progress >= 70) return { label: "ON TRACK", color: "#ffd700" };
  return { label: "BEHIND", color: "#ff4d4f" };
}

function pickValueFromRow(row) {
  const possibleDateKeys = [
    "Data",
    "data",
    "Date",
    "DATE",
    "Dt. Fechamento",
    "Fechamento",
    "Dia",
  ];

  const possibleValueKeys = [
    "Resultado",
    "resultado",
    "Lucro",
    "lucro",
    "P&L",
    "P/L",
    "Valor",
    "valor",
    "Total",
    "total",
    "Resultado Líquido",
    "Resultado Liquido",
    "Res. Líquido",
    "Res. Liquido",
  ];

  let rawDate = "";
  let rawValue = "";

  for (const key of possibleDateKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      rawDate = row[key];
      break;
    }
  }

  for (const key of possibleValueKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      rawValue = row[key];
      break;
    }
  }

  return { rawDate, rawValue };
}

function chartPath(values, width = 900, height = 240, pad = 24) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((v, i) => {
      const x = pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1);
      const y = pad + ((max - v) * (height - pad * 2)) / range;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function Panel({ title, value, color = "#00ff88", sub }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        minHeight: 108,
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ color: "#7c8ba1", fontSize: 11, marginBottom: 10, letterSpacing: 0.7 }}>
        {title}
      </div>
      <div style={{ color, fontWeight: 800, fontSize: 18, lineHeight: 1.2, whiteSpace: "pre-line" }}>
        {value}
      </div>
      {sub ? <div style={{ color: "#64748b", fontSize: 11, marginTop: 10 }}>{sub}</div> : null}
    </div>
  );
}

function ProgressCard({ title, value, color }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div
        style={{
          width: "100%",
          height: 16,
          background: "#172235",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(Math.max(value, 0), 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            boxShadow: `0 0 18px ${color}55`,
          }}
        />
      </div>
      <div style={{ marginTop: 8, color: "#d7e1ec", fontWeight: 700 }}>{value.toFixed(1)}%</div>
    </div>
  );
}

function Ranking({ title, items, color }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: "#64748b" }}>Sem dados</div>
      ) : (
        items.map((item, idx) => (
          <div
            key={`${item.dateKey}-${idx}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 0",
              borderBottom: idx === items.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ color: "#dbe4ee", fontSize: 13 }}>{item.shortDate}</div>
            <div style={{ color, fontWeight: 800, fontSize: 13 }}>{money(item.filteredValue)}</div>
          </div>
        ))
      )}
    </div>
  );
}

function LineChart({ title, values, labels, color, accent }) {
  if (!values.length) {
    return (
      <div
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
        <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
          Sem dados
        </div>
      </div>
    );
  }

  const width = 900;
  const height = 240;
  const d = chartPath(values, width, height);

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {accent ? <div style={{ color, fontWeight: 800 }}>{accent}</div> : null}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 240, display: "block" }}>
        <rect x="0" y="0" width={width} height={height} fill="#0b1220" rx="14" />
        <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div style={{ marginTop: 10, color: "#64748b", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        <span>{labels[0] || ""}</span>
        <span>{labels[Math.floor((labels.length - 1) / 2)] || ""}</span>
        <span>{labels[labels.length - 1] || ""}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [docs, setDocs] = useState([]);
  const [genialFile, setGenialFile] = useState(null);
  const [ricoFile, setRicoFile] = useState(null);
  const [metaMensal, setMetaMensal] = useState(10000);
  const [metaAnual, setMetaAnual] = useState(120000);
  const [custoOp, setCustoOp] = useState(2.8);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [diaSelecionado, setDiaSelecionado] = useState("");
  const [filtroCorretora, setFiltroCorretora] = useState("consolidado");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trades"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push(d.data()));
      list.sort((a, b) => String(a.dateKey || "").localeCompare(String(b.dateKey || "")));
      setDocs(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!mesSelecionado && docs.length) {
      const last = [...new Set(docs.map((d) => d.monthKey).filter(Boolean))].sort().pop();
      if (last) setMesSelecionado(last);
    }
  }, [docs, mesSelecionado]);

  async function saveBrokerFile(file, brokerName) {
    if (!file) return;

    const parsed = await new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data || []),
      });
    });

    const grouped = {};

    for (const row of parsed) {
      try {
        const { rawDate, rawValue } = pickValueFromRow(row);
        const dateInfo = normalizeDate(rawDate);
        if (!dateInfo) continue;

        const value = toNumberBR(rawValue);
        if (!grouped[dateInfo.dateKey]) {
          grouped[dateInfo.dateKey] = {
            dateKey: dateInfo.dateKey,
            shortDate: dateInfo.shortDate,
            monthKey: dateInfo.monthKey,
            genial: 0,
            rico: 0,
            opsGenial: 0,
            opsRico: 0,
            updatedAt: Date.now(),
          };
        }

        if (brokerName === "genial") {
          grouped[dateInfo.dateKey].genial += value;
          grouped[dateInfo.dateKey].opsGenial += 1;
        } else {
          grouped[dateInfo.dateKey].rico += value;
          grouped[dateInfo.dateKey].opsRico += 1;
        }
      } catch {
        // ignora linha ruim
      }
    }

    const entries = Object.values(grouped);
    for (const item of entries) {
      const ref = doc(db, "trades", item.dateKey);
      const exists = await getDoc(ref);
      const current = exists.exists() ? exists.data() : {};

      await setDoc(
        ref,
        {
          dateKey: item.dateKey,
          shortDate: item.shortDate,
          monthKey: item.monthKey,
          genial: brokerName === "genial" ? item.genial : Number(current.genial || 0),
          rico: brokerName === "rico" ? item.rico : Number(current.rico || 0),
          opsGenial: brokerName === "genial" ? item.opsGenial : Number(current.opsGenial || 0),
          opsRico: brokerName === "rico" ? item.opsRico : Number(current.opsRico || 0),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
  }

  async function handleUpload() {
    if (!genialFile && !ricoFile) {
      setMsg("Escolha pelo menos um arquivo.");
      return;
    }

    try {
      setLoading(true);
      setMsg("Enviando para o Firebase...");

      if (genialFile) await saveBrokerFile(genialFile, "genial");
      if (ricoFile) await saveBrokerFile(ricoFile, "rico");

      setMsg("Salvo no Firebase 🚀");
      alert("Salvo no Firebase 🚀");
    } catch (e) {
      console.error(e);
      setMsg("Erro ao salvar no Firebase.");
      alert("Erro ao salvar no Firebase.");
    } finally {
      setLoading(false);
    }
  }

  const months = useMemo(() => {
    return [...new Set(docs.map((d) => d.monthKey).filter(Boolean))].sort();
  }, [docs]);

  const enriched = useMemo(() => {
    return docs.map((item) => {
      const genial = Number(item.genial || 0);
      const rico = Number(item.rico || 0);
      const opsGenial = Number(item.opsGenial || 0);
      const opsRico = Number(item.opsRico || 0);

      const genialLiquido = genial - opsGenial * custoOp;
      const ricoLiquido = rico - opsRico * custoOp;

      let filteredValue = genialLiquido + ricoLiquido;
      let filteredOps = opsGenial + opsRico;
      let filteredCost = (opsGenial + opsRico) * custoOp;

      if (filtroCorretora === "genial") {
        filteredValue = genialLiquido;
        filteredOps = opsGenial;
        filteredCost = opsGenial * custoOp;
      }

      if (filtroCorretora === "rico") {
        filteredValue = ricoLiquido;
        filteredOps = opsRico;
        filteredCost = opsRico * custoOp;
      }

      return {
        ...item,
        genialLiquido,
        ricoLiquido,
        filteredValue,
        filteredOps,
        filteredCost,
      };
    });
  }, [docs, custoOp, filtroCorretora]);

  const monthDocs = useMemo(() => {
    if (!mesSelecionado) return enriched;
    return enriched.filter((d) => d.monthKey === mesSelecionado);
  }, [enriched, mesSelecionado]);

  const totalGeral = enriched.reduce((a, b) => a + Number(b.filteredValue || 0), 0);
  const totalMes = monthDocs.reduce((a, b) => a + Number(b.filteredValue || 0), 0);
  const totalGenialMes = monthDocs.reduce((a, b) => a + Number(b.genialLiquido || 0), 0);
  const totalRicoMes = monthDocs.reduce((a, b) => a + Number(b.ricoLiquido || 0), 0);
  const opsGenialMes = monthDocs.reduce((a, b) => a + Number(b.opsGenial || 0), 0);
  const opsRicoMes = monthDocs.reduce((a, b) => a + Number(b.opsRico || 0), 0);
  const totalOpsMes = monthDocs.reduce((a, b) => a + Number(b.filteredOps || 0), 0);
  const custoTotalMes = monthDocs.reduce((a, b) => a + Number(b.filteredCost || 0), 0);

  const progressoMensal = metaMensal > 0 ? (totalMes / metaMensal) * 100 : 0;
  const progressoAnual = metaAnual > 0 ? (totalGeral / metaAnual) * 100 : 0;
  const faltaMes = metaMensal - totalMes;
  const faltaAno = metaAnual - totalGeral;
  const status = statusInfo(progressoMensal);

  const sortedMonthDocs = [...monthDocs].sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  const mediaDia = sortedMonthDocs.length ? totalMes / sortedMonthDocs.length : 0;
  const melhorDia = sortedMonthDocs.length
    ? sortedMonthDocs.reduce((m, i) => (i.filteredValue > m.filteredValue ? i : m))
    : null;
  const piorDia = sortedMonthDocs.length
    ? sortedMonthDocs.reduce((m, i) => (i.filteredValue < m.filteredValue ? i : m))
    : null;

  let peak = 0;
  let ddMax = 0;
  let running = 0;
  const capitalCurve = [];
  const drawdownCurve = [];
  const dailyCurve = [];
  const labels = [];

  for (const item of sortedMonthDocs) {
    running += Number(item.filteredValue || 0);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > ddMax) ddMax = dd;

    capitalCurve.push(running);
    drawdownCurve.push(dd);
    dailyCurve.push(Number(item.filteredValue || 0));
    labels.push(item.shortDate || item.dateKey);
  }

  const top5 = [...sortedMonthDocs]
    .sort((a, b) => Number(b.filteredValue || 0) - Number(a.filteredValue || 0))
    .slice(0, 5);

  const bottom5 = [...sortedMonthDocs]
    .sort((a, b) => Number(a.filteredValue || 0) - Number(b.filteredValue || 0))
    .slice(0, 5);

  const prevMonthKey = previousMonth(mesSelecionado);
  const totalMesAnterior = enriched
    .filter((d) => d.monthKey === prevMonthKey)
    .reduce((a, b) => a + Number(b.filteredValue || 0), 0);

  const variacaoMesAnterior =
    totalMesAnterior !== 0 ? ((totalMes - totalMesAnterior) / Math.abs(totalMesAnterior)) * 100 : 0;

  const diasRestantes = businessDaysRemaining(mesSelecionado);
  const valorPorDia = faltaMes > 0 && diasRestantes > 0 ? faltaMes / diasRestantes : 0;

  const availableDays = sortedMonthDocs.map((d) => d.dateKey);
  const selectedDay = sortedMonthDocs.find((d) => d.dateKey === diaSelecionado);

  const weekdayTotals = useMemo(() => {
    const map = {
      Segunda: 0,
      Terça: 0,
      Quarta: 0,
      Quinta: 0,
      Sexta: 0,
    };

    sortedMonthDocs.forEach((d) => {
      const name = getWeekdayName(d.dateKey);
      if (map[name] !== undefined) {
        map[name] += Number(d.filteredValue || 0);
      }
    });

    return map;
  }, [sortedMonthDocs]);

  return (
    <div
      style={{
        background: "radial-gradient(circle at top, #071325 0%, #020617 45%, #01040d 100%)",
        minHeight: "100vh",
        color: "white",
        padding: "28px 20px 40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center" }}>
        <h1
          style={{
            color: "#00ffd5",
            fontSize: 42,
            marginBottom: 18,
            fontWeight: 800,
            letterSpacing: 1,
            textShadow: "0 0 18px rgba(0,255,213,0.15)",
          }}
        >
          DASHBOARD EC
        </h1>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <input type="file" accept=".csv" onChange={(e) => setGenialFile(e.target.files?.[0] || null)} style={{ color: "white" }} />
          <input type="file" accept=".csv" onChange={(e) => setRicoFile(e.target.files?.[0] || null)} style={{ color: "white" }} />

          <input
            type="number"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value) || 0)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 110 }}
          />
          <input
            type="number"
            value={metaAnual}
            onChange={(e) => setMetaAnual(Number(e.target.value) || 0)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 110 }}
          />
          <input
            type="number"
            step="0.01"
            value={custoOp}
            onChange={(e) => setCustoOp(Number(e.target.value) || 0)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 90 }}
          />

          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 140 }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filtroCorretora}
            onChange={(e) => setFiltroCorretora(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 140 }}
          >
            <option value="consolidado">Consolidado</option>
            <option value="genial">Só Genial</option>
            <option value="rico">Só Rico</option>
          </select>

          <button
            onClick={handleUpload}
            disabled={loading}
            style={{
              background: "#00ff9f",
              color: "#000",
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Enviando..." : "Atualizar CSV"}
          </button>
        </div>

        {progressoMensal >= 100 ? (
          <div
            style={{
              marginBottom: 14,
              padding: 14,
              borderRadius: 14,
              background: "linear-gradient(90deg, #00ff8840, #00ffd540)",
              color: "#00ff88",
              fontWeight: 900,
              letterSpacing: 1,
              border: "1px solid #00ff8860",
            }}
          >
            ✅ META BATIDA
          </div>
        ) : null}

        <div
          style={{
            border: `2px solid ${status.color}`,
            marginTop: 10,
            marginBottom: 20,
            padding: 12,
            textAlign: "center",
            borderRadius: 12,
            color: status.color,
            fontWeight: 800,
            fontSize: 24,
          }}
        >
          {status.label}
        </div>

        {!!msg ? <div style={{ marginBottom: 20, color: "#cbd5e1", fontSize: 15 }}>{msg}</div> : null}

        <h2 style={{ marginTop: 10, color: "#fff", marginBottom: 20 }}>
          TOTAL DO MÊS: {money(totalMes)}
        </h2>

        <div
          style={{
            marginTop: 25,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <Panel title="TOTAL GERAL" value={money(totalGeral)} color="#00ff88" />
          <Panel title="TOTAL DO MÊS" value={money(totalMes)} color="#00ffd5" />
          <Panel title="GENIAL" value={money(totalGenialMes)} color="#60a5fa" />
          <Panel title="RICO" value={money(totalRicoMes)} color="#fbbf24" />
          <Panel title="META MENSAL" value={money(metaMensal)} color="#22c55e" />
          <Panel title="META ANUAL" value={money(metaAnual)} color="#22c55e" />
          <Panel title="FALTA MÊS" value={money(faltaMes)} color={faltaMes <= 0 ? "#00ff88" : "#ff4d4f"} />
          <Panel title="FALTA ANO" value={money(faltaAno)} color={faltaAno <= 0 ? "#00ff88" : "#ff4d4f"} />
          <Panel title="CUSTO / OP" value={money(custoOp)} color="#e5e7eb" />
          <Panel title="OPS GENIAL" value={String(opsGenialMes)} color="#60a5fa" />
          <Panel title="OPS RICO" value={String(opsRicoMes)} color="#fbbf24" />
          <Panel title="OPS NO MÊS" value={String(totalOpsMes)} color="#ffd84d" />
          <Panel title="CUSTO TOTAL MÊS" value={money(custoTotalMes)} color="#ff4d4f" />
          <Panel
            title="VALOR POR DIA"
            value={money(valorPorDia)}
            color="#38bdf8"
            sub={diasRestantes > 0 ? `${diasRestantes} dias úteis restantes` : "somente para mês atual"}
          />
          <Panel title="MÊS ANTERIOR" value={money(totalMesAnterior)} color="#cbd5e1" />
          <Panel
            title="VARIAÇÃO VS MÊS ANT."
            value={`${variacaoMesAnterior.toFixed(1)}%`}
            color={variacaoMesAnterior >= 0 ? "#00ff88" : "#ff4d4f"}
          />
          <Panel title="DRAWDOWN" value={money(ddMax)} color="#ff4d4f" />
          <Panel title="MÉDIA POR DIA" value={money(mediaDia)} color="#38bdf8" />
          <Panel title="DIAS NO MÊS" value={String(sortedMonthDocs.length)} color="#e5e7eb" />
        </div>

        <div
          style={{
            marginTop: 22,
            background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
          }}
        >
          <div style={{ marginBottom: 12, fontWeight: 700 }}>Filtro por Dia</div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <select
              value={diaSelecionado}
              onChange={(e) => setDiaSelecionado(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "none", width: 170 }}
            >
              <option value="">Selecione o dia</option>
              {availableDays.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {selectedDay ? (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <Panel title="DATA" value={selectedDay.shortDate} color="#e5e7eb" />
              <Panel title="GENIAL DIA" value={money(selectedDay.genialLiquido)} color="#60a5fa" />
              <Panel title="RICO DIA" value={money(selectedDay.ricoLiquido)} color="#fbbf24" />
              <Panel title="TOTAL DIA" value={money(selectedDay.filteredValue)} color="#00ff88" />
              <Panel title="OPS GENIAL DIA" value={String(selectedDay.opsGenial || 0)} color="#60a5fa" />
              <Panel title="OPS RICO DIA" value={String(selectedDay.opsRico || 0)} color="#fbbf24" />
              <Panel title="CUSTO DIA" value={money(selectedDay.filteredCost)} color="#ff4d4f" />
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          <ProgressCard title="Progress Monthly" value={progressoMensal} color="#00ff88" />
          <ProgressCard title="Progress Annual" value={progressoAnual} color="#38bdf8" />
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          <LineChart
            title="Curva de Capital"
            values={capitalCurve}
            labels={labels}
            color="#00ffd5"
            accent={capitalCurve.length ? `Final: ${money(capitalCurve[capitalCurve.length - 1])}` : ""}
          />
          <LineChart
            title="Curva de Drawdown"
            values={drawdownCurve}
            labels={labels}
            color="#ff4d4f"
            accent={money(ddMax)}
          />
          <LineChart
            title="Curva de Resultado Diário"
            values={dailyCurve}
            labels={labels}
            color="#38bdf8"
            accent={`${dailyCurve.length} dias`}
          />
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          <Ranking title="Top 5 Melhores Dias" items={top5} color="#00ff88" />
          <Ranking title="Top 5 Piores Dias" items={bottom5} color="#ff4d4f" />
        </div>

        <div
          style={{
            marginTop: 22,
            background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Resultado por Dia da Semana</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {Object.entries(weekdayTotals).map(([day, value]) => (
              <Panel key={day} title={day} value={money(value)} color={value >= 0 ? "#00ff88" : "#ff4d4f"} />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <Panel
            title="MELHOR DIA"
            value={melhorDia ? `${melhorDia.shortDate}\n${money(melhorDia.filteredValue)}` : "Sem dados"}
            color="#00ff88"
          />
          <Panel
            title="PIOR DIA"
            value={piorDia ? `${piorDia.shortDate}\n${money(piorDia.filteredValue)}` : "Sem dados"}
            color="#ff4d4f"
          />
        </div>
      </div>
    </div>
  );
}