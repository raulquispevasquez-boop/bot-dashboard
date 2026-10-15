import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Download, Search, Filter, RefreshCw, Flame, Thermometer, Database, 
  Building2, ChevronDown, Check, Globe, RotateCcw, Activity, Sparkles, FileSpreadsheet
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

// Harmonic Regression Helper to fit Y = B0 + B1*t + B2*sin(2pi*m/12) + B3*cos(2pi*m/12)
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
        if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) {
          pivotRow = r;
        }
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

const Clima3 = () => {
  const [historicalRecords, setHistoricalRecords] = useState([]);
  const [sedesList, setSedesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('Inicializando...');

  // CDD Base Temperature state (synchronized via localStorage & window CustomEvent)
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

  // CDD Simulation Model (synced cross-tab via localStorage + CustomEvent)
  const [cddSimModel, setCddSimModelState] = useState(() => {
    return localStorage.getItem('clima_cdd_sim_model') || 'conservador';
  });
  const updateCddSimModel = (model) => {
    setCddSimModelState(model);
    localStorage.setItem('clima_cdd_sim_model', model);
    window.dispatchEvent(new CustomEvent('clima_cdd_sim_model_changed', { detail: model }));
  };
  useEffect(() => {
    const handler = (e) => { if (e.detail && e.detail !== cddSimModel) setCddSimModelState(e.detail); };
    window.addEventListener('clima_cdd_sim_model_changed', handler);
    return () => window.removeEventListener('clima_cdd_sim_model_changed', handler);
  }, [cddSimModel]);

  // Filters
  const [searchSedeLeft, setSearchSedeLeft] = useState('');
  const [searchSedeTable, setSearchSedeTable] = useState('');
  const [selectedSedes, setSelectedSedes] = useState(['Global']); // ['Global'] or array of sede names
  const [selectedYears, setSelectedYears] = useState(['2026', '2025', '2024']);
  const [selectedMonths, setSelectedMonths] = useState([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  // Dropdown Popovers state
  const [showYearPopover, setShowYearPopover] = useState(false);
  const [showMonthPopover, setShowMonthPopover] = useState(false);
  const [showCddBasePopover, setShowCddBasePopover] = useState(false);

  // Recalculation progress state (triggered on cddSimModel change)
  const [recalcProgress, setRecalcProgress] = useState(0);   // 0..100
  const [recalcDone, setRecalcDone]     = useState(false);
  const [recalcRunning, setRecalcRunning] = useState(false);
  const prevSimModel = useRef(cddSimModel);

  useEffect(() => {
    if (prevSimModel.current === cddSimModel) return; // skip initial mount
    prevSimModel.current = cddSimModel;
    setRecalcDone(false);
    setRecalcRunning(true);
    setRecalcProgress(0);
    const steps = [10, 30, 55, 75, 90, 100];
    steps.forEach((val, i) => {
      setTimeout(() => {
        setRecalcProgress(val);
        if (val === 100) {
          setTimeout(() => { setRecalcRunning(false); setRecalcDone(true); }, 400);
        }
      }, (i + 1) * 180);
    });
  }, [cddSimModel]);

  // Popover Outside Click Refs
  const yearPopoverRef = useRef(null);
  const monthPopoverRef = useRef(null);
  const cddBasePopoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (yearPopoverRef.current && !yearPopoverRef.current.contains(e.target)) {
        setShowYearPopover(false);
      }
      if (monthPopoverRef.current && !monthPopoverRef.current.contains(e.target)) {
        setShowMonthPopover(false);
      }
      if (cddBasePopoverRef.current && !cddBasePopoverRef.current.contains(e.target)) {
        setShowCddBasePopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real climate records on mount
  const fetchData = async () => {
    setLoading(true);
    setLoadingProgress(10);
    setLoadingStatus('Conectando con base de datos...');
    const backendBaseUrl = window.location.protocol + '//' + window.location.hostname + ':3001';
    let records = [];
    let sedesSet = new Set();

    // 1. Fetch from METEO climate endpoint
    try {
      setLoadingProgress(25);
      setLoadingStatus('Descargando datos meteorológicos...');
      const resMeteo = await fetch(`${backendBaseUrl}/api/clima?limit=100000`);
      if (resMeteo.ok) {
        setLoadingProgress(45);
        setLoadingStatus('Procesando datos meteorológicos...');
        const json = await resMeteo.json();
        if (json.data && Array.isArray(json.data)) {
          json.data.forEach(r => {
            records.push({
              ...r,
              sede: r.sede || 'Global',
              fuente: r.fuente_datos || 'METEO'
            });
            if (r.sede) sedesSet.add(r.sede);
          });
        }
      }
    } catch (err) {
      console.error("Error fetching METEO climate data:", err);
    }

    // 2. Fetch from SENAMHI endpoint
    try {
      setLoadingProgress(60);
      setLoadingStatus('Descargando datos SENAMHI...');
      const resSenamhi = await fetch(`${backendBaseUrl}/api/senamhi?limit=100000`);
      if (resSenamhi.ok) {
        setLoadingProgress(80);
        setLoadingStatus('Procesando datos SENAMHI...');
        const json = await resSenamhi.json();
        if (json.data && Array.isArray(json.data)) {
          json.data.forEach(r => {
            const sede = r.sede_spsa || r.sede || 'Global';
            records.push({
              ...r,
              fecha: r.fecha,
              sede: sede,
              temp_max: r.temp_max,
              temp_min: r.temp_min,
              temp_promedio: (r.temp_promedio !== undefined && r.temp_promedio !== null) 
                ? r.temp_promedio 
                : ((Number(r.temp_max || 0) + Number(r.temp_min || 0)) / 2),
              fuente: 'SENAMHI'
            });
            if (sede) sedesSet.add(sede);
          });
        }
      }
    } catch (err) {
      console.error("Error fetching SENAMHI data:", err);
    }

    setLoadingProgress(95);
    setLoadingStatus('Compilando modelos matemáticos ML...');
    // Give UI a tiny tick to paint the 95% state before the synchronous useMemos block it
    await new Promise(resolve => setTimeout(resolve, 50));

    setHistoricalRecords(records);
    const sortedSedes = Array.from(sedesSet).sort();
    setSedesList(sortedSedes);
    
    setLoadingProgress(100);
    setLoadingStatus('¡Completado!');
    setTimeout(() => {
      setLoading(false);
    }, 300);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Find last actual date in database for 2026
  const lastDbDateStr = useMemo(() => {
    return historicalRecords.reduce((max, r) => {
      if (r.fecha && r.fecha.startsWith('2026')) {
        return r.fecha > max ? r.fecha : max;
      }
      return max;
    }, '2026-07-19');
  }, [historicalRecords]);

  const maxValidMonth = useMemo(() => {
    const parts = lastDbDateStr.split('-').map(Number);
    return (parts[1] || 7) - 1; // 0-indexed (e.g. July = 6)
  }, [lastDbDateStr]);

  // Compute stats map for each sede (SENAMHI vs METEO proportions)
  const sedesStatsMap = useMemo(() => {
    const stats = {};
    sedesList.forEach(s => {
      stats[s] = { senamhi: 0, meteo: 0, total: 0 };
    });

    historicalRecords.forEach(r => {
      if (r.sede && stats[r.sede]) {
        stats[r.sede].total++;
        if (r.fuente === 'SENAMHI') stats[r.sede].senamhi++;
        else stats[r.sede].meteo++;
      }
    });

    sedesList.forEach(s => {
      if (stats[s].total === 0) {
        const isSenamhi = s.includes('AREQUIPA') || s.includes('CUSCO') || s.includes('HUANCAYO') || s.includes('TRUJILLO') || s.includes('PIURA');
        stats[s].senamhi = isSenamhi ? 95 : 5;
        stats[s].meteo = isSenamhi ? 5 : 95;
        stats[s].total = 100;
      }
    });

    return stats;
  }, [historicalRecords, sedesList]);

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

  // Compute Regression Fits for each Sede
  const regressionFits = useMemo(() => {
    const fits = {};
    const sedesToFit = [...sedesList, 'Global'];
    
    // O(N) pre-grouping to prevent browser freezing
    const groupedData = {};
    historicalRecords.forEach(r => {
      if (!r.fecha) return;
      const parts = String(r.fecha).split('-');
      if (parts.length < 2) return;
      
      const yr = parts[0];
      const m = parseInt(parts[1], 10) - 1;
      let val = Number(r.temp_promedio ?? r.t_promedio);
      if (isNaN(val) || val === null) {
         val = (Number(r.temp_max) + Number(r.temp_min)) / 2;
      }
      if (isNaN(val)) return;

      const keySpecific = `${r.sede}_${yr}_${m}`;
      const keyGlobal = `Global_${yr}_${m}`;

      if (!groupedData[keySpecific]) groupedData[keySpecific] = { sum: 0, count: 0 };
      groupedData[keySpecific].sum += val;
      groupedData[keySpecific].count += 1;

      if (!groupedData[keyGlobal]) groupedData[keyGlobal] = { sum: 0, count: 0 };
      groupedData[keyGlobal].sum += val;
      groupedData[keyGlobal].count += 1;
    });

    sedesToFit.forEach(sede => {
      const dataPoints = [];
      ['2024', '2025', '2026'].forEach(yr => {
        const is2026 = yr === '2026';
        const maxM = is2026 ? maxValidMonth : 11;
        for (let m = 0; m <= maxM; m++) {
          const key = `${sede}_${yr}_${m}`;
          const group = groupedData[key];
          if (group && group.count > 0) {
            const avg = group.sum / group.count;
            dataPoints.push({ t: Number(yr) + m / 12, month: m, value: avg });
          }
        }
      });

      const fit = fitHarmonicRegression(dataPoints);
      if (fit) fits[sede] = fit;
    });

    return fits;
  }, [historicalRecords, sedesList, maxValidMonth]);

  // Aggregate monthly data map across ALL sedes, years, months (Using active cddBaseTemp)
  const allMonthlyCalculations = useMemo(() => {
    if (!historicalRecords || historicalRecords.length === 0) return [];

    const sedesToProcess = [...sedesList, 'Global'];
    const yearsToProcess = availableYears;
    const groupedMap = {};

    // 1. Group actual daily DB records
    historicalRecords.forEach(r => {
      if (!r.fecha || !r.sede) return;
      const parts = String(r.fecha).split('-');
      if (parts.length < 3) return;

      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1; // 0-indexed
      if (monthIdx < 0 || monthIdx > 11) return;

      const key = `${r.sede}__${year}__${monthIdx}`;

      if (!groupedMap[key]) {
        groupedMap[key] = {
          sede: r.sede,
          year: year,
          monthIdx: monthIdx,
          monthName: MONTH_NAMES[monthIdx],
          dailyRecords: []
        };
      }

      let tProm = Number(r.temp_promedio ?? r.t_promedio);
      if (isNaN(tProm) || tProm === null || tProm === undefined) {
        const tMax = Number(r.temp_max);
        const tMin = Number(r.temp_min);
        if (!isNaN(tMax) && !isNaN(tMin)) tProm = (tMax + tMin) / 2;
        else if (!isNaN(tMax)) tProm = tMax;
        else if (!isNaN(tMin)) tProm = tMin;
      }

      if (!isNaN(tProm) && tProm !== null && tProm !== undefined) {
        groupedMap[key].dailyRecords.push(tProm);
      }
    });

    const resultList = [];

    // 2. Build complete 12 months for every Sede and Year
    sedesToProcess.forEach(sede => {
      yearsToProcess.forEach(yr => {
        const isYear2026 = yr === '2026';

        for (let m = 0; m < 12; m++) {
          const key = `${sede}__${yr}__${m}`;
          const group = groupedMap[key];

          const isFuture = (isYear2026 && m > maxValidMonth) || (!group || !group.dailyRecords || group.dailyRecords.length === 0);

          if (!isFuture && group && group.dailyRecords.length > 0) {
            // DATO REAL
            const count = group.dailyRecords.length;
            const avgTemp = group.dailyRecords.reduce((a, b) => a + b, 0) / count;
            const cddBaseVal = group.dailyRecords.reduce((acc, t) => acc + Math.max(t - cddBaseTemp, 0), 0);

            resultList.push({
              sede: sede,
              year: yr,
              monthIdx: m,
              monthName: MONTH_NAMES[m],
              cddMensual: Math.round(cddBaseVal),
              tempPromedioMensual: parseFloat(avgTemp.toFixed(1)),
              tipoDato: 'Dato Real',
              isProjected: false,
              diasEvaluados: count
            });
          } else {
            // PROYECTADO ML — apply thermal anomaly adjustment based on simulation model
            const fit = regressionFits[sede] || regressionFits['Global'];
            let projectedTemp = 20.5; // Fallback seasonal default

            if (fit && fit.beta) {
              const t = Number(yr) + m / 12;
              const sinVal = Math.sin(2 * Math.PI * m / 12);
              const cosVal = Math.cos(2 * Math.PI * m / 12);
              projectedTemp = fit.beta[0] + fit.beta[1] * t + fit.beta[2] * sinVal + fit.beta[3] * cosVal;
            } else {
              const seasonFactor = Math.cos(((m - 1) / 12) * 2 * Math.PI);
              projectedTemp = 19.5 + seasonFactor * 3.8;
            }

            // Calculate thermal anomaly from last real month for this sede
            let thermalAnomaly = 0;
            if (yr === '2026' && cddSimModel !== 'conservador') {
              // Find the last real month avg temp for this sede
              const lastRealKey = `${sede}__2026__${maxValidMonth}`;
              const lastRealGroup = groupedMap[lastRealKey];
              if (lastRealGroup && lastRealGroup.dailyRecords.length > 0) {
                const lastRealTemp = lastRealGroup.dailyRecords.reduce((a, b) => a + b, 0) / lastRealGroup.dailyRecords.length;
                // What model predicted for that month
                const tRef = 2026 + maxValidMonth / 12;
                const fitRef = regressionFits[sede] || regressionFits['Global'];
                if (fitRef && fitRef.beta) {
                  const sinRef = Math.sin(2 * Math.PI * maxValidMonth / 12);
                  const cosRef = Math.cos(2 * Math.PI * maxValidMonth / 12);
                  const predRef = fitRef.beta[0] + fitRef.beta[1]*tRef + fitRef.beta[2]*sinRef + fitRef.beta[3]*cosRef;
                  const rawAnomaly = lastRealTemp - predRef;
                  const periodsAway = m - maxValidMonth;
                  if (periodsAway > 0) {
                    if (cddSimModel === 'alerta') thermalAnomaly = rawAnomaly; // 100% inheritance
                    if (cddSimModel === 'intermedio') thermalAnomaly = rawAnomaly * Math.pow(0.5, periodsAway); // decay
                  }
                }
              }
            }

            projectedTemp = Math.max(12, Math.min(35, projectedTemp + thermalAnomaly));
            const daysInM = DAYS_IN_MONTH[m];
            const projectedCdd = Math.max(0, (projectedTemp - cddBaseTemp) * daysInM);

            const modelLabel = cddSimModel === 'alerta' ? 'Proy. Alerta Niño'
              : cddSimModel === 'intermedio' ? 'Proy. Intermedio'
              : 'Proyectado';

            resultList.push({
              sede: sede,
              year: yr,
              monthIdx: m,
              monthName: MONTH_NAMES[m],
              cddMensual: Math.round(projectedCdd),
              tempPromedioMensual: parseFloat(projectedTemp.toFixed(1)),
              tipoDato: modelLabel,
              isProjected: true,
              diasEvaluados: daysInM
            });
          }
        }
      });
    });

    // 3. Build lookup for Thermal Anomaly Delta (same month previous year)
    const lookupMap = {};
    resultList.forEach(item => {
      lookupMap[`${item.sede}__${item.year}__${item.monthIdx}`] = item.tempPromedioMensual;
    });

    // 4. Attach Anomaly Delta (vs Year - 1)
    const finalResult = resultList.map(item => {
      const prevYear = String(Number(item.year) - 1);
      const prevTemp = lookupMap[`${item.sede}__${prevYear}__${item.monthIdx}`];
      let anomalyDelta = null;
      if (prevTemp !== undefined && prevTemp !== null) {
        anomalyDelta = parseFloat((item.tempPromedioMensual - prevTemp).toFixed(1));
      }

      return {
        ...item,
        anomalyDelta
      };
    });

    // Sort by Sede, Year desc, Month asc
    return finalResult.sort((a, b) => {
      if (a.sede !== b.sede) return a.sede.localeCompare(b.sede);
      if (a.year !== b.year) return Number(b.year) - Number(a.year);
      return a.monthIdx - b.monthIdx;
    });
  }, [historicalRecords, sedesList, availableYears, maxValidMonth, regressionFits, cddBaseTemp, cddSimModel]);

  // Filtered rows matching active left Sede selection, table search, multi-select year, multi-select month
  const filteredRows = useMemo(() => {
    return allMonthlyCalculations.filter(row => {
      // 1. Sede filter from Left Tree selection
      const isGlobalSede = selectedSedes.includes('Global');
      const matchSedeSelection = isGlobalSede ? row.sede !== 'Global' : selectedSedes.includes(row.sede);

      // 2. Sede text search
      const textSearch = (searchSedeLeft || searchSedeTable).toLowerCase().trim();
      const matchSearch = !textSearch || row.sede.toLowerCase().includes(textSearch);

      // 3. Multi-year filter
      const matchYear = selectedYears.length === 0 || selectedYears.includes(String(row.year));

      // 4. Multi-month filter
      const matchMonth = selectedMonths.length === 0 || selectedMonths.includes(row.monthIdx);

      return matchSedeSelection && matchSearch && matchYear && matchMonth;
    });
  }, [allMonthlyCalculations, selectedSedes, searchSedeLeft, searchSedeTable, selectedYears, selectedMonths]);

  // Clear all filters handler
  const handleClearFilters = () => {
    setSearchSedeLeft('');
    setSearchSedeTable('');
    setSelectedSedes(['Global']);
    setSelectedYears(availableYears);
    setSelectedMonths([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  };

  // Left Sede Card Click Handler (supports Ctrl/Cmd multi-selection)
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

  // Multi-select Year Toggle
  const toggleYear = (yr) => {
    if (selectedYears.includes(yr)) {
      const next = selectedYears.filter(y => y !== yr);
      setSelectedYears(next);
    } else {
      setSelectedYears([...selectedYears, yr]);
    }
  };

  // Multi-select Month Toggle
  const toggleMonth = (mIdx) => {
    if (selectedMonths.includes(mIdx)) {
      const next = selectedMonths.filter(m => m !== mIdx);
      setSelectedMonths(next);
    } else {
      setSelectedMonths([...selectedMonths, mIdx]);
    }
  };

  // Select / Deselect All Years
  const handleSelectAllYears = () => {
    if (selectedYears.length === availableYears.length) {
      setSelectedYears([]);
    } else {
      setSelectedYears(availableYears);
    }
  };

  // Select / Deselect All Months
  const handleSelectAllMonths = () => {
    if (selectedMonths.length === 12) {
      setSelectedMonths([]);
    } else {
      setSelectedMonths([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
  };

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    if (filteredRows.length === 0) return { totalRecords: 0, avgCdd: 0, avgTemp: 0, maxCddSede: '-' };

    const totalCdd = filteredRows.reduce((a, b) => a + b.cddMensual, 0);
    const totalTemp = filteredRows.reduce((a, b) => a + b.tempPromedioMensual, 0);
    
    let maxCddRow = filteredRows[0];
    filteredRows.forEach(r => {
      if (r.cddMensual > maxCddRow.cddMensual) maxCddRow = r;
    });

    return {
      totalRecords: filteredRows.length,
      avgCdd: Math.round(totalCdd / filteredRows.length),
      avgTemp: (totalTemp / filteredRows.length).toFixed(1),
      maxCddSede: `${maxCddRow.sede} (${maxCddRow.cddMensual} CDD)`
    };
  }, [filteredRows]);

  // EXPORT COMPLETE FILTERED DATASET TO NATIVE EXCEL (.XLSX)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;

    // Prepare clean data array for XLSX worksheet
    const excelRows = filteredRows.map((row, index) => ({
      'N°': index + 1,
      'Sede': row.sede,
      'Año': Number(row.year),
      'Mes': row.monthName,
      'Tipo Dato': row.tipoDato,
      [`CDD Mensual (Base ${cddBaseTemp}°C)`]: row.cddMensual,
      'Temp. Promedio Mensual (°C)': row.tempPromedioMensual,
      'Anomalía Térmica vs Año Ant. (°C)': row.anomalyDelta !== null ? (row.anomalyDelta > 0 ? `+${row.anomalyDelta} °C` : `${row.anomalyDelta} °C`) : 'N/A'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Set column widths for clean readability in Microsoft Excel
    ws['!cols'] = [
      { wch: 6 },  // N°
      { wch: 26 }, // Sede
      { wch: 8 },  // Año
      { wch: 14 }, // Mes
      { wch: 14 }, // Tipo Dato
      { wch: 28 }, // CDD Mensual
      { wch: 28 }, // Temp Promedio Mensual
      { wch: 32 }  // Anomalía Térmica
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Reporte CDD Mensual');

    // Trigger binary .xlsx download
    const filename = `Reporte_CDD_Mensual_Clima_SPSA_Completo_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Filtered Sedes List for Left Tree Sidebar
  const filteredSedesList = useMemo(() => {
    if (!searchSedeLeft) return sedesList;
    return sedesList.filter(s => s.toLowerCase().includes(searchSedeLeft.toLowerCase()));
  }, [sedesList, searchSedeLeft]);

  return (
    <div style={{
      backgroundColor: '#0a0d14',
      height: '100vh',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      
      {/* ========================================================================= */}
      {/* FIXED TOP CONTAINER (EVERYTHING FROM THE YELLOW LINE UPWARD IS 100% FIXED)  */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0a0d14',
        borderBottom: '3px solid #facc15', // BRIGHT YELLOW ACCENT SEPARATOR LINE
        flexShrink: 0,
        zIndex: 100,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)'
      }}>
        {/* Row 1: Header Title + Action Buttons */}
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
              backgroundColor: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Flame size={22} color="#0ea5e9" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Tabla de Grados Día (CDD) y Temperatura Mensual
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                Cálculo acumulado mensual por Sede con base ASHRAE ({cddBaseTemp}°C) y promedios térmicos.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>

            {/* BASE CDD TEMP SELECTOR TOOLTIP POPOVER */}
            <div ref={cddBasePopoverRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setShowCddBasePopover(!showCddBasePopover);
                  setShowYearPopover(false);
                  setShowMonthPopover(false);
                }}
                title="Configurar temperatura base CDD"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(14, 165, 233, 0.12)',
                  border: '1px solid rgba(14, 165, 233, 0.35)',
                  color: '#38bdf8',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <Flame size={14} color="#0ea5e9" />
                <span>Base CDD: <strong style={{ color: '#fff' }}>{cddBaseTemp}°C</strong></span>
                <ChevronDown size={14} color="#38bdf8" />
              </button>

              {/* Tooltip Selector Dropdown */}
              {showCddBasePopover && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  right: 0,
                  width: '210px',
                  backgroundColor: '#181d28',
                  border: '1px solid rgba(14, 165, 233, 0.35)',
                  borderRadius: '8px',
                  padding: '0.65rem',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.85)',
                  zIndex: 300
                }}>
                  <div style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    paddingBottom: '0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between'
                  }}>
                    <span>Temperatura Base CDD</span>
                    <span style={{ fontSize: '0.62rem', color: '#0ea5e9' }}>Sincronizado</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {[18, 17.7, 17, 16.5, 16].map(b => (
                      <button
                        key={b}
                        onClick={() => updateCddBaseTemp(b)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: cddBaseTemp === b ? '1px solid #0ea5e9' : '1px solid rgba(255,255,255,0.06)',
                          backgroundColor: cddBaseTemp === b ? 'rgba(14, 165, 233, 0.25)' : 'transparent',
                          color: cddBaseTemp === b ? '#38bdf8' : '#cbd5e1',
                          fontSize: '0.78rem',
                          fontWeight: cddBaseTemp === b ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        <span>Base {b}°C {b === 18 ? '(ASHRAE Std)' : ''}</span>
                        {cddBaseTemp === b && <Check size={12} color="#38bdf8" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SIMULATION MODEL SELECTOR — synced with Panorama por Sede */}
            {(() => {
              const SIM_CONFIGS = [
                { key: 'conservador', label: 'Conservador', shortLabel: 'Base', color: '#6366f1', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.35)' },
                { key: 'intermedio',  label: 'Intermedio',  shortLabel: 'Int.',  color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.35)'  },
                { key: 'alerta',      label: 'Alerta (Niño)', shortLabel: 'Niño', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
              ];
              const active = SIM_CONFIGS.find(s => s.key === cddSimModel) || SIM_CONFIGS[0];
              return (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '2px',
                  padding: '0.3rem 0.55rem', borderRadius: '8px',
                  backgroundColor: active.bg, border: `1px solid ${active.border}` }}
                  title="Modelo de simulación CDD (sincronizado con Panorama por Sede)"
                >
                  <span style={{ fontSize: '0.65rem', color: active.color, fontWeight: 600, marginRight: '4px', whiteSpace: 'nowrap' }}>
                    Modelo:
                  </span>
                  {SIM_CONFIGS.map(s => (
                    <button key={s.key} onClick={() => updateCddSimModel(s.key)}
                      style={{
                        fontSize: '0.65rem', padding: '2px 7px', borderRadius: '5px', cursor: 'pointer',
                        border: cddSimModel === s.key ? `1px solid ${s.color}` : '1px solid rgba(255,255,255,0.07)',
                        backgroundColor: cddSimModel === s.key ? `${s.color}33` : 'transparent',
                        color: cddSimModel === s.key ? s.color : '#64748b',
                        fontWeight: cddSimModel === s.key ? 700 : 400,
                        transition: 'all 0.2s'
                      }}
                    >{s.shortLabel}</button>
                  ))}
                </div>
              );
            })()}

            <button
              onClick={handleClearFilters}
              title="Restablecer todos los filtros"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} />
              <span>Limpiar Filtros</span>
            </button>

            <button
              onClick={fetchData}
              title="Recargar datos de la BD"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Actualizar</span>
            </button>

            {/* EXCEL EXPORT BUTTON (.XLSX) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
              <button
                onClick={() => { setRecalcDone(false); handleExportExcel(); }}
                disabled={filteredRows.length === 0}
                title={`Exportar bajo modelo: ${cddSimModel.toUpperCase()} — ${filteredRows.length} registros`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1.1rem',
                  borderRadius: '8px',
                  backgroundColor: recalcDone ? '#10b981' : '#10b981',
                  border: recalcDone ? '2px solid #34d399' : 'none',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: recalcDone ? '0 0 12px rgba(52,211,153,0.6), 0 4px 14px rgba(16, 185, 129, 0.35)' : '0 4px 14px rgba(16, 185, 129, 0.35)',
                  opacity: filteredRows.length === 0 ? 0.5 : 1,
                  transition: 'all 0.3s ease'
                }}
              >
                <FileSpreadsheet size={16} />
                <span>Descargar Data (Excel)</span>
              </button>
              {recalcDone && (
                <span style={{ fontSize: '0.6rem', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  ✓ Listo · Modelo {cddSimModel === 'alerta' ? 'Alerta Niño' : cddSimModel === 'intermedio' ? 'Intermedio' : 'Conservador'} aplicado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ===== RECALCULATION PROGRESS TOAST ===== */}
        {recalcRunning && (
          <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
            backgroundColor: '#0f172a',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: '12px',
            padding: '0.85rem 1.2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: '260px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 700 }}>
                Recalculando CDD — Modelo {cddSimModel === 'alerta' ? 'Alerta Niño' : cddSimModel === 'intermedio' ? 'Intermedio' : 'Conservador'}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>{recalcProgress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', borderRadius: '3px', backgroundColor: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                borderRadius: '3px',
                width: `${recalcProgress}%`,
                background: cddSimModel === 'alerta'
                  ? 'linear-gradient(90deg, #ef4444, #f97316)'
                  : cddSimModel === 'intermedio'
                  ? 'linear-gradient(90deg, #eab308, #f59e0b)'
                  : 'linear-gradient(90deg, #6366f1, #818cf8)',
                boxShadow: cddSimModel === 'alerta' ? '0 0 8px #ef4444' : cddSimModel === 'intermedio' ? '0 0 8px #eab308' : '0 0 8px #6366f1',
                transition: 'width 0.25s ease'
              }} />
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.65rem', color: '#64748b' }}>
              {recalcProgress < 40 ? 'Aplicando anomalía térmica...' :
               recalcProgress < 80 ? 'Proyectando meses futuros por sede...' :
               recalcProgress < 100 ? 'Actualizando tabla...' : 'Completado'}
            </div>
          </div>
        )}

        {/* Row 2: 4 Summary KPI Cards */}
        <div style={{
          padding: '0 1.5rem 0.75rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem'
        }}>
          <div style={{
            padding: '0.65rem 0.9rem', borderRadius: '8px', backgroundColor: '#12161f',
            border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem'
          }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '7px', backgroundColor: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={16} color="#38bdf8" />
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>Registros Filtrados</span>
              <strong style={{ fontSize: '1.05rem', color: '#fff' }}>{summaryMetrics.totalRecords} Meses</strong>
            </div>
          </div>

          <div style={{
            padding: '0.65rem 0.9rem', borderRadius: '8px', backgroundColor: '#12161f',
            border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem'
          }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '7px', backgroundColor: 'rgba(14, 165, 233, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={16} color="#0ea5e9" />
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>Promedio CDD (Base {cddBaseTemp}°C)</span>
              <strong style={{ fontSize: '1.05rem', color: '#38bdf8' }}>{summaryMetrics.avgCdd} CDD</strong>
            </div>
          </div>

          <div style={{
            padding: '0.65rem 0.9rem', borderRadius: '8px', backgroundColor: '#12161f',
            border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem'
          }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '7px', backgroundColor: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Thermometer size={16} color="#4ade80" />
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>Temp. Promedio General</span>
              <strong style={{ fontSize: '1.05rem', color: '#4ade80' }}>{summaryMetrics.avgTemp} °C</strong>
            </div>
          </div>

          <div style={{
            padding: '0.65rem 0.9rem', borderRadius: '8px', backgroundColor: '#12161f',
            border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem'
          }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '7px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={16} color="#f87171" />
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>Máxima Exigencia CDD</span>
              <strong style={{ fontSize: '0.82rem', color: '#f87171' }}>{summaryMetrics.maxCddSede}</strong>
            </div>
          </div>
        </div>

        {/* Row 3: Combined Search & Filter Control Bar (Spanning across Left Tree & Right Table) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#121620',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {/* Left Tree Filter Bar (Exact width matching left panel: 285px) */}
          <div style={{
            width: '285px',
            flexShrink: 0,
            padding: '0.6rem 0.85rem',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} color="#64748b" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar Sede..."
                value={searchSedeLeft}
                onChange={(e) => setSearchSedeLeft(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem 0.35rem 1.8rem',
                  backgroundColor: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.75rem',
                  outline: 'none'
                }}
              />
            </div>
            <span style={{
              fontSize: '0.62rem',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              padding: '2px 6px',
              borderRadius: '8px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              {selectedSedes.includes('Global') ? `${sedesList.length}/${sedesList.length}` : `${selectedSedes.length}/${sedesList.length}`}
            </span>
          </div>

          {/* Right Table Filter Bar */}
          <div style={{
            flex: 1,
            padding: '0.6rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            {/* Table Sede Search */}
            <div style={{ position: 'relative', flex: '1 1 180px' }}>
              <Search size={13} color="#64748b" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Filtrar por Sede..."
                value={searchSedeTable}
                onChange={(e) => setSearchSedeTable(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem 0.35rem 1.8rem',
                  backgroundColor: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.75rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Year Multi-Select Tooltip Popover */}
            <div ref={yearPopoverRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setShowYearPopover(!showYearPopover);
                  setShowMonthPopover(false);
                  setShowCddBasePopover(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  backgroundColor: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <span style={{ color: '#94a3b8' }}>Año:</span>
                <strong style={{ color: '#38bdf8' }}>
                  {selectedYears.length === availableYears.length 
                    ? 'Todos' 
                    : selectedYears.length === 0 
                      ? 'Ninguno' 
                      : selectedYears.join(', ')}
                </strong>
                <ChevronDown size={13} color="#94a3b8" />
              </button>

              {showYearPopover && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  width: '190px',
                  backgroundColor: '#181d28',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '0.6rem',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
                  zIndex: 300
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    paddingBottom: '0.4rem',
                    marginBottom: '0.4rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>Selección de Años</span>
                    <button
                      onClick={handleSelectAllYears}
                      style={{ fontSize: '0.62rem', color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {selectedYears.length === availableYears.length ? 'Desmarcar' : 'Todos'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {availableYears.map(yr => {
                      const checked = selectedYears.includes(yr);
                      return (
                        <div
                          key={yr}
                          onClick={() => toggleYear(yr)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.3rem 0.45rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: checked ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                            fontSize: '0.75rem',
                            color: checked ? '#38bdf8' : '#cbd5e1'
                          }}
                        >
                          <div style={{
                            width: '13px', height: '13px', borderRadius: '3px',
                            border: checked ? '1px solid #38bdf8' : '1px solid #64748b',
                            backgroundColor: checked ? '#0ea5e9' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {checked && <Check size={9} color="#fff" />}
                          </div>
                          <span>Año {yr}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Month Multi-Select Tooltip Popover */}
            <div ref={monthPopoverRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setShowMonthPopover(!showMonthPopover);
                  setShowYearPopover(false);
                  setShowCddBasePopover(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  backgroundColor: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <span style={{ color: '#94a3b8' }}>Mes:</span>
                <strong style={{ color: '#4ade80' }}>
                  {selectedMonths.length === 12 
                    ? 'Todos los Meses' 
                    : selectedMonths.length === 0 
                      ? 'Ninguno' 
                      : `${selectedMonths.length} Meses`}
                </strong>
                <ChevronDown size={13} color="#94a3b8" />
              </button>

              {showMonthPopover && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  width: '230px',
                  backgroundColor: '#181d28',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '0.6rem',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
                  zIndex: 300
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    paddingBottom: '0.4rem',
                    marginBottom: '0.4rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>Selección de Meses</span>
                    <button
                      onClick={handleSelectAllMonths}
                      style={{ fontSize: '0.62rem', color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {selectedMonths.length === 12 ? 'Desmarcar' : 'Todos'}
                    </button>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.25rem',
                    maxHeight: '210px',
                    overflowY: 'auto'
                  }}>
                    {MONTH_NAMES.map((name, mIdx) => {
                      const checked = selectedMonths.includes(mIdx);
                      return (
                        <div
                          key={mIdx}
                          onClick={() => toggleMonth(mIdx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.3rem 0.35rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: checked ? 'rgba(74, 222, 128, 0.12)' : 'transparent',
                            fontSize: '0.72rem',
                            color: checked ? '#4ade80' : '#cbd5e1'
                          }}
                        >
                          <div style={{
                            width: '12px', height: '12px', borderRadius: '3px',
                            border: checked ? '1px solid #4ade80' : '1px solid #64748b',
                            backgroundColor: checked ? '#22c55e' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {checked && <Check size={8} color="#fff" />}
                          </div>
                          <span>{MONTH_SHORT[mIdx]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* END FIXED TOP CONTAINER */}

      {/* ========================================================================= */}
      {/* MAIN SCROLLABLE CONTENT AREA BELOW THE YELLOW SEPARATOR LINE              */}
      {/* ========================================================================= */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden'
      }}>
        
        {/* ----------------------------------------------------------------------- */}
        {/* LEFT PANEL: ARBOL DE SEDES (SCROLLABLE INDEPENDENTLY BELOW YELLOW LINE)  */}
        {/* ----------------------------------------------------------------------- */}
        <div style={{
          width: '285px',
          backgroundColor: '#0c0f17',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflowY: 'auto',
          padding: '0.75rem 0.85rem'
        }}>
          {/* Global Panorama Card */}
          <div
            onClick={(e) => handleSedeCardClick(e, 'Global')}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              marginBottom: '0.65rem',
              backgroundColor: selectedSedes.includes('Global') ? 'rgba(59, 130, 246, 0.18)' : '#121620',
              border: selectedSedes.includes('Global') ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              transition: 'all 0.15s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <Globe size={18} color="#3b82f6" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selectedSedes.includes('Global') ? '#60a5fa' : '#fff' }}>
                Panorama Global
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>AVG</span>
          </div>

          {/* Individual Sedes List */}
          {filteredSedesList.map(sede => {
            const isSelected = selectedSedes.includes(sede);
            const stat = sedesStatsMap[sede] || { senamhi: 0, meteo: 0, total: 100 };
            const senamhiPercent = stat.total > 0 ? Math.round((stat.senamhi / stat.total) * 100) : 50;
            const isSenamhiDom = senamhiPercent > 50;

            return (
              <div
                key={sede}
                onClick={(e) => handleSedeCardClick(e, sede)}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.18)' : '#121620',
                  border: isSelected ? '1px solid #0ea5e9' : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Building2 size={15} color={isSelected ? '#38bdf8' : '#94a3b8'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? '#38bdf8' : '#f1f5f9' }}>
                      {sede}
                    </span>
                  </div>

                  <span style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: isSenamhiDom ? 'rgba(16, 185, 129, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    color: isSenamhiDom ? '#10b981' : '#a855f7',
                    border: `1px solid ${isSenamhiDom ? 'rgba(16, 185, 129, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`
                  }}>
                    {isSenamhiDom ? 'SENAMHI' : 'METEO'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.62rem', color: '#64748b' }}>
                  <span>{senamhiPercent}% Estación / {100 - senamhiPercent}% Satélite</span>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    backgroundColor: isSenamhiDom ? '#10b981' : '#a855f7'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
        {/* END LEFT PANEL */}

        {/* ----------------------------------------------------------------------- */}
        {/* RIGHT PANEL: MAIN DATA TABLE WITH STICKY HEADER & SMOOTH SCROLLING       */}
        {/* ----------------------------------------------------------------------- */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0d14',
          overflow: 'hidden'
        }}>

          {/* Scrollable Table Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            position: 'relative'
          }}>
            {loading ? (
              <div style={{ 
                padding: '4rem', 
                textAlign: 'center', 
                color: '#94a3b8', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                gap: '1.5rem'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  <RefreshCw size={28} className="spin" style={{ color: '#0ea5e9' }} />
                  <p style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: 600 }}>{loadingStatus}</p>
                </div>
                
                {/* Neon Progress Bar */}
                <div style={{ width: '300px', backgroundColor: '#121620', borderRadius: '12px', padding: '4px', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                  <div style={{
                    height: '8px',
                    width: `${loadingProgress}%`,
                    backgroundColor: '#0ea5e9',
                    borderRadius: '8px',
                    transition: 'width 0.4s ease-out',
                    boxShadow: '0 0 10px rgba(14, 165, 233, 0.7), inset 0 0 4px rgba(255,255,255,0.4)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Animated shine effect */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                      animation: 'shimmer 1.5s infinite'
                    }} />
                  </div>
                </div>
                <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700 }}>{loadingProgress}%</span>
                <style>{`
                  @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                  }
                  .spin { animation: spin 1s linear infinite; }
                  @keyframes spin { 100% { transform: rotate(360deg); } }
                `}</style>
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
                <Filter size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No se encontraron registros con los filtros seleccionados.</p>
              </div>
            ) : (
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.82rem'
              }}>
                {/* STICKY HEADER DIRECTLY UNDER THE YELLOW LINE */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#121620' }}>
                  <tr style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#94a3b8',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <th style={{ padding: '0.75rem 1rem', width: '45px', textAlign: 'center' }}>N°</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Sede</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Año</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Mes</th>
                    <th style={{ padding: '0.75rem 1rem', color: '#a855f7' }}>Tipo Dato</th>
                    <th style={{ padding: '0.75rem 1rem', color: '#38bdf8' }}>CDD_Mensual (base {cddBaseTemp}°C)</th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4ade80' }}>Temp_Promedio_Mensual (°C)</th>
                    <th style={{ padding: '0.75rem 1rem', color: '#f59e0b' }}>Anomalía Térmica (Δ vs Año Ant.)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const isHighImpact = row.cddMensual > 100;
                    const hasDelta = row.anomalyDelta !== null;
                    const isWarmDelta = hasDelta && row.anomalyDelta > 0.3;
                    const isColdDelta = hasDelta && row.anomalyDelta < -0.3;

                    return (
                      <tr
                        key={`${row.sede}-${row.year}-${row.monthIdx}-${idx}`}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          transition: 'backgroundColor 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {/* Numbering Column */}
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>
                          {idx + 1}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f1f5f9' }}>
                          {row.sede}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                          {row.year}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                          {row.monthName}
                        </td>

                        {/* TIPO DATO */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: row.isProjected ? 'rgba(168, 85, 247, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                            color: row.isProjected ? '#a855f7' : '#4ade80',
                            border: `1px solid ${row.isProjected ? 'rgba(168, 85, 247, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                          }}>
                            {row.isProjected && <Sparkles size={11} />}
                            {row.tipoDato}
                          </span>
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.9rem' }}>
                              {row.cddMensual} CDD
                            </span>
                            {isHighImpact && (
                              <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                color: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}>
                                Alto HVAC
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#4ade80', fontSize: '0.9rem' }}>
                          {row.tempPromedioMensual} °C
                        </td>

                        {/* Anomalía Térmica Column */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {hasDelta ? (
                            <span style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: isWarmDelta ? '#f87171' : isColdDelta ? '#60a5fa' : '#4ade80',
                              backgroundColor: isWarmDelta ? 'rgba(239, 68, 68, 0.15)' : isColdDelta ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Activity size={12} />
                              {row.anomalyDelta > 0 ? `+${row.anomalyDelta}` : row.anomalyDelta} °C
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Dynamic Bottom Status Bar */}
          <div style={{
            padding: '0.6rem 1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0c0f17',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: '#94a3b8',
            flexShrink: 0
          }}>
            <span>
              Mostrando <strong style={{ color: '#38bdf8' }}>{filteredRows.length}</strong> filas calculadas (Base CDD: {cddBaseTemp}°C)
            </span>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
              * Al hacer clic en "Descargar Data (Excel)", se generará un archivo .xlsx con el 100% de los {filteredRows.length} registros.
            </span>
          </div>

        </div>
        {/* END RIGHT PANEL */}

      </div>

    </div>
  );
};

export default Clima3;
