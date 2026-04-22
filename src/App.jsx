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
      };
    }
    mapa[item.dateKey].valor += item.valor;
  });

  return Object.values(mapa);
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function Card({ titulo, valor, cor = "#00ff88" }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #091224 100%)",
        padding: 16,
        borderRadius: 14,
        textAlign: "center",
        border: "1px solid #172033",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 24, color: cor, fontWeight: "800" }}>{valor}</div>
    </div>
  );
}

export default function App() {
  const [dados, setDados] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);
  const [metaAnual, setMetaAnual] = useState(120000);
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

  const dadosMes = useMemo(() => {
    if (!mesSelecionado) return dados;
    return dados.filter((item) => item.monthKey === mesSelecionado);
  }, [dados, mesSelecionado]);

  const totalGeral = dados.reduce(
    (acc, item) => acc + Number(item.genial || 0) + Number(item.rico || 0),
    0
  );

  const totalMes = dadosMes.reduce(
    (acc, item) => acc + Number(item.genial || 0) + Number(item.rico || 0),
    0
  );

  const totalGenialMes = dadosMes.reduce(
    (acc, item) => acc + Number(item.genial || 0),
    0
  );

  const totalRicoMes = dadosMes.reduce(
    (acc, item) => acc + Number(item.rico || 0),
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

  const diasOrdenadosMes = [...dadosMes].sort((a, b) =>
    String(a.dateKey).localeCompare(String(b.dateKey))
  );

  const melhorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((max, item) =>
          Number(item.genial || 0) + Number(item.rico || 0) >
          Number(max.genial || 0) + Number(max.rico || 0)
            ? item
            : max
        )
      : null;

  const piorDia =
    diasOrdenadosMes.length > 0
      ? diasOrdenadosMes.reduce((min, item) =>
          Number(item.genial || 0) + Number(item.rico || 0) <
          Number(min.genial || 0) + Number(min.rico || 0)
            ? item
            : min
        )
      : null;

  const mediaDia =
    diasOrdenadosMes.length > 0 ? totalMes / diasOrdenadosMes.length : 0;

  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        color: "white",
        padding: "30px 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: "#00ffd5",
            fontSize: "58px",
            marginBottom: "20px",
            fontWeight: "800",
            letterSpacing: "1px",
          }}
        >
          DASHBOARD EC
        </h1>

        <div
          style={{
            display: "flex",
            gap: "14px",
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
              width: "120px",
            }}
          />

          <input
            type="number"
            value={metaAnual}
            onChange={(e) => setMetaAnual(Number(e.target.value) || 0)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              width: "120px",
            }}
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
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "700",
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
            borderRadius: 10,
            color: corStatus,
            fontWeight: "700",
            fontSize: "22px",
          }}
        >
          {status}
        </div>

        {!!mensagem && (
          <div
            style={{
              marginBottom: 20,
              color: "#cbd5e1",
              fontSize: "16px",
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
          <Card
            titulo="FALTA MÊS"
            valor={formatMoney(faltaMensal)}
            cor={faltaMensal <= 0 ? "#00ff88" : "#ff4d4f"}
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
                ? `${melhorDia.shortDate} • ${formatMoney(
                    Number(melhorDia.genial || 0) + Number(melhorDia.rico || 0)
                  )}`
                : "R$ 0.00"
            }
            cor="#00ff88"
          />
          <Card
            titulo="PIOR DIA"
            valor={
              piorDia
                ? `${piorDia.shortDate} • ${formatMoney(
                    Number(piorDia.genial || 0) + Number(piorDia.rico || 0)
                  )}`
                : "R$ 0.00"
            }
            cor="#ff4d4f"
          />
          <Card titulo="MÉDIA POR DIA" valor={formatMoney(mediaDia)} cor="#38bdf8" />
          <Card titulo="DIAS NO MÊS" valor={String(diasOrdenadosMes.length)} cor="#e5e7eb" />
        </div>

        <div
          style={{
            marginTop: 30,
            background: "#0f172a",
            borderRadius: 12,
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
            borderRadius: 12,
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