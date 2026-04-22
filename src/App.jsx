import { useEffect, useMemo, useRef, useState } from "react";
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

const STORAGE_KEY = "dashboard_ec_auto_v1";

const GENIAL_CSV_URL = "/genial.csv";
const RICO_CSV_URL = "/rico.csv";

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

function getDateParts(dateTime) {
  const d = shortDate(dateTime);
  const parts = d.split("/");
  if (parts.length !== 3) {
    return { day: "", month: 0, year: 0, dateKey: "" };
  }

  const day = parts[0];
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  return {
    day,
    month,
    year,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function monthNameLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx] || month}/${year}`;
}

function toMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const dt = new Date(year, month - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
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

      if (!fechamento) return null;

      const parts = getDateParts(fechamento);
      if (!parts.dateKey) return null;

      return {
        broker,
        originalDate: fechamento,
        shortDate: shortDate(fechamento),
        day: parts.day,
        month: parts.month,
        year: parts.year,
        monthKey: `${parts.year}-${String(parts.month).padStart(2, "0")}`,
        dateKey: parts.dateKey,
        value: total - custo,
      };
    })
    .filter(Boolean);
}

function aggregateBrokerRowsByDate(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!map[row.dateKey]) {
      map[row.dateKey] = {
        dateKey: row.dateKey,
        shortDate: row.shortDate,
        day: row.day,
        month: row.month,
        year: row.year,
        monthKey: row.monthKey,
        value: 0,
      };
    }
    map[row.dateKey].value += row.value;
  });
  return map;
}

function sortByDateKeyAsc(list) {
  return [...list].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function normalizeDays(daysMap) {
  return Object.values(daysMap)
    .map((item) => ({
      ...item,
      genial: item.genial || 0,
      rico: item.rico || 0,
      total: (item.genial || 0) + (item.rico || 0),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
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

export default function App() {
  const currentMonthKey = toMonthKey(new Date());
  const autoLoadedRef = useRef(false);

  const [db, setDb] = useState({
    days: {},
  });

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [selectedDay, setSelectedDay] = useState("TODOS");
  const [metaMensal, setMetaMensal] = useState(10000);
  const [custo, setCusto] = useState(2.8);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setDb({
        days: saved.days || {},
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
        days: db.days,
        metaMensal,
        custo,
        selectedMonth,
      })
    );
  }, [db, metaMensal, custo, selectedMonth]);

  const allDays = useMemo(() => normalizeDays(db.days), [db.days]);

  const monthsAvailable = useMemo(() => {
    const set = new Set([currentMonthKey]);
    allDays.forEach((item) => set.add(item.monthKey));
    return Array.from(set).sort();
  }, [allDays, currentMonthKey]);

  const monthDataBase = useMemo(() => {
    return allDays.filter((item) => item.monthKey === selectedMonth);
  }, [allDays, selectedMonth]);

  const daysAvailable = useMemo(() => {
    const set = new Set(monthDataBase.map((item) => item.day).filter(Boolean));
    return ["TODOS", ...Array.from(set).sort((a, b) => Number(a) - Number(b))];
  }, [monthDataBase]);

  useEffect(() => {
    if (!daysAvailable.includes(selectedDay)) setSelectedDay("TODOS");
  }, [daysAvailable, selectedDay]);

  const monthData = useMemo(() => {
    const filtered =
      selectedDay === "TODOS"
        ? monthDataBase
        : monthDataBase.filter((item) => item.day === selectedDay);

    let acumulado = 0;
    let pico = 0;

    return sortByDateKeyAsc(filtered).map((item) => {
      acumulado += item.total;
      pico = Math.max(pico, acumulado);

      return {
        ...item,
        acumulado,
        drawdown: acumulado - pico,
      };
    });
  }, [monthDataBase, selectedDay]);

  const selectedYear = Number(selectedMonth.split("-")[0] || 0);

  const annualBase = useMemo(() => {
    return allDays.filter((item) => item.year === selectedYear);
  }, [allDays, selectedYear]);

  const annualData = useMemo(() => {
    let acumulado = 0;
    let pico = 0;

    return sortByDateKeyAsc(annualBase).map((item) => {
      acumulado += item.total;
      pico = Math.max(pico, acumulado);

      return {
        ...item,
        acumulado,
        drawdown: acumulado - pico,
      };
    });
  }, [annualBase]);

  const totalMes = monthDataBase.reduce((sum, item) => sum + item.total, 0);
  const totalFiltro = monthData.reduce((sum, item) => sum + item.total, 0);
  const totalAnual = annualBase.reduce((sum, item) => sum + item.total, 0);
  const totalGenialAnual = annualBase.reduce((sum, item) => sum + (item.genial || 0), 0);
  const totalRicoAnual = annualBase.reduce((sum, item) => sum + (item.rico || 0), 0);

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

  const melhorDiaGeral = monthDataBase.length
    ? monthDataBase.reduce((max, item) => (item.total > max.total ? item : max), monthDataBase[0])
    : null;

  const melhorDiaGenial = monthDataBase.length
    ? monthDataBase.reduce(
        (max, item) => ((item.genial || 0) > (max.genial || 0) ? item : max),
        monthDataBase[0]
      )
    : null;

  const melhorDiaRico = monthDataBase.length
    ? monthDataBase.reduce(
        (max, item) => ((item.rico || 0) > (max.rico || 0) ? item : max),
        monthDataBase[0]
      )
    : null;

  const piorDiaGeral = monthDataBase.length
    ? monthDataBase.reduce((min, item) => (item.total < min.total ? item : min), monthDataBase[0])
    : null;

  const piorDiaGenial = monthDataBase.length
    ? monthDataBase.reduce(
        (min, item) => ((item.genial || 0) < (min.genial || 0) ? item : min),
        monthDataBase[0]
      )
    : null;

  const piorDiaRico = monthDataBase.length
    ? monthDataBase.reduce(
        (min, item) => ((item.rico || 0) < (min.rico || 0) ? item : min),
        monthDataBase[0]
      )
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

    annualBase.forEach((item) => {
      const idx = item.month - 1;
      if (idx >= 0 && idx < 12) {
        base[idx].genial += item.genial || 0;
        base[idx].rico += item.rico || 0;
        base[idx].total += item.total || 0;
      }
    });

    return base;
  }, [annualBase]);

  const previousKey = previousMonthKey(selectedMonth);
  const previousMonthTotal = allDays
    .filter((item) => item.monthKey === previousKey)
    .reduce((sum, item) => sum + item.total, 0);

  const variationVsPrevious =
    previousMonthTotal !== 0
      ? ((totalMes - previousMonthTotal) / Math.abs(previousMonthTotal)) * 100
      : 0;

  const historyTable = useMemo(() => {
    return sortByDateKeyAsc(allDays).reverse().slice(0, 20);
  }, [allDays]);

  function upsertBrokerRows(rows, broker) {
    const aggregated = aggregateBrokerRowsByDate(rows);

    setDb((prev) => {
      const nextDays = { ...prev.days };

      Object.values(aggregated).forEach((row) => {
        const current = nextDays[row.dateKey] || {
          dateKey: row.dateKey,
          shortDate: row.shortDate,
          day: row.day,
          month: row.month,
          year: row.year,
          monthKey: row.monthKey,
          genial: 0,
          rico: 0,
        };

        nextDays[row.dateKey] = {
          ...current,
          shortDate: row.shortDate,
          day: row.day,
          month: row.month,
          year: row.year,
          monthKey: row.monthKey,
          genial: broker === "genial" ? row.value : current.genial || 0,
          rico: broker === "rico" ? row.value : current.rico || 0,
        };
      });

      return { days: nextDays };
    });

    const detectedMonths = [...new Set(rows.map((r) => r.monthKey))].sort();
    if (detectedMonths.length) {
      setSelectedMonth(detectedMonths[detectedMonths.length - 1]);
    }
  }

  async function fetchCsvText(url) {
    const finalUrl = `${url}?t=${Date.now()}`;
    const res = await fetch(finalUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status}`);
    }

    return await res.text();
  }

  async function atualizarDoPublic(showMessage = true) {
    try {
      setLoadingCsv(true);
      if (showMessage) setStatusMsg("Buscando arquivos CSV do site...");

      const genialText = await fetchCsvText(GENIAL_CSV_URL);
      const ricoText = await fetchCsvText(RICO_CSV_URL);

      const genialRows = parseProfitCsvText(genialText, "genial", custo);
      const ricoRows = parseProfitCsvText(ricoText, "rico", custo);

      if (!genialRows.length && !ricoRows.length) {
        throw new Error("Os arquivos foram lidos, mas não retornaram linhas válidas.");
      }

      upsertBrokerRows(genialRows, "genial");
      upsertBrokerRows(ricoRows, "rico");

      if (showMessage) {
        setStatusMsg("Arquivos CSV atualizados com sucesso.");
      }
    } catch (err) {
      console.error(err);
      if (showMessage) {
        setStatusMsg(`Erro ao buscar os CSVs do site: ${err.message}`);
      }
    } finally {
      setLoadingCsv(false);
    }
  }

  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    atualizarDoPublic(false);
  }, []);

  function importManualFile(file, broker) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const rows = parseProfitCsvText(text, broker, custo);
      upsertBrokerRows(rows, broker);
      setStatusMsg(`Arquivo ${broker} importado com sucesso.`);
    };
    reader.readAsText(file);
  }

  function clearSelectedMonth() {
    setDb((prev) => {
      const nextDays = { ...prev.days };
      Object.keys(nextDays).forEach((dateKey) => {
        if (nextDays[dateKey].monthKey === selectedMonth) {
          delete nextDays[dateKey];
        }
      });
      return { days: nextDays };
    });
    setStatusMsg(`Mês ${monthLabel(selectedMonth)} limpo.`);
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    setDb({ days: {} });
    setSelectedMonth(currentMonthKey);
    setSelectedDay("TODOS");
    setStatusMsg("Histórico completo apagado.");
  }

  const ritmoColor =
    progressoMeta >= 100 ? "#22c55e" : progressoMeta >= 70 ? "#facc15" : "#ef4444";

  const ritmoTexto =
    progressoMeta >= 100
      ? "META BATIDA"
      : progressoMeta >= 70
      ? "NO RITMO CERTO"
      : "ATRASADO";

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
            onClick={() => atualizarDoPublic(true)}
            disabled={loadingCsv}
          >
            {loadingCsv ? "Atualizando..." : "Atualizar CSV"}
          </button>

          <button style={styles.clearButton} onClick={clearSelectedMonth}>
            Limpar mês
          </button>

          <button style={styles.clearButton} onClick={clearAll}>
            Limpar tudo
          </button>
        </div>

        {!!statusMsg && <div style={styles.statusMsg}>{statusMsg}</div>}

        <div style={{ ...styles.ritmoBox, borderColor: ritmoColor }}>
          <span style={{ color: ritmoColor, fontWeight: "800" }}>{ritmoTexto}</span>
        </div>

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
          <Card title="Precisa por dia" value={formatMoney(precisaPorDia)} color="#fbbf24" />
        </div>

        <div style={styles.cardRowSmall}>
          <MiniCard
            title={`Mês atual (${monthNameLabel(selectedMonth)})`}
            value={formatMoney(totalMes)}
            color="#00ff88"
          />
          <MiniCard
            title={`Mês anterior (${monthNameLabel(previousKey)})`}
            value={formatMoney(previousMonthTotal)}
            color="#e5e7eb"
          />
          <MiniCard
            title="Variação vs mês anterior"
            value={`${variationVsPrevious.toFixed(1)}%`}
            color={variationVsPrevious >= 0 ? "#22c55e" : "#ef4444"}
          />
          <MiniCard title="Dias restantes" value={String(diasRestantes)} color="#e5e7eb" />
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
          <MiniCard title="Drawdown" value={formatMoney(piorDrawdown)} color="#ef4444" />
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
          <MiniCard title="Dias no histórico" value={String(allDays.length)} color="#e5e7eb" />
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
          <h3 style={styles.chartTitle}>Gráfico Consolidado do Mês</h3>
          <div style={styles.chartAreaLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthData}>
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
                <LineChart data={monthData}>
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
                <LineChart data={monthData}>
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

        <div style={styles.chartFull}>
          <h3 style={styles.chartTitle}>Histórico Diário (últimos 20 dias salvos)</h3>
          <div style={styles.historyTable}>
            <div style={styles.historyHeader}>
              <span>Data</span>
              <span>Genial</span>
              <span>Rico</span>
              <span>Total</span>
            </div>

            {historyTable.map((item) => (
              <div key={item.dateKey} style={styles.historyRow}>
                <span>{item.shortDate}</span>
                <span style={{ color: "#60a5fa" }}>{formatMoney(item.genial)}</span>
                <span style={{ color: "#fbbf24" }}>{formatMoney(item.rico)}</span>
                <span style={{ color: item.total >= 0 ? "#22c55e" : "#ef4444" }}>
                  {formatMoney(item.total)}
                </span>
              </div>
            ))}

            {!historyTable.length && (
              <div style={styles.historyEmpty}>Nenhum histórico salvo ainda.</div>
            )}
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
  ritmoBox: {
    textAlign: "center",
    marginBottom: 16,
    padding: "10px 14px",
    borderRadius: 12,
    border: "2px solid",
    background: "#0b1324",
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
  historyTable: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  historyHeader: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
    gap: 10,
    padding: "10px 12px",
    background: "#111b31",
    borderRadius: 10,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "700",
  },
  historyRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
    gap: 10,
    padding: "10px 12px",
    background: "#0b1324",
    borderRadius: 10,
    border: "1px solid #172033",
    fontSize: 13,
  },
  historyEmpty: {
    textAlign: "center",
    color: "#94a3b8",
    padding: 12,
  },
};