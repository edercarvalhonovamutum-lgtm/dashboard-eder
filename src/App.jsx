import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  onSnapshot
} from "firebase/firestore";

export default function App() {
  const [dados, setDados] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);

  // 🔥 CARREGA EM TEMPO REAL
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "resultados"), (snap) => {
      const lista = [];
      snap.forEach((doc) => lista.push(doc.data()));
      setDados(lista);
    });

    return () => unsub();
  }, []);

  // 🔥 IMPORTAR CSV
  async function importarCSV(file, corretora) {
    const text = await file.text();
    const linhas = text.split("\n").slice(1);

    for (let l of linhas) {
      const col = l.split(";");
      const data = col[0];

      if (!data) continue;

      const valor = parseFloat(col[5]?.replace(",", ".")) || 0;

      const [dia, mes, ano] = data.split("/");

      const dateKey = `${ano}-${mes}-${dia}`;

      const ref = doc(db, "resultados", dateKey);

      await setDoc(ref, {
        dateKey,
        shortDate: data,
        monthKey: `${ano}-${mes}`,
        genial: corretora === "Genial" ? valor : 0,
        rico: corretora === "Rico" ? valor : 0,
        updatedAt: Date.now()
      }, { merge: true });
    }

    alert("Salvo no Firebase 🚀");
  }

  const total = dados.reduce((a, b) => a + (b.genial || 0) + (b.rico || 0), 0);

  const progresso = (total / metaMensal) * 100;

  const status =
    progresso >= 100
      ? "TARGET ACHIEVED"
      : progresso >= 70
      ? "ON TRACK"
      : "BEHIND";

  return (
    <div style={{ background: "#020617", minHeight: "100vh", color: "white", padding: 20 }}>
      
      <h1 style={{ textAlign: "center", color: "#00ffcc" }}>
        DASHBOARD EC
      </h1>

      {/* IMPORTAR CSV */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        
        <input
          type="file"
          onChange={(e) => importarCSV(e.target.files[0], "Genial")}
        />

        <input
          type="file"
          onChange={(e) => importarCSV(e.target.files[0], "Rico")}
        />
      </div>

      {/* STATUS */}
      <div style={{
        border: "2px solid gold",
        marginTop: 20,
        padding: 10,
        textAlign: "center",
        borderRadius: 10
      }}>
        {status}
      </div>

      {/* TOTAL */}
      <h2 style={{ textAlign: "center", marginTop: 20 }}>
        TOTAL: R$ {total.toFixed(2)}
      </h2>

    </div>
  );
}