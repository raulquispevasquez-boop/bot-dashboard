import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Download, Search, Filter, RefreshCw, Flame, Thermometer, Database, 
  Building2, ChevronDown, Check, Globe, RotateCcw, Activity, Sparkles, FileSpreadsheet,
  Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, HelpCircle, X, Info,
  BarChart2, Table as TableIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Harmonic Regression Helper for Daily Trend Estimation
const fitHarmonicRegression = (dataPoints) => {
  if (!dataPoints || dataPoints.length < 4) return null;
  const N = dataPoints.length;

  const X = dataPoints.map(p => {
    const sinVal = Math.sin(2 * Math.PI * p.month / 12);
    const cosVal = Math.cos(2 * Math.PI * p.month / 12);
    return [1, p.t, sinVal, cosVal];
  });
  const Y = dataPoints.map(p => p.value);

  const XTX = Array(4).fill(0).map(() => Array(4).fill(0));
  const XTY = Array(4).fill(0);

  for (let i = 0; i < N; i++) {
    for (let r = 0; r < 4; r++) {
      XTY[r] += X[i][r] * Y[i];
      for (let c = 0; c < 4; c++) {
        XTX[r][c] += X[i][r] * X[i][c];
      }
    }
  }

  const invert4x4 = (matrix) => {
    const A = matrix.map(row => [...row]);
    const I = Array(4).fill(0).map((_, i) => {
      const r = Array(4).fill(0);
      r[i] = 1;
      return r;
    });

    for (let i = 0; i < 4; i++) {
      let pivotRow = i;
      for (let r = i + 1; r < 4; r++) {
        if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) pivotRow = r;
      }
      if (pivotRow !== i) {
        [A[i], A[pivotRow]] = [A[pivotRow], A[i]];
        [I[i], I[pivotRow]] = [I[pivotRow], I[i]];
      }

      const pivot = A[i][i];
      if (Math.abs(pivot) < 1e-12) return null;

      for (let c = 0; c < 4; c++) {
        A[i][c] /= pivot;
        I[i][c] /= pivot;
      }

      for (let r = 0; r < 4; r++) {
        if (r !== i) {
          const factor = A[r][i];
          for (let c = 0; c < 4; c++) {
            A[r][c] -= factor * A[i][c];
            I[r][c] -= factor * I[i][c];
          }
        }
      }
    }
    return I;
  };

  const XTX_inv = invert4x4(XTX);
  if (!XTX_inv) return null;

  const beta = Array(4).fill(0);
  for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let c = 0; c < 4; c++) {
      sum += XTX_inv[r][c] * XTY[c];
    }
    beta[r] = sum;
  }

  return { beta };
};

const Clima4 = () => {
  const [historicalRecords, setHistoricalRecords] = useState([]);
  const [sedesList, setSedesList] = useState([]);
  const [cecoMap, setCecoMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('Inicializando...');

  // View Mode: 'table' vs 'chart'
  const [viewMode, setViewMode] = useState('table');
  const [monthlyDeltaScenario, setMonthlyDeltaScenario] = useState('hist'); // 'hist', 'intermed', 'nino'

  // CDD Base Temperature state (default 18°C)
  const [cddBaseTemp, setCddBaseTemp] = useState(() => {
    const saved = localStorage.getItem('clima_cdd_base_temp');
    return saved ? Number(saved) : 18;
  });

  const updateCddBaseTemp = (newBase) => {
    setCddBaseTemp(newBase);
    localStorage.setItem('clima_cdd_base_temp', String(newBase));
    window.dispatchEvent(new CustomEvent('clima_cdd_base_changed', { detail: newBase }));
    setShowCddBasePopover(false);
  };

  useEffect(() => {
    const handleBaseChange = (e) => {
      if (e.detail && Number(e.detail) !== cddBaseTemp) {
        setCddBaseTemp(Number(e.detail));
      }
    };
    window.addEventListener('clima_cdd_base_changed', handleBaseChange);
    return () => window.removeEventListener('clima_cdd_base_changed', handleBaseChange);
  }, [cddBaseTemp]);

  // Modal Informativo State
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Filters & Search
  const [searchSedeLeft, setSearchSedeLeft] = useState('');
  const [searchTable, setSearchTable] = useState('');
  const [selectedSedes, setSelectedSedes] = useState(['Global']);
  const [selectedYears, setSelectedYears] = useState(['2026', '2025', '2024']);
  const [selectedMonths, setSelectedMonths] = useState([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  // Pagination state (default 500 rows per page for smooth scrolling)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(500);

  // Popover controls
  const [showYearPopover, setShowYearPopover] = useState(false);
  const [showMonthPopover, setShowMonthPopover] = useState(false);
  const [showCddBasePopover, setShowCddBasePopover] = useState(false);

  const yearPopoverRef = useRef(null);
  const monthPopoverRef = useRef(null);
  const cddBasePopoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (yearPopoverRef.current && !yearPopoverRef.current.contains(e.target)) setShowYearPopover(false);
      if (monthPopoverRef.current && !monthPopoverRef.current.contains(e.target)) setShowMonthPopover(false);
      if (cddBasePopoverRef.current && !cddBasePopoverRef.current.contains(e.target)) setShowCddBasePopover(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real climate records + sedes list on mount
  const fetchData = async () => {
    setLoading(true);
    setLoadingProgress(10);
    setLoadingStatus('Conectando con base de datos...');
    const backendBaseUrl = window.location.protocol + '//' + window.location.hostname + ':3001';
    let records = [];
    let sedesSet = new Set();
    let cecoDict = {};

    // 1. Fetch Sedes list and CECO mapping
    try {
      setLoadingProgress(20);
      setLoadingStatus('Descargando catálogo de sedes...');
      const resSedes = await fetch(`${backendBaseUrl}/api/senamhi/sedes`);
      if (resSedes.ok) {
        const jsonSedes = await resSedes.json();
        if (jsonSedes.data && Array.isArray(jsonSedes.data)) {
          jsonSedes.data.forEach(s => {
            if (s.sede) {
              sedesSet.add(s.sede);
              if (s.ceco) cecoDict[s.sede] = s.ceco;
            }
          });
        }
      }
    } catch (e) {
      console.warn("Could not fetch sedes metadata:", e);
    }

    // 2. Fetch METEO climate data
    try {
      setLoadingProgress(40);
      setLoadingStatus('Descargando datos meteorológicos diarios...');
      const resMeteo = await fetch(`${backendBaseUrl}/api/clima?limit=100000`);
      if (resMeteo.ok) {
        const json = await resMeteo.json();
        if (json.data && Array.isArray(json.data)) {
          json.data.forEach(r => {
            const sName = r.sede || 'Global';
            records.push({
              fecha: r.fecha,
              sede: sName,
              ceco: r.ceco || cecoDict[sName] || 'N/A',
              temp_promedio: Number(r.temp_promedio ?? r.t_promedio ?? r.temp_max),
              temp_max: r.temp_max,
              temp_min: r.temp_min,
              fuente: r.fuente_datos || 'METEO'
            });
            if (sName) sedesSet.add(sName);
            if (r.ceco && sName) cecoDict[sName] = r.ceco;
          });
        }
      }
    } catch (err) {
      console.error("Error fetching METEO climate data:", err);
    }

    // 3. Fetch SENAMHI climate data
    try {
      setLoadingProgress(70);
      setLoadingStatus('Descargando datos SENAMHI diarios...');
      const resSenamhi = await fetch(`${backendBaseUrl}/api/senamhi?limit=100000`);
      if (resSenamhi.ok) {
        const json = await resSenamhi.json();
        if (json.data && Array.isArray(json.data)) {
          json.data.forEach(r => {
            const sName = r.sede_spsa || r.sede || 'Global';
            const tProm = (r.temp_promedio !== undefined && r.temp_promedio !== null) 
              ? Number(r.temp_promedio) 
              : ((Number(r.temp_max || 0) + Number(r.temp_min || 0)) / 2);

            records.push({
              fecha: r.fecha,
              sede: sName,
              ceco: r.ceco || cecoDict[sName] || 'N/A',
              temp_promedio: tProm,
              temp_max: r.temp_max,
              temp_min: r.temp_min,
              fuente: 'SENAMHI'
            });
            if (sName) sedesSet.add(sName);
            if (r.ceco && sName) cecoDict[sName] = r.ceco;
          });
        }
      }
    } catch (err) {
      console.error("Error fetching SENAMHI data:", err);
    }

    setLoadingProgress(90);
    setLoadingStatus('Procesando datos por sede...');
    await new Promise(resolve => setTimeout(resolve, 50));

    setHistoricalRecords(records);
    setCecoMap(cecoDict);
    const sortedSedes = Array.from(sedesSet).sort();
    setSedesList(sortedSedes);

    setLoadingProgress(100);
    setLoadingStatus('¡Completado!');
    setTimeout(() => setLoading(false), 300);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Available Years list from data
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    historicalRecords.forEach(r => {
      if (r.fecha) {
        const yr = String(r.fecha).split('-')[0];
        if (yr && yr.length === 4) yearsSet.add(yr);
      }
    });
    ['2026', '2025', '2024'].forEach(y => yearsSet.add(y));
    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
  }, [historicalRecords]);

  // Compute Harmonic Fits for each Sede
  const regressionFits = useMemo(() => {
    const fits = {};
    const sedesToFit = [...sedesList, 'Global'];
    const groupedData = {};

    historicalRecords.forEach(r => {
      if (!r.fecha) return;
      const parts = String(r.fecha).split('-');
      if (parts.length < 2) return;
      const yr = parts[0];
      const m = parseInt(parts[1], 10) - 1;
      const val = Number(r.temp_promedio);
      if (isNaN(val)) return;

      const keySpecific = `${r.sede}_${yr}_${m}`;
      if (!groupedData[keySpecific]) groupedData[keySpecific] = { sum: 0, count: 0 };
      groupedData[keySpecific].sum += val;
      groupedData[keySpecific].count += 1;
    });

    sedesToFit.forEach(sede => {
      const dataPoints = [];
      ['2024', '2025', '2026'].forEach(yr => {
        for (let m = 0; m <= 11; m++) {
          const key = `${sede}_${yr}_${m}`;
          const group = groupedData[key];
          if (group && group.count > 0) {
            dataPoints.push({ t: Number(yr) + m / 12, month: m, value: group.sum / group.count });
          }
        }
      });
      const fit = fitHarmonicRegression(dataPoints);
      if (fit) fits[sede] = fit;
    });

    return fits;
  }, [historicalRecords, sedesList]);

  // Calculate DAILY records for all Sedes and Dates:
  // Includes Daily Deltas (DÍA) & Monthly Thermal Deltas (MES) vs 2025 for all 3 scenarios!
  const allDailyCalculations = useMemo(() => {
    if (!historicalRecords || historicalRecords.length === 0) return [];

    // 1. Map actual daily records by `sede__fecha`
    const dailyMap = {};
    historicalRecords.forEach(r => {
      if (!r.fecha || !r.sede) return;
      const key = `${r.sede}__${r.fecha}`;
      if (!dailyMap[key]) {
        dailyMap[key] = {
          records: [],
          ceco: r.ceco || cecoMap[r.sede] || 'N/A'
        };
      }
      if (!isNaN(r.temp_promedio)) {
        dailyMap[key].records.push(r.temp_promedio);
      }
    });

    // Lookup map for day temperatures: `sede__yr__MM-DD`
    const dayTempMap = {};
    // Lookup map for month temperatures: `sede__yr__m`
    const monthTempAccMap = {};

    const dailyList = [];
    const sedesToProcess = sedesList.length > 0 ? sedesList : ['Acho - PVH'];

    sedesToProcess.forEach(sede => {
      const cecoCode = cecoMap[sede] || 'N/A';

      availableYears.forEach(yr => {
        const isLeapYear = (Number(yr) % 4 === 0 && Number(yr) % 100 !== 0) || (Number(yr) % 400 === 0);

        for (let m = 0; m < 12; m++) {
          const numDays = m === 1 && isLeapYear ? 29 : DAYS_IN_MONTH[m];
          const monthStr = String(m + 1).padStart(2, '0');

          for (let d = 1; d <= numDays; d++) {
            const dayStr = String(d).padStart(2, '0');
            const dateStr = `${yr}-${monthStr}-${dayStr}`;
            const key = `${sede}__${dateStr}`;
            const entry = dailyMap[key];

            let tempPromReal = null;
            if (entry && entry.records.length > 0) {
              tempPromReal = entry.records.reduce((a, b) => a + b, 0) / entry.records.length;
            }

            // Real vs Projected Rule:
            // Year 2025 or Year 2026 Jan-Jun (months 0 to 5): REAL DATA
            // Year 2026 Jul-Dec (months 6 to 11): PROJECTED ML
            const isProjectedPeriod = (yr === '2026' && m >= 6);
            const isReal = !isProjectedPeriod && tempPromReal !== null;
            const tipoDato = isReal ? 'Dato Real' : 'Proyectado';

            // Harmonic ML prediction fallback
            const fit = regressionFits[sede] || regressionFits['Global'];
            let tempHarmonic = 20.5;
            if (fit && fit.beta) {
              const t = Number(yr) + m / 12 + d / 365;
              const sinVal = Math.sin(2 * Math.PI * m / 12);
              const cosVal = Math.cos(2 * Math.PI * m / 12);
              tempHarmonic = fit.beta[0] + fit.beta[1] * t + fit.beta[2] * sinVal + fit.beta[3] * cosVal;
            }

            let tHist, tIntermed, tNino;
            if (isReal) {
              tHist = tempPromReal;
              tIntermed = tempPromReal;
              tNino = tempPromReal;
            } else {
              tHist = tempHarmonic;
              tIntermed = tempHarmonic + 0.4;
              tNino = tempHarmonic + 0.9;
            }

            dayTempMap[`${sede}__${yr}__${monthStr}-${dayStr}`] = parseFloat(tHist.toFixed(1));

            // Accumulate monthly temperatures to compute Monthly Averages (MES)
            const mk = `${sede}__${yr}__${m}`;
            if (!monthTempAccMap[mk]) {
              monthTempAccMap[mk] = { histSum: 0, intermedSum: 0, ninoSum: 0, count: 0 };
            }
            monthTempAccMap[mk].histSum += tHist;
            monthTempAccMap[mk].intermedSum += tIntermed;
            monthTempAccMap[mk].ninoSum += tNino;
            monthTempAccMap[mk].count += 1;

            // CDD Base 18°C: max(0, T - 18)
            const cddHist = Math.max(0, tHist - cddBaseTemp);
            const cddIntermed = Math.max(0, tIntermed - cddBaseTemp);
            const cddNino = Math.max(0, tNino - cddBaseTemp);

            dailyList.push({
              fecha: dateStr,
              year: yr,
              monthIdx: m,
              monthName: MONTH_NAMES[m],
              day: d,
              monthDayKey: `${monthStr}-${dayStr}`,
              ceco: entry?.ceco || cecoCode,
              sede: sede,
              tipoDato: tipoDato,
              tempPromedioDia: parseFloat(tHist.toFixed(1)),
              tempIntermedioDia: parseFloat(tIntermed.toFixed(1)),
              tempNinoDia: parseFloat(tNino.toFixed(1)),
              cddHistorico: parseFloat(cddHist.toFixed(1)),
              cddIntermedio: parseFloat(cddIntermed.toFixed(1)),
              cddAlertaNino: parseFloat(cddNino.toFixed(1)),
              monthKey: `${sede}__${yr}__${m}`,
              yearKey: `${sede}__${yr}`
            });
          }
        }
      });
    });

    // 2. Compute Monthly Average Temperatures for 2025 and 2026 (Hist, Intermed, Nino)
    const monthlyAvgMap = {};
    Object.keys(monthTempAccMap).forEach(mk => {
      const acc = monthTempAccMap[mk];
      if (acc.count > 0) {
        monthlyAvgMap[mk] = {
          histAvg: acc.histSum / acc.count,
          intermedAvg: acc.intermedSum / acc.count,
          ninoAvg: acc.ninoSum / acc.count
        };
      }
    });

    // 3. Attach Daily Deltas (DÍA) and Monthly Thermal Deltas (MES) vs 2025
    const dailyWithDeltas = dailyList.map(item => {
      const t2025 = dayTempMap[`${item.sede}__2025__${item.monthDayKey}`];
      const t2026 = dayTempMap[`${item.sede}__2026__${item.monthDayKey}`];

      const temp2025Val = t2025 !== undefined ? t2025 : item.tempPromedioDia;
      const temp2026Val = t2026 !== undefined ? t2026 : item.tempPromedioDia;

      // Daily Deltas (DÍA)
      const deltaHistDia = parseFloat((item.tempPromedioDia - temp2025Val).toFixed(1));
      const deltaIntermedDia = parseFloat((item.tempIntermedioDia - temp2025Val).toFixed(1));
      const deltaNinoDia = parseFloat((item.tempNinoDia - temp2025Val).toFixed(1));

      // Monthly Thermal Deltas (MES) vs 2025
      const mKey2025 = `${item.sede}__2025__${item.monthIdx}`;
      const mKeyCurrent = `${item.sede}__${item.year}__${item.monthIdx}`;

      const monthAvg2025 = monthlyAvgMap[mKey2025]?.histAvg ?? item.tempPromedioDia;
      const currentMonthAvgHist = monthlyAvgMap[mKeyCurrent]?.histAvg ?? item.tempPromedioDia;
      const currentMonthAvgIntermed = monthlyAvgMap[mKeyCurrent]?.intermedAvg ?? item.tempIntermedioDia;
      const currentMonthAvgNino = monthlyAvgMap[mKeyCurrent]?.ninoAvg ?? item.tempNinoDia;

      const deltaHistMes = parseFloat((currentMonthAvgHist - monthAvg2025).toFixed(1));
      const deltaIntermedMes = parseFloat((currentMonthAvgIntermed - monthAvg2025).toFixed(1));
      const deltaNinoMes = parseFloat((currentMonthAvgNino - monthAvg2025).toFixed(1));

      return {
        ...item,
        tempPromedio2025: temp2025Val,
        tempPromedio2026: temp2026Val,
        deltaTempHistDia: deltaHistDia,
        deltaTempIntermedDia: deltaIntermedDia,
        deltaTempNinoDia: deltaNinoDia,
        deltaTempHistMes: deltaHistMes,
        deltaTempIntermedMes: deltaIntermedMes,
        deltaTempNinoMes: deltaNinoMes
      };
    });

    // 4. Compute Monthly Running Accumulation (CUMULATIVE DAY-BY-DAY WITHIN MONTH)
    const monthlyAccTracker = {};
    const dailyWithMonthlyAcc = dailyWithDeltas.map(item => {
      const mk = item.monthKey;
      if (!monthlyAccTracker[mk]) {
        monthlyAccTracker[mk] = { hist: 0, intermed: 0, nino: 0 };
      }
      monthlyAccTracker[mk].hist += item.cddHistorico;
      monthlyAccTracker[mk].intermed += item.cddIntermedio;
      monthlyAccTracker[mk].nino += item.cddAlertaNino;

      return {
        ...item,
        cddAcumuladoMesHistorico: Math.round(monthlyAccTracker[mk].hist),
        cddAcumuladoMesIntermedio: Math.round(monthlyAccTracker[mk].intermed),
        cddAcumuladoMesAlertaNino: Math.round(monthlyAccTracker[mk].nino)
      };
    });

    // 5. Compute Annual Total Accumulation for 2025 and 2026 (3 Scenarios) per Sede
    const annualTotalsMap = {};
    dailyWithMonthlyAcc.forEach(item => {
      const sede = item.sede;
      if (!annualTotalsMap[sede]) {
        annualTotalsMap[sede] = {
          cdd2025: 0,
          cdd2026Hist: 0,
          cdd2026Intermed: 0,
          cdd2026Nino: 0
        };
      }
      if (item.year === '2025') {
        annualTotalsMap[sede].cdd2025 += item.cddHistorico;
      } else if (item.year === '2026') {
        annualTotalsMap[sede].cdd2026Hist += item.cddHistorico;
        annualTotalsMap[sede].cdd2026Intermed += item.cddIntermedio;
        annualTotalsMap[sede].cdd2026Nino += item.cddAlertaNino;
      }
    });

    // Attach Annual Totals to each row
    const finalDailyList = dailyWithMonthlyAcc.map(item => {
      const ann = annualTotalsMap[item.sede] || { cdd2025: 0, cdd2026Hist: 0, cdd2026Intermed: 0, cdd2026Nino: 0 };
      return {
        ...item,
        cddAnual2025Total: Math.round(ann.cdd2025),
        cddAnual2026HistTotal: Math.round(ann.cdd2026Hist),
        cddAnual2026IntermedTotal: Math.round(ann.cdd2026Intermed),
        cddAnual2026NinoTotal: Math.round(ann.cdd2026Nino)
      };
    });

    // Sort by Fecha desc, Sede asc
    return finalDailyList.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.sede.localeCompare(b.sede);
    });
  }, [historicalRecords, sedesList, availableYears, cecoMap, regressionFits, cddBaseTemp]);

  // Filtered Daily Rows
  const filteredRows = useMemo(() => {
    return allDailyCalculations.filter(row => {
      // 1. Left Sede Selection
      const isGlobalSede = selectedSedes.includes('Global');
      const matchSedeSelection = isGlobalSede ? true : selectedSedes.includes(row.sede);

      // 2. Text Search (Sede or CECO or Fecha or TipoDato)
      const q = searchTable.toLowerCase().trim();
      const matchSearch = !q || 
        row.sede.toLowerCase().includes(q) || 
        String(row.ceco).toLowerCase().includes(q) ||
        row.fecha.includes(q) ||
        row.tipoDato.toLowerCase().includes(q);

      // 3. Year Filter
      const matchYear = selectedYears.length === 0 || selectedYears.includes(String(row.year));

      // 4. Month Filter
      const matchMonth = selectedMonths.length === 0 || selectedMonths.includes(row.monthIdx);

      return matchSedeSelection && matchSearch && matchYear && matchMonth;
    });
  }, [allDailyCalculations, selectedSedes, searchTable, selectedYears, selectedMonths]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTable, selectedSedes, selectedYears, selectedMonths, pageSize]);

  // Paginated Rows for DOM Rendering
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Metric Summaries
  const summaryMetrics = useMemo(() => {
    if (filteredRows.length === 0) {
      return { totalDays: 0, avgTemp: 0, sumCddHist: 0, sumCddIntermed: 0, sumCddNino: 0 };
    }
    const sumTemp = filteredRows.reduce((a, b) => a + b.tempPromedioDia, 0);
    const sumHist = filteredRows.reduce((a, b) => a + b.cddHistorico, 0);
    const sumIntermed = filteredRows.reduce((a, b) => a + b.cddIntermedio, 0);
    const sumNino = filteredRows.reduce((a, b) => a + b.cddAlertaNino, 0);

    return {
      totalDays: filteredRows.length,
      avgTemp: (sumTemp / filteredRows.length).toFixed(1),
      sumCddHist: Math.round(sumHist),
      sumCddIntermed: Math.round(sumIntermed),
      sumCddNino: Math.round(sumNino)
    };
  }, [filteredRows]);

  // Monthly Thermal Anomaly Aggregation for Chart 2
  const monthlyThermalChartData = useMemo(() => {
    const sedesToChart = selectedSedes.includes('Global') 
      ? (sedesList.length > 0 ? sedesList.slice(0, 10) : ['Acho - PVH']) 
      : selectedSedes;

    // For each month (0..11), compute average delta across selected sedes
    const result = MONTH_SHORT.map((mName, mIdx) => {
      const rowsForMonth = filteredRows.filter(r => r.monthIdx === mIdx && sedesToChart.includes(r.sede));
      if (rowsForMonth.length === 0) return { month: mName, valHist: 0, valIntermed: 0, valNino: 0 };

      const sumHist = rowsForMonth.reduce((a, b) => a + b.deltaTempHistMes, 0);
      const sumIntermed = rowsForMonth.reduce((a, b) => a + b.deltaTempIntermedMes, 0);
      const sumNino = rowsForMonth.reduce((a, b) => a + b.deltaTempNinoMes, 0);

      return {
        month: mName,
        valHist: parseFloat((sumHist / rowsForMonth.length).toFixed(1)),
        valIntermed: parseFloat((sumIntermed / rowsForMonth.length).toFixed(1)),
        valNino: parseFloat((sumNino / rowsForMonth.length).toFixed(1))
      };
    });

    return result;
  }, [filteredRows, selectedSedes, sedesList]);

  // EXPORT 2-SHEET EXCEL FILE (.XLSX) WITH DAILY AND MONTHLY THERMAL DELTAS AND ANNUAL TOTALS
  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;

    // HOJA 1: Detalle CDD Diario Completo
    const dailySheetRows = filteredRows.map((row, index) => ({
      'N°': index + 1,
      'FECHA': row.fecha,
      'CECO': row.ceco,
      'SEDE': row.sede,
      'TIPO DATO': row.tipoDato,
      'TEMP PROM. DÍA 2025 (°C)': row.tempPromedio2025,
      'TEMP PROM. DÍA 2026 (°C)': row.tempPromedio2026,
      'Δ TEMP PROM. DÍA VS 2025 (°C)': row.deltaTempHistDia > 0 ? `+${row.deltaTempHistDia} °C` : `${row.deltaTempHistDia} °C`,
      'Δ TEMP INTERMED. DÍA VS 2025 (°C)': row.deltaTempIntermedDia > 0 ? `+${row.deltaTempIntermedDia} °C` : `${row.deltaTempIntermedDia} °C`,
      'Δ TEMP NIÑO DÍA VS 2025 (°C)': row.deltaTempNinoDia > 0 ? `+${row.deltaTempNinoDia} °C` : `${row.deltaTempNinoDia} °C`,
      'Δ TEMP PROM. MES VS 2025 (°C)': row.deltaTempHistMes > 0 ? `+${row.deltaTempHistMes} °C` : `${row.deltaTempHistMes} °C`,
      'Δ TEMP INTERMED. MES VS 2025 (°C)': row.deltaTempIntermedMes > 0 ? `+${row.deltaTempIntermedMes} °C` : `${row.deltaTempIntermedMes} °C`,
      'Δ TEMP NIÑO MES VS 2025 (°C)': row.deltaTempNinoMes > 0 ? `+${row.deltaTempNinoMes} °C` : `${row.deltaTempNinoMes} °C`,
      [`CDD 2025 (DÍA)`]: row.cddHistorico,
      [`CDD 2026 HISTÓRICO (DÍA)`]: row.cddHistorico,
      [`CDD 2026 INTERMEDIO (DÍA)`]: row.cddIntermedio,
      [`CDD 2026 ALERTA NIÑO (DÍA)`]: row.cddAlertaNino,
      'CDD ACUM. MES 2026 (HISTÓRICO)': row.cddAcumuladoMesHistorico,
      'CDD ACUM. MES 2026 (INTERMEDIO)': row.cddAcumuladoMesIntermedio,
      'CDD ACUM. MES 2026 (ALERTA NIÑO)': row.cddAcumuladoMesAlertaNino,
      'CDD ACUM. TOTAL ANUAL 2025': row.cddAnual2025Total,
      'CDD ACUM. TOTAL ANUAL 2026 (HISTÓRICO)': row.cddAnual2026HistTotal,
      'CDD ACUM. TOTAL ANUAL 2026 (INTERMEDIO)': row.cddAnual2026IntermedTotal,
      'CDD ACUM. TOTAL ANUAL 2026 (ALERTA NIÑO)': row.cddAnual2026NinoTotal
    }));

    // HOJA 2: Resumen Acumulado Mensual y Anual por Sede
    const monthlySummaryMap = {};
    filteredRows.forEach(row => {
      const mk = row.monthKey; // `sede__yr__m`
      if (!monthlySummaryMap[mk]) {
        monthlySummaryMap[mk] = {
          ceco: row.ceco,
          sede: row.sede,
          year: row.year,
          monthName: row.monthName,
          tipoDato: row.tipoDato,
          temps2025: [],
          temps2026: [],
          cddHistSum: 0,
          cddIntermedSum: 0,
          cddNinoSum: 0,
          deltaMesHist: row.deltaTempHistMes,
          deltaMesIntermed: row.deltaTempIntermedMes,
          deltaMesNino: row.deltaTempNinoMes,
          ann2025: row.cddAnual2025Total,
          ann2026Hist: row.cddAnual2026HistTotal,
          ann2026Intermed: row.cddAnual2026IntermedTotal,
          ann2026Nino: row.cddAnual2026NinoTotal
        };
      }
      monthlySummaryMap[mk].temps2025.push(row.tempPromedio2025);
      monthlySummaryMap[mk].temps2026.push(row.tempPromedio2026);
      monthlySummaryMap[mk].cddHistSum += row.cddHistorico;
      monthlySummaryMap[mk].cddIntermedSum += row.cddIntermedio;
      monthlySummaryMap[mk].cddNinoSum += row.cddAlertaNino;
    });

    const monthlySheetRows = Object.values(monthlySummaryMap).map((mItem, index) => {
      const avg2025 = mItem.temps2025.reduce((a, b) => a + b, 0) / mItem.temps2025.length;
      const avg2026 = mItem.temps2026.reduce((a, b) => a + b, 0) / mItem.temps2026.length;

      return {
        'N°': index + 1,
        'CECO': mItem.ceco,
        'SEDE': mItem.sede,
        'AÑO': Number(mItem.year),
        'MES': mItem.monthName,
        'TIPO DATO': mItem.tipoDato,
        'TEMP PROM. MENSUAL 2025 (°C)': parseFloat(avg2025.toFixed(1)),
        'TEMP PROM. MENSUAL 2026 (°C)': parseFloat(avg2026.toFixed(1)),
        'Δ TEMP PROM. MES VS 2025 (°C)': mItem.deltaMesHist > 0 ? `+${mItem.deltaMesHist} °C` : `${mItem.deltaMesHist} °C`,
        'Δ TEMP INTERMED. MES VS 2025 (°C)': mItem.deltaMesIntermed > 0 ? `+${mItem.deltaMesIntermed} °C` : `${mItem.deltaMesIntermed} °C`,
        'Δ TEMP NIÑO MES VS 2025 (°C)': mItem.deltaMesNino > 0 ? `+${mItem.deltaMesNino} °C` : `${mItem.deltaMesNino} °C`,
        [`CDD ACUM. MES 2026 HISTÓRICO (BASE ${cddBaseTemp}°C)`]: Math.round(mItem.cddHistSum),
        [`CDD ACUM. MES 2026 INTERMEDIO (BASE ${cddBaseTemp}°C)`]: Math.round(mItem.cddIntermedSum),
        [`CDD ACUM. MES 2026 ALERTA NIÑO (BASE ${cddBaseTemp}°C)`]: Math.round(mItem.cddNinoSum),
        'CDD ACUM. ANUAL 2025 TOTAL': mItem.ann2025,
        'CDD ACUM. ANUAL 2026 HISTÓRICO TOTAL': mItem.ann2026Hist,
        'CDD ACUM. ANUAL 2026 INTERMEDIO TOTAL': mItem.ann2026Intermed,
        'CDD ACUM. ANUAL 2026 ALERTA NIÑO TOTAL': mItem.ann2026Nino
      };
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1
    const ws1 = XLSX.utils.json_to_sheet(dailySheetRows);
    ws1['!cols'] = [
      { wch: 6 },  // N°
      { wch: 12 }, // FECHA
      { wch: 12 }, // CECO
      { wch: 28 }, // SEDE
      { wch: 14 }, // TIPO DATO
      { wch: 24 }, // TEMP PROM 2025
      { wch: 24 }, // TEMP PROM 2026
      { wch: 26 }, // Δ TEMP PROM DIA VS 2025
      { wch: 26 }, // Δ TEMP INTERMED DIA VS 2025
      { wch: 26 }, // Δ TEMP NIÑO DIA VS 2025
      { wch: 26 }, // Δ TEMP PROM MES VS 2025
      { wch: 26 }, // Δ TEMP INTERMED MES VS 2025
      { wch: 26 }, // Δ TEMP NIÑO MES VS 2025
      { wch: 22 }, // CDD 2025 DIA
      { wch: 26 }, // CDD 2026 HIST DIA
      { wch: 26 }, // CDD 2026 INTERMED DIA
      { wch: 26 }, // CDD 2026 NINO DIA
      { wch: 30 }, // CDD ACUM MES HIST
      { wch: 30 }, // CDD ACUM MES INTERMED
      { wch: 30 }, // CDD ACUM MES NINO
      { wch: 28 }, // CDD ANUAL 2025
      { wch: 32 }, // CDD ANUAL 2026 HIST
      { wch: 32 }, // CDD ANUAL 2026 INTERMED
      { wch: 32 }  // CDD ANUAL 2026 NINO
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detalle CDD Diario');

    // Sheet 2
    const ws2 = XLSX.utils.json_to_sheet(monthlySheetRows);
    ws2['!cols'] = [
      { wch: 6 },  // N°
      { wch: 12 }, // CECO
      { wch: 28 }, // SEDE
      { wch: 8 },  // AÑO
      { wch: 14 }, // MES
      { wch: 14 }, // TIPO DATO
      { wch: 28 }, // TEMP PROM MENSUAL 2025
      { wch: 28 }, // TEMP PROM MENSUAL 2026
      { wch: 26 }, // Δ TEMP PROM MES VS 2025
      { wch: 26 }, // Δ TEMP INTERMED MES VS 2025
      { wch: 26 }, // Δ TEMP NIÑO MES VS 2025
      { wch: 32 }, // CDD ACUM MES 2026 HIST
      { wch: 32 }, // CDD ACUM MES 2026 INTERMED
      { wch: 32 }, // CDD ACUM MES 2026 NINO
      { wch: 28 }, // CDD ANUAL 2025 TOTAL
      { wch: 32 }, // CDD ANUAL 2026 HIST TOTAL
      { wch: 32 }, // CDD ANUAL 2026 INTERMED TOTAL
      { wch: 32 }  // CDD ANUAL 2026 NINO TOTAL
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen Acumulado Mensual');

    const filename = `Reporte_CDD_Diario_y_Mensual_Sedes_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchSedeLeft('');
    setSearchTable('');
    setSelectedSedes(['Global']);
    setSelectedYears(availableYears);
    setSelectedMonths([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  };

  const handleSedeCardClick = (e, sedeName) => {
    if (sedeName === 'Global') {
      setSelectedSedes(['Global']);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      let next = selectedSedes.filter(s => s !== 'Global');
      if (next.includes(sedeName)) {
        next = next.filter(s => s !== sedeName);
        if (next.length === 0) next = ['Global'];
      } else {
        next.push(sedeName);
      }
      setSelectedSedes(next);
    } else {
      setSelectedSedes([sedeName]);
    }
  };

  const filteredSedesList = useMemo(() => {
    if (!searchSedeLeft) return sedesList;
    return sedesList.filter(s => s.toLowerCase().includes(searchSedeLeft.toLowerCase()));
  }, [sedesList, searchSedeLeft]);

  return (
    <div style={{
      backgroundColor: '#0a0d14',
      height: '100%',
      minHeight: '85vh',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>

      {/* ========================================================================= */}
      {/* MODAL INFORMATIVO (GUÍA METODOLÓGICA DE CÁLCULO CDD)                      */}
      {/* ========================================================================= */}
      {showInfoModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '16px',
            width: '90%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', color: '#e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Info size={24} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                  Metodología de Cálculo de Grados Día (CDD) y Acumulados
                </h3>
              </div>
              <button 
                onClick={() => setShowInfoModal(false)}
                style={{ backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Explanation Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
              
              {/* Section 1 */}
              <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #10b981' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '0.95rem', fontWeight: 700 }}>
                  1. Regla de Datos Reales vs Proyectados (2025 vs 2026)
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  • <strong>Año 2025 y Periodo Pre-Julio 2026 (01 Ene - 30 Jun)</strong>: Todos los datos son 100% <strong>Reales</strong> medidos por SENAMHI / METEO. Por este motivo, las 3 opciones de cálculo (Histórico, Intermedio, Alerta Niño) arrojan valores idénticos en esta etapa.
                  <br />
                  • <strong>Periodo Post-Julio 2026 (01 Jul - 31 Dic)</strong>: Aplica el modelo de Regresión Armónica de Inteligencia Artificial para predecir las temperaturas con las 3 variaciones térmicas (+0.0°C Histórico, +0.4°C Intermedio, +0.9°C Alerta Niño).
                </p>
              </div>

              {/* Section 2 */}
              <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #38bdf8' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '0.95rem', fontWeight: 700 }}>
                  2. Fórmula de Grados Día (CDD Base {cddBaseTemp}°C)
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  <strong>CDD Diario = max(0, Temp_Promedio - {cddBaseTemp}°C)</strong>
                  <br />
                  Representa la demanda de climatización térmica necesaria cuando la temperatura promedio ambiente supera la línea base confortable de {cddBaseTemp}°C.
                </p>
              </div>

              {/* Section 3 */}
              <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #f59e0b' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#f59e0b', fontSize: '0.95rem', fontWeight: 700 }}>
                  3. CDD Acumulado Mes (Progresión Diaria)
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  Es la suma acumulativa día a día dentro de cada mes. 
                  <br />
                  • El <strong>Día 1 de cada mes</strong> inicia sumando los CDD de ese día.
                  <br />
                  • Cada día subsiguiente suma progresivamente los CDD acumulados del mes hasta llegar al último día (fin de mes), donde se obtiene el acumulado total del mes.
                </p>
              </div>

              {/* Section 4 */}
              <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', borderLeft: '4px solid #a855f7' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#a855f7', fontSize: '0.95rem', fontWeight: 700 }}>
                  4. CDD Acumulado Total Anual (2025 vs 2026 - 3 Escenarios)
                </h4>
                <p style={{ margin: 0, color: '#cbd5e1' }}>
                  • <strong>CDD Acum. Anual 2025</strong>: Suma total de los 365 días del año 2025 de esa sede.
                  <br />
                  • <strong>CDD Acum. Anual 2026 (3 Escenarios)</strong>: Suma total proyectada del año 2026 (datos reales Jan-Jun + predicción Jul-Dec) en sus 3 opciones (Histórico, Intermedio y Alerta Niño).
                </p>
              </div>

            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setShowInfoModal(false)}
                style={{
                  padding: '0.65rem 1.5rem', borderRadius: '8px',
                  backgroundColor: '#38bdf8', border: 'none', color: '#000',
                  fontWeight: 800, cursor: 'pointer'
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ========================================================================= */}
      {/* FIXED TOP HEADER & ACTION BAR                                             */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0a0d14',
        borderBottom: '3px solid #38bdf8',
        flexShrink: 0,
        zIndex: 100,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)'
      }}>
        {/* Title + Action Controls */}
        <div style={{
          padding: '1.1rem 1.5rem 0.75rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Calendar size={22} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Tabla y Analítica de Grados Día (CDD) Diario por Sede
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                Cálculo diario y mensual (Base {cddBaseTemp}°C) con comparativa vs 2025, variaciones térmicas diarias/mensuales y acumulados.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            
            {/* VIEW MODE TOGGLE BUTTONS */}
            <div style={{
              display: 'flex', backgroundColor: '#020617', padding: '3px',
              borderRadius: '8px', border: '1px solid #1e293b'
            }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 0.85rem', borderRadius: '6px', border: 'none',
                  backgroundColor: viewMode === 'table' ? '#38bdf8' : 'transparent',
                  color: viewMode === 'table' ? '#000' : '#94a3b8',
                  fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                <TableIcon size={14} />
                <span>Tabla Diaria</span>
              </button>
              <button
                onClick={() => setViewMode('chart')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 0.85rem', borderRadius: '6px', border: 'none',
                  backgroundColor: viewMode === 'chart' ? '#38bdf8' : 'transparent',
                  color: viewMode === 'chart' ? '#000' : '#94a3b8',
                  fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                <BarChart2 size={14} />
                <span>Gráficos & Tendencias</span>
              </button>
            </div>

            {/* GUÍA METODOLÓGICA (MODAL INFO) */}
            <button
              onClick={() => setShowInfoModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.5rem 0.85rem', borderRadius: '8px',
                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: '#c084fc', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              <HelpCircle size={14} color="#c084fc" />
              <span>Guía Metodológica</span>
            </button>

            {/* BASE CDD TEMP SELECTOR */}
            <div ref={cddBasePopoverRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setShowCddBasePopover(!showCddBasePopover);
                  setShowYearPopover(false);
                  setShowMonthPopover(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.45rem',
                  padding: '0.5rem 0.85rem', borderRadius: '8px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                <Flame size={14} color="#38bdf8" />
                <span>Base CDD: <strong style={{ color: '#fff' }}>{cddBaseTemp}°C</strong></span>
                <ChevronDown size={14} color="#38bdf8" />
              </button>

              {showCddBasePopover && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, width: '220px',
                  backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
                  padding: '0.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', zIndex: 300
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem' }}>
                    TEMPERATURA BASE ASHRAE
                  </div>
                  {[16, 18, 20].map(baseVal => (
                    <button
                      key={baseVal}
                      onClick={() => updateCddBaseTemp(baseVal)}
                      style={{
                        width: '100%', padding: '0.45rem 0.65rem', marginBottom: '0.35rem',
                        borderRadius: '6px', border: cddBaseTemp === baseVal ? '1px solid #38bdf8' : '1px solid transparent',
                        backgroundColor: cddBaseTemp === baseVal ? 'rgba(56,189,248,0.2)' : 'transparent',
                        color: cddBaseTemp === baseVal ? '#38bdf8' : '#e2e8f0',
                        fontSize: '0.8rem', fontWeight: 600, textAlign: 'left', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <span>Base {baseVal}°C {baseVal === 18 && '(Estándar ASHRAE)'}</span>
                      {cddBaseTemp === baseVal && <Check size={14} color="#38bdf8" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RESET FILTERS */}
            <button
              onClick={handleClearFilters}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 0.85rem', borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
                color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} />
              <span>Limpiar Filtros</span>
            </button>

            {/* REFRESH DATA */}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 0.85rem', borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
                color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Actualizar</span>
            </button>

            {/* EXCEL DOWNLOAD BUTTON */}
            <button
              onClick={handleExportExcel}
              disabled={filteredRows.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.55rem 1.1rem', borderRadius: '8px',
                backgroundColor: '#10b981', border: 'none',
                color: '#ffffff', fontSize: '0.82rem', fontWeight: 700,
                cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
              }}
            >
              <FileSpreadsheet size={16} />
              <span>Descargar Data (Excel Multi-Hoja)</span>
            </button>
          </div>
        </div>

        {/* Row 2: KPI Metric Cards */}
        <div style={{
          padding: '0 1.5rem 1rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}>
          {/* Card 1: Registros Filtrados */}
          <div style={{
            backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem 1rem',
            border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Database size={22} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Registros Diarios Filtrados
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                {summaryMetrics.totalDays.toLocaleString()} Días
              </div>
            </div>
          </div>

          {/* Card 2: Promedio Temp Diario */}
          <div style={{
            backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem 1rem',
            border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Thermometer size={22} color="#10b981" />
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Temp. Promedio General
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>
                {summaryMetrics.avgTemp} °C
              </div>
            </div>
          </div>

          {/* Card 3: CDD Histórico Acumulado */}
          <div style={{
            backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem 1rem',
            border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Flame size={22} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Acum. CDD Histórico
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
                {summaryMetrics.sumCddHist.toLocaleString()} CDD
              </div>
            </div>
          </div>

          {/* Card 4: CDD Intermedio Acumulado */}
          <div style={{
            backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem 1rem',
            border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Sparkles size={22} color="#f59e0b" />
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Acum. CDD Intermedio
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b' }}>
                {summaryMetrics.sumCddIntermed.toLocaleString()} CDD
              </div>
            </div>
          </div>

          {/* Card 5: CDD Alerta Niño Acumulado */}
          <div style={{
            backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem 1rem',
            border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <Activity size={22} color="#ef4444" />
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Acum. CDD Alerta Niño
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>
                {summaryMetrics.sumCddNino.toLocaleString()} CDD
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN CONTENT SPLIT (LEFT TREE + RIGHT MAIN AREA: TABLE OR CHART)          */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT SEDES SIDEBAR */}
        <div style={{
          width: '280px', backgroundColor: '#0f172a', borderRight: '1px solid #1e293b',
          display: 'flex', flexDirection: 'column', flexShrink: 0
        }}>
          {/* Sede Search */}
          <div style={{ padding: '0.85rem', borderBottom: '1px solid #1e293b' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Buscar Sede en árbol..."
                value={searchSedeLeft}
                onChange={(e) => setSearchSedeLeft(e.target.value)}
                style={{
                  width: '100%', padding: '0.45rem 0.5rem 0.45rem 2rem',
                  backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px',
                  color: '#fff', fontSize: '0.78rem', outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Sedes List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {/* Global Sede Card */}
            <div
              onClick={(e) => handleSedeCardClick(e, 'Global')}
              style={{
                padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '0.4rem',
                backgroundColor: selectedSedes.includes('Global') ? 'rgba(56, 189, 248, 0.15)' : '#020617',
                border: selectedSedes.includes('Global') ? '1px solid #38bdf8' : '1px solid #1e293b',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>Panorama Global (Todas)</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{sedesList.length}</span>
            </div>

            {/* Individual Sede Cards */}
            {filteredSedesList.map(sede => {
              const isSelected = selectedSedes.includes(sede);
              const ceco = cecoMap[sede] || 'N/A';

              return (
                <div
                  key={sede}
                  onClick={(e) => handleSedeCardClick(e, sede)}
                  style={{
                    padding: '0.55rem 0.75rem', borderRadius: '8px', marginBottom: '0.35rem',
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    border: isSelected ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <Building2 size={14} color={isSelected ? '#38bdf8' : '#64748b'} />
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? '#38bdf8' : '#cbd5e1' }}>
                        {sede}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>CECO: {ceco}</div>
                    </div>
                  </div>
                  {isSelected && <Check size={14} color="#38bdf8" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT MAIN AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {viewMode === 'table' ? (
            /* ========================================================================= */
            /* VIEW 1: MAIN TABLE WITH FIXED STICKY HEADER & SMOOTH 500-ROW SCROLL       */
            /* ========================================================================= */
            <>
              {/* Table Search and Filters Sub-Bar */}
              <div style={{
                padding: '0.75rem 1.25rem', backgroundColor: '#0b0f19',
                borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', flexShrink: 0
              }}>
                {/* Table Search */}
                <div style={{ position: 'relative', width: '340px' }}>
                  <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    placeholder="Buscar Sede, CECO, Fecha o Tipo Dato..."
                    value={searchTable}
                    onChange={(e) => setSearchTable(e.target.value)}
                    style={{
                      width: '100%', padding: '0.45rem 0.5rem 0.45rem 2rem',
                      backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px',
                      color: '#fff', fontSize: '0.78rem', outline: 'none'
                    }}
                  />
                </div>

                {/* Pagination Controls & Rows Per Page */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    Filas por página:
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{
                        marginLeft: '0.4rem', padding: '0.2rem 0.4rem',
                        backgroundColor: '#020617', border: '1px solid #1e293b',
                        borderRadius: '4px', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700
                      }}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      style={{
                        padding: '0.3rem 0.45rem', borderRadius: '4px',
                        backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1
                      }}
                    >
                      <ChevronsLeft size={14} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '0.3rem 0.45rem', borderRadius: '4px',
                        backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1
                      }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600, padding: '0 0.4rem' }}>
                      Pág. {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '0.3rem 0.45rem', borderRadius: '4px',
                        backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1
                      }}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '0.3rem 0.45rem', borderRadius: '4px',
                        backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1
                      }}
                    >
                      <ChevronsRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* TABLE SCROLL CONTAINER WITH PINNED STICKY HEADER */}
              <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#080b11', position: 'relative' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#0f172a', color: '#94a3b8', textTransform: 'uppercase',
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em'
                    }}>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', width: '50px', borderBottom: '2px solid #1e293b' }}>N°</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', borderBottom: '2px solid #1e293b' }}>FECHA</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', borderBottom: '2px solid #1e293b' }}>CECO</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', borderBottom: '2px solid #1e293b' }}>SEDE</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', borderBottom: '2px solid #1e293b' }}>TIPO DATO</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#cbd5e1', borderBottom: '2px solid #1e293b' }}>TEMP. PROM. 2025 (°C)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#10b981', borderBottom: '2px solid #1e293b' }}>TEMP. PROM. 2026 (°C)</th>
                      
                      {/* Daily Deltas (DÍA) */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#38bdf8', borderBottom: '2px solid #1e293b' }}>Δ TEMP PROM. DÍA VS 2025</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#f59e0b', borderBottom: '2px solid #1e293b' }}>Δ TEMP INTERMED. DÍA VS 2025</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#ef4444', borderBottom: '2px solid #1e293b' }}>Δ TEMP NIÑO DÍA VS 2025</th>
                      
                      {/* Monthly Deltas (MES) */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#38bdf8', borderBottom: '2px solid #1e293b' }}>Δ TEMP PROM. MES VS 2025</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#f59e0b', borderBottom: '2px solid #1e293b' }}>Δ TEMP INTERMED. MES VS 2025</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#ef4444', borderBottom: '2px solid #1e293b' }}>Δ TEMP NIÑO MES VS 2025</th>
                      
                      {/* Daily CDD 2025 & 2026 Scenarios */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#cbd5e1', borderBottom: '2px solid #1e293b' }}>CDD 2025 (DÍA)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#38bdf8', borderBottom: '2px solid #1e293b' }}>CDD 2026 HISTÓRICO (DÍA)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#f59e0b', borderBottom: '2px solid #1e293b' }}>CDD 2026 INTERMEDIO (DÍA)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#ef4444', borderBottom: '2px solid #1e293b' }}>CDD 2026 ALERTA NIÑO (DÍA)</th>

                      {/* Monthly CDD Accumulations */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#38bdf8', borderBottom: '2px solid #1e293b' }}>CDD ACUM. MES 2026 (HIST)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#f59e0b', borderBottom: '2px solid #1e293b' }}>CDD ACUM. MES 2026 (INTERM)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#ef4444', borderBottom: '2px solid #1e293b' }}>CDD ACUM. MES 2026 (NIÑO)</th>

                      {/* Annual CDD Totals */}
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#cbd5e1', borderBottom: '2px solid #1e293b' }}>CDD ACUM. ANUAL 2025</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#38bdf8', borderBottom: '2px solid #1e293b' }}>CDD ANUAL 2026 (HIST)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#f59e0b', borderBottom: '2px solid #1e293b' }}>CDD ANUAL 2026 (INTERM)</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#0f172a', padding: '0.75rem 0.85rem', textAlign: 'right', color: '#ef4444', borderBottom: '2px solid #1e293b' }}>CDD ANUAL 2026 (NIÑO)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={24} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                          <div>Cargando y calculando registros diarios de CDD... ({loadingProgress}%)</div>
                        </td>
                      </tr>
                    ) : paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={24} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                          No se encontraron registros diarios para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, idx) => {
                        const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                        const isReal = row.tipoDato === 'Dato Real';

                        return (
                          <tr
                            key={`${row.sede}__${row.fecha}__${idx}`}
                            style={{
                              borderBottom: '1px solid #1e293b',
                              backgroundColor: idx % 2 === 0 ? '#080b11' : '#0d111a',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#161e2e'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#080b11' : '#0d111a'}
                          >
                            <td style={{ padding: '0.55rem 0.85rem', color: '#64748b' }}>{globalIdx}</td>
                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 600, color: '#f8fafc' }}>{row.fecha}</td>
                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 700, color: '#f59e0b' }}>{row.ceco}</td>
                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 600, color: '#cbd5e1' }}>{row.sede}</td>
                            
                            {/* TIPO DATO BADGE */}
                            <td style={{ padding: '0.55rem 0.85rem' }}>
                              <span style={{
                                padding: '0.2rem 0.55rem', borderRadius: '4px',
                                fontSize: '0.68rem', fontWeight: 700,
                                backgroundColor: isReal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                color: isReal ? '#10b981' : '#c084fc',
                                border: isReal ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(168, 85, 247, 0.3)'
                              }}>
                                {row.tipoDato}
                              </span>
                            </td>

                            {/* TEMPS 2025 / 2026 */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 600, color: '#94a3b8' }}>
                              {row.tempPromedio2025} °C
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                              {row.tempPromedio2026} °C
                            </td>

                            {/* 3 DAILY DELTAS (DÍA) vs 2025 */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: row.deltaTempHistDia > 0 ? '#ef4444' : row.deltaTempHistDia < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempHistDia > 0 ? `+${row.deltaTempHistDia}` : row.deltaTempHistDia} °C
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: row.deltaTempIntermedDia > 0 ? '#f59e0b' : row.deltaTempIntermedDia < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempIntermedDia > 0 ? `+${row.deltaTempIntermedDia}` : row.deltaTempIntermedDia} °C
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: row.deltaTempNinoDia > 0 ? '#ef4444' : row.deltaTempNinoDia < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempNinoDia > 0 ? `+${row.deltaTempNinoDia}` : row.deltaTempNinoDia} °C
                            </td>

                            {/* 3 MONTHLY DELTAS (MES) vs 2025 */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: row.deltaTempHistMes > 0 ? '#ef4444' : row.deltaTempHistMes < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempHistMes > 0 ? `+${row.deltaTempHistMes}` : row.deltaTempHistMes} °C
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: row.deltaTempIntermedMes > 0 ? '#f59e0b' : row.deltaTempIntermedMes < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempIntermedMes > 0 ? `+${row.deltaTempIntermedMes}` : row.deltaTempIntermedMes} °C
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: row.deltaTempNinoMes > 0 ? '#ef4444' : row.deltaTempNinoMes < 0 ? '#38bdf8' : '#94a3b8' }}>
                              {row.deltaTempNinoMes > 0 ? `+${row.deltaTempNinoMes}` : row.deltaTempNinoMes} °C
                            </td>
                            
                            {/* Daily CDD 2025 & 2026 Columns */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 600, color: '#94a3b8' }}>
                              {row.cddHistorico} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                              {row.cddHistorico} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                              {row.cddIntermedio} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                              {row.cddAlertaNino} CDD
                            </td>

                            {/* CDD Monthly Accumulation Columns */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
                              {row.cddAcumuladoMesHistorico} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>
                              {row.cddAcumuladoMesIntermedio} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>
                              {row.cddAcumuladoMesAlertaNino} CDD
                            </td>

                            {/* CDD Annual Total Accumulation Columns */}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#94a3b8' }}>
                              {row.cddAnual2025Total} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
                              {row.cddAnual2026HistTotal} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>
                              {row.cddAnual2026IntermedTotal} CDD
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>
                              {row.cddAnual2026NinoTotal} CDD
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* ========================================================================= */
            /* VIEW 2: INTERACTIVE CHARTS & TENDENCIES FOR SEDES & MONTHLY DELTAS        */
            /* ========================================================================= */
            <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', backgroundColor: '#080b11', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Chart Section Header */}
              <div style={{
                backgroundColor: '#0f172a', padding: '1rem 1.25rem', borderRadius: '12px',
                border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                    Variación Térmica Mensual (°C) 2026 vs 2025
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Comparativa mes a mes de la anomalía de temperatura por tienda seleccionada en el árbol.
                  </p>
                </div>

                {/* Scenario Selector for Chart 2 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>Escenario Anomalía:</span>
                  <select
                    value={monthlyDeltaScenario}
                    onChange={(e) => setMonthlyDeltaScenario(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem', backgroundColor: '#020617',
                      border: '1px solid #38bdf8', borderRadius: '6px',
                      color: '#38bdf8', fontSize: '0.78rem', fontWeight: 800
                    }}
                  >
                    <option value="hist">Δ Temp Promedial Mensual (Histórico ML)</option>
                    <option value="intermed">Δ Temp Intermedia Mensual (+0.4°C)</option>
                    <option value="nino">Δ Temp Alerta Niño Mensual (+0.9°C)</option>
                  </select>
                </div>
              </div>

              {/* BAR CHART: MONTHLY THERMAL ANOMALIES (°C) */}
              <div style={{
                backgroundColor: '#0f172a', padding: '1.5rem', borderRadius: '12px',
                border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '1rem'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                  Desviación Térmica (°C) por Mes - {selectedSedes.includes('Global') ? 'Promedio Global Sedes' : selectedSedes.join(', ')}
                </div>

                {/* SVG Visual Bars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '220px', padding: '1rem 0.5rem', borderBottom: '1px solid #334155', gap: '0.5rem' }}>
                  {monthlyThermalChartData.map((mItem, idx) => {
                    const val = monthlyDeltaScenario === 'hist' 
                      ? mItem.valHist 
                      : (monthlyDeltaScenario === 'intermed' ? mItem.valIntermed : mItem.valNino);

                    const isPositive = val >= 0;
                    const barHeightPct = Math.min(100, Math.max(10, Math.abs(val) * 25));
                    const barColor = isPositive ? '#f59e0b' : '#38bdf8';

                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: barColor, marginBottom: '0.35rem' }}>
                          {val > 0 ? `+${val}` : val}°C
                        </span>
                        <div style={{
                          width: '70%', height: `${barHeightPct}%`,
                          backgroundColor: barColor, borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                          boxShadow: `0 4px 12px ${barColor}40`
                        }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginTop: '0.5rem' }}>
                          {mItem.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CDD ANNUAL PROJECTION COMPARISON CARDS BY SCENARIO */}
              <div style={{
                backgroundColor: '#0f172a', padding: '1.5rem', borderRadius: '12px',
                border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '1rem'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                  Resumen de Grados Día Acumulado Total Anual (CDD 2025 vs 2026 3 Escenarios)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                      CDD Total Real 2025
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#cbd5e1', marginTop: '0.2rem' }}>
                      {summaryMetrics.sumCddHist.toLocaleString()} CDD
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Sumatoria real 365 días del 2025
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
                      CDD 2026 Escenario Histórico ML
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>
                      {summaryMetrics.sumCddHist.toLocaleString()} CDD
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Reales Jan-Jun + ML Hist. Jul-Dec
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>
                      CDD 2026 Escenario Intermedio (+0.4°C)
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.2rem' }}>
                      {summaryMetrics.sumCddIntermed.toLocaleString()} CDD
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Reales Jan-Jun + ML Intermed Jul-Dec
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>
                      CDD 2026 Escenario Alerta Niño (+0.9°C)
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444', marginTop: '0.2rem' }}>
                      {summaryMetrics.sumCddNino.toLocaleString()} CDD
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Reales Jan-Jun + ML Niño Jul-Dec
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default Clima4;
