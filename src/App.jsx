import { useEffect, useState } from "react";
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
        valor: 0,
      };
    }
    mapa[item.dateKey].valor += item.valor;
  });

  return Object.values(mapa);
}

export default function App() {
  const [dados, setDados] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);
  const [arquivoGenial, setArquivoGenial] = useState(null);
  const [arquivoRico, setArquivoRico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");

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

  const total = dados.reduce(
    (acc, item) => acc + Number(item.genial || 0) + Number(item.rico || 0),
    0
  );

  const totalGenial = dados.reduce(
    (acc, item) => acc + Number(item.genial || 0),
    0
  );

  const totalRico = dados.reduce(
    (acc, item) => acc + Number(item.rico || 0),
    0
  );

  const progresso = metaMensal > 0 ? (total / metaMensal) * 100 : 0;

  const status =
    progresso >= 100
      ? "TARGET ACHIEVED"
      : progresso >= 70
      ? "ON TRACK"
      : "BEHIND";

  const corStatus =
    progresso >= 100
      ? "#00ff88"
      : progresso >= 70
      ? "#FFD700"
      : "#ff4d4f";

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
          maxWidth: "1100px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: "#00ffd5",
            fontSize: "56px",
            marginBottom: "20px",
            fontWeight: "800",
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
          <div>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setArquivoGenial(e.target.files?.[0] || null)}
              style={{ color: "white" }}
            />
          </div>

          <div>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setArquivoRico(e.target.files?.[0] || null)}
              style={{ color: "white" }}
            />
          </div>

          <div>
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
          </div>

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

        <h2 style={{ marginTop: 10, color: "#ffffff" }}>
          TOTAL: R$ {total.toFixed(2)}
        </h2>

        <div
          style={{
            marginTop: 25,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
          }}
        >
          <Card titulo="TOTAL P&L" valor={total} cor="#00ff88" />
          <Card titulo="GENIAL" valor={totalGenial} cor="#60a5fa" />
          <Card titulo="RICO" valor={totalRico} cor="#fbbf24" />
          <Card titulo="MONTH TARGET" valor={metaMensal} cor="#00ff88" />
        </div>

        <div
          style={{
            marginTop: 30,
            background: "#0f172a",
            borderRadius: 12,
            padding: 16,
            textAlign: "left",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: "700" }}>Progress</div>
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
                width: `${Math.min(progresso, 100)}%`,
                height: "100%",
                background: "#00ff88",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ marginTop: 8 }}>{progresso.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

function Card({ titulo, valor, cor }) {
  return (
    <div
      style={{
        background: "#0f172a",
        padding: 15,
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 22, color: cor, fontWeight: "800" }}>
        R$ {Number(valor || 0).toFixed(2)}
      </div>
    </div>
  );
}