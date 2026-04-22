import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocs,
} from "firebase/firestore";

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
      setDados(lista);
    });

    return () => unsub();
  }, []);

  async function importarCSV(file, corretora) {
    if (!file) return;

    const text = await file.text();
    const linhas = text.split(/\r?\n/).filter((linha) => linha.trim() !== "");

    const dadosImportados = [];

    for (let i = 1; i < linhas.length; i++) {
      const col = linhas[i].split(";");
      if (!col || col.length < 6) continue;

      const data = String(col[0] || "").trim();
      if (!data.includes("/")) continue;

      const valorTexto = String(col[5] || "0").trim();
      const valor = parseFloat(valorTexto.replace(/\./g, "").replace(",", ".")) || 0;

      const partes = data.split("/");
      if (partes.length !== 3) continue;

      const dia = partes[0].padStart(2, "0");
      const mes = partes[1].padStart(2, "0");
      const ano = partes[2];

      const dateKey = `${ano}-${mes}-${dia}`;

      dadosImportados.push({
        dateKey,
        shortDate: `${dia}/${mes}/${ano}`,
        monthKey: `${ano}-${mes}`,
        genial: corretora === "Genial" ? valor : 0,
        rico: corretora === "Rico" ? valor : 0,
        updatedAt: Date.now(),
      });
    }

    for (const item of dadosImportados) {
      const ref = doc(db, "trades", item.dateKey);

      const snap = await getDocs(collection(db, "trades"));
      let atual = null;

      snap.forEach((docSnap) => {
        if (docSnap.id === item.dateKey) {
          atual = docSnap.data();
        }
      });

      await setDoc(
        ref,
        {
          dateKey: item.dateKey,
          shortDate: item.shortDate,
          monthKey: item.monthKey,
          genial:
            item.genial !== 0
              ? item.genial
              : Number(atual?.genial || 0),
          rico:
            item.rico !== 0
              ? item.rico
              : Number(atual?.rico || 0),
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
        await importarCSV(arquivoGenial, "Genial");
      }

      if (arquivoRico) {
        await importarCSV(arquivoRico, "Rico");
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