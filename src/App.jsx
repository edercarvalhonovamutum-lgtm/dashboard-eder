import React, { useState } from "react";
import Papa from "papaparse";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

function App() {
  const [genialFile, setGenialFile] = useState(null);
  const [ricoFile, setRicoFile] = useState(null);

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

            const date = data.split(" ")[0]; // pega só a data

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

        updatedAt: Date.now(),
      });
    }

    alert("🔥 Dados atualizados com sucesso!");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>DASHBOARD EC</h1>

      <div>
        <input
          type="file"
          onChange={(e) => setGenialFile(e.target.files[0])}
        />
        <span> Genial</span>
      </div>

      <div>
        <input
          type="file"
          onChange={(e) => setRicoFile(e.target.files[0])}
        />
        <span> Rico</span>
      </div>

      <button onClick={uploadData}>Atualizar CSV</button>
    </div>
  );
}

export default App;