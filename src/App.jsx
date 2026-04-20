// 🔥 ADICIONA ESSE CÓDIGO DENTRO DO SEU App.jsx (SUBSTITUI TUDO)

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const STORAGE_KEY = "dashboard_ec_v6";

function parseBR(value) {
  if (!value) return 0;
  return (
    parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || 0
  );
}

function getDay(date) {
  return date.split("/")[0];
}

function getMonthKey(date) {
  const parts = date.split("/");
  return `${parts[2]}-${parts[1]}`;
}

function businessDaysInMonth(year, month) {
  let total = 0;
  const last = new Date(year, month, 0).getDate();

  for (let i = 1; i <= last; i++) {
    const d = new Date(year, month - 1, i).getDay();
    if (d !== 0 && d !== 6) total++;
  }

  return total;
}

export default function App() {
  const [data, setData] = useState([]);
  const [metaMensal, setMetaMensal] = useState(10000);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setData(parsed.data || []);
      setMetaMensal(parsed.metaMensal || 10000);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data, metaMensal })
    );
  }, [data, metaMensal]);

  const total = data.reduce((acc, cur) => acc + cur.value, 0);

  const diasOperados = data.length || 1;

  const now = new Date();
  const diasUteis = businessDaysInMonth(
    now.getFullYear(),
    now.getMonth() + 1
  );

  const metaDiaria = metaMensal / diasUteis;
  const mediaDia = total / diasOperados;
  const faltaDiaria = metaDiaria - mediaDia;

  const faltaMes = metaMensal - total;
  const precisaPorDia = faltaMes / diasUteis;

  const importCSV = (file) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const rows = e.target.result.split("\n").slice(6);

      const parsed = rows
        .map((r) => {
          const c = r.split(";");
          if (!c[2]) return null;

          return {
            date: c[2],
            day: getDay(c[2]),
            value: parseBR(c[17]),
          };
        })
        .filter(Boolean);

      setData(parsed);
    };

    reader.readAsText(file);
  };

  const exportBackup = () => {
    const blob = new Blob(
      [JSON.stringify({ data, metaMensal })],
      { type: "application/json" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backup-dashboard.json";
    a.click();
  };

  const importBackup = (file) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const parsed = JSON.parse(e.target.result);
      setData(parsed.data || []);
      setMetaMensal(parsed.metaMensal || 10000);
    };

    reader.readAsText(file);
  };

  const chartData = useMemo(() => {
    let acc = 0;
    return data.map((d) => {
      acc += d.value;
      return { ...d, acumulado: acc };
    });
  }, [data]);

  return (
    <div style={{ padding: 20, background: "#020617", color: "#fff" }}>
      <h1 style={{ color: "#00ff88" }}>DASHBOARD EC</h1>

      <input type="file" onChange={(e) => importCSV(e.target.files[0])} />

      <div style={{ marginTop: 10 }}>
        <button onClick={exportBackup}>Exportar Backup</button>

        <input
          type="file"
          onChange={(e) => importBackup(e.target.files[0])}
        />
      </div>

      <h3>Total: R$ {total.toFixed(2)}</h3>
      <h3>Meta mensal: R$ {metaMensal}</h3>

      <h3>Meta diária: R$ {metaDiaria.toFixed(2)}</h3>

      <h3 style={{ color: "#ff4d4f" }}>
        Falta meta diária: R$ {faltaDiaria.toFixed(2)}
      </h3>

      <h3 style={{ color: "#ff4d4f" }}>
        Falta mês: R$ {faltaMes.toFixed(2)}
      </h3>

      <h3>Precisa por dia: R$ {precisaPorDia.toFixed(2)}</h3>

      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#333" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="acumulado"
              stroke="#00ff88"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}