import { useEffect, useMemo, useState } from "react";
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

function Card({ titulo, valor, cor = "#00ff88", subtitulo = "" }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #08101f 100%)",
        padding: 16,
        borderRadius: 16,
        textAlign: "center",
        border: "1px solid #162033",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
        {titulo}
      </div>
      <div
        style={{
          fontSize: 28,
          color: cor,
          fontWeight: "800",
          lineHeight: 1.1,
          whiteSpace: "pre-line",
        }}
      >
        {valor}
      </div>
      {!!subtitulo && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
          {subtitulo}
        </div>
      )}
    </div>
  );
}

function RankingCard({ titulo, itens, cor }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #08101f 100%)",
        padding: 16,
        borderRadius: 16,
        textAlign: "left",
        border: "1px solid #162033",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "#e2e8f0",
          marginBottom: 12,
          fontWeight: "700",
        }}
      >
        {titulo}
      </div>

      {itens.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Sem dados</div>
      ) : (
        itens.map((item, idx) => (
          <div
            key={`${item.dateKey}-${idx}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom:
                idx !== itens.length - 1 ? "1px solid #162033" : "none",
              gap: 12,
            }}
          >
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>{item.shortDate}</div>
            <div style={{ color: cor, fontWeight: "700", fontSize: 13 }}>
              {formatMoney(item.totalLiquido)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CapitalCurve({ data }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
        }}
      >
        Sem dados para curva
      </div>
    );
  }

  const valores = [];
  let acumulado = 0;
  for (const item of data) {
    acumulado += Number(item.totalLiquido || 0);
    valores.push(acumulado);
  }

  const minVal = Math.min(...valores, 0);
  const maxVal = Math.max(...valores, 0);

  const width = 900;
  const height = 220;
  const padding = 20;

  const scaleX = (idx) => {
    if (valores.length === 1) return padding;
    return padding + (idx * (width - padding * 2)) / (valores.length - 1);
  };

  const scaleY = (value) => {
    if (maxVal === minVal) return height / 2;
    return (
      padding +
      ((maxVal - value) * (height - padding * 2)) / (maxVal - minVal)
    );
  };

  const points = valores
    .map((v, i) => `${scaleX(i)},${scaleY(v)}`)
    .join(" ");

  const ultimo = valores[valores.length - 1];

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #08101f 100%)",
        borderRadius: 16,
        border: "1px solid #162033",
        padding: 16,
      }}
    >
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: "700" }}>Curva de Capital</div>
        <div style={{ color: "#00ff88", fontWeight: "700" }}>
          Acumulado do mês: {formatMoney(ultimo)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: 240, display: "block" }}
      >
        <rect x="0" y="0" width={width} height={height} fill="#0b1220" rx="12" />
        <polyline
          fill="none"
          stroke="#00ffd5"
          strokeWidth="4"
          points={points}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
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

  const totalGeral = dadosCalculados.reduce(
    (acc, item) => acc + Number(item.totalLiquido || 0),
    0
  );

  const totalMes = dadosMesCalculados.reduce(
    (acc, item) => acc + Number(item.totalLiquido || 0),
    0
  );

  const totalGenialMes = dadosMesCalculados.reduce(
    (acc, item) => acc + Number(item.genialLiquido || 0),
    0
  );

  const totalRicoMes = dadosMesCalculados.reduce(
    (acc, item) => acc + Number(item.ricoLiquido || 0),
    0
  );

  const totalOperacoesMes = dadosMesCalculados.reduce(
    (acc, item) => acc + Number(item.operacoesTotal || 0),
    0
  );

  const custoTotalMes = dadosMesCalculados.reduce(
    (acc, item) => acc + Number(item.custoTotal || 0),
    0
  );

  const progressoMensal = metaMensal > 0 ? (totalMes / metaMensal) * 100 : 0;
  const progressoAnual = metaAnual > 0 ? (totalGeral / metaAnual) * 100 : 0;

  const faltaMensal = metaMensal - totalMes;
  const faltaAnual = metaAnual - totalGeral;

  const status =
    progressoMensal >= 100
      ? "TARGET ACHIEVED"
      : progressoMensal >= 70
      ? "ON TRACK"
      : "BEHIND";

  const corStatus =
    progressoMensal >= 100
      ? "#00ff88"
      : progressoMensal >= 70
      ? "#FFD700"
      : "#ff4d4f";

  const diasOrdenadosMes = [...dadosMesCalculados].sort((a, b) =>
    String(a.dateKey).localeCompare(String(b.dateKey))
  );

  const melhorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((max, item) =>
          Number(item.totalLiquido || 0) > Number(max.totalLiquido || 0)
            ? item
            : max
        )
      : null;

  const piorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((min, item) =>
          Number(item.totalLiquido || 0) < Number(min.totalLiquido || 0)
            ? item
            : min
        )
      : null;

  const mediaDia =
    diasOrdenadosMes.length > 0 ? totalMes / diasOrdenadosMes.length : 0;

  let pico = 0;
  let drawdown = 0;
  let acumulado = 0;
  for (const item of diasOrdenadosMes) {
    acumulado += Number(item.totalLiquido || 0);
    if (acumulado > pico) pico = acumulado;
    const ddAtual = pico - acumulado;
    if (ddAtual > drawdown) drawdown = ddAtual;
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
    faltaMensal > 0 && diasUteisRestantes > 0
      ? faltaMensal / diasUteisRestantes
      : 0;

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
      <div
        style={{
          maxWidth: "1250px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
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
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setArquivoGenial(e.target.files?.[0] || null)}
            style={{ color: "white" }}
          />

          <input
            type="file"
            accept=".csv"
            onChange={(e) => setArquivoRico(e.target.files?.[0] || null)}
            style={{ color: "white" }}
          />

          <input
            type="number"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value) || 0)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              width: "105px",
            }}
            placeholder="Meta mês"
          />

          <input
            type="number"
            value={metaAnual}
            onChange={(e) => setMetaAnual(Number(e.target.value) || 0)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              width: "105px",
            }}
            placeholder="Meta ano"
          />

          <input
            type="number"
            step="0.01"
            value={custoOperacao}
            onChange={(e) => setCustoOperacao(Number(e.target.value) || 0)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              width: "95px",
            }}
            placeholder="Custo/op"
          />

          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              width: "140px",
            }}
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
            border: `2px solid ${corStatus}`,
            marginTop: 10,
            marginBottom: 20,
            padding: 12,
            textAlign: "center",
            borderRadius: 12,
            color: corStatus,
            fontWeight: "800",
            fontSize: "24px",
            boxShadow: `0 0 18px ${corStatus}22`,
          }}
        >
          {status}
        </div>

        {!!mensagem && (
          <div
            style={{
              marginBottom: 20,
              color: "#cbd5e1",
              fontSize: "15px",
            }}
          >
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
          <Card titulo="TOTAL GERAL" valor={formatMoney(totalGeral)} cor="#00ff88" />
          <Card titulo="TOTAL DO MÊS" valor={formatMoney(totalMes)} cor="#00ffd5" />
          <Card titulo="GENIAL" valor={formatMoney(totalGenialMes)} cor="#60a5fa" />
          <Card titulo="RICO" valor={formatMoney(totalRicoMes)} cor="#fbbf24" />
          <Card titulo="META MENSAL" valor={formatMoney(metaMensal)} cor="#22c55e" />
          <Card titulo="CUSTO / OP" valor={formatMoney(custoOperacao)} cor="#e5e7eb" />
          <Card titulo="OPS NO MÊS" valor={String(totalOperacoesMes)} cor="#fbbf24" />
          <Card titulo="CUSTO TOTAL MÊS" valor={formatMoney(custoTotalMes)} cor="#ff4d4f" />
          <Card
            titulo="FALTA MÊS"
            valor={formatMoney(faltaMensal)}
            cor={faltaMensal <= 0 ? "#00ff88" : "#ff4d4f"}
          />
          <Card
            titulo="VALOR POR DIA"
            valor={formatMoney(valorPorDia)}
            cor="#38bdf8"
            subtitulo={
              diasUteisRestantes > 0
                ? `${diasUteisRestantes} dias úteis restantes`
                : "somente para mês atual"
            }
          />
          <Card titulo="META ANUAL" valor={formatMoney(metaAnual)} cor="#22c55e" />
          <Card
            titulo="FALTA ANO"
            valor={formatMoney(faltaAnual)}
            cor={faltaAnual <= 0 ? "#00ff88" : "#ff4d4f"}
          />
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          <Card titulo="MÊS ANTERIOR" valor={formatMoney(totalMesAnterior)} cor="#cbd5e1" />
          <Card
            titulo="VARIAÇÃO VS MÊS ANT."
            valor={`${variacaoMesAnterior.toFixed(1)}%`}
            cor={variacaoMesAnterior >= 0 ? "#00ff88" : "#ff4d4f"}
          />
          <Card titulo="DRAWDOWN" valor={formatMoney(drawdown)} cor="#ff4d4f" />
          <Card titulo="MÉDIA POR DIA" valor={formatMoney(mediaDia)} cor="#38bdf8" />
        </div>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          <Card
            titulo="MELHOR DIA"
            valor={
              melhorDia
                ? `${melhorDia.shortDate} • ${formatMoney(melhorDia.totalLiquido)}`
                : "R$ 0.00"
            }
            cor="#00ff88"
          />
          <Card
            titulo="PIOR DIA"
            valor={
              piorDia
                ? `${piorDia.shortDate} • ${formatMoney(piorDia.totalLiquido)}`
                : "R$ 0.00"
            }
            cor="#ff4d4f"
          />
          <Card titulo="DIAS NO MÊS" valor={String(diasOrdenadosMes.length)} cor="#e5e7eb" />
          <Card titulo="PROGRESSO MÊS" valor={`${progressoMensal.toFixed(1)}%`} cor="#00ffd5" />
        </div>

        <div style={{ marginTop: 24 }}>
          <CapitalCurve data={diasOrdenadosMes} />
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          <RankingCard titulo="Top 5 Melhores Dias" itens={topDias} cor="#00ff88" />
          <RankingCard titulo="Top 5 Piores Dias" itens={pioresDias} cor="#ff4d4f" />
        </div>

        <div
          style={{
            marginTop: 30,
            background: "#0f172a",
            borderRadius: 16,
            padding: 16,
            textAlign: "left",
            border: "1px solid #172033",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: "700" }}>
            Progress Monthly
          </div>
          <div
            style={{
              width: "100%",
              height: 16,
              background: "#1e293b",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(progressoMensal, 100)}%`,
                height: "100%",
                background: "#00ff88",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ marginTop: 8 }}>{progressoMensal.toFixed(1)}%</div>
        </div>

        <div
          style={{
            marginTop: 20,
            background: "#0f172a",
            borderRadius: 16,
            padding: 16,
            textAlign: "left",
            border: "1px solid #172033",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: "700" }}>
            Progress Annual
          </div>
          <div
            style={{
              width: "100%",
              height: 16,
              background: "#1e293b",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(progressoAnual, 100)}%`,
                height: "100%",
                background: "#38bdf8",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ marginTop: 8 }}>{progressoAnual.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}