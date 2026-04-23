import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { db } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

const CUSTO_POR_OP = 2.9;
const META_ANUAL_FIXA = 120000;

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
    dd,
    mm,
    yyyy,
    dateKey: `${yyyy}-${mm}-${dd}`,
    shortDate: `${dd}/${mm}/${yyyy}`,
    monthKey: `${yyyy}-${mm}`,
    yearKey: `${yyyy}`,
  };
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

function normalizeHeaderText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "")
    .replace(/[^\w\s.%]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumnIndex(header, matcher) {
  for (let i = 0; i < header.length; i++) {
    const h = normalizeHeaderText(header[i]);
    if (matcher(h)) return i;
  }
  return -1;
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
      <div
        style={{
          color: "#7c8ba1",
          fontSize: 11,
          marginBottom: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ color, fontWeight: 800, fontSize: 18, lineHeight: 1.2, whiteSpace: "pre-line" }}>
        {value}
      </div>
      {sub ? <div style={{ color: "#64748b", fontSize: 11, marginTop: 10 }}>{sub}</div> : null}
    </div>
  );
}

function ChartCard({ title, children, rightLabel }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
        minHeight: 360,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        {rightLabel ? (
          <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>{rightLabel}</div>
        ) : null}
      </div>
      <div style={{ width: "100%", height: 280 }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [genialFile, setGenialFile] = useState(null);
  const [ricoFile, setRicoFile] = useState(null);
  const [mes, setMes] = useState("2026-04");
  const [metaMensal, setMetaMensal] = useState(10000);
  const [msg, setMsg] = useState("");
  const [docsMes, setDocsMes] = useState([]);
  const [docsAno, setDocsAno] = useState([]);
  const [dataFiltro, setDataFiltro] = useState("");

  const anoSelecionado = mes.split("-")[0] || "2026";

  const carregarDados = async () => {
    try {
      const qMes = query(collection(db, "trades"), where("monthKey", "==", mes));
      const snapshotMes = await getDocs(qMes);

      const rowsMes = [];
      snapshotMes.forEach((d) => rowsMes.push(d.data()));
      rowsMes.sort((a, b) => String(a.dateKey || "").localeCompare(String(b.dateKey || "")));
      setDocsMes(rowsMes);

      const snapshotAno = await getDocs(collection(db, "trades"));
      const rowsAno = [];
      snapshotAno.forEach((d) => {
        const item = d.data();
        if (String(item.ano || "") === String(anoSelecionado)) {
          rowsAno.push(item);
        }
      });
      rowsAno.sort((a, b) => String(a.dateKey || "").localeCompare(String(b.dateKey || "")));
      setDocsAno(rowsAno);
    } catch (error) {
      console.error(error);
      setMsg("Erro ao carregar dados do Firebase.");
    }
  };

  useEffect(() => {
    carregarDados();
  }, [mes]);

  const limparMes = async () => {
    try {
      setMsg("Limpando mês no Firebase...");
      const snapshot = await getDocs(collection(db, "trades"));

      for (const docSnap of snapshot.docs) {
        if (docSnap.id.startsWith(mes)) {
          await deleteDoc(doc(db, "trades", docSnap.id));
        }
      }

      setMsg("Mês limpo com sucesso.");
      await carregarDados();
      alert("🔥 Mês limpo com sucesso!");
    } catch (error) {
      console.error(error);
      setMsg("Erro ao limpar mês.");
      alert(`Erro ao limpar mês: ${error.message || error}`);
    }
  };

  const processCSV = (file, broker) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        delimiter: ";",
        complete: (results) => {
          try {
            const rows = results.data || [];
            let headerIndex = -1;
            let header = [];

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i].map((c) => String(c || "").trim());
              const col0 = normalizeHeaderText(row[0]);
              const col1 = normalizeHeaderText(row[1]);

              if (col0 === "ativo" && col1 === "abertura") {
                headerIndex = i;
                header = row;
                break;
              }
            }

            if (headerIndex === -1) {
              reject(
                new Error(
                  `Cabeçalho do CSV de ${broker} não encontrado. Primeiras linhas: ${JSON.stringify(
                    rows.slice(0, 5)
                  )}`
                )
              );
              return;
            }

            const idxFechamento = findColumnIndex(header, (h) => h.includes("fechamento"));
            const idxResOperacao = findColumnIndex(
              header,
              (h) => h.includes("res") && h.includes("oper")
            );

            if (idxFechamento === -1 || idxResOperacao === -1) {
              reject(
                new Error(
                  `Colunas necessárias não encontradas no CSV de ${broker}. Cabeçalho encontrado: ${JSON.stringify(
                    header
                  )}`
                )
              );
              return;
            }

            const dataRows = rows.slice(headerIndex + 1);
            const grouped = {};

            dataRows.forEach((rawRow) => {
              const row = rawRow.map((c) => String(c || "").trim());
              if (!row.length) return;

              const fechamento = row[idxFechamento];
              const resOperacaoRaw = row[idxResOperacao];

              if (!fechamento || !String(fechamento).includes("/")) return;
              if (
                resOperacaoRaw === "" ||
                resOperacaoRaw === undefined ||
                resOperacaoRaw === null
              )
                return;

              const dateInfo = normalizeDate(fechamento);
              if (!dateInfo) return;

              const resultado = toNumberBR(resOperacaoRaw);

              if (!grouped[dateInfo.dateKey]) {
                grouped[dateInfo.dateKey] = {
                  dateKey: dateInfo.dateKey,
                  shortDate: dateInfo.shortDate,
                  monthKey: dateInfo.monthKey,
                  ano: dateInfo.yearKey,
                  genial: 0,
                  rico: 0,
                  opsGenial: 0,
                  opsRico: 0,
                };
              }

              if (broker === "genial") {
                grouped[dateInfo.dateKey].genial += resultado;
                grouped[dateInfo.dateKey].opsGenial += 1;
              } else {
                grouped[dateInfo.dateKey].rico += resultado;
                grouped[dateInfo.dateKey].opsRico += 1;
              }
            });

            resolve(grouped);
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(err),
      });
    });
  };

  const uploadData = async () => {
    try {
      if (!genialFile && !ricoFile) {
        alert("Escolha pelo menos um CSV.");
        return;
      }

      setMsg("Enviando CSV para o Firebase...");

      const genialData = genialFile ? await processCSV(genialFile, "genial") : {};
      const ricoData = ricoFile ? await processCSV(ricoFile, "rico") : {};

      const allDates = new Set([
        ...Object.keys(genialData),
        ...Object.keys(ricoData),
      ]);

      for (const dateKey of allDates) {
        const g = genialData[dateKey] || {};
        const r = ricoData[dateKey] || {};

        const genial = Number(g.genial || 0);
        const rico = Number(r.rico || 0);
        const opsGenial = Number(g.opsGenial || 0);
        const opsRico = Number(r.opsRico || 0);

        const [year, month, day] = dateKey.split("-");

        await setDoc(
          doc(db, "trades", dateKey),
          {
            dateKey,
            shortDate: `${day}/${month}/${year}`,
            ano: year,
            mes: month,
            dia: day,
            monthKey: `${year}-${month}`,
            genial: Number(genial.toFixed(2)),
            rico: Number(rico.toFixed(2)),
            opsGenial,
            opsRico,
            custo: Number(((opsGenial + opsRico) * CUSTO_POR_OP).toFixed(2)),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      setMsg("Salvo no Firebase 🚀");
      await carregarDados();
      alert("🚀 Dados atualizados com sucesso!");
    } catch (error) {
      console.error(error);
      const detail = error?.message || String(error);
      setMsg(`Erro ao atualizar CSV: ${detail}`);
      alert(`Erro ao atualizar CSV:\n\n${detail}`);
    }
  };

  const calculado = useMemo(() => {
    const rows = docsMes.map((item) => {
      const genial = Number(item.genial || 0);
      const rico = Number(item.rico || 0);
      const opsGenial = Number(item.opsGenial || 0);
      const opsRico = Number(item.opsRico || 0);

      const genialLiquido = genial - opsGenial * CUSTO_POR_OP;
      const ricoLiquido = rico - opsRico * CUSTO_POR_OP;
      const totalLiquido = genialLiquido + ricoLiquido;
      const opsTotal = opsGenial + opsRico;
      const custoTotal = opsTotal * CUSTO_POR_OP;

      return {
        ...item,
        genialLiquido,
        ricoLiquido,
        totalLiquido,
        opsTotal,
        custoTotal,
      };
    });

    const totalMes = rows.reduce((a, b) => a + b.totalLiquido, 0);
    const genialMes = rows.reduce((a, b) => a + b.genialLiquido, 0);
    const ricoMes = rows.reduce((a, b) => a + b.ricoLiquido, 0);
    const opsGenial = rows.reduce((a, b) => a + Number(b.opsGenial || 0), 0);
    const opsRico = rows.reduce((a, b) => a + Number(b.opsRico || 0), 0);
    const opsTotal = rows.reduce((a, b) => a + b.opsTotal, 0);
    const custoTotalMes = rows.reduce((a, b) => a + b.custoTotal, 0);

    const faltaMes = metaMensal - totalMes;
    const diasRestantes = businessDaysRemaining(mes);
    const valorPorDia =
      faltaMes > 0 && diasRestantes > 0 ? faltaMes / diasRestantes : 0;
    const progresso = metaMensal > 0 ? (totalMes / metaMensal) * 100 : 0;

    const { label: status, color: statusColor } = statusInfo(progresso);

    let acumulado = 0;
    let pico = 0;
    let drawdownMax = 0;

    const curvaCapital = rows.map((r) => {
      acumulado += r.totalLiquido;
      if (acumulado > pico) pico = acumulado;

      const drawdownAtual = pico - acumulado;
      if (drawdownAtual > drawdownMax) drawdownMax = drawdownAtual;

      return {
        data: r.shortDate,
        valor: Number(acumulado.toFixed(2)),
      };
    });

    acumulado = 0;
    pico = 0;

    const curvaDrawdown = rows.map((r) => {
      acumulado += r.totalLiquido;
      if (acumulado > pico) pico = acumulado;

      return {
        data: r.shortDate,
        valor: Number((pico - acumulado).toFixed(2)),
      };
    });

    const mediaDia = rows.length ? totalMes / rows.length : 0;

    return {
      rows,
      totalMes,
      genialMes,
      ricoMes,
      opsGenial,
      opsRico,
      opsTotal,
      custoTotalMes,
      faltaMes,
      diasRestantes,
      valorPorDia,
      progresso,
      status,
      statusColor,
      curvaCapital,
      curvaDrawdown,
      drawdownMax,
      mediaDia,
    };
  }, [docsMes, mes, metaMensal]);

  const calculadoAno = useMemo(() => {
    const rows = docsAno.map((item) => {
      const genial = Number(item.genial || 0);
      const rico = Number(item.rico || 0);
      const opsGenial = Number(item.opsGenial || 0);
      const opsRico = Number(item.opsRico || 0);

      const genialLiquido = genial - opsGenial * CUSTO_POR_OP;
      const ricoLiquido = rico - opsRico * CUSTO_POR_OP;
      const totalLiquido = genialLiquido + ricoLiquido;

      return {
        ...item,
        totalLiquido,
      };
    });

    const totalAno = rows.reduce((a, b) => a + b.totalLiquido, 0);
    const faltaAno = META_ANUAL_FIXA - totalAno;
    const progressoAno = META_ANUAL_FIXA > 0 ? (totalAno / META_ANUAL_FIXA) * 100 : 0;

    return {
      totalAno,
      faltaAno,
      progressoAno,
    };
  }, [docsAno]);

  const detalheDia = useMemo(() => {
    if (!dataFiltro) {
      return {
        genial: 0,
        rico: 0,
        total: 0,
        opsGenial: 0,
        opsRico: 0,
      };
    }

    const item = docsMes.find((d) => d.dateKey === dataFiltro);

    if (!item) {
      return {
        genial: 0,
        rico: 0,
        total: 0,
        opsGenial: 0,
        opsRico: 0,
      };
    }

    const genial = Number(item.genial || 0) - Number(item.opsGenial || 0) * CUSTO_POR_OP;
    const rico = Number(item.rico || 0) - Number(item.opsRico || 0) * CUSTO_POR_OP;
    const total = genial + rico;

    return {
      genial,
      rico,
      total,
      opsGenial: Number(item.opsGenial || 0),
      opsRico: Number(item.opsRico || 0),
    };
  }, [dataFiltro, docsMes]);

  return (
    <div
      style={{
        background:
          "radial-gradient(circle at top, #071325 0%, #020617 45%, #01040d 100%)",
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
            fontSize: 30,
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
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setGenialFile(e.target.files?.[0] || null)}
            style={{ color: "white" }}
          />
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setRicoFile(e.target.files?.[0] || null)}
            style={{ color: "white" }}
          />

          <input
            type="number"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value) || 0)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 120 }}
          />

          <input
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "none", width: 120 }}
            placeholder="2026-04"
          />

          <button
            onClick={limparMes}
            style={{
              background: "#ff3b3b",
              color: "#fff",
              padding: "10px 18px",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Limpar mês
          </button>

          <button
            onClick={uploadData}
            style={{
              background: "#00ff9f",
              color: "#000",
              padding: "10px 18px",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Atualizar CSV
          </button>
        </div>

        <div
          style={{
            border: `2px solid ${calculado.statusColor}`,
            marginTop: 10,
            marginBottom: 20,
            padding: 12,
            textAlign: "center",
            borderRadius: 12,
            color: calculado.statusColor,
            fontWeight: 800,
            fontSize: 24,
          }}
        >
          {calculado.status}
        </div>

        {!!msg ? (
          <div
            style={{
              marginBottom: 20,
              color: "#cbd5e1",
              fontSize: 14,
              maxWidth: 1000,
              marginInline: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg}
          </div>
        ) : null}

        <h2 style={{ marginTop: 10, color: "#fff", marginBottom: 20 }}>
          TOTAL DO MÊS: {money(calculado.totalMes)}
        </h2>

        <div
          style={{
            marginTop: 25,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <Panel title="TOTAL DO MÊS" value={money(calculado.totalMes)} color="#00ffd5" />
          <Panel title="GENIAL" value={money(calculado.genialMes)} color="#60a5fa" />
          <Panel title="RICO" value={money(calculado.ricoMes)} color="#fbbf24" />
          <Panel title="META MENSAL" value={money(metaMensal)} color="#22c55e" />
          <Panel
            title="FALTA MÊS"
            value={money(calculado.faltaMes)}
            color={calculado.faltaMes <= 0 ? "#00ff88" : "#ff4d4f"}
          />
          <Panel title="OPS GENIAL" value={String(calculado.opsGenial)} color="#60a5fa" />
          <Panel title="OPS RICO" value={String(calculado.opsRico)} color="#fbbf24" />
          <Panel title="OPS NO MÊS" value={String(calculado.opsTotal)} color="#ffd84d" />
          <Panel title="CUSTO / OP" value={money(CUSTO_POR_OP)} color="#e5e7eb" />
          <Panel title="CUSTO TOTAL MÊS" value={money(calculado.custoTotalMes)} color="#ff4d4f" />
          <Panel
            title="VALOR POR DIA"
            value={money(calculado.valorPorDia)}
            color="#38bdf8"
            sub={
              calculado.diasRestantes > 0
                ? `${calculado.diasRestantes} dias úteis restantes`
                : "somente para mês atual"
            }
          />
          <Panel title="DIAS NO MÊS" value={String(calculado.rows.length)} color="#e5e7eb" />
          <Panel title="DRAWDOWN MÁXIMO" value={money(calculado.drawdownMax)} color="#ff4d4f" />
          <Panel title="MÉDIA POR DIA" value={money(calculado.mediaDia)} color="#38bdf8" />
          <Panel title="META ANUAL" value={money(META_ANUAL_FIXA)} color="#22c55e" />
          <Panel title="TOTAL ANUAL" value={money(calculadoAno.totalAno)} color="#00ffd5" />
          <Panel
            title="FALTA ANUAL"
            value={money(calculadoAno.faltaAno)}
            color={calculadoAno.faltaAno <= 0 ? "#00ff88" : "#ff4d4f"}
          />
        </div>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 16 }}>
              Filtro por Dia
            </div>

            <input
              type="date"
              value={dataFiltro}
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "none",
                width: "100%",
                marginBottom: 14,
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 10,
                textAlign: "left",
              }}
            >
              <div style={{ color: "#60a5fa", fontWeight: 700 }}>
                Genial no dia: {money(detalheDia.genial)}
              </div>
              <div style={{ color: "#fbbf24", fontWeight: 700 }}>
                Rico no dia: {money(detalheDia.rico)}
              </div>
              <div style={{ color: "#00ffd5", fontWeight: 800 }}>
                Total do dia: {money(detalheDia.total)}
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>
                Ops Genial: {detalheDia.opsGenial}
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>
                Ops Rico: {detalheDia.opsRico}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,13,26,0.96) 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 16 }}>
              Progresso Anual
            </div>

            <div
              style={{
                width: "100%",
                height: 18,
                background: "#0f172a",
                borderRadius: 999,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, calculadoAno.progressoAno))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #00ffd5 0%, #00ff88 100%)",
                }}
              />
            </div>

            <div
              style={{
                marginTop: 12,
                color: "#cbd5e1",
                fontWeight: 700,
              }}
            >
              {calculadoAno.progressoAno.toFixed(1)}% da meta anual
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: 16,
          }}
        >
          <ChartCard
            title="Curva de Capital"
            rightLabel={`Final: ${money(calculado.totalMes)}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calculado.curvaCapital}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(value) => money(value)}
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    color: "#fff",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#00ffd5"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Curva de Drawdown"
            rightLabel={`Máx: ${money(calculado.drawdownMax)}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={calculado.curvaDrawdown}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(value) => money(value)}
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid #1e293b",
                    borderRadius: 10,
                    color: "#fff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="#ff4d4f"
                  fill="#ff4d4f55"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}