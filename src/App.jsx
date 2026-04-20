import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

const STORAGE_KEY = "dashboard_ec_drive_v2";

// LINKS DIRETOS DO GOOGLE DRIVE
const GENIAL_DRIVE_URL =
  "https://drive.google.com/uc?export=download&id=1_j4vsiUt2YQflhN0DQ_EUHk9NOeQNMGY";

const RICO_DRIVE_URL =
  "https://drive.google.com/uc?export=download&id=1G2YrPwuuz0-u7ZD3RSJFvz0pByjw2aad";

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function parseBR(value) {
  if (value === null || value === undefined || value === "") return 0;
  return (
    parseFloat(String(value).replace(/\./g, "").replace(",", ".").trim()) || 0
  );
}

function shortDate(dateTime) {
  return String(dateTime || "").split(" ")[0] || "";
}

function getDay(dateTime) {
  const d = shortDate(dateTime);
  const parts = d.split("/");
  return parts.length === 3 ? parts[0] : "";
}

function getMonth(dateTime) {
  const d = shortDate(dateTime);
  const parts = d.split("/");
  return parts.length === 3 ? Number(parts[1]) : 0;
}

function getYear(dateTime) {
  const d = shortDate(dateTime);
  const parts = d.split("/");
  return parts.length === 3 ? Number(parts[2]) : 0;
}

function getMonthKeyFromDateTime(dateTime) {
  const year = getYear(dateTime);
  const month = String(getMonth(dateTime)).padStart(2, "0");
  if (!year || month === "00") return null;
  return `${year}-${month}`;
}

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  return `${m}/${y}`;
}

function toMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function businessDaysRemaining(year, month, startDay) {
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;

  for (let day = startDay; day <= lastDay; day++) {
    const dt = new Date(year, month - 1, day);
    const weekDay = dt.getDay();
    if (weekDay !== 0 && weekDay !== 6) total++;
  }

  return total;
}

function mergeRows(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const key = `${row.date}_${row.value}_${row.broker}`;
    map.set(key, row);
  });

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function joinBrokerData(genialRows, ricoRows) {
  const map = {};

  genialRows.forEach((item) => {
    if (!map[item.date]) {
      map[item.date] = {
        date: item.date,
        shortDate: item.shortDate,
        day: item.day,
        month: item.month,
        year: item.year,
        genial: 0,
        rico: 0,
      };
    }
    map[item.date].genial += item.value;
  });

  ricoRows.forEach((item) => {
    if (!map[item.date]) {
      map[item.date] = {
        date: item.date,
        shortDate: item.shortDate,
        day: item.day,
        month: item.month,
        year: item.year,
        genial: 0,
        rico: 0,
      };
    }
    map[item.date].rico += item.value;
  });

  let acumulado = 0;
  let pico = 0;

  return Object.values(map)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => {
      const total = item.genial + item.rico;
      acumulado += total;
      pico = Math.max(pico, acumulado);

      return {
        ...item,
        total,
        acumulado,
        drawdown: acumulado - pico,
      };
    });
}

function parseProfitCsvText(text, broker, custo) {
  const rows = text
    .split(/\r?\n/)
    .slice(6)
    .map((row) => row.split(";"))
    .filter((cols) => cols.length > 17);

  return rows
    .map((cols) => {
      const fechamento = String(cols[2] || "").trim();
      const total = parseBR(cols[17]);
      const monthKey = getMonthKeyFromDateTime(fechamento);

      if (!fechamento || !monthKey) return null;

      return {
        broker,
        date: fechamento,
        shortDate: shortDate(fechamento),
        day: getDay(fechamento),
        month: getMonth(fechamento),
        year: getYear(fechamento),
        monthKey,
        value: total - custo,
      };
    })
    .filter(Boolean);
}

function groupRowsByMonth(rows) {
  const grouped = {};
  rows.forEach((row) => {
    if (!grouped[row.monthKey]) grouped[row.monthKey] = [];
    grouped[row.monthKey].push(row);
  });
  return grouped;
}

function Card({ title, value, color }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
    </div>
  );
}

function MiniCard({ title, value, color }) {
  return (
    <div style={styles.miniCard}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={{ ...styles.miniCardValue, color }}>{value}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={styles.tooltip}>
      <div style={{ marginBottom: 6, fontWeight: "bold" }}>{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} style={{ color: entry.color, fontSize: 13 }}>
          {entry.name}: {formatMoney(entry.value)}
        </div>
      ))}
    </div>
  );
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function App() {
  const currentMonthKey = toMonthKey(new Date());

  const [db, setDb] = useState({
    genialByMonth: {},
    ricoByMonth: {},
  });

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [selectedDay, setSelectedDay] = useState("TODOS");
  const [metaMensal, setMetaMensal] = useState(10000);
  const [custo, setCusto] = useState(2.8);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setDb({
        genialByMonth: saved.genialByMonth || {},
        ricoByMonth: saved.ricoByMonth || {},
      });

      if (typeof saved.metaMensal === "number") setMetaMensal(saved.metaMensal);
      if (typeof saved.custo === "number") setCusto(saved.custo);
      if (saved.selectedMonth) setSelectedMonth(saved.selectedMonth);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        genialByMonth: db.genialByMonth,
        ricoByMonth: db.ricoByMonth,
        metaMensal,
        custo,
        selectedMonth,
      })
    );
  }, [db, metaMensal, custo, selectedMonth]);

  const monthsAvailable = useMemo(() => {
    const set = new Set([
      currentMonthKey,
      ...Object.keys(db.genialByMonth || {}),
      ...Object.keys(db.ricoByMonth || {}),
    ]);
    return Array.from(set).sort();
  }, [db, currentMonthKey]);

  const genialMonth = db.genialByMonth[selectedMonth] || [];
  const ricoMonth = db.ricoByMonth[selectedMonth] || [];

  const monthData = useMemo(
    () => joinBrokerData(genialMonth, ricoMonth),
    [genialMonth, ricoMonth]
  );

  const daysAvailable = useMemo(() => {
    const set = new Set(monthData.map((item) => item.day).filter(Boolean));
    return ["TODOS", ...Array.from(set).sort((a, b) => Number(a) - Number(b))];
  }, [monthData]);

  useEffect(() => {
    if (!daysAvailable.includes(selectedDay)) setSelectedDay("TODOS");
  }, [daysAvailable, selectedDay]);

  const filteredData = useMemo(() => {
    if (selectedDay === "TODOS") return monthData;
    return monthData.filter((item) => item.day === selectedDay);
  }, [monthData, selectedDay]);

  const selectedYear = Number(selectedMonth.split("-")[0] || 0);

  const annualGenialRows = Object.entries(db.genialByMonth)
    .filter(([monthKey]) => Number(monthKey.split("-")[0]) === selectedYear)
    .flatMap(([, rows]) => rows);

  const annualRicoRows = Object.entries(db.ricoByMonth)
    .filter(([monthKey]) => Number(monthKey.split("-")[0]) === selectedYear)
    .flatMap(([, rows]) => rows);

  const annualData = useMemo(
    () => joinBrokerData(annualGenialRows, annualRicoRows),
    [annualGenialRows, annualRicoRows]
  );

  const totalMes = monthData.reduce((sum, item) => sum + item.total, 0);
  const totalFiltro = filteredData.reduce((sum, item) => sum + item.total, 0);
  const totalAnual = annualData.reduce((sum, item) => sum + item.total, 0);
  const totalGenialAnual = annualData.reduce((sum, item) => sum + item.genial, 0);
  const totalRicoAnual = annualData.reduce((sum, item) => sum + item.rico, 0);

  const metaAnual = metaMensal * 12;
  const faltaMes = metaMensal - totalMes;
  const faltaAnual = metaAnual - totalAnual;

  const [yearStr, monthStr] = selectedMonth.split("-");
  const yearNum = Number(yearStr || 0);
  const monthNum = Number(monthStr || 0);
  const now = new Date();

  const diasRestantes =
    selectedMonth === currentMonthKey
      ? businessDaysRemaining(yearNum, monthNum, now.getDate())
      : 0;

  const precisaPorDia =
    faltaMes > 0 && diasRestantes > 0 ? faltaMes / diasRestantes : 0;

  const percentGenial = totalAnual
    ? ((totalGenialAnual / totalAnual) * 100).toFixed(1)
    : "0.0";

  const percentRico = totalAnual
    ? ((totalRicoAnual / totalAnual) * 100).toFixed(1)
    : "0.0";

  const progressoMeta =
    metaMensal > 0 ? Math.max(0, Math.min((totalMes / metaMensal) * 100, 100)) : 0;

  const melhorDiaGeral = monthData.length
    ? monthData.reduce((max, item) => (item.total > max.total ? item : max), monthData[0])
    : null;

  const melhorDiaGenial = monthData.length
    ? monthData.reduce((max, item) => (item.genial > max.genial ? item : max), monthData[0])
    : null;

  const melhorDiaRico = monthData.length
    ? monthData.reduce((max, item) => (item.rico > max.rico ? item : max), monthData[0])
    : null;

  const piorDiaGeral = monthData.length
    ? monthData.reduce((min, item) => (item.total < min.total ? item : min), monthData[0])
    : null;

  const piorDiaGenial = monthData.length
    ? monthData.reduce((min, item) => (item.genial < min.genial ? item : min), monthData[0])
    : null;

  const piorDiaRico = monthData.length
    ? monthData.reduce((min, item) => (item.rico < min.rico ? item : min), monthData[0])
    : null;

  const piorDrawdown = annualData.length
    ? Math.min(...annualData.map((item) => item.drawdown))
    : 0;

  const monthlyYearData = useMemo(() => {
    const base = MONTH_NAMES.map((mes, index) => ({
      mes,
      numero: index + 1,
      genial: 0,
      rico: 0,
      total: 0,
    }));

    annualData.forEach((item) => {
      const idx = item.month - 1;
      if (idx >= 0 && idx < 12) {
        base[idx].genial += item.genial;
        base[idx].rico += item.rico;
        base[idx].total += item.total;
      }
    });

    return base;
  }, [annualData]);

  function applyParsedRows(rows, broker) {
    const grouped = groupRowsByMonth(rows);

    setDb((prev) => {
      const next = {
        genialByMonth: { ...prev.genialByMonth },
        ricoByMonth: { ...prev.ricoByMonth },
      };

      Object.entries(grouped).forEach(([monthKey, monthRows]) => {
        if (broker === "genial") {
          const current = next.genialByMonth[monthKey] || [];
          next.genialByMonth[monthKey] = mergeRows([...current, ...monthRows]);
        } else {
          const current = next.ricoByMonth[monthKey] || [];
          next.ricoByMonth[monthKey] = mergeRows([...current, ...monthRows]);
        }
      });

      return next;
    });

    const detectedMonths = Object.keys(grouped).sort();
    if (detectedMonths.length) {
      setSelectedMonth(detectedMonths[detectedMonths.length - 1]);
    }
  }

  async function fetchCsvText(url) {
    const finalUrl = `${url}&t=${Date.now()}`;
    const res = await fetch(finalUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status}`);
    }

    return await res.text();
  }

  async function importDriveFiles() {
    try {
      setLoadingDrive(true);
      setStatusMsg("Buscando arquivos do Drive...");

      const genialText = await fetchCsvText(GENIAL_DRIVE_URL);
      const ricoText = await fetchCsvText(RICO_DRIVE_URL);

      const genialRows = parseProfitCsvText(genialText, "genial", custo);
      const ricoRows = parseProfitCsvText(ricoText, "rico", custo);

      if (!genialRows.length && !ricoRows.length) {
        throw new Error("Os arquivos foram lidos, mas não retornaram linhas válidas.");
      }

      applyParsedRows(genialRows, "genial");
      applyParsedRows(ricoRows, "rico");

      setStatusMsg("Arquivos do Drive atualizados com sucesso.");
    } catch (err) {
      console.error(err);
      setStatusMsg(`Erro ao buscar os CSVs do Google Drive: ${err.message}`);
    } finally {
      setLoadingDrive(false);
    }
  }

  function importManualFile(file, broker) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const rows = parseProfitCsvText(text, broker, custo);
      applyParsedRows(rows, broker);
      setStatusMsg(`Arquivo ${broker} importado com sucesso.`);
    };
    reader.readAsText(file);
  }

  function clearSelectedMonth() {
    setDb((prev) => {
      const genialByMonth = { ...prev.genialByMonth };
      const ricoByMonth = { ...prev.ricoByMonth };
      delete genialByMonth[selectedMonth];
      delete ricoByMonth[selectedMonth];
      return { genialByMonth, ricoByMonth };
    });
    setStatusMsg(`Mês ${monthLabel(selectedMonth)} limpo.`);
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    setDb({ genialByMonth: {}, ricoByMonth: {} });
    setSelectedMonth(currentMonthKey);
    setSelectedDay("TODOS");
    setStatusMsg("Histórico apagado.");
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>DASHBOARD EC</h1>

        <div style={styles.topControls}>
          <div style={styles.importItem}>
            <span>Mês:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={styles.select}
            >
              {monthsAvailable.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {monthLabel(monthKey)}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.importItem}>
            <span>Dia:</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={styles.select}
            >
              {daysAvailable.map((day) => (
                <option key={day} value={day}>
                  {day === "TODOS" ? "Todos" : day}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.importItem}>
            <span>Importar Genial:</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => importManualFile(e.target.files?.[0], "genial")}
            />
          </div>

          <div style={styles.importItem}>
            <span>Importar Rico:</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => importManualFile(e.target.files?.[0], "rico")}
            />
          </div>

          <div style={styles.importItem}>
            <span>Meta mensal:</span>
            <input
              type="number"
              value={metaMensal}
              onChange={(e) => setMetaMensal(Number(e.target.value) || 0)}
              style={styles.input}
            />
          </div>

          <div style={styles.importItem}>
            <span>Custo/op:</span>
            <input
              type="number"
              step="0.1"
              value={custo}
              onChange={(e) => setCusto(Number(e.target.value) || 0)}
              style={styles.input}
            />
          </div>

          <button
            style={styles.driveButton}
            onClick={importDriveFiles}
            disabled={loadingDrive}
          >
            {loadingDrive ? "Atualizando..." : "Atualizar do Drive"}
          </button>

          <button style={styles.clearButton} onClick={clearSelectedMonth}>
            Limpar mês
          </button>

          <button style={styles.clearButton} onClick={clearAll}>
            Limpar tudo
          </button>
        </div>

        {!!statusMsg && <div style={styles.statusMsg}>{statusMsg}</div>}

        <div style={styles.topCards}>
          <Card
            title={`Genial (${percentGenial}%)`}
            value={formatMoney(totalGenialAnual)}
            color="#60a5fa"
          />
          <Card
            title={`Rico (${percentRico}%)`}
            value={formatMoney(totalRicoAnual)}
            color="#fbbf24"
          />
        </div>

        <div style={styles.cardRow}>
          <Card title="TOTAL ACUMULADO" value={formatMoney(totalAnual)} color="#00ff88" />
          <Card title="Resultado filtro" value={formatMoney(totalFiltro)} color="#e5e7eb" />
          <Card title="Meta mensal" value={formatMoney(metaMensal)} color="#00ff88" />
          <Card title="Meta anual" value={formatMoney(metaAnual)} color="#00ff88" />
          <Card title="Falta" value={formatMoney(faltaMes)} color="#ff4d4f" />
          <Card title="Falta meta anual" value={formatMoney(faltaAnual)} color="#ff4d4f" />
          <Card
            title="Precisa por dia"
            value={formatMoney(precisaPorDia)}
            color="#fbbf24"
          />
        </div>

        <div style={styles.progressBox}>
          <div style={styles.progressHeader}>
            <span>Progresso da meta</span>
            <span>{progressoMeta.toFixed(1)}%</span>
          </div>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${progressoMeta}%` }} />
          </div>
        </div>

        <div style={styles.cardRowSmall}>
          <MiniCard
            title="Melhor dia geral"
            value={
              melhorDiaGeral
                ? `${melhorDiaGeral.shortDate} • ${formatMoney(melhorDiaGeral.total)}`
                : "-"
            }
            color="#22c55e"
          />
          <MiniCard
            title="Melhor dia Genial"
            value={
              melhorDiaGenial
                ? `${melhorDiaGenial.shortDate} • ${formatMoney(melhorDiaGenial.genial)}`
                : "-"
            }
            color="#60a5fa"
          />
          <MiniCard
            title="Melhor dia Rico"
            value={
              melhorDiaRico
                ? `${melhorDiaRico.shortDate} • ${formatMoney(melhorDiaRico.rico)}`
                : "-"
            }
            color="#fbbf24"
          />
          <MiniCard title="Dias restantes" value={String(diasRestantes)} color="#e5e7eb" />
        </div>

        <div style={styles.cardRowSmall}>
          <MiniCard
            title="Pior dia geral"
            value={
              piorDiaGeral
                ? `${piorDiaGeral.shortDate} • ${formatMoney(piorDiaGeral.total)}`
                : "-"
            }
            color="#ef4444"
          />
          <MiniCard
            title="Pior dia Genial"
            value={
              piorDiaGenial
                ? `${piorDiaGenial.shortDate} • ${formatMoney(piorDiaGenial.genial)}`
                : "-"
            }
            color="#ef4444"
          />
          <MiniCard
            title="Pior dia Rico"
            value={
              piorDiaRico
                ? `${piorDiaRico.shortDate} • ${formatMoney(piorDiaRico.rico)}`
                : "-"
            }
            color="#ef4444"
          />
          <MiniCard title="Drawdown" value={formatMoney(piorDrawdown)} color="#ef4444" />
        </div>

        {faltaMes <= 0 && <div style={styles.metaBatida}>💰 META BATIDA</div>}

        <div style={styles.chartFull}>
          <h3 style={styles.chartTitle}>Resultado por mês do ano</h3>
          <div style={styles.chartAreaMedium}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyYearData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
                <XAxis dataKey="mes" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="genial" fill="#3b82f6" name="Genial" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rico" fill="#f59e0b" name="Rico" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" fill="#00ff88" name="Total" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.chartFull}>
          <h3 style={styles.chartTitle}>Gráfico Consolidado</h3>
          <div style={styles.chartAreaLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
                <XAxis dataKey="shortDate" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine
                  y={metaMensal}
                  stroke="red"
                  strokeDasharray="5 5"
                  label={{ value: "meta", fill: "red", position: "insideTopLeft" }}
                />
                <Line
                  type="monotone"
                  dataKey="acumulado"
                  stroke="#00ff88"
                  strokeWidth={2}
                  dot={false}
                  name="Acumulado"
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#ffffff"
                  strokeWidth={1}
                  dot={false}
                  name="Total"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.chartFull}>
          <h3 style={styles.chartTitle}>Curva de Drawdown</h3>
          <div style={styles.chartAreaMedium}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={annualData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
                <XAxis dataKey="shortDate" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  fill="#7f1d1d"
                  name="Drawdown"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.bottomColumn}>
          <div style={styles.chartBlock}>
            <h3 style={styles.chartTitle}>Genial</h3>
            <div style={styles.chartAreaSmall}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
                  <XAxis dataKey="shortDate" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="genial"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                    name="Genial"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={styles.chartBlock}>
            <h3 style={styles.chartTitle}>Rico</h3>
            <div style={styles.chartAreaSmall}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
                  <XAxis dataKey="shortDate" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="rico"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    name="Rico"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#020617",
    minHeight: "100vh",
    padding: "14px 18px 30px",
    color: "white",
  },
  container: {
    width: "100%",
    maxWidth: "1700px",
    margin: "0 auto",
  },
  title: {
    textAlign: "center",
    marginBottom: 18,
    fontSize: 46,
    fontWeight: "800",
    color: "#00ff88",
    letterSpacing: "1px",
  },
  topControls: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  importItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    background: "#0b1324",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #172033",
  },
  input: {
    width: 110,
    padding: 6,
    borderRadius: 6,
    border: "none",
  },
  select: {
    width: 110,
    padding: 6,
    borderRadius: 6,
    border: "none",
  },
  driveButton: {
    background: "#166534",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  clearButton: {
    background: "#7f1d1d",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "700",
  },
  statusMsg: {
    textAlign: "center",
    marginBottom: 14,
    color: "#cbd5e1",
    fontSize: 14,
  },
  topCards: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  cardRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  cardRowSmall: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  card: {
    background: "linear-gradient(180deg, #0f172a 0%, #0b1220 100%)",
    padding: 14,
    borderRadius: 14,
    textAlign: "center",
    border: "1px solid #172033",
  },
  miniCard: {
    background: "#0b1324",
    padding: 12,
    borderRadius: 12,
    textAlign: "center",
    border: "1px solid #172033",
  },
  cardTitle: {
    fontSize: 12,
    marginBottom: 8,
    color: "#cbd5e1",
  },
  cardValue: {
    fontSize: 17,
    fontWeight: "800",
  },
  miniCardValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  progressBox: {
    background: "#0b1324",
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    border: "1px solid #172033",
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    color: "#e5e7eb",
    fontSize: 13,
  },
  progressBarBg: {
    width: "100%",
    height: 14,
    background: "#1e293b",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #00ff88 0%, #22c55e 100%)",
    borderRadius: 999,
  },
  metaBatida: {
    textAlign: "center",
    color: "lime",
    fontWeight: "bold",
    marginBottom: 14,
    fontSize: 28,
  },
  chartFull: {
    background: "#091225",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    border: "1px solid #172033",
  },
  chartBlock: {
    background: "#091225",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    border: "1px solid #172033",
  },
  chartTitle: {
    textAlign: "center",
    margin: 0,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#e5e7eb",
  },
  chartAreaLarge: {
    width: "100%",
    height: 340,
  },
  chartAreaMedium: {
    width: "100%",
    height: 260,
  },
  chartAreaSmall: {
    width: "100%",
    height: 280,
  },
  bottomColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    width: "100%",
  },
  tooltip: {
    background: "#0f172a",
    border: "1px solid #1f2937",
    padding: 10,
    borderRadius: 8,
    color: "#fff",
  },
};