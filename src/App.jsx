import { useEffect, useState } from "react";

export default function App() {
  const [dados, setDados] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);
  const [custo, setCusto] = useState(2.8);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [diaSelecionado, setDiaSelecionado] = useState("Todos");

  // 🔥 CARREGA CSV AUTOMÁTICO
  useEffect(() => {
    async function carregar() {
      try {
        const resGenial = await fetch("/genial.csv");
        const resRico = await fetch("/rico.csv");

        const txtGenial = await resGenial.text();
        const txtRico = await resRico.text();

        const parseCSV = (txt, corretora) => {
          const linhas = txt.split("\n").slice(1);
          return linhas.map(l => {
            const col = l.split(";");
            return {
              data: col[0],
              resultado: parseFloat(col[5]?.replace(",", ".")) || 0,
              corretora
            };
          });
        };

        const dadosFinal = [
          ...parseCSV(txtGenial, "Genial"),
          ...parseCSV(txtRico, "Rico")
        ];

        setDados(dadosFinal);
      } catch (e) {
        console.log("Erro ao carregar CSV");
      }
    }

    carregar();
  }, []);

  // 🔥 FILTRO
  const dadosFiltrados = dados.filter(d => {
    if (!d.data) return false;

    const mes = d.data.split("/")[1] + "/" + d.data.split("/")[2];
    const dia = d.data.split("/")[0];

    if (mesSelecionado && mes !== mesSelecionado) return false;
    if (diaSelecionado !== "Todos" && dia !== diaSelecionado) return false;

    return true;
  });

  const total = dadosFiltrados.reduce((a, b) => a + b.resultado, 0);

  const genial = dadosFiltrados
    .filter(d => d.corretora === "Genial")
    .reduce((a, b) => a + b.resultado, 0);

  const rico = dadosFiltrados
    .filter(d => d.corretora === "Rico")
    .reduce((a, b) => a + b.resultado, 0);

  const progressoMeta = (total / metaMensal) * 100;
  const falta = metaMensal - total;

  // 🔥 STATUS EM INGLÊS
  const ritmoTexto =
    progressoMeta >= 100
      ? "TARGET ACHIEVED"
      : progressoMeta >= 70
      ? "ON TRACK"
      : "BEHIND SCHEDULE";

  const corStatus =
    progressoMeta >= 100
      ? "#00ff88"
      : progressoMeta >= 70
      ? "#FFD700"
      : "#ff4d4d";

  return (
    <div style={{ padding: 20, background: "#020617", minHeight: "100vh", color: "white" }}>
      
      <h1 style={{ textAlign: "center", color: "#00ffcc" }}>
        DASHBOARD EC
      </h1>

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
        <input
          placeholder="MM/YYYY"
          onChange={e => setMesSelecionado(e.target.value)}
        />

        <input
          placeholder="Dia"
          onChange={e => setDiaSelecionado(e.target.value)}
        />

        <input
          value={metaMensal}
          onChange={e => setMetaMensal(Number(e.target.value))}
        />

        <input
          value={custo}
          onChange={e => setCusto(Number(e.target.value))}
        />
      </div>

      {/* STATUS */}
      <div
        style={{
          border: `2px solid ${corStatus}`,
          padding: 10,
          textAlign: "center",
          borderRadius: 10,
          marginBottom: 20,
          color: corStatus
        }}
      >
        {ritmoTexto}
      </div>

      {/* CARDS */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        
        <Card titulo="TOTAL P&L" valor={total} />
        <Card titulo="MONTH TARGET" valor={metaMensal} />
        <Card titulo="REMAINING" valor={falta} />
        <Card titulo="GENIAL" valor={genial} />
        <Card titulo="RICO" valor={rico} />

      </div>

      {/* PROGRESSO */}
      <div style={{ marginTop: 30 }}>
        <div>Progress</div>
        <div style={{ background: "#111", height: 10, borderRadius: 10 }}>
          <div
            style={{
              width: `${Math.min(progressoMeta, 100)}%`,
              background: "#00ff88",
              height: "100%",
              borderRadius: 10
            }}
          />
        </div>
        <div>{progressoMeta.toFixed(1)}%</div>
      </div>
    </div>
  );
}

// 🔥 COMPONENTE CARD
function Card({ titulo, valor }) {
  return (
    <div
      style={{
        background: "#0f172a",
        padding: 15,
        borderRadius: 10,
        minWidth: 150,
        textAlign: "center"
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{titulo}</div>
      <div style={{ fontSize: 20, color: "#00ff88" }}>
        R$ {valor.toFixed(2)}
      </div>
    </div>
  );
}