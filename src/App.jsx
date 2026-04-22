import React, { useState } from "react"
import Papa from "papaparse"

export default function App() {
  const [genialFile, setGenialFile] = useState(null)
  const [ricoFile, setRicoFile] = useState(null)
  const [total, setTotal] = useState(0)

  const [metaMensal, setMetaMensal] = useState(10000)
  const [metaAnual, setMetaAnual] = useState(120000)
  const [custoOp, setCustoOp] = useState(2.8)

  const [ops, setOps] = useState(0)

  const processCSV = (file, callback) => {
    if (!file) return callback(0, 0)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        let soma = 0
        let operacoes = 0

        result.data.forEach((row) => {
          try {
            // pega qualquer coluna possível de lucro
            const valorRaw =
              row["Resultado"] ||
              row["Lucro"] ||
              row["P&L"] ||
              row["Valor"] ||
              "0"

            const valor = parseFloat(
              String(valorRaw).replace(",", ".")
            )

            if (!isNaN(valor)) {
              soma += valor
              operacoes++
            }
          } catch (e) {
            // evita quebrar app
            console.log("linha ignorada")
          }
        })

        callback(soma, operacoes)
      },
    })
  }

  const handleProcess = () => {
    processCSV(genialFile, (gTotal, gOps) => {
      processCSV(ricoFile, (rTotal, rOps) => {
        const bruto = gTotal + rTotal
        const totalOps = gOps + rOps

        const custoTotal = totalOps * custoOp
        const liquido = bruto - custoTotal

        setTotal(liquido)
        setOps(totalOps)
      })
    })
  }

  const faltaMes = metaMensal - total
  const diasRestantes = 7
  const valorDia = faltaMes > 0 ? faltaMes / diasRestantes : 0

  return (
    <div style={{
      background: "#020617",
      minHeight: "100vh",
      color: "white",
      padding: 30,
      fontFamily: "Arial"
    }}>
      <h1 style={{ color: "#00ffd5", fontSize: 28 }}>
        DASHBOARD EC
      </h1>

      <div style={{ marginTop: 20 }}>
        <input type="file" onChange={(e) => setGenialFile(e.target.files[0])} />
        <input type="file" onChange={(e) => setRicoFile(e.target.files[0])} />

        <br /><br />

        <input
          type="number"
          value={metaMensal}
          onChange={(e) => setMetaMensal(Number(e.target.value))}
        />
        <input
          type="number"
          value={metaAnual}
          onChange={(e) => setMetaAnual(Number(e.target.value))}
        />
        <input
          type="number"
          step="0.1"
          value={custoOp}
          onChange={(e) => setCustoOp(Number(e.target.value))}
        />

        <br /><br />

        <button onClick={handleProcess} style={{
          background: "#00ff9f",
          border: "none",
          padding: "10px 20px",
          cursor: "pointer"
        }}>
          Atualizar CSV
        </button>
      </div>

      <h2 style={{ marginTop: 30 }}>
        TOTAL: R$ {total.toFixed(2)}
      </h2>

      <div style={{ marginTop: 20 }}>
        <p>📊 Operações: {ops}</p>
        <p>💸 Custo total: R$ {(ops * custoOp).toFixed(2)}</p>
        <p>🎯 Meta mensal: R$ {metaMensal}</p>
        <p>📉 Falta mês: R$ {faltaMes.toFixed(2)}</p>
        <p>📅 Por dia: R$ {valorDia.toFixed(2)}</p>
      </div>
    </div>
  )
}