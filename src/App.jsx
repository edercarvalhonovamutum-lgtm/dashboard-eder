import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";

function parseBR(value) {
  if (value === null || value === undefined || value === "") return 0;
  return (
    parseFloat(String(value).replace(/\./g, "").replace(",", ".").trim()) || 0
  );
}

function splitLine(line) {
  if (line.includes(";")) return line.split(";");
  return line.split(",");
}

function normalizeDate(dateText) {
  const txt = String(dateText || "").trim();
  const onlyDate = txt.split(" ")[0];
  const parts = onlyDate.split("/");

  if (parts.length !== 3) return null;

  const dia = String(parts[0]).padStart(2, "0");
  const mes = String(parts[1]).padStart(2, "0");
  const ano = String(parts[2]);

  return {
    dia,
    mes,
    ano,
    shortDate: `${dia}/${mes}/${ano}`,
    monthKey: `${ano}-${mes}`,
    dateKey: `${ano}-${mes}-${dia}`,
  };
}

function parseProfitCsv(text) {
  const linhas = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const dados = [];

  for (let i = 0; i < linhas.length; i++) {
    const cols = splitLine(linhas[i]);
    if (!cols || cols.length < 18) continue;

    const dataRaw = String(cols[2] || "").trim();
    const totalRaw = String(cols[17] || "").trim();

    if (!dataRaw.includes("/")) continue;

    const dateInfo = normalizeDate(dataRaw);
    if (!dateInfo) continue;

    const valor = parseBR(totalRaw);

    dados.push({
      dateKey: dateInfo.dateKey,
      shortDate: dateInfo.shortDate,
      monthKey: dateInfo.monthKey,
      dia: dateInfo.dia,
      mes: dateInfo.mes,
      ano: dateInfo.ano,
      valor,
      operacoes: 1,
    });
  }

  return dados;
}

function agruparPorDia(lista) {
  const mapa = {};

  lista.forEach((item) => {
    if (!mapa[item.dateKey]) {
      mapa[item.dateKey] = {
        dateKey: item.dateKey,
        shortDate: item.shortDate,
        monthKey: item.monthKey,
        dia: item.dia,
        mes: item.mes,
        ano: item.ano,
        valor: 0,
        operacoes: 0,
      };
    }
    mapa[item.dateKey].valor += item.valor;
    mapa[item.dateKey].operacoes += Number(item.operacoes || 0);
  });

  return Object.values(mapa);
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function getPreviousMonthKey(monthKey) {
  if (!monthKey) return "";
  const [anoStr, mesStr] = monthKey.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const data = new Date(ano, mes - 2, 1);
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getBusinessDaysRemaining(monthKey) {
  if (!monthKey) return 0;

  const [anoStr, mesStr] = monthKey.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  const hoje = new Date();
  const currentMonthKey = `${hoje.getFullYear()}-${String(
    hoje.getMonth() + 1
  ).padStart(2, "0")}`;

  if (monthKey !== currentMonthKey) return 0;

  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fim = new Date(ano, mes, 0);

  let total = 0;
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) total++;
  }
  return total;
}

function getStatus(progressoMensal) {
  if (progressoMensal >= 100) {
    return { text: "TARGET ACHIEVED", color: "#00ff88" };
  }
  if (progressoMensal >= 70) {
    return { text: "ON TRACK", color: "#FFD700" };
  }
  return { text: "BEHIND", color: "#ff4d4f" };
}

function StatCard({ title, value, sub, color = "#00ff88" }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        minHeight: 108,
      }}
    >
      <div style={{ color: "#7c8ba1", fontSize: 11, marginBottom: 10, letterSpacing: 0.6 }}>
        {title}
      </div>
      <div
        style={{
          color,
          fontWeight: 800,
          fontSize: 18,
          lineHeight: 1.2,
          whiteSpace: "pre-line",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ color: "#64748b", fontSize: 11, marginTop: 10 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function ProgressBlock({ title, value, color }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ marginBottom: 10, fontWeight: 700 }}>{title}</div>
      <div
        style={{
          width: "100%",
          height: 16,
          background: "#182235",
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
      <div style={{ marginTop: 8, color: "#cbd5e1", fontWeight: 700 }}>
        {value.toFixed(1)}%
      </div>
    </div>
  );
}

function RankingCard({ title, items, color }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
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
              padding: "8px 0",
              borderBottom: idx === items.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)",
              gap: 10,
            }}
          >
            <div style={{ color: "#dbe4ee", fontSize: 13 }}>{item.shortDate}</div>
            <div style={{ color, fontWeight: 800, fontSize: 13 }}>
              {formatMoney(item.totalLiquido)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SimpleLineChart({ title, values, labels = [], lineColor = "#00ffd5", accentText }) {
  if (!values.length) {
    return (
      <div
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
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
  const padding = 22;
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const scaleX = (idx) =>
    padding + (idx * (width - padding * 2)) / Math.max(values.length - 1, 1);

  const scaleY = (value) =>
    padding + ((maxVal - value) * (height - padding * 2)) / range;

  const points = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" ");

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>{title}</div>
        {accentText ? (
          <div style={{ color: lineColor, fontWeight: 800 }}>{accentText}</div>
        ) : null}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 240, display: "block" }}>
        <rect x="0" y="0" width={width} height={height} fill="#0b1220" rx="14" />
        <polyline
          fill="none"
          stroke={lineColor}
          strokeWidth="4"
          points={points}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {labels.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            color: "#64748b",
            fontSize: 11,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            overflow: "hidden",
          }}
        >
          <span>{labels[0]}</span>
          <span>{labels[Math.floor((labels.length - 1) / 2)] || ""}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [dados, setDados] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);
  const [metaAnual, setMetaAnual] = useState(120000);
  const [custoOperacao, setCustoOperacao] = useState(2.8);
  const [arquivoGenial, setArquivoGenial] = useState(null);
  const [arquivoRico, setArquivoRico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [diaSelecionado, setDiaSelecionado] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trades"), (snap) => {
      const lista = [];
      snap.forEach((docSnap) => {
        lista.push(docSnap.data());
      });
      lista.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
      setDados(lista);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!mesSelecionado && dados.length > 0) {
      const ultimoMes = [...new Set(dados.map((item) => item.monthKey))].sort().pop();
      if (ultimoMes) setMesSelecionado(ultimoMes);
    }
  }, [dados, mesSelecionado]);

  async function salvarArquivoNoFirebase(file, corretora) {
    if (!file) return;

    const text = await file.text();
    const bruto = parseProfitCsv(text);
    const agrupado = agruparPorDia(bruto);

    for (const item of agrupado) {
      const ref = doc(db, "trades", item.dateKey);
      const existente = await getDoc(ref);
      const atual = existente.exists() ? existente.data() : {};

      const genialAtual = Number(atual.genial || 0);
      const ricoAtual = Number(atual.rico || 0);
      const opsGenialAtual = Number(atual.opsGenial || 0);
      const opsRicoAtual = Number(atual.opsRico || 0);

      await setDoc(
        ref,
        {
          dateKey: item.dateKey,
          shortDate: item.shortDate,
          monthKey: item.monthKey,
          dia: item.dia,
          mes: item.mes,
          ano: item.ano,
          genial: corretora === "Genial" ? item.valor : genialAtual,
          rico: corretora === "Rico" ? item.valor : ricoAtual,
          opsGenial: corretora === "Genial" ? item.operacoes : opsGenialAtual,
          opsRico: corretora === "Rico" ? item.operacoes : opsRicoAtual,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
  }

  async function handleUpload() {
    if (!arquivoGenial && !arquivoRico) {
      setMensagem("Escolha pelo menos um arquivo.");
      return;
    }

    try {
      setLoading(true);
      setMensagem("Enviando para o Firebase...");

      if (arquivoGenial) {
        await salvarArquivoNoFirebase(arquivoGenial, "Genial");
      }
      if (arquivoRico) {
        await salvarArquivoNoFirebase(arquivoRico, "Rico");
      }

      setMensagem("Salvo no Firebase 🚀");
      alert("Salvo no Firebase 🚀");
    } catch (error) {
      console.error(error);
      setMensagem("Erro ao salvar no Firebase.");
      alert("Erro ao salvar no Firebase.");
    } finally {
      setLoading(false);
    }
  }

  const mesesDisponiveis = useMemo(() => {
    return [...new Set(dados.map((item) => item.monthKey))].sort();
  }, [dados]);

  const dadosCalculados = useMemo(() => {
    return dados.map((item) => {
      const genialBruto = Number(item.genial || 0);
      const ricoBruto = Number(item.rico || 0);
      const opsGenial = Number(item.opsGenial || 0);
      const opsRico = Number(item.opsRico || 0);

      const genialLiquido = genialBruto - opsGenial * Number(custoOperacao || 0);
      const ricoLiquido = ricoBruto - opsRico * Number(custoOperacao || 0);

      return {
        ...item,
        genialLiquido,
        ricoLiquido,
        totalLiquido: genialLiquido + ricoLiquido,
        operacoesTotal: opsGenial + opsRico,
        custoTotal: (opsGenial + opsRico) * Number(custoOperacao || 0),
      };
    });
  }, [dados, custoOperacao]);

  const dadosMesCalculados = useMemo(() => {
    if (!mesSelecionado) return dadosCalculados;
    return dadosCalculados.filter((item) => item.monthKey === mesSelecionado);
  }, [dadosCalculados, mesSelecionado]);

  const totalGeral = dadosCalculados.reduce((acc, item) => acc + Number(item.totalLiquido || 0), 0);
  const totalMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.totalLiquido || 0), 0);
  const totalGenialMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.genialLiquido || 0), 0);
  const totalRicoMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.ricoLiquido || 0), 0);

  const totalOpsMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.operacoesTotal || 0), 0);
  const opsGenialMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.opsGenial || 0), 0);
  const opsRicoMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.opsRico || 0), 0);
  const custoTotalMes = dadosMesCalculados.reduce((acc, item) => acc + Number(item.custoTotal || 0), 0);

  const progressoMensal = metaMensal > 0 ? (totalMes / metaMensal) * 100 : 0;
  const progressoAnual = metaAnual > 0 ? (totalGeral / metaAnual) * 100 : 0;
  const faltaMensal = metaMensal - totalMes;
  const faltaAnual = metaAnual - totalGeral;

  const status = getStatus(progressoMensal);

  const diasOrdenadosMes = [...dadosMesCalculados].sort((a, b) =>
    String(a.dateKey).localeCompare(String(b.dateKey))
  );

  const melhorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((max, item) =>
          Number(item.totalLiquido || 0) > Number(max.totalLiquido || 0) ? item : max
        )
      : null;

  const piorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((min, item) =>
          Number(item.totalLiquido || 0) < Number(min.totalLiquido || 0) ? item : min
        )
      : null;

  const mediaDia = diasOrdenadosMes.length > 0 ? totalMes / diasOrdenadosMes.length : 0;

  let pico = 0;
  let drawdownMax = 0;
  let acumulado = 0;
  const curvaCapital = [];
  const curvaDrawdown = [];
  const curvaDiasOperacao = [];
  const labelsDias = [];

  for (let i = 0; i < diasOrdenadosMes.length; i++) {
    const item = diasOrdenadosMes[i];
    acumulado += Number(item.totalLiquido || 0);
    if (acumulado > pico) pico = acumulado;
    const ddAtual = pico - acumulado;
    if (ddAtual > drawdownMax) drawdownMax = ddAtual;

    curvaCapital.push(acumulado);
    curvaDrawdown.push(ddAtual);
    curvaDiasOperacao.push(Number(item.totalLiquido || 0));
    labelsDias.push(item.shortDate);
  }

  const topDias = [...diasOrdenadosMes]
    .sort((a, b) => Number(b.totalLiquido || 0) - Number(a.totalLiquido || 0))
    .slice(0, 5);

  const pioresDias = [...diasOrdenadosMes]
    .sort((a, b) => Number(a.totalLiquido || 0) - Number(b.totalLiquido || 0))
    .slice(0, 5);

  const mesAnteriorKey = getPreviousMonthKey(mesSelecionado);
  const totalMesAnterior = dadosCalculados
    .filter((item) => item.monthKey === mesAnteriorKey)
    .reduce((acc, item) => acc + Number(item.totalLiquido || 0), 0);

  const variacaoMesAnterior =
    totalMesAnterior !== 0
      ? ((totalMes - totalMesAnterior) / Math.abs(totalMesAnterior)) * 100
      : 0;

  const diasUteisRestantes = getBusinessDaysRemaining(mesSelecionado);
  const valorPorDia =
    faltaMensal > 0 && diasUteisRestantes > 0 ? faltaMensal / diasUteisRestantes : 0;

  const datasDisponiveis = diasOrdenadosMes.map((item) => item.dateKey);
  const diaFiltrado = diasOrdenadosMes.find((item) => item.dateKey === diaSelecionado);

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
      <div style={{ maxWidth: "1280px", margin: "0 auto", textAlign: "center" }}>
        <h1
          style={{
            color: "#00ffd5",
            fontSize: "60px",
            marginBottom: "18px",
            fontWeight: "800",
            letterSpacing: "1px",
            textShadow: "0 0 18px rgba(0,255,213,0.15)",
          }}
        >
          DASHBOARD EC
        </h1>

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "18px",
          }}
        >
          <input type="file" accept=".csv" onChange={(e) => setArquivoGenial(e.target.files?.[0] || null)} style={{ color: "white" }} />
          <input type="file" accept=".csv" onChange={(e) => setArquivoRico(e.target.files?.[0] || null)} style={{ color: "white" }} />

          <input
            type="number"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value) || 0)}
            style={{ padding: "8px", borderRadius: "8px", border: "none", width: "110px" }}
            placeholder="Meta mês"
          />

          <input
            type="number"
            value={metaAnual}
            onChange={(e) => setMetaAnual(Number(e.target.value) || 0)}
            style={{ padding: "8px", borderRadius: "8px", border: "none", width: "110px" }}
            placeholder="Meta ano"
          />

          <input
            type="number"
            step="0.01"
            value={custoOperacao}
            onChange={(e) => setCustoOperacao(Number(e.target.value) || 0)}
            style={{ padding: "8px", borderRadius: "8px", border: "none", width: "90px" }}
            placeholder="Custo/op"
          />

          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            style={{ padding: "8px", borderRadius: "8px", border: "none", width: "140px" }}
          >
            {mesesDisponiveis.map((mes) => (
              <option key={mes} value={mes}>
                {mes}
              </option>
            ))}
          </select>

          <button
            onClick={handleUpload}
            disabled={loading}
            style={{
              background: "#00ff9f",
              color: "#000",
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              fontWeight: "800",
              boxShadow: "0 0 20px rgba(0,255,159,0.2)",
            }}
          >
            {loading ? "Enviando..." : "Atualizar CSV"}
          </button>
        </div>

        <div
          style={{
            border: `2px solid ${status.color}`,
            marginTop: 10,
            marginBottom: 20,
            padding: 12,
            textAlign: "center",
            borderRadius: 12,
            color: status.color,
            fontWeight: "800",
            fontSize: "24px",
            boxShadow: `0 0 18px ${status.color}22`,
          }}
        >
          {status.text}
        </div>

        {!!mensagem && (
          <div style={{ marginBottom: 20, color: "#cbd5e1", fontSize: "15px" }}>
            {mensagem}
          </div>
        )}

        <h2 style={{ marginTop: 10, color: "#ffffff", marginBottom: 20 }}>
          TOTAL DO MÊS: {formatMoney(totalMes)}
        </h2>

        <div
          style={{
            marginTop: 25,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
          }}
        >
          <StatCard title="TOTAL GERAL" value={formatMoney(totalGeral)} color="#00ff88" />
          <StatCard title="TOTAL DO MÊS" value={formatMoney(totalMes)} color="#00ffd5" />
          <StatCard title="GENIAL" value={formatMoney(totalGenialMes)} color="#60a5fa" />
          <StatCard title="RICO" value={formatMoney(totalRicoMes)} color="#fbbf24" />
          <StatCard title="META MENSAL" value={formatMoney(metaMensal)} color="#22c55e" />
          <StatCard title="META ANUAL" value={formatMoney(metaAnual)} color="#22c55e" />
          <StatCard title="FALTA MÊS" value={formatMoney(faltaMensal)} color={faltaMensal <= 0 ? "#00ff88" : "#ff4d4f"} />
          <StatCard title="FALTA ANO" value={formatMoney(faltaAnual)} color={faltaAnual <= 0 ? "#00ff88" : "#ff4d4f"} />
          <StatCard title="CUSTO / OP" value={formatMoney(custoOperacao)} color="#e5e7eb" />
          <StatCard title="OPS GENIAL" value={String(opsGenialMes)} color="#60a5fa" />
          <StatCard title="OPS RICO" value={String(opsRicoMes)} color="#fbbf24" />
          <StatCard title="OPS NO MÊS" value={String(totalOpsMes)} color="#ffd84d" />
          <StatCard title="CUSTO TOTAL MÊS" value={formatMoney(custoTotalMes)} color="#ff4d4f" />
          <StatCard
            title="VALOR POR DIA"
            value={formatMoney(valorPorDia)}
            color="#38bdf8"
            sub={diasUteisRestantes > 0 ? `${diasUteisRestantes} dias úteis restantes` : "somente para mês atual"}
          />
          <StatCard title="MÊS ANTERIOR" value={formatMoney(totalMesAnterior)} color="#cbd5e1" />
          <StatCard
            title="VARIAÇÃO VS MÊS ANT."
            value={`${variacaoMesAnterior.toFixed(1)}%`}
            color={variacaoMesAnterior >= 0 ? "#00ff88" : "#ff4d4f"}
          />
          <StatCard title="DRAWDOWN" value={formatMoney(drawdownMax)} color="#ff4d4f" />
          <StatCard title="MÉDIA POR DIA" value={formatMoney(mediaDia)} color="#38bdf8" />
          <StatCard title="DIAS NO MÊS" value={String(diasOrdenadosMes.length)} color="#e5e7eb" />
        </div>

        <div
          style={{
            marginTop: 22,
            background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(6,13,26,0.95) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ marginBottom: 12, fontWeight: 700 }}>Filtro por Dia</div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <select
              value={diaSelecionado}
              onChange={(e) => setDiaSelecionado(e.target.value)}
              style={{ padding: "8px", borderRadius: "8px", border: "none", width: "160px" }}
            >
              <option value="">Selecione o dia</option>
              {datasDisponiveis.map((data) => (
                <option key={data} value={data}>
                  {data}
                </option>
              ))}
            </select>
          </div>

          {diaFiltrado ? (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <StatCard title="DATA" value={diaFiltrado.shortDate} color="#e5e7eb" />
              <StatCard title="GENIAL DIA" value={formatMoney(diaFiltrado.genialLiquido)} color="#60a5fa" />
              <StatCard title="RICO DIA" value={formatMoney(diaFiltrado.ricoLiquido)} color="#fbbf24" />
              <StatCard title="TOTAL DIA" value={formatMoney(diaFiltrado.totalLiquido)} color="#00ff88" />
              <StatCard title="OPS GENIAL DIA" value={String(diaFiltrado.opsGenial || 0)} color="#60a5fa" />
              <StatCard title="OPS RICO DIA" value={String(diaFiltrado.opsRico || 0)} color="#fbbf24" />
              <StatCard title="CUSTO DIA" value={formatMoney(diaFiltrado.custoTotal)} color="#ff4d4f" />
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "14px",
          }}
        >
          <ProgressBlock title="Progress Monthly" value={progressoMensal} color="#00ff88" />
          <ProgressBlock title="Progress Annual" value={progressoAnual} color="#38bdf8" />
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "14px",
          }}
        >
          <SimpleLineChart
            title="Curva de Capital"
            values={curvaCapital}
            labels={labelsDias}
            lineColor="#00ffd5"
            accentText={curvaCapital.length ? `Final: ${formatMoney(curvaCapital[curvaCapital.length - 1])}` : ""}
          />
          <SimpleLineChart
            title="Curva de Drawdown"
            values={curvaDrawdown}
            labels={labelsDias}
            lineColor="#ff4d4f"
            accentText={formatMoney(drawdownMax)}
          />
          <SimpleLineChart
            title="Curva de Dias de Operação"
            values={curvaDiasOperacao}
            labels={labelsDias}
            lineColor="#38bdf8"
            accentText={`${curvaDiasOperacao.length} dias`}
          />
        </div>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "14px",
          }}
        >
          <RankingCard title="Top 5 Melhores Dias" items={topDias} color="#00ff88" />
          <RankingCard title="Top 5 Piores Dias" items={pioresDias} color="#ff4d4f" />
        </div>
      </div>
    </div>
  );
}