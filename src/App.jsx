import React, { useState } from "react";
import Papa from "papaparse";
import { db } from "./firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

const CUSTO_POR_OP = 2.9;

export default function App() {
  const [genialFile, setGenialFile] = useState(null);
  const [ricoFile, setRicoFile] = useState(null);
  const [mes, setMes] = useState("2026-04");

  // 🔥 LIMPAR MÊS
  const limparMes = async () => {
    const snapshot = await getDocs(collection(db, "trades"));

    for (let docSnap of snapshot.docs) {
      if (docSnap.id.startsWith(mes)) {
        await deleteDoc(doc(db, "trades", docSnap.id));
      }
    }

    alert("🔥 Mês limpo com sucesso!");
  };

  // 🔥 PROCESSAR CSV
  const processCSV = (file, broker) => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const grouped = {};

          results.data.forEach((row) => {
            const data = row["Data Abertura"];
            const total = parseFloat(row["Total"]);

            if (!data || isNaN(total)) return;

            const date = data.split(" ")[0]; // dd/mm/yyyy

            if (!grouped[date]) {
              grouped[date] = {
                genial: 0,
                rico: 0,
                opsGenial: 0,
                opsRico: 0,
              };
            }

            if (broker === "genial") {
              grouped[date].genial += total;
              grouped[date].opsGenial += 1;
            } else {
              grouped[date].rico += total;
              grouped[date].opsRico += 1;
            }
          });

          resolve(grouped);
        },
      });
    });
  };

  // 🔥 SUBIR DADOS
  const uploadData = async () => {
    const genialData = genialFile
      ? await processCSV(genialFile, "genial")
      : {};

    const ricoData = ricoFile
      ? await processCSV(ricoFile, "rico")
      : {};

    const allDates = new Set([
      ...Object.keys(genialData),
      ...Object.keys(ricoData),
    ]);

    for (let date of allDates) {
      const g = genialData[date] || {};
      const r = ricoData[date] || {};

      const genial = g.genial || 0;
      const rico = r.rico || 0;

      const opsGenial = g.opsGenial || 0;
      const opsRico = r.opsRico || 0;

      const [day, month, year] = date.split("/");

      const docId = `${year}-${month}-${day}`;

      await setDoc(doc(db, "trades", docId), {
        dateKey: docId,
        shortDate: date,
        ano: year,
        mes: month,
        dia: day,
        monthKey: `${year}-${month}`,

        genial: Number(genial.toFixed(2)),
        rico: Number(rico.toFixed(2)),

        opsGenial,
        opsRico,

        custo: (opsGenial + opsRico) * CUSTO_POR_OP,

        updatedAt: Date.now(),
      });
    }

    alert("🚀 Dados atualizados com sucesso!");
  };

  return (
    <div style={{ padding: 20, background: "#020617", minHeight: "100vh", color: "white" }}>
      <h1 style={{ color: "#00ffd5" }}>DASHBOARD EC</h1>

      <br />

      <div>
        <input type="file" onChange={(e) => setGenialFile(e.target.files[0])} />
        <span> Genial</span>
      </div>

      <br />

      <div>
        <input type="file" onChange={(e) => setRicoFile(e.target.files[0])} />
        <span> Rico</span>
      </div>

      <br />

      <div>
        <label>Mês: </label>
        <input
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          placeholder="2026-04"
        />
      </div>

      <br />

      <button
        onClick={limparMes}
        style={{
          background: "#ff3b3b",
          color: "#fff",
          padding: "10px 20px",
          marginRight: 10,
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Limpar mês
      </button>

      <button
        onClick={uploadData}
        style={{
          background: "#00ff9f",
          color: "#000",
          padding: "10px 20px",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Atualizar CSV
      </button>
    </div>
  );
}