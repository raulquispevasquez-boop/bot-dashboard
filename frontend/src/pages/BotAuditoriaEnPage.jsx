import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Settings, RefreshCw, FolderOpen, CheckCircle2, AlertCircle, 
  Database, Activity, Table, FileSpreadsheet, Search, ShieldAlert, Trash2, Download,
  Maximize2, X, ChevronLeft, ChevronRight, FileText, Printer, DollarSign, TrendingUp,
  PieChart as PieIcon, Award, FileCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import RunningBot from '../components/common/RunningBot';
import Toast from '../components/common/Toast';
import InfoModal from '../components/common/InfoModal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';

const URL_SUPABASE = "https://zuouxnvcktjhqzlniion.supabase.co";
const KEY_SUPABASE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";

const getMacroSystem = (sysName) => {
  if (!sysName) return 'OTROS';
  const s = sysName.toString().toUpperCase();
  if (s.includes('FRIO') || s.includes('VISICOOLER') || s.includes('MURAL') || s.includes('POZA') || s.includes('HIELERA') || s.includes('AUTOCONTENIDA')) return 'FRIO ALIMENTARIO';
  if (s.includes('AIRE') || s.includes('HVAC') || s.includes('CLIMA') || s.includes('CALEFACCION')) return 'HVAC';
  if (s.includes('ILUMINA')) return 'ILUMINACION';
  if (s.includes('CONDENSADOR')) return 'TABLEROS CONDENSADORES';
  if (s.includes('TABLERO') || s.includes('ELECTRIC')) return 'TABLEROS ELÉCTRICOS';
  if (s.includes('BOMBA') || s.includes('AGUA')) return 'BOMBAS DE AGUA';
  if (s.includes('ELEVACION') || s.includes('ASCENSOR') || s.includes('MONTACARGA')) return 'ELEVACION VERTICAL';
  if (s.includes('PRACTICA') || s.includes('BUENAS')) return 'BUENAS PRACTICAS';
  return 'OTROS';
};

const fetchSupabaseTable = async (tableName) => {
  let selectQuery = '*';
  if (tableName === 'auditoria_puntajes' || tableName === 'auditoria_hallazgos_detallados') {
    selectQuery = '*,auditoria_auditorias(filename)';
  }

  const res = await fetch(`${URL_SUPABASE}/rest/v1/${tableName}?select=${encodeURIComponent(selectQuery)}&limit=5000`, {
    headers: {
      'apikey': KEY_SUPABASE,
      'Authorization': `Bearer ${KEY_SUPABASE}`,
      'Accept-Profile': 'energia'
    }
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Error ${res.status}: ${errTxt}`);
  }

  const rawData = await res.json();

  return rawData.map(row => ({
    ...row,
    filename: row.filename || row.auditoria_auditorias?.filename || 'Sin registro'
  }));
};

// Función global para exportar cualquier tabla a formato Excel (.xlsx)
export const handleExportExcel = (data, filename = 'auditoria_export.xlsx') => {
  if (!data || data.length === 0) {
    alert("No hay registros disponibles para exportar.");
    return;
  }

  const cleanData = data.map((row, idx) => {
    const cleanRow = { 'N°': idx + 1 };
    Object.keys(row).forEach(key => {
      if (key === 'auditoria_auditorias') {
        if (row[key] && row[key].filename) {
          cleanRow['archivo_origen'] = row[key].filename;
        }
      } else {
        const val = row[key];
        cleanRow[key] = val != null ? val : '';
      }
    });
    return cleanRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(cleanData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoría');
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeFilename);
};

const BotAuditoriaEnPage = ({ bots, logs, onStart, onStop, socket }) => {
  const [activeTab, setActiveTab] = useState('ejecucion'); // 'ejecucion', 'auditorias', 'puntajes', 'hallazgos'
  const [folderPath, setFolderPath] = useState('E:\\Gestion SPSA\\3.Gestión Energía\\Auditoria Energética\\1.Auditoria energeticas Mk 2026');
  const [showConfig, setShowConfig] = useState(false);
  const [storesData, setStoresData] = useState({});
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  // Trello-style Drag and Drop para Pestañas (con persistencia en localStorage)
  const defaultTabs = [
    { id: 'ejecucion', label: 'Bot Auditoría En.' },
    { id: 'panel', label: 'Panel Auditorías' },
    { id: 'funcionalidades', label: 'Funcionalidades del Bot' },
    { id: 'plan_accion', label: 'Plan de Acción' },
    { id: 'auditorias', label: 'Auditorías (`auditoria_auditorias`)' },
    { id: 'puntajes', label: 'Puntajes (`auditoria_puntajes`)' },
    { id: 'config_pesos', label: 'Config. Pesos (`auditoria_config_pesos`)' },
    { id: 'estandarizacion', label: 'Estandarización Acciones (`auditoria_estandarizacion_acciones`)' },
    { id: 'hallazgos', label: 'Hallazgos Detallados (`auditoria_hallazgos_detallados`)' },
    { id: 'costos_auditorias', label: 'Costos Auditorías (`auditoria_costos`)' },
    { id: 'reporte_digital', label: 'Reporte Digital' }
  ];

  const [tabsOrder, setTabsOrder] = useState(() => {
    const savedOrder = localStorage.getItem('auditoria_tabs_order');
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          const existingIds = new Set(parsed.map(t => t.id));
          const missing = defaultTabs.filter(t => !existingIds.has(t.id));
          if (missing.length === 0 && parsed.length === defaultTabs.length) return parsed;
          return [...parsed, ...missing];
        }
      } catch (e) {}
    }
    return defaultTabs;
  });
  const [draggedTab, setDraggedTab] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedTab(index);
    e.dataTransfer.effectAllowed = 'move';
    // Opcional: hacer el "fantasma" semitransparente
    e.currentTarget.style.opacity = '0.4';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault(); // Necesario para permitir el "drop"
    if (draggedTab === null || draggedTab === index) return;

    const newTabs = [...tabsOrder];
    const draggedItem = newTabs[draggedTab];
    newTabs.splice(draggedTab, 1);
    newTabs.splice(index, 0, draggedItem);
    
    setTabsOrder(newTabs);
    setDraggedTab(index);
    localStorage.setItem('auditoria_tabs_order', JSON.stringify(newTabs));
  };

  const handleDragEnd = (e) => {
    setDraggedTab(null);
    e.currentTarget.style.opacity = '1';
  };

  const [fases, setFases] = useState({
    login: 'idle',
    descarga: 'idle',
    proceso: 'idle',
    drive: 'idle',
    truncate: 'idle',
    insertar: 'idle',
    fin: 'idle'
  });

  const botId = 'bot_auditoria_en'; 
  const botStatus = bots?.find(b => b.id === botId) || { id: botId, name: 'Bot Auditoría En. (Orquestado)', status: 'stopped' };
  const botLogs = logs[botId] || [];
  const consoleBodyRef = useRef(null);

  // Estados de Tablas Supabase y Resumen de Ejecución
  const [tblAuditorias, setTblAuditorias] = useState([]);
  const [tblPuntajes, setTblPuntajes] = useState([]);
  const [tblConfigPesos, setTblConfigPesos] = useState([]);
  const [tblHallazgos, setTblHallazgos] = useState([]);
  const [tblEstandarizacion, setTblEstandarizacion] = useState([]);
  const [tblCostos, setTblCostos] = useState([]);

  const [loadingTable, setLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [treeSelectedNode, setTreeSelectedNode] = useState('');
  const [executionSummary, setExecutionSummary] = useState(null);

  // Generar Reporte Consolidado Completo de Auditorías de Energía (Multi-hoja Excel)
  const handleGenerateFullAuditReport = async () => {
    setLoadingTable(true);
    setToast({ type: 'info', message: '⏳ Generando Reporte Consolidado de Auditoría de Energía...' });
    try {
      const dataAuditorias = tblAuditorias.length > 0 ? tblAuditorias : await fetchSupabaseTable('auditoria_auditorias');
      const dataPuntajes = tblPuntajes.length > 0 ? tblPuntajes : await fetchSupabaseTable('auditoria_puntajes');
      const dataHallazgos = tblHallazgos.length > 0 ? tblHallazgos : await fetchSupabaseTable('auditoria_hallazgos_detallados');
      const dataEstandarizacion = tblEstandarizacion.length > 0 ? tblEstandarizacion : await fetchSupabaseTable('auditoria_plan_accion_maestro');
      const dataPesos = tblConfigPesos.length > 0 ? tblConfigPesos : await fetchSupabaseTable('auditoria_config_pesos');

      const workbook = XLSX.utils.book_new();

      // Hoja 1: Resumen de Auditorías por Tienda
      if (dataAuditorias.length > 0) {
        const cleanAuditorias = dataAuditorias.map((r, i) => ({
          'N°': i + 1,
          'Tienda / Sede': r.tienda || '-',
          'Fecha Auditoría': r.fecha || '-',
          'Auditor': r.auditor || '-',
          'Nota Global Ponderada (%)': r.porcentaje_general != null ? `${r.porcentaje_general}%` : '-',
          'Archivo Origen': r.filename || '-'
        }));
        const wsAud = XLSX.utils.json_to_sheet(cleanAuditorias);
        XLSX.utils.book_append_sheet(workbook, wsAud, 'Resumen Auditorías');
      }

      // Hoja 2: Puntajes por Sistema
      if (dataPuntajes.length > 0) {
        const cleanPuntajes = dataPuntajes.map((r, i) => ({
          'N°': i + 1,
          'Tienda': r.tienda || '-',
          'Sistema / Activo Evaluado': r.sistema || '-',
          'N° Equipos Evaluados': r.cantidad_equipos_evaluados ?? '-',
          'Puntaje Obtenido': r.puntaje_obtenido ?? '-',
          'Puntaje Ideal / Máximo': r.puntaje_ideal ?? '-',
          '% Cumplimiento Simple': r.porcentaje_cumplimiento != null ? `${r.porcentaje_cumplimiento}%` : '-',
          'Peso Energético (%)': r.peso_sistema != null ? `${r.peso_sistema}%` : '-',
          '% Cumplimiento Ponderado': r.porcentaje_cumplimiento_ponderado != null ? `${r.porcentaje_cumplimiento_ponderado}%` : '-',
          'Archivo Origen': r.filename || '-'
        }));
        const wsPunt = XLSX.utils.json_to_sheet(cleanPuntajes);
        XLSX.utils.book_append_sheet(workbook, wsPunt, 'Puntajes por Sistema');
      }

      // Hoja 3: Hallazgos Detallados con Cruce de Estandarización
      if (dataHallazgos.length > 0) {
        const cleanHallazgos = dataHallazgos.map((h, i) => {
          const matchStr = (h.item_no_conforme || '').toString().trim().toLowerCase();
          const matchedAction = dataEstandarizacion.find(e => 
            (e.codigo_item || '').toString().trim().toLowerCase() === matchStr
          ) || {};
          
          return {
            'N°': i + 1,
            'Tienda / Sede': h.tienda || '-',
            'Sistema': h.sistema || '-',
            'Activo Específico': h.activo_especifico || '-',
            'Cód. Observación': h.item_no_conforme || '-',
            'Pregunta / Item No Conforme': h.descripcion_item_no_cumple || '-',
            'Puntaje Real (Eq.)': h.puntaje_real_equipo ?? '-',
            '% Cumplimiento': h.porcentaje_cumplimiento_equipo != null ? `${h.porcentaje_cumplimiento_equipo}%` : '-',
            'Acción (Regla Estandarizada)': matchedAction.accion_estandar || h.accion_regla || '-',
            'Proyecto Eficiencia': matchedAction.tipo_proyecto || '-',
            'Impacto': matchedAction.impacto || '-',
            'Capex / Opex': matchedAction.opex_capex || '-',
            'Costo Estimado (S/)': h.costo != null && !isNaN(h.costo) ? `S/ ${Number(h.costo).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : (matchedAction.costo != null ? `S/ ${Number(matchedAction.costo).toLocaleString('es-PE')}` : '-'),
            'Responsable': matchedAction.responsable || h.responsable_observado || '-',
            'Observación Auditor': h.acciones_especifica || '-',
            'Auditor': h.auditor || '-',
            'Archivo Origen': h.filename || '-'
          };
        });
        const wsHall = XLSX.utils.json_to_sheet(cleanHallazgos);
        XLSX.utils.book_append_sheet(workbook, wsHall, 'Hallazgos Detallados');
      }

      // Hoja 4: Matriz de Pesos Energéticos
      if (dataPesos.length > 0) {
        const cleanPesos = dataPesos.map((r, i) => ({
          'N°': i + 1,
          'Sección': `Sección ${r.numero_seccion}`,
          'Categoría': r.categoria || '-',
          'Nombre del Sistema': r.nombre_seccion || '-',
          'Unidad': r.unidad || '-',
          'Peso Asignado (%)': r.peso_porcentaje != null ? `${r.peso_porcentaje}%` : '-'
        }));
        const wsPesos = XLSX.utils.json_to_sheet(cleanPesos);
        XLSX.utils.book_append_sheet(workbook, wsPesos, 'Configuración de Pesos');
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `Reporte_Consolidado_Auditoria_Energia_${todayStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
      setToast({ type: 'success', message: `✨ Reporte Consolidado generado con éxito: ${filename}` });
    } catch (err) {
      console.error("Error al generar reporte de auditoría:", err);
      setToast({ type: 'error', message: `❌ Error al generar reporte: ${err.message}` });
    } finally {
      setLoadingTable(false);
    }
  };

  // Cargar tablas desde Supabase cuando cambia la pestaña
  const loadTableData = async (tabKey, silent = false) => {
    if (!silent) setLoadingTable(true);
    setTableError(null);
    try {
      if (tabKey === 'auditorias') {
        const data = await fetchSupabaseTable('auditoria_auditorias');
        setTblAuditorias(data);
      } else if (tabKey === 'puntajes') {
        const data = await fetchSupabaseTable('auditoria_puntajes');
        setTblPuntajes(data);
      } else if (tabKey === 'config_pesos') {
        const data = await fetchSupabaseTable('auditoria_config_pesos');
        data.sort((a, b) => a.numero_seccion - b.numero_seccion || a.id - b.id);
        setTblConfigPesos(data);
      } else if (tabKey === 'hallazgos') {
        const data = await fetchSupabaseTable('auditoria_hallazgos_detallados');
        setTblHallazgos(data);
        if (tblEstandarizacion.length === 0) {
          const estData = await fetchSupabaseTable('auditoria_plan_accion_maestro');
          setTblEstandarizacion(estData);
        }
      } else if (tabKey === 'panel') {
        if (tblAuditorias.length === 0) setTblAuditorias(await fetchSupabaseTable('auditoria_auditorias'));
        if (tblPuntajes.length === 0) setTblPuntajes(await fetchSupabaseTable('auditoria_puntajes'));
        if (tblHallazgos.length === 0) setTblHallazgos(await fetchSupabaseTable('auditoria_hallazgos_detallados'));
        if (tblEstandarizacion.length === 0) {
          const estData = await fetchSupabaseTable('auditoria_plan_accion_maestro');
          setTblEstandarizacion(estData);
        }
      } else if (tabKey === 'estandarizacion') {
        const data = await fetchSupabaseTable('auditoria_plan_accion_maestro');
        data.sort((a, b) => (a.codigo_item || 0).toString().localeCompare((b.codigo_item || 0).toString()));
        setTblEstandarizacion(data);
      } else if (tabKey === 'costos_auditorias') {
        try {
          const data = await fetchSupabaseTable('auditoria_costos');
          setTblCostos(data);
        } catch (e) {
          console.warn("Tabla auditoria_costos no encontrada en Supabase, se calculará dinámicamente.");
          setTblCostos([]);
        }
        if (tblHallazgos.length === 0) {
          setTblHallazgos(await fetchSupabaseTable('auditoria_hallazgos_detallados'));
        }
        if (tblEstandarizacion.length === 0) {
          setTblEstandarizacion(await fetchSupabaseTable('auditoria_plan_accion_maestro'));
        }
      } else if (tabKey === 'reporte_digital') {
        if (tblAuditorias.length === 0) setTblAuditorias(await fetchSupabaseTable('auditoria_auditorias'));
        if (tblPuntajes.length === 0) setTblPuntajes(await fetchSupabaseTable('auditoria_puntajes'));
        if (tblHallazgos.length === 0) setTblHallazgos(await fetchSupabaseTable('auditoria_hallazgos_detallados'));
      }
    } catch (err) {
      console.error("Error al cargar tabla de Supabase:", err);
      setTableError(err.message);
    } finally {
      if (!silent) setLoadingTable(false);
    }
  };

  const handleSavePeso = async (id, newPeso) => {
    try {
      const parsed = parseFloat(newPeso);
      if (isNaN(parsed) || parsed < 0) return;
      const res = await fetch(`${URL_SUPABASE}/rest/v1/auditoria_config_pesos?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': KEY_SUPABASE,
          'Authorization': `Bearer ${KEY_SUPABASE}`,
          'Accept-Profile': 'energia',
          'Content-Profile': 'energia',
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ peso_porcentaje: parsed })
      });
      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Error ${res.status}: ${errTxt}`);
      }
      setToast({ type: 'success', message: 'Peso actualizado correctamente en Supabase' });
      loadTableData('config_pesos');
    } catch (err) {
      setToast({ type: 'error', message: `Error al guardar peso: ${err.message}` });
    }
  };

  const handleSaveEstandarizacion = async (id, updatedFields) => {
    // Actualización optimista local para evitar parpadeo y pérdida de scroll
    setTblEstandarizacion(prev => prev.map(r => r.id === id ? { ...r, ...updatedFields } : r));

    try {
      const res = await fetch(`${URL_SUPABASE}/rest/v1/auditoria_estandarizacion_acciones?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': KEY_SUPABASE,
          'Authorization': `Bearer ${KEY_SUPABASE}`,
          'Content-Type': 'application/json',
          'Accept-Profile': 'energia',
          'Content-Profile': 'energia'
        },
        body: JSON.stringify(updatedFields)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ type: 'success', message: '✨ Acción estandarizada actualizada con éxito en Supabase.' });
      loadTableData('estandarizacion', true);
    } catch (err) {
      setToast({ type: 'error', message: `❌ Error al actualizar: ${err.message}` });
      loadTableData('estandarizacion', true);
    }
  };

  const handleAddEstandarizacion = async (newRow) => {
    try {
      const res = await fetch(`${URL_SUPABASE}/rest/v1/auditoria_estandarizacion_acciones`, {
        method: 'POST',
        headers: {
          'apikey': KEY_SUPABASE,
          'Authorization': `Bearer ${KEY_SUPABASE}`,
          'Content-Type': 'application/json',
          'Accept-Profile': 'energia',
          'Content-Profile': 'energia',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify([newRow])
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ type: 'success', message: '✨ Nueva acción registrada correctamente en Supabase.' });
      loadTableData('estandarizacion', true);
    } catch (err) {
      setToast({ type: 'error', message: `❌ Error al guardar: ${err.message}` });
    }
  };

  const handleDeleteEstandarizacion = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este registro de la tabla maestra?")) return;
    setTblEstandarizacion(prev => prev.filter(r => r.id !== id));
    try {
      const res = await fetch(`${URL_SUPABASE}/rest/v1/auditoria_estandarizacion_acciones?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': KEY_SUPABASE,
          'Authorization': `Bearer ${KEY_SUPABASE}`,
          'Accept-Profile': 'energia',
          'Content-Profile': 'energia'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ type: 'success', message: '🗑️ Registro eliminado correctamente.' });
      loadTableData('estandarizacion', true);
    } catch (err) {
      setToast({ type: 'error', message: `❌ Error al eliminar: ${err.message}` });
      loadTableData('estandarizacion', true);
    }
  };

  useEffect(() => {
    if (activeTab !== 'ejecucion') {
      loadTableData(activeTab);
    }
  }, [activeTab]);

  // Telemetría & Parsing de Logs del Bot
  useEffect(() => {
    if (!botLogs || botLogs.length === 0) return;
    
    let newStoresData = { ...storesData };
    let updated = false;
    let newFases = { ...fases };
    let fasesChanged = false;

    botLogs.forEach(log => {
      const type = log.type || (log[0] && log[0].type);
      const message = log.message || (log[0] && log[0].message);

      if (type === 'fase') {
        newFases[log.fase] = log.estado;
        fasesChanged = true;
      }

      if (type === 'summary') {
        try {
          const payload = typeof message === 'string' ? JSON.parse(message) : message;
          if (payload && payload.total_analyzed !== undefined) {
            setExecutionSummary(payload);
          }
        } catch(e){}
      }

      if (type === 'discovery') {
        try {
          const payload = typeof message === 'string' ? JSON.parse(message) : message;
          if (payload && payload.stores && Array.isArray(payload.stores)) {
            payload.stores.forEach(store => {
              if (!newStoresData[store]) {
                newStoresData[store] = { progress: 0, detail: 'En cola...', status: 'waiting' };
                updated = true;
              }
            });
          }
        } catch(e){}
      } else if (type === 'progress') {
        try {
          const payload = typeof message === 'string' ? JSON.parse(message) : message;
          if (payload && payload.store) {
            const detailText = payload.detail || '';
            let st = 'processing';
            if (payload.status === 'collision') {
              st = 'collision';
            } else if (payload.progress === 100) {
              st = (detailText.includes('Error') || detailText.includes('Fallo')) ? 'error' : 'done';
            }
            newStoresData[payload.store] = {
              progress: payload.progress || 0,
              detail: detailText,
              status: st
            };
            updated = true;
          }
        } catch(e){}
      }
    });

    if (updated) setStoresData(newStoresData);
    if (fasesChanged) setFases(newFases);

    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [botLogs]);

  const isRunning = botStatus.status === 'running';

  const handleStart = () => {
    if (!folderPath) {
      alert("Por favor ingresa la ruta de la carpeta con los archivos Excel.");
      return;
    }
    setExecutionSummary(null);
    setStoresData({});
    setFases({
      descubrimiento: 'idle',
      metadatos: 'idle',
      puntajes: 'idle',
      hallazgos: 'idle',
      validacion: 'idle',
      upsert: 'idle',
      completado: 'idle'
    });
    if (onStart) {
      socket?.emit('save_config_auditoria', { folderPath });
      onStart(botId, 'manual');
    }
  };

  const handleStop = () => {
    if (onStop) onStop(botId);
  };

  const getPhaseColor = (state) => {
    if (state === 'activo') return '#3b82f6';
    if (state === 'ok') return '#22c55e';
    if (state === 'error') return '#ef4444';
    return '#333';
  };
  
  const getPhaseGlow = (state) => {
    if (state === 'activo') return '0 0 10px #3b82f6';
    if (state === 'ok') return '0 0 10px #22c55e';
    if (state === 'error') return '0 0 10px #ef4444';
    return 'none';
  };

  const renderFase = (key, label) => {
    const estado = fases[key] || (isRunning ? 'activo' : 'idle');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          backgroundColor: getPhaseColor(estado),
          boxShadow: getPhaseGlow(estado),
          transition: 'all 0.3s ease'
        }}></div>
        <span style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: estado !== 'idle' ? '#fff' : '#666' }}>
          {label}
        </span>
      </div>
    );
  };

  const filterRecords = (data) => {
    let result = data;
    if (treeSelectedNode) {
      const termNode = treeSelectedNode.toLowerCase();
      result = result.filter(item => 
        Object.values(item).some(val => 
          val !== null && val !== undefined && String(val).toLowerCase().includes(termNode)
        )
      );
    }
    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(item => 
      Object.values(item).some(val => 
        val !== null && val !== undefined && String(val).toLowerCase().includes(term)
      )
    );
  };

  return (
    <div style={{ width: '100%', color: '#e2e8f0' }}>
      
      {/* Header Estilo Bot Fracttal-Msp */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#60a5fa', margin: '0 0 0.25rem 0' }}>
          Bot Auditoría Energética 2026
        </h1>
        <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>
          Navega entre las vistas de ejecuciones y consolidación de tablas relacionales.
        </p>

        {/* Estilos CSS para el scroll y botones suaves de pestañas */}
        <style>{`
          .auditoria-tabs-scroll::-webkit-scrollbar {
            height: 6px;
          }
          .auditoria-tabs-scroll::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
            border-radius: 10px;
          }
          .auditoria-tabs-scroll::-webkit-scrollbar-thumb {
            background: rgba(59, 130, 246, 0.35);
            border-radius: 10px;
          }
          .auditoria-tabs-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(59, 130, 246, 0.65);
          }
          .auditoria-tab-btn {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .auditoria-tab-btn:hover:not(.active-tab) {
            background-color: rgba(255, 255, 255, 0.08) !important;
            color: #f8fafc !important;
            border-color: rgba(255, 255, 255, 0.18) !important;
            transform: translateY(-1px);
          }
        `}</style>

        {/* Contenedor con Scroll Horizontal y Botones Suaves (Efecto Trello) */}
        <div 
          className="auditoria-tabs-scroll"
          style={{ 
            display: 'flex', gap: '0.6rem', marginTop: '1.25rem', paddingBottom: '0.65rem',
            overflowX: 'auto', overflowY: 'hidden', scrollBehavior: 'smooth',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {tabsOrder.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const isDragging = draggedTab === index;
            
            const tabIcons = {
              ejecucion: <Activity size={14} />,
              panel: <PieIcon size={14} />,
              funcionalidades: <Settings size={14} />,
              plan_accion: <FileCheck size={14} />,
              auditorias: <Database size={14} />,
              puntajes: <Award size={14} />,
              config_pesos: <Table size={14} />,
              estandarizacion: <FileText size={14} />,
              hallazgos: <ShieldAlert size={14} />,
              costos_auditorias: <DollarSign size={14} />,
              reporte_digital: <FileSpreadsheet size={14} />
            };

            const icon = tabIcons[tab.id] || null;

            return (
              <button
                key={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveTab(tab.id)}
                className={`auditoria-tab-btn ${isActive ? 'active-tab' : ''}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 1rem', borderRadius: '10px',
                  whiteSpace: 'nowrap', cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none', fontSize: '0.85rem',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? '#60a5fa' : '#94a3b8',
                  backgroundColor: isActive 
                    ? 'rgba(59, 130, 246, 0.18)' 
                    : isDragging ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                  border: isActive 
                    ? '1px solid rgba(96, 165, 250, 0.45)' 
                    : isDragging ? '1px dashed #3b82f6' : '1px solid rgba(255, 255, 255, 0.07)',
                  boxShadow: isActive 
                    ? '0 4px 14px rgba(37, 99, 235, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                    : 'none',
                  opacity: isDragging ? 0.4 : 1,
                  position: 'relative'
                }}
              >
                {isActive && (
                  <span style={{ 
                    width: '6px', height: '6px', borderRadius: '50%', 
                    backgroundColor: '#60a5fa', boxShadow: '0 0 8px #60a5fa' 
                  }} />
                )}
                {icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vista 1: Control & Ejecución del Bot */}
      {activeTab === 'ejecucion' && (
        <div className="bot-panel">
          
          {/* Header Pegajoso (Sticky Controls) */}
          <div style={{ 
            position: 'sticky', top: 0, zIndex: 100, backgroundColor: '#0f1115',
            paddingTop: '0.5rem', paddingBottom: '1rem', 
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' 
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Bot Auditoría En. (Orquestado)</h2>
                <RunningBot isRunning={isRunning} />
                {Object.keys(storesData).length > 0 && (() => {
                  const sList = Object.values(storesData);
                  const totalCount = sList.length;
                  const doneCount = sList.filter(s => s.status === 'done' || s.status === 'collision' || s.progress === 100).length;
                  const isAllDone = totalCount > 0 && doneCount === totalCount;
                  
                  return (
                    <span style={{ 
                      backgroundColor: isAllDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      border: `1px solid ${isAllDone ? 'rgba(34, 197, 94, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                      color: isAllDone ? '#4ade80' : '#60a5fa',
                      padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 'bold',
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                      📊 {doneCount} de {totalCount} Archivos 100% Analizados ({Math.round((doneCount / totalCount) * 100)}%)
                    </span>
                  );
                })()}
              </div>
              <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '0.85rem' }}>
                Estado: <span style={{ color: isRunning ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                  {isRunning ? 'Ejecutando Escaneo Masivo...' : 'Detenido'}
                </span>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                onClick={handleGenerateFullAuditReport}
                disabled={loadingTable}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1.1rem', borderRadius: '6px', 
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', 
                  cursor: loadingTable ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
                  boxShadow: '0 2px 10px rgba(34, 197, 94, 0.15)', transition: 'all 0.2s'
                }}
                title="Generar y descargar el Reporte Consolidado Completo de Auditorías de Energía en Excel (Multi-hoja)"
              >
                <FileSpreadsheet size={16} /> Generar Reporte de Auditoría
              </button>

              <button 
                onClick={() => setShowConfig(!showConfig)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #333',
                  backgroundColor: '#111', color: '#fff', cursor: 'pointer'
                }}>
                <Settings size={16} /> Configuración
              </button>

              <button 
                onClick={handleStart} 
                disabled={isRunning}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                  backgroundColor: isRunning ? '#333' : '#22c55e', color: '#fff', 
                  cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                }}>
                <Play size={16} /> Iniciar Escaneo
              </button>

              <button 
                onClick={handleStop} 
                disabled={!isRunning}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                  backgroundColor: !isRunning ? '#333' : '#ef4444', color: '#fff', 
                  cursor: !isRunning ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                }}>
                <Square size={16} /> Abortar
              </button>
            </div>
          </div>

          {/* Configuración desplegable */}
          {showConfig && (
            <div style={{ 
              backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', 
              padding: '1.5rem', marginBottom: '1.5rem' 
            }}>
              <h3 style={{ margin: '0 0 1rem 0', borderBottom: '1px solid #222', paddingBottom: '0.5rem', fontSize: '1rem', color: '#f8fafc' }}>
                Directorio Origen de Archivos Auditados
              </h3>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.5rem' }}>
                  Ruta absoluta de carpeta (.xlsx / .xls):
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ 
                    display: 'flex', alignItems: 'center', background: '#000', 
                    border: '1px solid #333', borderRadius: '4px', flex: 1, padding: '0 12px'
                  }}>
                    <FolderOpen size={16} color="#666" />
                    <input 
                      type="text" 
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      style={{
                        width: '100%', padding: '0.6rem', background: 'transparent',
                        border: 'none', color: '#fff', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Banner de Resultado de la Ejecución (Resumen Superior) */}
          {executionSummary && (
            <div style={{ 
              backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', 
              padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>📊</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#60a5fa', fontWeight: 'bold' }}>
                  Resultado de la Ejecución:
                </h3>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', fontSize: '0.95rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#aaa' }}>Total Excels analizados:</span>
                  <strong style={{ color: '#fff', fontSize: '1.05rem', backgroundColor: '#1e293b', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                    {executionSummary.total_analyzed}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#aaa' }}>Auditorías inyectadas con éxito:</span>
                  <strong style={{ color: '#4ade80', fontSize: '1.05rem', backgroundColor: 'rgba(34,197,94,0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(34,197,94,0.3)' }}>
                    {executionSummary.successful}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#aaa' }}>Archivos omitidos por colisión de plantilla:</span>
                  <strong style={{ color: '#fbbf24', fontSize: '1.05rem', backgroundColor: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.3)' }}>
                    {executionSummary.collisions} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#f59e0b' }}>(disponibles en la consola para tu revisión)</span>
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Visual de Fases Dinámica */}
          {(() => {
            const steps = [
              { id: 'descubrimiento', label: 'Descubrimiento' },
              { id: 'metadatos', label: 'Lectura Metadatos' },
              { id: 'puntajes', label: 'Autocálculo Puntajes' },
              { id: 'hallazgos', label: 'Extracción Hallazgos' },
              { id: 'validacion', label: 'Validación DB' },
              { id: 'upsert', label: 'Upsert Supabase' },
              { id: 'completado', label: 'Completado' }
            ];

            const storeList = Object.values(storesData);
            const totalCount = storeList.length;
            const doneCount = storeList.filter(s => s.status === 'done' || s.status === 'collision' || s.progress === 100).length;
            const isFullyCompleted = totalCount > 0 && doneCount === totalCount && !isRunning;

            let activeStepIdx = -1;
            if (isFullyCompleted) {
              activeStepIdx = 6; // All 100% completed
            } else if (isRunning || totalCount > 0) {
              let latestDetail = '';
              storeList.forEach(s => {
                if (s.detail) latestDetail = s.detail;
              });

              if (latestDetail.includes('Guardando') || latestDetail.includes('DB')) {
                activeStepIdx = 5;
              } else if (latestDetail.includes('Analizando') || latestDetail.includes('hallazgos')) {
                activeStepIdx = 3;
              } else if (latestDetail.includes('Upsert auditoria') || latestDetail.includes('Metadatos')) {
                activeStepIdx = 1;
              } else {
                activeStepIdx = 0;
              }
            }

            return (
              <div style={{ 
                position: 'relative',
                padding: '1.5rem 1rem', 
                backgroundColor: '#0c0e12', 
                borderRadius: '10px', 
                marginBottom: '1.5rem',
                border: '1px solid #1e293b',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
              }}>
                {/* Barra de progreso conectora de fondo */}
                <div style={{
                  position: 'absolute',
                  top: '2.2rem',
                  left: '8%',
                  right: '8%',
                  height: '4px',
                  backgroundColor: '#1e293b',
                  borderRadius: '2px',
                  zIndex: 1
                }}>
                  <div style={{
                    height: '100%',
                    width: activeStepIdx >= 0 ? `${(activeStepIdx / (steps.length - 1)) * 100}%` : '0%',
                    background: activeStepIdx === 6 ? 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)' : 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                    borderRadius: '2px',
                    boxShadow: activeStepIdx >= 0 ? '0 0 10px rgba(59, 130, 246, 0.6)' : 'none',
                    transition: 'width 0.4s ease-in-out'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
                  {steps.map((step, idx) => {
                    let isDone = isFullyCompleted || (activeStepIdx > idx);
                    let isActive = !isFullyCompleted && activeStepIdx === idx;
                    
                    let nodeBg = '#18181b';
                    let nodeBorder = '#333';
                    let nodeColor = '#666';
                    let glow = 'none';

                    if (isDone) {
                      nodeBg = '#22c55e';
                      nodeBorder = '#4ade80';
                      nodeColor = '#fff';
                      glow = '0 0 12px rgba(34, 197, 94, 0.6)';
                    } else if (isActive) {
                      nodeBg = '#3b82f6';
                      nodeBorder = '#60a5fa';
                      nodeColor = '#fff';
                      glow = '0 0 15px rgba(59, 130, 246, 0.8)';
                    }

                    return (
                      <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          backgroundColor: nodeBg,
                          border: `2px solid ${nodeBorder}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: glow,
                          transition: 'all 0.3s ease',
                          fontSize: '0.7rem', fontWeight: 'bold', color: nodeColor
                        }}>
                          {isDone ? '✓' : idx + 1}
                        </div>
                        <span style={{ 
                          marginTop: '0.6rem', fontSize: '0.78rem', textAlign: 'center',
                          color: isDone ? '#4ade80' : isActive ? '#60a5fa' : '#64748b',
                          fontWeight: (isDone || isActive) ? 'bold' : 'normal',
                          transition: 'color 0.3s ease'
                        }}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Grid de Tarjetas de Tiendas */}
          {Object.keys(storesData).length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ color: '#aaa', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>PROGRESO POR SEDE / TIENDA</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                {Object.entries(storesData).map(([storeName, data]) => {
                  let statusColor = '#94a3b8';
                  let statusBadge = `${data.progress}%`;
                  if (data.status === 'processing') statusColor = '#3b82f6';
                  if (data.status === 'done') statusColor = '#22c55e';
                  if (data.status === 'error') statusColor = '#ef4444';
                  if (data.status === 'collision') {
                    statusColor = '#f59e0b';
                    statusBadge = '⚠️ Colisión';
                  }

                  return (
                    <div key={storeName} style={{ 
                      backgroundColor: '#111', borderRadius: '8px', padding: '1rem', 
                      border: `1px solid ${data.status === 'collision' ? '#f59e0b' : '#222'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }} title={storeName}>
                          {storeName}
                        </span>
                        <span style={{ color: statusColor, fontSize: '0.8rem', fontWeight: 'bold' }}>{statusBadge}</span>
                      </div>
                      <div style={{ backgroundColor: '#222', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                        <div style={{ backgroundColor: statusColor, width: `${data.progress}%`, height: '100%', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ color: data.status === 'collision' ? '#fcd34d' : '#666', fontSize: '0.75rem', display: 'block', lineHeight: '1.2' }}>
                        {data.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consola Bonita de Terminal */}
          <div style={{ 
            backgroundColor: '#050505', borderRadius: '8px', border: '1px solid #222',
            display: 'flex', flexDirection: 'column', height: '400px', overflow: 'hidden'
          }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #222', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#eab308' }}></div>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
                </div>
                <span style={{ marginLeft: '1rem', fontFamily: 'monospace', color: '#888', fontSize: '0.85rem' }}>Terminal Auditoría Energética</span>
              </div>
              <button 
                onClick={() => setBotLogs([])}
                title="Limpiar Consola de Logs"
                style={{
                  backgroundColor: '#1e1e1e',
                  color: '#94a3b8',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ef4444'; }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#1e1e1e'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#333'; }}
              >
                <Trash2 size={13} />
                Limpiar Log
              </button>
            </div>
            
            <div ref={consoleBodyRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {botLogs.length === 0 ? (
                <div style={{ color: '#555' }}>Esperando instrucciones...</div>
              ) : (
                botLogs.filter(log => {
                  if (!log) return false;
                  const type = log.type || (log[0] && log[0].type);
                  const msg = log.message || (log[0] && log[0].message) || '';
                  return type !== 'discovery' && type !== 'progress' && type !== 'summary' && !msg.includes('UserWarning') && !msg.includes('site-packages');
                }).map((log, index) => {
                  const type = log.type || (log[0] && log[0].type);
                  const msg = log.message || (log[0] && log[0].message) || '';
                  let color = '#d4d4d8';
                  if (type === 'error') color = '#ef4444';
                  if (type === 'success' || msg.includes('✅')) color = '#22c55e';
                  if (msg.includes('⚠️')) color = '#f59e0b';
                  
                  return (
                    <div key={index} style={{ marginBottom: '0.25rem', color }}>
                      {msg}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* Vista de Funcionalidades */}
      {activeTab === 'funcionalidades' && (
        <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#60a5fa' }}>Funcionalidades del Motor de Reglas (Plan de Acción)</h2>
          <p style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>Con la nueva lógica integrada, el Bot de Auditoría ahora es capaz de procesar los hallazgos con las siguientes características avanzadas:</p>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', lineHeight: '1.5' }}>
            <li><strong>Asignación Automática de SLA:</strong> Asigna plazos de atención (7, 15, 30, 60 días) basados en el impacto del hallazgo.</li>
            <li><strong>Clasificación Inteligente:</strong> Deduce el tipo de acción a tomar (Correctivo, CAPEX, Capacitación, Configuración) de forma autónoma.</li>
            <li><strong>Agrupación Anti-Spam:</strong> Si una tienda tiene varios hallazgos del mismo tipo (ej. fallas de puertas en diferentes equipos), el bot genera un solo ticket unificado, evitando la saturación de alertas.</li>
            <li><strong>Generación Dinámica de Texto:</strong> Emplea plantillas estructuradas para crear títulos y descripciones ricas y precisas automáticamente.</li>
            <li><strong>Catálogo de Capacitaciones:</strong> Detecta problemas de comportamiento y receta automáticamente una de las 11 capacitaciones predefinidas dirigidas a las áreas responsables correspondientes.</li>
          </ul>
          <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255, 204, 0, 0.1)', borderLeft: '4px solid #ffcc00', borderRadius: '4px' }}>
            <p style={{ color: '#ffcc00', margin: 0 }}><strong>Nota Importante:</strong> El código original en Python <code>constantes_plan_accion.py</code> ha sido copiado íntegramente al núcleo del servidor local (Backend). Los archivos y carpetas descargados originalmente ya pueden ser eliminados con seguridad de tu PC.</p>
          </div>
        </div>
      )}

      {/* Vista del Plan de Acción */}
      {activeTab === 'plan_accion' && (
        <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#60a5fa' }}>Plan de Acción</h2>
          <p style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>Este panel centralizará los tickets e iniciativas generados automáticamente por el bot. Aquí se visualizarán las acciones estandarizadas a tomar tras analizar las auditorías, incluyendo responsables, SLAs, e impactos.</p>
          <div style={{ textAlign: 'center', padding: '4rem', color: '#666', border: '1px dashed #333', borderRadius: '8px' }}>
            En construcción: Interfaz de gestión de planes de acción.
          </div>
        </div>
      )}

      {/* Vista del Panel de Auditorías (Dashboard Analítico) */}
      {activeTab === 'panel' && (
        <PanelDashboard 
          auditorias={tblAuditorias} 
          puntajes={tblPuntajes} 
          hallazgos={tblHallazgos} 
          estandarizacion={tblEstandarizacion} 
          loading={loadingTable} 
          setModal={setModal}
          onGenerateReport={handleGenerateFullAuditReport}
        />
      )}

      {/* Vistas de Tablas de Supabase con Columna Izquierda para Árbol Jerárquico (~5cm / 240px) */}
      {['auditorias', 'puntajes', 'config_pesos', 'estandarizacion', 'hallazgos'].includes(activeTab) && (
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem', alignItems: 'flex-start' }}>
          
          {/* Columna Lateral para Árbol Jerárquico (~5cm / 240px) */}
          <TreeSidebarColumn 
            selectedNode={treeSelectedNode}
            onSelectNode={setTreeSelectedNode}
          />

          {/* Área Principal de la Tabla */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Barra de Búsqueda y Actualización */}
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', padding: '0.8rem 1.2rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#000', border: '1px solid #333', borderRadius: '4px', padding: '0 10px', width: '380px' }}>
                <Search size={16} color="#666" />
                <input 
                  type="text" 
                  placeholder="Buscar por tienda, auditor, código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {treeSelectedNode && (
                  <span style={{ fontSize: '0.8rem', color: '#60a5fa', backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', padding: '0.35rem 0.75rem', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🌳 Árbol: {treeSelectedNode}
                    <button onClick={() => setTreeSelectedNode('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold', marginLeft: '0.2rem' }} title="Quitar filtro">✕</button>
                  </span>
                )}

                <button
                  onClick={() => {
                    let currentData = [];
                    let name = 'auditoria_export.xlsx';
                    if (activeTab === 'auditorias') { currentData = filterRecords(tblAuditorias); name = 'auditoria_auditorias.xlsx'; }
                    else if (activeTab === 'puntajes') { currentData = filterRecords(tblPuntajes); name = 'auditoria_puntajes.xlsx'; }
                    else if (activeTab === 'config_pesos') { currentData = filterRecords(tblConfigPesos); name = 'auditoria_config_pesos.xlsx'; }
                    else if (activeTab === 'estandarizacion') { currentData = filterRecords(tblEstandarizacion); name = 'auditoria_estandarizacion_acciones.xlsx'; }
                    else if (activeTab === 'hallazgos') { currentData = filterRecords(tblHallazgos); name = 'auditoria_hallazgos_detallados.xlsx'; }
                    handleExportExcel(currentData, name);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '6px',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
                  }}
                  title="Descargar la tabla seleccionada en Excel"
                >
                  <Download size={15} /> Exportar Excel
                </button>

                <button 
                  onClick={() => loadTableData(activeTab)}
                  disabled={loadingTable}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem',
                    backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
                  }}>
                  <RefreshCw size={14} style={{ animation: loadingTable ? 'spin 1s linear infinite' : 'none' }} />
                  {loadingTable ? 'Cargando Supabase...' : 'Actualizar Tabla'}
                </button>
              </div>
            </div>

            {tableError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '1rem', borderRadius: '8px' }}>
                <strong>Error al consultar Supabase:</strong> {tableError}
              </div>
            )}

            {/* Tabla Auditorías */}
            {activeTab === 'auditorias' && (
              <TableContainer 
                data={filterRecords(tblAuditorias)}
                loading={loadingTable}
                tableName="energia.auditoria_auditorias"
                columns={[
                  { key: 'tienda', label: 'Tienda / Sede' },
                  { key: 'fecha', label: 'Fecha' },
                  { key: 'auditor', label: 'Auditor' },
                  { key: 'filename', label: 'Archivo Origen' },
                  { key: 'created_at', label: 'Fecha Registro', format: (v) => v ? new Date(v).toLocaleString() : '-' },
                  { key: 'porcentaje_general', label: 'Nota Global Ponderada (%)', format: (v) => v != null ? `${v}%` : '-' }
                ]}
              />
            )}

            {/* Tabla Puntajes */}
            {activeTab === 'puntajes' && (
              <TableContainer 
                data={filterRecords(tblPuntajes)}
                loading={loadingTable}
                tableName="energia.auditoria_puntajes"
                columns={[
                  { key: 'tienda', label: 'Tienda' },
                  { key: 'filename', label: 'Archivo Origen' },
                  { key: 'sistema', label: 'Activo Evaluado' },
                  { key: 'macro_sistema', label: 'Sistema (Macro)', format: (_, row) => getMacroSystem(row.sistema) },
                  { key: 'cantidad_equipos_evaluados', label: 'N° Equip. Evaluados', format: (v) => v != null ? v : '-' },
                  { key: 'puntaje_obtenido', label: 'Puntaje Obtenido' },
                  { key: 'puntaje_ideal', label: 'Puntaje Ideal / Máximo' },
                  { key: 'porcentaje_cumplimiento', label: '% Cumplimiento Simple', format: (v) => v != null ? `${v}%` : '-' },
                  { key: 'peso_sistema', label: 'Peso Energético (%)', format: (v) => v != null ? `${v}%` : '-' },
                  { key: 'porcentaje_cumplimiento_ponderado', label: '% Cumplimiento Ponderado', format: (v) => v != null ? `${v}%` : '-' }
                ]}
              />
            )}

            {/* Tabla Configuración de Pesos */}
            {activeTab === 'config_pesos' && (
              <ConfigPesosTable 
                data={filterRecords(tblConfigPesos)}
                loading={loadingTable}
                onSavePeso={handleSavePeso}
              />
            )}

            {/* Tabla Estandarización Maestra de Acciones */}
            {activeTab === 'estandarizacion' && (
              <TableContainer 
                data={filterRecords(tblEstandarizacion)}
                loading={loadingTable}
                tableName="energia.auditoria_plan_accion_maestro"
                columns={[
                  { key: 'clave_unica', label: 'Clave Única' },
                  { key: 'codigo_item', label: 'Cód. Ítem' },
                  { key: 'criterio_eleccion', label: 'Criterio' },
                  { key: 'naturaleza', label: 'Naturaleza' },
                  { key: 'id_nc', label: 'ID NC' },
                  { key: 'descripcion_no_conformidad', label: 'No Conformidad' },
                  { key: 'accion_estandar', label: 'Acción' },
                  { key: 'tipo_proyecto', label: 'Tipo Proyecto' },
                  { key: 'impacto', label: 'Impacto' },
                  { key: 'opex_capex', label: 'Opex/Capex' },
                  { key: 'responsable', label: 'Resp.' },
                  { key: 'agrupacion_ticket', label: 'Agrupación' },
                  { key: 'cod_tema_capacitacion', label: 'Tema Cap.' }
                ]}
              />
            )}

            {/* Tabla Hallazgos Detallados con Cruce de Estandarización */}
            {activeTab === 'hallazgos' && (
              <TableContainer 
                data={filterRecords(tblHallazgos).map(h => {
                  const matchStr = (h.item_no_conforme || '').toString().trim().toLowerCase();
                  const matchedAction = tblEstandarizacion.find(e => 
                    (e.codigo_item || '').toString().trim().toLowerCase() === matchStr
                  ) || {};
                  
                  return {
                    ...h,
                    costo: (h.costo !== undefined && h.costo !== null) ? h.costo : (matchedAction.costo ?? null),
                    _accion_estandar: matchedAction.accion_estandar || '-',
                    _proyecto: matchedAction.tipo_proyecto || '-',
                    _accion_especifica: matchedAction.accion_estandar ? 
                      `${matchedAction.accion_estandar} — ${h.activo_especifico && h.activo_especifico !== '-' ? h.activo_especifico : (h.sistema || 'Sistema General')}` 
                      : '-',
                    _impacto: matchedAction.impacto || '-',
                    _opex_capex: matchedAction.opex_capex || '-',
                    _responsable_estandar: matchedAction.responsable || '-'
                  };
                })}
                loading={loadingTable}
                tableName="energia.auditoria_hallazgos_detallados"
                columns={[
                  { key: 'tienda', label: 'Tienda / Sede' },
                  { key: 'filename', label: 'Archivo Origen' },
                  { key: 'sistema', label: 'Sistema' },
                  { key: 'activo_especifico', label: 'Activo Específico' },
                  { key: 'item_no_conforme', label: 'Cód. Observación' },
                  { key: 'descripcion_item_no_cumple', label: 'Pregunta / Item No Conforme' },
                  { key: 'puntaje_real_equipo', label: 'Puntaje Real (Eq.)' },
                  { key: 'porcentaje_cumplimiento_equipo', label: '% Cumplimiento', format: (v) => v != null ? `${v}%` : '-' },
                  { key: '_accion_estandar', label: 'Acción (Regla)' },
                  { key: '_accion_especifica', label: 'Acción Específica' },
                  { key: '_proyecto', label: 'Proyecto' },
                  { key: '_impacto', label: 'Impacto' },
                  { key: '_opex_capex', label: 'Capex/Opex' },
                  { key: 'costo', label: 'Costo (S/)', format: (v) => v != null && v !== '' && !isNaN(v) ? `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : (v || '-') },
                  { key: '_responsable_estandar', label: 'Responsable (Regla)' },
                  { key: 'acciones_especifica', label: 'Observación Auditor' },
                  { key: 'auditor', label: 'Auditor' }
                ]}
              />
            )}

          </div>
        </div>
      )}

      {/* Vista de Costos Auditorías */}
      {activeTab === 'costos_auditorias' && (
        <CostosAuditoriasView 
          data={tblCostos}
          loading={loadingTable}
          tableName="energia.auditoria_costos"
          filterRecords={filterRecords}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          tblHallazgos={tblHallazgos}
          tblEstandarizacion={tblEstandarizacion}
          onReload={() => loadTableData('costos_auditorias')}
          handleExportExcel={handleExportExcel}
          selectedNode={treeSelectedNode}
          onSelectNode={setTreeSelectedNode}
        />
      )}

      {/* Vista de Reporte Digital */}
      {activeTab === 'reporte_digital' && (
        <ReporteDigitalView 
          auditorias={tblAuditorias}
          puntajes={tblPuntajes}
          hallazgos={tblHallazgos}
          loading={loadingTable}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <InfoModal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={() => setModal({ ...modal, isOpen: false })} />
    </div>
  );
};

// Componente para la Configuración Interactiva de Pesos Energéticos
const ConfigPesosTable = ({ data, loading, onSavePeso }) => {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', color: '#888' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
        <div>Cargando matriz de pesos desde Supabase (`energia.auditoria_config_pesos`)...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', color: '#888' }}>
        <FileSpreadsheet size={32} style={{ marginBottom: '0.75rem', color: '#555' }} />
        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>No se encontraron registros en `energia.auditoria_config_pesos`</div>
      </div>
    );
  }

  const totalSum = data.reduce((acc, r) => acc + (Number(r.peso_porcentaje) || 0), 0);
  const isHundred = Math.abs(totalSum - 100) < 0.01;

  return (
    <div style={{ backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #222', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#111', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>TABLA: ENERGIA.AUDITORIA_CONFIG_PESOS</span>
          <span style={{ marginLeft: '1rem', color: '#3b82f6', fontSize: '0.85rem' }}>{data.length} Secciones Registradas</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            backgroundColor: isHundred ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            border: `1px solid ${isHundred ? '#22c55e' : '#eab308'}`,
            color: isHundred ? '#4ade80' : '#fde047',
            padding: '0.35rem 0.9rem', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            {isHundred ? '✅ Suma Total Configurada: 100.00%' : `⚠️ Suma Total: ${totalSum.toFixed(2)}% (Debe sumar 100%)`}
          </span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#141416', zIndex: 10 }}>
            <tr>
              <th style={{ padding: '0.8rem 0.75rem', color: '#3b82f6', fontWeight: 'bold', borderBottom: '2px solid #222', width: '50px', textAlign: 'center' }}>N°</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', width: '90px' }}>Sec.</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', width: '180px' }}>Categoría</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222' }}>Nombre / Descripción del Sistema Auditado</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', width: '90px' }}>Unidad</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#34d399', fontWeight: 'bold', borderBottom: '2px solid #222', textAlign: 'right', width: '150px' }}>Peso Asignado (%)</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#3b82f6', fontWeight: 'bold', borderBottom: '2px solid #222', textAlign: 'center', width: '120px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={row.id || idx} style={{ borderBottom: '1px solid #1f1f23', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ padding: '0.65rem 0.75rem', color: '#3b82f6', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                <td style={{ padding: '0.65rem 0.75rem', color: '#93c5fd', fontWeight: 'bold' }}>Sección {row.numero_seccion}</td>
                <td style={{ padding: '0.65rem 0.75rem' }}>
                  <span style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold'
                  }}>
                    {row.categoria || 'General'}
                  </span>
                </td>
                <td style={{ padding: '0.65rem 0.75rem', color: '#fff', fontWeight: 'bold' }}>{row.nombre_seccion}</td>
                <td style={{ padding: '0.65rem 0.75rem', color: '#888' }}>{row.unidad}</td>
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 'bold', fontSize: '0.9rem', color: '#34d399' }}>
                  {editingId === row.id ? (
                    <input 
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{ width: '80px', padding: '0.25rem 0.4rem', background: '#000', border: '1px solid #34d399', color: '#34d399', borderRadius: '4px', textAlign: 'right', fontWeight: 'bold' }}
                    />
                  ) : (
                    `${row.peso_porcentaje}%`
                  )}
                </td>
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                  {editingId === row.id ? (
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button 
                        onClick={async () => {
                          await onSavePeso(row.id, editValue);
                          setEditingId(null);
                        }}
                        style={{ padding: '0.25rem 0.6rem', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        Guardar
                      </button>
                      <button 
                        onClick={() => setEditingId(null)}
                        style={{ padding: '0.25rem 0.6rem', background: '#333', color: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setEditingId(row.id);
                        setEditValue(row.peso_porcentaje);
                      }}
                      style={{ padding: '0.25rem 0.6rem', background: '#1e293b', border: '1px solid #334155', color: '#60a5fa', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Componente de Tabla Estilo Fracttal Dashboard con Enumeración N°
const TableContainer = ({ data, loading, tableName, columns }) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', color: '#888' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
        <div>Cargando datos desde Supabase (`{tableName}`)...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', color: '#888' }}>
        <FileSpreadsheet size={32} style={{ marginBottom: '0.75rem', color: '#555' }} />
        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>No se encontraron registros en `{tableName}`</div>
        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Ejecuta el escaneo de auditoría para poblar los datos automáticamente.</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #222', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#111', borderBottom: '1px solid #222', color: '#888', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>TABLA: {tableName.toUpperCase()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#22c55e' }}>{data.length} REGISTROS ENCONTRADOS</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem', tableLayout: 'auto' }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#141416', zIndex: 10 }}>
            <tr>
              <th style={{ padding: '0.8rem 0.75rem', color: '#3b82f6', fontWeight: 'bold', borderBottom: '2px solid #222', width: '50px', textAlign: 'center' }}>
                N°
              </th>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', whiteSpace: 'nowrap' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={row.id || idx} style={{ 
                borderBottom: '1px solid #1f1f23',
                backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
              }}>
                <td style={{ padding: '0.65rem 0.75rem', color: '#3b82f6', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #1f1f23', verticalAlign: 'top' }}>
                  {idx + 1}
                </td>
                {columns.map(col => {
                  const rawVal = row[col.key];
                  const formattedVal = col.format ? col.format(rawVal, row) : rawVal;
                  const isLongText = ['descripcion_item_no_cumple', 'acciones_especifica', 'filename', '_accion_especifica', '_accion_estandar', 'descripcion_no_conformidad', 'accion_estandar'].includes(col.key);
                  const strVal = formattedVal != null ? String(formattedVal) : '';

                  return (
                    <td 
                      key={col.key} 
                      title={strVal}
                      style={{ 
                        padding: '0.65rem 0.75rem', 
                        color: col.key === 'filename' ? '#93c5fd' : '#ccc', 
                        whiteSpace: isLongText ? 'normal' : 'nowrap',
                        wordBreak: isLongText ? 'break-word' : 'normal',
                        maxWidth: col.key === 'filename' ? '400px' : isLongText ? '350px' : '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'top',
                        lineHeight: '1.35'
                      }}
                    >
                      {formattedVal != null && formattedVal !== '' ? formattedVal : <span style={{ color: '#444' }}>-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Componente para la Edición Interactiva de la Tabla Maestra de Estandarización de Acciones
const EstandarizacionAccionesTable = ({ data, loading, onSave, onAdd, onDelete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newForm, setNewForm] = useState({
    item_codigo: '',
    descripcion_no_conformidad: '',
    accion_estandar: '',
    cantidad: 0,
    responsable: ''
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', color: '#888' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
        <div>Cargando tabla maestra de estandarización desde Supabase...</div>
      </div>
    );
  }

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      item_codigo: row.item_codigo || '',
      descripcion_no_conformidad: row.descripcion_no_conformidad || '',
      accion_estandar: row.accion_estandar || '',
      cantidad: row.cantidad != null ? row.cantidad : 0,
      responsable: row.responsable || ''
    });
  };

  const handleSaveClick = async (id) => {
    await onSave(id, {
      item_codigo: parseInt(editForm.item_codigo, 10) || 0,
      descripcion_no_conformidad: editForm.descripcion_no_conformidad,
      accion_estandar: editForm.accion_estandar,
      cantidad: parseInt(editForm.cantidad, 10) || 0,
      responsable: editForm.responsable
    });
    setEditingId(null);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newForm.descripcion_no_conformidad || !newForm.accion_estandar) return;
    await onAdd({
      item_codigo: parseInt(newForm.item_codigo, 10) || (data.length + 1),
      descripcion_no_conformidad: newForm.descripcion_no_conformidad,
      accion_estandar: newForm.accion_estandar,
      cantidad: parseInt(newForm.cantidad, 10) || 0,
      responsable: newForm.responsable || 'Eddy'
    });
    setShowAddModal(false);
    setNewForm({ item_codigo: '', descripcion_no_conformidad: '', accion_estandar: '', cantidad: 0, responsable: '' });
  };

  return (
    <div style={{ backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #222', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#111', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>TABLA: ENERGIA.AUDITORIA_ESTANDARIZACION_ACCIONES</span>
          <span style={{ marginLeft: '1rem', color: '#22c55e', fontSize: '0.85rem' }}>{data?.length || 0} ACCIONES ESTÁNDAR</span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              backgroundColor: '#2563eb', color: '#fff', border: 'none',
              padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
            }}>
            + Agregar Nueva Acción
          </button>
        </div>
      </div>

      {showAddModal && (
        <form onSubmit={handleAddSubmit} style={{ padding: '1rem 1.25rem', backgroundColor: '#18181b', borderBottom: '1px solid #27272a', display: 'grid', gridTemplateColumns: '80px 1fr 1fr 90px 180px auto', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.2rem' }}>Item Cód.</label>
            <input type="number" value={newForm.item_codigo} onChange={e => setNewForm({ ...newForm, item_codigo: e.target.value })} placeholder="Ej: 57" style={{ width: '100%', padding: '0.35rem', background: '#09090b', border: '1px solid #3f3f46', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.2rem' }}>No Conformidad</label>
            <input required type="text" value={newForm.descripcion_no_conformidad} onChange={e => setNewForm({ ...newForm, descripcion_no_conformidad: e.target.value })} placeholder="Descripción..." style={{ width: '100%', padding: '0.35rem', background: '#09090b', border: '1px solid #3f3f46', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.2rem' }}>Acción Estandarizada</label>
            <input required type="text" value={newForm.accion_estandar} onChange={e => setNewForm({ ...newForm, accion_estandar: e.target.value })} placeholder="Acción..." style={{ width: '100%', padding: '0.35rem', background: '#09090b', border: '1px solid #3f3f46', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.2rem' }}>Cantidad</label>
            <input type="number" value={newForm.cantidad} onChange={e => setNewForm({ ...newForm, cantidad: e.target.value })} style={{ width: '100%', padding: '0.35rem', background: '#09090b', border: '1px solid #3f3f46', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.2rem' }}>Responsable</label>
            <input type="text" value={newForm.responsable} onChange={e => setNewForm({ ...newForm, responsable: e.target.value })} placeholder="Ej: Eddy" style={{ width: '100%', padding: '0.35rem', background: '#09090b', border: '1px solid #3f3f46', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="submit" style={{ padding: '0.4rem 0.75rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>Guardar</button>
            <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '0.4rem 0.75rem', background: '#3f3f46', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#141416', zIndex: 10 }}>
            <tr>
              <th style={{ padding: '0.8rem 0.75rem', color: '#3b82f6', fontWeight: 'bold', borderBottom: '2px solid #222', width: '50px', textAlign: 'center' }}>N°</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', width: '90px' }}>ITEM Cód.</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222' }}>Descripción de No Conformidades</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222' }}>Acción Estandarizada</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#34d399', fontWeight: 'bold', borderBottom: '2px solid #222', width: '100px', textAlign: 'center' }}>Cantidad</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#2b9eff', fontWeight: 'bold', borderBottom: '2px solid #222', width: '180px' }}>Responsable Sugerido</th>
              <th style={{ padding: '0.8rem 0.75rem', color: '#3b82f6', fontWeight: 'bold', borderBottom: '2px solid #222', textAlign: 'center', width: '140px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.length === 0) ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  No hay registros. Haz clic en "+ Agregar Nueva Acción" para comenzar.
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id || idx} style={{ borderBottom: '1px solid #1f1f23', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#3b82f6', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                    
                    {/* Item Cód */}
                    <td style={{ padding: '0.65rem 0.75rem', fontWeight: 'bold', color: '#93c5fd' }}>
                      {isEditing ? (
                        <input type="number" value={editForm.item_codigo} onChange={e => setEditForm({ ...editForm, item_codigo: e.target.value })} style={{ width: '60px', padding: '0.25rem', background: '#000', border: '1px solid #3b82f6', color: '#fff', borderRadius: '4px' }} />
                      ) : (
                        row.item_codigo
                      )}
                    </td>

                    {/* Descripción No Conformidad */}
                    <td style={{ padding: '0.65rem 0.75rem', color: '#fff' }}>
                      {isEditing ? (
                        <textarea value={editForm.descripcion_no_conformidad} onChange={e => setEditForm({ ...editForm, descripcion_no_conformidad: e.target.value })} rows={2} style={{ width: '100%', padding: '0.25rem', background: '#000', border: '1px solid #3b82f6', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
                      ) : (
                        row.descripcion_no_conformidad
                      )}
                    </td>

                    {/* Acción Estandarizada */}
                    <td style={{ padding: '0.65rem 0.75rem', color: '#60a5fa' }}>
                      {isEditing ? (
                        <textarea value={editForm.accion_estandar} onChange={e => setEditForm({ ...editForm, accion_estandar: e.target.value })} rows={2} style={{ width: '100%', padding: '0.25rem', background: '#000', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '4px', fontSize: '0.8rem' }} />
                      ) : (
                        row.accion_estandar
                      )}
                    </td>

                    {/* Cantidad Observada */}
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 'bold', color: '#34d399' }}>
                      {isEditing ? (
                        <input type="number" value={editForm.cantidad} onChange={e => setEditForm({ ...editForm, cantidad: e.target.value })} style={{ width: '60px', padding: '0.25rem', background: '#000', border: '1px solid #34d399', color: '#34d399', borderRadius: '4px', textAlign: 'center' }} />
                      ) : (
                        row.cantidad != null ? row.cantidad : 0
                      )}
                    </td>

                    {/* Responsable */}
                    <td style={{ padding: '0.65rem 0.75rem', color: '#e4e4e7' }}>
                      {isEditing ? (
                        <input type="text" value={editForm.responsable} onChange={e => setEditForm({ ...editForm, responsable: e.target.value })} style={{ width: '100%', padding: '0.25rem', background: '#000', border: '1px solid #3b82f6', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }} />
                      ) : (
                        row.responsable
                      )}
                    </td>

                    {/* Botones de Acción */}
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                          <button onClick={() => handleSaveClick(row.id)} style={{ padding: '0.25rem 0.5rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>Guardar</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '0.25rem 0.5rem', background: '#3f3f46', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Cancelar</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button onClick={() => startEdit(row)} style={{ padding: '0.25rem 0.55rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>Editar</button>
                          <button onClick={() => onDelete(row.id)} style={{ padding: '0.25rem 0.45rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Eliminar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Componente Dashboard Analítico de Auditorías
const PanelDashboard = ({ auditorias, puntajes, hallazgos, estandarizacion, loading, setModal, onGenerateReport }) => {
  const [maximizedCard, setMaximizedCard] = useState(null);
  const [activeStoreIdx, setActiveStoreIdx] = useState(null);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const dashboardRef = useRef(null);

  const numTiendasTotal = auditorias ? auditorias.length : 0;

  const handleExportDashboardPDF = async () => {
    if (!dashboardRef.current) return;
    setLoadingPDF(true);

    try {
      const element = dashboardRef.current;

      // Ocultar botones no deseados en la captura PDF
      const noPdfElements = element.querySelectorAll('.no-pdf');
      noPdfElements.forEach(el => { el.style.opacity = '0'; });

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f1f5f9'
      });

      noPdfElements.forEach(el => { el.style.opacity = '1'; });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210; // Ancho estándar A4 (210mm)
      const margin = 10;
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = (canvas.height * contentWidth) / canvas.width;
      const totalPdfHeight = Math.ceil(contentHeight + 24); // Margen superior (20mm) + inferior (4mm)

      // Crear PDF con altura personalizada para albergar TODO el contenido en UNA SOLA HOJA continua
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [pdfWidth, totalPdfHeight]
      });

      // Encabezado del PDF
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(15, 23, 42);
      pdf.text("Reporte Gerencial Dashboard de Auditoría de Energía", margin, 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}`, margin, 17);

      // Renderizar el dashboard completo en la ÚNICA hoja continua
      pdf.addImage(imgData, 'JPEG', margin, 20, contentWidth, contentHeight);

      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `Reporte_Dashboard_Graficas_Auditoria_${todayStr}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      alert(`Error al generar el PDF del dashboard: ${err.message}`);
    } finally {
      setLoadingPDF(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeStoreIdx === null) return;
      if (e.key === 'ArrowRight') {
        setActiveStoreIdx(prev => (prev < numTiendasTotal - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft') {
        setActiveStoreIdx(prev => (prev > 0 ? prev - 1 : numTiendasTotal - 1));
      } else if (e.key === 'Escape') {
        setActiveStoreIdx(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStoreIdx, numTiendasTotal]);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', background: '#fff', borderRadius: '12px', color: '#666' }}>
        <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p>Procesando datos para el dashboard...</p>
      </div>
    );
  }

  // 1. Cálculos de KPIs
  const safeAuditorias = auditorias || [];
  const safePuntajes = puntajes || [];
  const safeHallazgos = hallazgos || [];
  const safeEstandarizacion = estandarizacion || [];

  const totalTiendas = safeAuditorias.length;
  const promGlobal = safeAuditorias.length > 0 
    ? (safeAuditorias.reduce((acc, curr) => acc + (curr.porcentaje_general || 0), 0) / safeAuditorias.length).toFixed(1) 
    : 0;
  const totalHallazgos = safeHallazgos.length;
  const equiposEvaluados = safePuntajes.reduce((acc, curr) => acc + (curr.cantidad_equipos_evaluados || 0), 0);

  // Cruce de Hallazgos con Estandarización
  const hallazgosCruzados = safeHallazgos.map(h => {
    const rawCode = (h.item_no_conforme || '').toString().trim().toLowerCase();
    const cleanCode = rawCode.replace(/^[a-z\.\s\-]+/, '').trim();

    const action = safeEstandarizacion.find(e => {
      if (!e) return false;
      const eCode = (e.codigo_item || '').toString().trim().toLowerCase();
      const eCleanCode = eCode.replace(/^[a-z\.\s\-]+/, '').trim();
      return (eCode && eCode === rawCode) || (cleanCode && eCleanCode === cleanCode) || (e.descripcion_no_conformidad && (h.descripcion_item_no_cumple || '').toLowerCase().includes(e.descripcion_no_conformidad.toLowerCase()));
    }) || {};

    const accionEstandar = action.accion_estandar || h.accion_regla || h.accion || h._accion_estandar;

    return {
      ...h,
      ...action,
      _accion_estandar: (accionEstandar && accionEstandar !== '-') ? accionEstandar : null
    };
  });

  const countOpex = hallazgosCruzados.filter(h => h.opex_capex === 'OPEX').length;
  const countCapex = hallazgosCruzados.filter(h => h.opex_capex === 'CAPEX').length;

  // 2. Gráfica: Ranking de Tiendas
  const rankingTiendas = [...safeAuditorias]
    .sort((a, b) => (b.porcentaje_general || 0) - (a.porcentaje_general || 0))
    .map(a => ({
      nombreFull: a.tienda || 'Desconocida',
      nombre: (a.tienda || 'Desconocida').replace('MK - ', '').substring(0, 20),
      cumplimiento: parseFloat(a.porcentaje_general || 0).toFixed(1)
    }));

  // 3. Gráfica: Hallazgos por Naturaleza (Dona)
  const naturalezaMap = {};
  hallazgosCruzados.forEach(h => {
    const nat = h.naturaleza || 'Sin clasificar';
    naturalezaMap[nat] = (naturalezaMap[nat] || 0) + 1;
  });
  const dataNaturaleza = Object.keys(naturalezaMap).map(key => ({
    name: key,
    value: naturalezaMap[key]
  }));
  const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#64748b'];

  // 4. Gráfica: Hallazgos por Sistema (Agrupado por Macro Sistema)
  const hallazgosPorSistema = {};
  hallazgosCruzados.forEach(h => {
    if (!h.sistema) return;
    const macro = getMacroSystem(h.sistema);
    hallazgosPorSistema[macro] = (hallazgosPorSistema[macro] || 0) + 1;
  });
  
  const totalH = hallazgosCruzados.length || 1;
  const dataSistemas = Object.keys(hallazgosPorSistema).map(macro => ({
    sistema: macro,
    cantidad: hallazgosPorSistema[macro],
    porcentaje: parseFloat(((hallazgosPorSistema[macro] / totalH) * 100).toFixed(1))
  })).sort((a, b) => b.cantidad - a.cantidad);

  // 5. Gráfica: Top Capacitaciones por Tienda (Barras horizontales simulando Gantt de prioridad)
  const capMap = {};
  hallazgosCruzados.forEach(h => {
    if (h.naturaleza === 'Comportamiento') {
      const t = h.tienda ? h.tienda.replace('MK - ', '').substring(0, 15) : 'Desconocida';
      capMap[t] = (capMap[t] || 0) + 1;
    }
  });
  const dataCap = Object.keys(capMap)
    .map(key => ({ tienda: key, cantidad: capMap[key] }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 6); // Top 6 tiendas con más fallas humanas

  // 6. Gráfica: Top Acciones por Sede (Barras Apiladas)
  const accionesMap = {};
  const tiendasUnicasSet = new Set();

  hallazgosCruzados.forEach(h => {
    let accion = h._accion_estandar || h.accion_estandar || h.accion_regla || h.accion;
    if (!accion || accion === '-') {
      accion = h.descripcion_item_no_cumple || 'Sin Observación';
    }
    if (accion.length > 85) accion = accion.substring(0, 82) + '...'; // Truncar solo si es excesivamente largo
    
    const tienda = h.tienda ? h.tienda.replace('MK - ', '').substring(0, 15) : 'Desconocida';
    tiendasUnicasSet.add(tienda);
    
    if (!accionesMap[accion]) {
      accionesMap[accion] = { accion, total: 0, dummyTotal: 0 };
    }
    accionesMap[accion].total += 1;
    accionesMap[accion][tienda] = (accionesMap[accion][tienda] || 0) + 1;
  });

  const tiendasUnicas = Array.from(tiendasUnicasSet);
  const dataAcciones = Object.values(accionesMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 30) // TOP 30 acciones más recurrentes
    .map((item, idx) => ({
      ...item,
      accion_label: `${idx + 1}. ${item.accion}`
    }));

  const STORE_COLORS = [
    '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e', 
    '#14b8a6', '#0ea5e9', '#6366f1', '#d946ef', '#84cc16', '#eab308'
  ];

  const KpiCard = ({ title, value, sub, color }) => (
    <div className="glass-card kpi-card" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: `5px solid ${color}`, flex: 1, minWidth: '150px' }}>
      <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{title}</div>
      <div style={{ color: '#0f172a', fontSize: '2.2rem', fontWeight: '900', marginBottom: '0.25rem', letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{sub}</div>}
    </div>
  );

  // Modal interactivo al hacer click en la dona
  const handlePieClick = (data) => {
    const nature = data.name;
    const findings = hallazgosCruzados.filter(h => h.naturaleza === nature);
    const message = (
      <div style={{ textAlign: 'left', marginTop: '1rem' }}>
        <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1rem' }}>
          Se encontraron <strong>{findings.length} observaciones</strong> tipificadas como "{nature}". A continuación el detalle exacto:
        </p>
        <ul style={{ maxHeight: '350px', overflowY: 'auto', padding: '0 0.5rem', listStyle: 'none', margin: 0 }}>
          {findings.map((f, i) => (
            <li key={i} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#3b82f6' }}>{f.tienda?.replace('MK - ','')} - {f.sistema}</div>
              <div style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: '500', margin: '0.2rem 0' }}>{f.descripcion_item_no_cumple}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <span style={{ fontWeight: 'bold' }}>Acción a tomar:</span> {f._accion_estandar || 'No especificada'}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
    setModal({
      isOpen: true,
      title: `Detalle Interactivo: ${nature}`,
      message: message,
      type: 'info'
    });
  };

  // Modal interactivo al hacer clic en cualquier tienda de Capacitación
  const handleCapacitacionClick = (tiendaShort) => {
    if (!tiendaShort) return;

    const matching = hallazgosCruzados.filter(h => {
      const tName = (h.tienda || '').replace('MK - ', '').substring(0, 15);
      return tName.toLowerCase() === tiendaShort.toLowerCase() && h.naturaleza === 'Comportamiento';
    });

    const findingsToUse = matching.length > 0 ? matching : hallazgosCruzados.filter(h => {
      const tName = (h.tienda || '').replace('MK - ', '').substring(0, 15);
      return tName.toLowerCase() === tiendaShort.toLowerCase();
    });

    const storeFullName = findingsToUse[0]?.tienda || `Tienda ${tiendaShort}`;

    const capTopicsMap = {};
    findingsToUse.forEach(f => {
      const topic = f.cod_tema_capacitacion || f.tema_capacitacion || f.agrupacion_ticket || f._accion_estandar || f.accion_estandar || f.descripcion_item_no_cumple || 'Capacitación Operativa General';
      if (!capTopicsMap[topic]) {
        capTopicsMap[topic] = {
          topic,
          count: 0,
          responsable: f.responsable || f._responsable_estandar || 'Personal de Tienda / Operaciones',
          sistema: f.sistema || 'General',
          ejemplos: []
        };
      }
      capTopicsMap[topic].count += 1;
      if (capTopicsMap[topic].ejemplos.length < 4) {
        capTopicsMap[topic].ejemplos.push(f.descripcion_item_no_cumple || f.item_no_conforme || 'Falla operacional');
      }
    });

    const topicsList = Object.values(capTopicsMap).sort((a, b) => b.count - a.count);

    const message = (
      <div style={{ textAlign: 'left', marginTop: '0.5rem' }}>
        <div style={{ 
          background: 'linear-gradient(135deg, #ef444415 0%, #dc262605 100%)', 
          border: '1px solid #ef444433', 
          borderRadius: '10px', 
          padding: '1rem', 
          marginBottom: '1.25rem',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Plan Prioritario de Capacitación Operativa
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1e293b' }}>
              {storeFullName}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ 
              background: '#ef4444', 
              color: '#fff', 
              padding: '0.35rem 0.85rem', 
              borderRadius: '20px', 
              fontSize: '0.85rem', 
              fontWeight: 'bold' 
            }}>
              {findingsToUse.length} Hallazgos de Comportamiento
            </span>
          </div>
        </div>

        <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem' }}>
          🎓 Módulos de Capacitación Requeridos ({topicsList.length}):
        </h4>

        <div style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {topicsList.map((t, idx) => (
            <div key={idx} style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '1rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1d4ed8', flex: 1, paddingRight: '0.5rem' }}>
                  {idx + 1}. {t.topic}
                </div>
                <span style={{ 
                  background: '#dbeafe', 
                  color: '#1e40af', 
                  padding: '0.2rem 0.6rem', 
                  borderRadius: '12px', 
                  fontSize: '0.75rem', 
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}>
                  {t.count} {t.count === 1 ? 'incidencia' : 'incidencias'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#475569', margin: '0.4rem 0' }}>
                <div><strong>📌 Sistema:</strong> {t.sistema}</div>
                <div><strong>👤 Resp. Sugerido:</strong> {t.responsable}</div>
              </div>

              <div style={{ marginTop: '0.5rem', background: '#ffffff', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.25rem' }}>
                  Evidencias de Auditoría que sustentan la capacitación:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#334155' }}>
                  {t.ejemplos.map((ej, i) => (
                    <li key={i} style={{ marginBottom: '0.2rem' }}>{ej}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    );

    setModal({
      isOpen: true,
      title: `Detalle de Capacitaciones — ${storeFullName}`,
      message: message,
      type: 'info'
    });
  };

  const renderCustomBarLabel = (props) => {
    const { x, y, width, value, porcentaje, payload, index } = props;
    let pct = porcentaje || payload?.porcentaje;
    if (pct === undefined && index !== undefined && dataSistemas && dataSistemas[index]) {
      pct = dataSistemas[index].porcentaje;
    }
    if (pct === undefined || isNaN(pct) || pct === 0) {
      const sumSistemas = dataSistemas ? dataSistemas.reduce((acc, curr) => acc + (curr.cantidad || 0), 0) : 0;
      pct = sumSistemas > 0 ? parseFloat(((value / sumSistemas) * 100).toFixed(1)) : 0;
    }
    return (
      <text x={x + width / 2} y={y - 8} fill="#334155" textAnchor="middle" fontSize={13} fontWeight="bold">
        {value} ({pct}%)
      </text>
    );
  };

  // Tooltip Personalizado para la Dona de Naturalezas
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const glossary = {
        'Comportamiento': 'Malas prácticas del personal (ej. puertas abiertas). Requiere capacitación.',
        'Estado / Operación': 'Desgaste o roturas (ej. jebes rotos). Requiere presupuesto OPEX.',
        'Configuración': 'Equipos mal programados (ej. termostato). Requiere ajuste técnico.',
        'Existencia': 'Falta infraestructura o es obsoleta. Requiere compra (presupuesto CAPEX).'
      };
      
      const natureFindings = hallazgosCruzados.filter(h => h.naturaleza === data.name);
      const storeCounts = {};
      natureFindings.forEach(h => {
        const t = h.tienda ? h.tienda.replace('MK - ', '').substring(0, 15) : 'Desconocida';
        storeCounts[t] = (storeCounts[t] || 0) + 1;
      });
      const topStores = Object.keys(storeCounts)
        .map(k => ({ t: k, c: storeCounts[k] }))
        .sort((a,b) => b.c - a.c)
        .slice(0, 5); // Mostrar hasta 5 tiendas afectadas

      return (
        <div style={{ background: '#ffffff', padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '260px' }}>
          <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1rem', marginBottom: '0.35rem' }}>{data.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem', lineHeight: '1.4' }}>
            {glossary[data.name] || 'Clasificación del tipo de hallazgo.'}
          </div>
          
          <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.35rem', marginBottom: '0.5rem' }}>
            Afectación en Tiendas:
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.75rem', color: '#475569' }}>
            {topStores.map((st, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                <span>{st.t}</span>
                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{st.c} hlzg.</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
  };

  const CustomYAxisTick = (props) => {
    const { x, y, payload } = props;
    const rawText = payload.value || '';
    
    const maxLineLen = 42;
    let line1 = rawText;
    let line2 = '';

    if (rawText.length > maxLineLen) {
      let splitIdx = rawText.lastIndexOf(' ', maxLineLen);
      if (splitIdx === -1 || splitIdx < 18) splitIdx = maxLineLen;
      line1 = rawText.substring(0, splitIdx).trim();
      line2 = rawText.substring(splitIdx).trim();
      if (line2.length > maxLineLen + 10) {
        line2 = line2.substring(0, maxLineLen + 7) + '...';
      }
    }

    return (
      <g transform={`translate(${x},${y})`}>
        {line2 ? (
          <>
            <text x={-305} y={-6} textAnchor="start" fill="#0f172a" fontSize={11} fontWeight="bold">
              {line1}
            </text>
            <text x={-305} y={8} textAnchor="start" fill="#475569" fontSize={10.5} fontWeight="600">
              {line2}
            </text>
          </>
        ) : (
          <text x={-305} y={3} textAnchor="start" fill="#0f172a" fontSize={11} fontWeight="bold">
            {line1}
          </text>
        )}
      </g>
    );
  };

  const renderTotalStackedLabel = (props) => {
    const { x, y, width, height, value, payload } = props;
    const totalVal = value ?? payload?.total;
    if (totalVal === undefined || totalVal === null) return null;
    return (
      <text 
        x={x + width + 8} 
        y={y + height / 2 + 4} 
        fill="#0f172a" 
        fontSize={12} 
        fontWeight="900" 
        textAnchor="start"
      >
        {totalVal}
      </text>
    );
  };

  const renderRankingCenterLabel = (props) => {
    const { x, y, width, height, value } = props;
    if (!value) return null;
    return (
      <text 
        x={x + Math.max(width / 2, 28)} 
        y={y + height / 2 + 4} 
        fill="#ffffff" 
        fontSize={12} 
        fontWeight="bold" 
        textAnchor="middle"
        style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.8)' }}
      >
        {value}%
      </text>
    );
  };

  const MaximizeButton = ({ cardId }) => (
    <button 
      onClick={() => setMaximizedCard(cardId)} 
      title="Maximizar gráfica"
      style={{
        background: 'rgba(15, 23, 42, 0.06)',
        border: '1px solid rgba(15, 23, 42, 0.15)',
        borderRadius: '6px',
        padding: '0.3rem 0.55rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        color: '#1e293b',
        fontSize: '0.75rem',
        fontWeight: 'bold',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
      onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.color = '#1e293b'; }}
    >
      <Maximize2 size={13} /> Maximizar
    </button>
  );

  return (
    <div ref={dashboardRef} style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', borderRadius: '12px', color: '#1e293b', padding: '1.5rem', position: 'relative' }}>
      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-6px) scale(1.015);
          box-shadow: 0 20px 30px rgba(0, 0, 0, 0.08);
          z-index: 10;
        }
        .kpi-card:hover {
          transform: translateY(-8px) scale(1.03);
        }
        .recharts-pie-sector:hover {
          cursor: pointer;
          filter: brightness(1.1);
        }
        @media print {
          .no-pdf { display: none !important; }
          .glass-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1 !important; box-shadow: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', color: '#0f172a', fontWeight: 'bold', margin: 0 }}>Panel Gerencial de Auditorías</h2>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0 0' }}>Resumen consolidado de eficiencia energética</p>
        </div>
        
        <div className="no-pdf" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button 
            onClick={handleExportDashboardPDF}
            disabled={loadingPDF}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1.2rem', borderRadius: '8px', 
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff', color: '#0f172a', 
              cursor: loadingPDF ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.88rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
            title="Exportar todas las gráficas del Dashboard a un archivo PDF estructurado"
          >
            <FileText size={18} color="#dc2626" /> {loadingPDF ? 'Generando PDF...' : 'Exportar PDF (Todas las Gráficas)'}
          </button>

          {onGenerateReport && (
            <button 
              onClick={onGenerateReport}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.6rem 1.2rem', borderRadius: '8px', 
                border: 'none',
                backgroundColor: '#16a34a', color: '#ffffff', 
                cursor: 'pointer', fontWeight: 'bold', fontSize: '0.88rem',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)', transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#15803d'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#16a34a'; }}
              title="Generar y descargar el Reporte Consolidado Completo de Auditorías de Energía en Excel (Multi-hoja)"
            >
              <FileSpreadsheet size={18} /> Generar Reporte Excel
            </button>
          )}
        </div>
      </div>

      {/* FILA 1: KPIs */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <KpiCard title="Nota Global Promedio" value={`${promGlobal}%`} color="#3b82f6" sub="De todas las tiendas" />
        <KpiCard title="Tiendas Auditadas" value={totalTiendas} color="#10b981" sub="Escaneadas con éxito" />
        <KpiCard title="Equipos Evaluados" value={equiposEvaluados} color="#8b5cf6" sub="Muestra total inspeccionada" />
        <KpiCard title="Total Hallazgos" value={totalHallazgos} color="#ef4444" sub="Desviaciones detectadas" />
        <KpiCard title="Fugas por OPEX" value={countOpex} color="#f59e0b" sub="Requieren mantenimiento" />
        <KpiCard title="Fugas por CAPEX" value={countCapex} color="#ec4899" sub="Requieren inversión/compra" />
      </div>

      {/* FILA 2 */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        
        {/* Ranking de Tiendas */}
        <div className="glass-card" style={{ flex: '1 1 500px', padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: '900' }}>
                Ranking Completo de Tiendas ({rankingTiendas.length} Sedes)
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                % Cumplimiento Energético General — Haz click en una barra para ver plan de acción
              </p>
            </div>
            <MaximizeButton cardId="ranking" />
          </div>
          <div style={{ height: `${Math.max(420, rankingTiendas.length * 36)}px`, paddingRight: '0.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingTiendas} layout="vertical" margin={{ top: 5, right: 40, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                <XAxis type="number" domain={[0, 100]} stroke="#475569" fontSize={13} fontWeight="bold" />
                <YAxis dataKey="nombre" type="category" stroke="#1e293b" fontSize={12} fontWeight="bold" width={150} />
                <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                <Bar 
                  dataKey="cumplimiento" 
                  radius={[0, 4, 4, 0]}
                  onClick={(entry, index) => setActiveStoreIdx(index)}
                  style={{ cursor: 'pointer' }}
                >
                  <LabelList dataKey="cumplimiento" content={renderRankingCenterLabel} />
                  {rankingTiendas.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.cumplimiento > 95 ? '#10b981' : entry.cumplimiento > 90 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hallazgos por Naturaleza */}
        <div className="glass-card" style={{ flex: '1 1 340px', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: '900' }}>Hallazgos por Naturaleza</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>Haz click en una sección para ver el detalle en tienda</p>
            </div>
            <MaximizeButton cardId="naturaleza" />
          </div>
          <div style={{ height: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={dataNaturaleza} 
                  cx="50%" cy="50%" 
                  innerRadius={60} outerRadius={95} 
                  paddingAngle={4} 
                  dataKey="value" 
                  label={({ cx, cy, midAngle, outerRadius, percent, name, value }) => {
                    if (!percent || percent < 0.005) return null;
                    const RADIAN = Math.PI / 180;
                    const radius = outerRadius + 18;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    const pctStr = `${(percent * 100).toFixed(1)}%`;
                    return (
                      <text x={x} y={y} fill="#0f172a" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight="800">
                        {`${name}: ${value} (${pctStr})`}
                      </text>
                    );
                  }}
                  labelLine={{ stroke: '#64748b', strokeWidth: 1.5 }}
                  style={{ cursor: 'pointer' }}
                  onClick={handlePieClick}
                >
                  {dataNaturaleza.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Glosa Explicativa del Significado de Cada Porción */}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.5rem' }}>
              📌 Significado y Acción por Tipo de Hallazgo:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {dataNaturaleza.map((entry, idx) => {
                const totalN = dataNaturaleza.reduce((acc, c) => acc + c.value, 0) || 1;
                const pct = ((entry.value / totalN) * 100).toFixed(1);
                const info = {
                  'Comportamiento': { meaning: 'Capacitación al Personal (Fallas operativas humanas)', action: 'Requiere instrucción' },
                  'Estado / Operación': { meaning: 'Mantenimiento Correctivo / Preventivo (OPEX)', action: 'Requiere reparación' },
                  'Existencia': { meaning: 'Inversión / Adquisición Equipamiento (CAPEX)', action: 'Requiere compra' },
                  'Configuración': { meaning: 'Ajuste Técnico / Reprogramación Setpoints', action: 'Requiere ajuste' },
                  'Medición / Gestión': { meaning: 'Calibración / Instrumentación Medidores', action: 'Requiere monitoreo' }
                }[entry.name] || { meaning: 'Falla clasificada', action: 'Revisión técnica' };

                return (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{entry.name}</span>
                    </div>
                    <div style={{ color: '#475569', textAlign: 'right' }}>
                      <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{entry.value}</span> ({pct}%) — <span style={{ color: '#64748b' }}>{info.meaning}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* FILA 3 */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        
        {/* Hallazgos por Sistema */}
        <div className="glass-card" style={{ flex: '1 1 500px', padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: '900' }}>Distribución de Hallazgos por Sistema</h3>
            <MaximizeButton cardId="sistemas" />
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataSistemas} margin={{ top: 35, right: 20, left: -20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="sistema" stroke="#1e293b" fontSize={11} fontWeight="bold" interval={0} tick={{ angle: -40, textAnchor: 'end' }} />
                <YAxis stroke="#475569" fontSize={12} fontWeight="bold" />
                <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} formatter={(val, name, props) => [`${val} (${props.payload.porcentaje}%)`, 'Hallazgos']} />
                <Bar dataKey="cantidad" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                  {/* Se usa LabelList para acceder correctamente al payload completo (que contiene 'porcentaje') */}
                  <LabelList dataKey="cantidad" content={renderCustomBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Tiendas para Capacitación */}
        <div className="glass-card" style={{ flex: '1 1 300px', padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: '900' }}>Tiendas Urgentes para Capacitación</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>Fallas por Comportamiento 👆 <i>(Haz clic en una barra para ver capacitaciones)</i></p>
            </div>
            <MaximizeButton cardId="capacitacion" />
          </div>
          <div style={{ height: '260px' }}>
            {dataCap.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataCap} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                  <XAxis type="number" stroke="#475569" fontSize={11} fontWeight="bold" />
                  <YAxis dataKey="tienda" type="category" stroke="#1e293b" fontSize={12} fontWeight="bold" width={90} />
                  <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                  <Bar 
                    dataKey="cantidad" 
                    fill="#ef4444" 
                    radius={[0, 4, 4, 0]} 
                    label={{ position: 'right', fill: '#ef4444', fontSize: 13, fontWeight: 'bold' }} 
                    onClick={(data) => handleCapacitacionClick(data?.tienda || data?.payload?.tienda)}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem', fontWeight: 'bold', fontSize: '1.1rem' }}>No hay fallas de comportamiento detectadas. 🎉</div>
            )}
          </div>
        </div>

      </div>

      {/* FILA 4 */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
        
        {/* Top Acciones por Sede */}
        <div className="glass-card" style={{ flex: '1 1 100%', padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: '900' }}>
                TOP 30 Distribución de Hallazgos por Acción y Sedes
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                Frecuencia de las 30 observaciones/acciones estandarizadas más recurrentes, desglosadas por tienda
              </p>
            </div>
            <MaximizeButton cardId="acciones" />
          </div>
          <div style={{ height: `${Math.max(900, dataAcciones.length * 44)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataAcciones} layout="vertical" margin={{ top: 5, right: 85, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                  <XAxis type="number" stroke="#475569" fontSize={12} fontWeight="bold" />
                  <YAxis dataKey="accion_label" type="category" stroke="#1e293b" tick={<CustomYAxisTick />} width={310} />
                  <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                  <Legend verticalAlign="top" height={60} wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
                  {tiendasUnicas.map((tienda, idx) => (
                    <Bar 
                      key={tienda} 
                      dataKey={tienda} 
                      stackId="a" 
                      fill={STORE_COLORS[idx % STORE_COLORS.length]} 
                      radius={idx === tiendasUnicas.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} 
                    />
                  ))}
                  {/* Barra transparente para renderizar la etiqueta del valor total al final de cada barra apilada */}
                  <Bar dataKey="total" fill="transparent">
                    <LabelList dataKey="total" content={renderTotalStackedLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* PIE DE PÁGINA DEL DASHBOARD */}
      <div style={{ 
        marginTop: '2.5rem', 
        paddingTop: '1rem', 
        borderTop: '1px solid #cbd5e1', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        fontSize: '0.85rem', 
        fontWeight: 'bold', 
        color: '#475569' 
      }}>
        <div>Gerencia Infraestructura y Seguridad</div>
        <div>Jefe de Energía (Especialidades) SPFH  - R.Q.V.</div>
      </div>

      {/* MODAL PANTALLA COMPLETA AL MAXIMIZAR */}
      {maximizedCard && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '16px', width: '95vw', maxWidth: '1400px',
            maxHeight: '92vh', overflowY: 'auto', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: '900' }}>
                  {maximizedCard === 'ranking' && 'Ranking de Tiendas (% Cumplimiento)'}
                  {maximizedCard === 'naturaleza' && 'Hallazgos por Naturaleza'}
                  {maximizedCard === 'sistemas' && 'Distribución de Hallazgos por Sistema'}
                  {maximizedCard === 'capacitacion' && 'Tiendas Urgentes para Capacitación'}
                  {maximizedCard === 'acciones' && 'TOP 30 Distribución de Hallazgos por Acción y Sedes'}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Vista ampliada a pantalla completa</p>
              </div>
              <button 
                onClick={() => setMaximizedCard(null)}
                style={{
                  backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontWeight: 'bold', fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
                }}>
                <X size={18} /> Cerrar
              </button>
            </div>

            {/* Body Modal with expanded chart */}
            <div style={{ flex: 1, minHeight: '500px' }}>
              {maximizedCard === 'ranking' && (
                <div style={{ height: `${Math.max(600, rankingTiendas.length * 45)}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankingTiendas} layout="vertical" margin={{ top: 10, right: 50, left: 60, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                      <XAxis type="number" domain={[0, 100]} stroke="#475569" fontSize={14} fontWeight="bold" />
                      <YAxis dataKey="nombre" type="category" stroke="#1e293b" fontSize={13} fontWeight="bold" width={180} />
                      <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                      <Bar dataKey="cumplimiento" radius={[0, 6, 6, 0]}>
                        <LabelList dataKey="cumplimiento" content={renderRankingCenterLabel} />
                        {rankingTiendas.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.cumplimiento > 95 ? '#10b981' : entry.cumplimiento > 90 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {maximizedCard === 'naturaleza' && (
                <div style={{ height: '600px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={dataNaturaleza} 
                        cx="50%" cy="50%" 
                        innerRadius={110} outerRadius={190} 
                        paddingAngle={5} 
                        dataKey="value" 
                        label={({name, percent, value}) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`} 
                        style={{fontSize: '14px', fontWeight: 'bold'}}
                        onClick={handlePieClick}
                      >
                        {dataNaturaleza.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomPieTooltip />} />
                      <Legend verticalAlign="bottom" height={40} wrapperStyle={{fontSize: '14px', fontWeight: '600'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {maximizedCard === 'sistemas' && (
                <div style={{ height: '550px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataSistemas} margin={{ top: 40, right: 30, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                      <XAxis dataKey="sistema" stroke="#1e293b" fontSize={13} fontWeight="bold" interval={0} tick={{ angle: -30, textAnchor: 'end' }} />
                      <YAxis stroke="#475569" fontSize={13} fontWeight="bold" />
                      <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} formatter={(val, name, props) => [`${val} (${props.payload.porcentaje}%)`, 'Hallazgos']} />
                      <Bar dataKey="cantidad" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="cantidad" content={renderCustomBarLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {maximizedCard === 'capacitacion' && (
                <div style={{ height: '550px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataCap} layout="vertical" margin={{ top: 10, right: 40, left: 30, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                      <XAxis type="number" stroke="#475569" fontSize={13} fontWeight="bold" />
                      <YAxis dataKey="tienda" type="category" stroke="#1e293b" fontSize={13} fontWeight="bold" width={140} />
                      <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                      <Bar 
                        dataKey="cantidad" 
                        fill="#ef4444" 
                        radius={[0, 6, 6, 0]} 
                        label={{ position: 'right', fill: '#ef4444', fontSize: 15, fontWeight: 'bold' }} 
                        onClick={(data) => handleCapacitacionClick(data?.tienda || data?.payload?.tienda)}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {maximizedCard === 'acciones' && (
                <div style={{ height: `${Math.max(700, dataAcciones.length * 60)}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataAcciones} layout="vertical" margin={{ top: 10, right: 95, left: 20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                      <XAxis type="number" stroke="#475569" fontSize={13} fontWeight="bold" />
                      <YAxis dataKey="accion_label" type="category" stroke="#1e293b" tick={<CustomYAxisTick />} width={350} />
                      <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                      <Legend verticalAlign="top" height={60} wrapperStyle={{fontSize: '12px', fontWeight: 'bold'}} />
                      {tiendasUnicas.map((tienda, idx) => (
                        <Bar 
                          key={tienda} 
                          dataKey={tienda} 
                          stackId="a" 
                          fill={STORE_COLORS[idx % STORE_COLORS.length]} 
                          radius={idx === tiendasUnicas.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} 
                        />
                      ))}
                      <Bar dataKey="total" fill="transparent">
                        <LabelList dataKey="total" content={renderTotalStackedLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARRUSEL DE DETALLE POR TIENDA */}
      {activeStoreIdx !== null && (() => {
        const storeInfo = rankingTiendas[activeStoreIdx];
        if (!storeInfo) return null;
        const storeNameFull = storeInfo.nombreFull || storeInfo.nombre;
        const storeHallazgos = hallazgosCruzados.filter(h => 
          h.tienda && (
            h.tienda.toLowerCase().includes(storeInfo.nombre.toLowerCase()) || 
            storeNameFull.toLowerCase().includes(h.tienda.toLowerCase())
          )
        );
        
        // Agrupar acciones de esta tienda
        const storeActionsMap = {};
        storeHallazgos.forEach(h => {
          let act = h._accion_estandar || h.accion_estandar || h.accion_regla || h.descripcion_item_no_cumple || 'Sin Observación';
          if (act.length > 55) act = act.substring(0, 52) + '...';
          storeActionsMap[act] = (storeActionsMap[act] || 0) + 1;
        });

        const storeActionsData = Object.keys(storeActionsMap).map(key => ({
          name: key,
          value: storeActionsMap[key]
        })).sort((a, b) => b.value - a.value);

        const totalAccionesStore = storeHallazgos.length;

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem'
          }}>
            <div style={{
              backgroundColor: '#ffffff', borderRadius: '16px', width: '95vw', maxWidth: '1350px',
              maxHeight: '92vh', overflowY: 'auto', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              display: 'flex', flexDirection: 'column', position: 'relative'
            }}>
              
              {/* Encabezado con Controles de Deslizamiento de Tiendas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1.2rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.6rem', color: '#0f172a', fontWeight: '900' }}>
                      {storeNameFull}
                    </h2>
                    <span style={{ 
                      padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold',
                      backgroundColor: parseFloat(storeInfo.cumplimiento) > 95 ? '#d1fae5' : parseFloat(storeInfo.cumplimiento) > 90 ? '#fef3c7' : '#fee2e2',
                      color: parseFloat(storeInfo.cumplimiento) > 95 ? '#065f46' : parseFloat(storeInfo.cumplimiento) > 90 ? '#92400e' : '#991b1b'
                    }}>
                      Cumplimiento: {storeInfo.cumplimiento}%
                    </span>
                    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                      {totalAccionesStore} Hallazgos
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                    Plan de Acción Específico | Usa las flechas [Anterior / Siguiente] o el teclado (← →) para deslizarte entre tiendas
                  </p>
                </div>

                {/* Botones de Navegación (Carrusel) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                    <button 
                      onClick={() => setActiveStoreIdx(prev => (prev > 0 ? prev - 1 : rankingTiendas.length - 1))}
                      style={{
                        border: 'none', background: '#fff', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                      <ChevronLeft size={18} /> Anterior
                    </button>
                    <span style={{ padding: '0 0.8rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#475569' }}>
                      {activeStoreIdx + 1} / {rankingTiendas.length}
                    </span>
                    <button 
                      onClick={() => setActiveStoreIdx(prev => (prev < rankingTiendas.length - 1 ? prev + 1 : 0))}
                      style={{
                        border: 'none', background: '#fff', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                      Siguiente <ChevronRight size={18} />
                    </button>
                  </div>

                  <button 
                    onClick={() => setActiveStoreIdx(null)}
                    style={{
                      backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px',
                      padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                      fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
                    }}>
                    <X size={18} /> Cerrar
                  </button>
                </div>
              </div>

              {/* Cuerpo del Modal: 2 Columnas (Gráfico de Acciones + Tabla de Detalle) */}
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', flex: 1 }}>
                
                {/* Columna Izquierda: Torta / Barras de Acciones de esta Tienda */}
                <div style={{ flex: '1 1 420px', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#0f172a', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    📊 Acciones a Realizar en esta Tienda
                  </h4>
                  {storeActionsData.length > 0 ? (
                    <>
                      <div style={{ height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={storeActionsData} 
                              cx="50%" cy="50%" 
                              innerRadius={55} outerRadius={100} 
                              paddingAngle={4} 
                              dataKey="value"
                            >
                              {storeActionsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(val, name) => [`${val} hallazgos`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Leyenda con porcentaje por acción */}
                      <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {storeActionsData.map((act, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '6px 10px', background: '#fff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#334155', fontWeight: '600' }}>{act.name}</span>
                            </div>
                            <span style={{ fontWeight: 'bold', color: '#0f172a', flexShrink: 0, marginLeft: '0.5rem' }}>
                              {act.value} ({((act.value / totalAccionesStore) * 100).toFixed(1)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>
                      ¡Excelente! Esta tienda no presenta hallazgos pendientes. 🎉
                    </div>
                  )}
                </div>

                {/* Columna Derecha: Tabla detallada de Observaciones y Acciones de esta Tienda */}
                <div style={{ flex: '1 1 550px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#0f172a', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    📋 Lista de Observaciones y Acciones Correctivas
                  </h4>
                  <div style={{ flex: 1, maxHeight: '480px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', color: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Sistema</th>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Observación Detectada</th>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Acción Estandarizada</th>
                          <th style={{ padding: '10px', textAlign: 'center' }}>Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeHallazgos.length > 0 ? (
                          storeHallazgos.map((h, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>{h.sistema || '-'}</td>
                              <td style={{ padding: '10px', color: '#475569' }}>{h.descripcion_item_no_cumple || h.item_no_conforme || '-'}</td>
                              <td style={{ padding: '10px', color: '#0284c7', fontWeight: '600' }}>{h._accion_estandar || h.accion_estandar || '-'}</td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                                  backgroundColor: h.opex_capex === 'OPEX' ? '#fef3c7' : '#fce7f3',
                                  color: h.opex_capex === 'OPEX' ? '#d97706' : '#db2777'
                                }}>
                                  {h.opex_capex || 'OPEX'}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Sin datos de observaciones</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Indicador de Deslizamiento (Puntos inferiores para saltar directamente a otra tienda) */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                {rankingTiendas.map((st, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveStoreIdx(i)}
                    title={`${st.nombreFull}: ${st.cumplimiento}%`}
                    style={{
                      width: i === activeStoreIdx ? '26px' : '10px',
                      height: '10px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: i === activeStoreIdx ? '#3b82f6' : '#cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                  />
                ))}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};

// Componente de Vista para "Costos Auditorías"
const CostosAuditoriasView = ({ data, loading, tableName, filterRecords, searchTerm, setSearchTerm, tblHallazgos, tblEstandarizacion, onReload, handleExportExcel, selectedNode, onSelectNode }) => {
  const costItems = (data && data.length > 0) ? data : tblHallazgos.map((h, i) => {
    const sys = h.sistema || 'Sistema General';
    const macroSys = getMacroSystem(sys);
    const score = Number(h.porcentaje_cumplimiento_equipo) || 0;
    
    let baseCapex = 450;
    if (macroSys === 'FRIO ALIMENTARIO') baseCapex = 1200;
    else if (macroSys === 'HVAC') baseCapex = 950;
    else if (macroSys === 'ILUMINACION') baseCapex = 350;
    else if (macroSys === 'TABLEROS ELÉCTRICOS') baseCapex = 800;

    const estCost = h.costo ? Number(h.costo) : Math.round((100 - score) * baseCapex / 10);
    const estWastePerYear = Math.round((100 - score) * (baseCapex * 2.2) / 10);
    const paybackMonths = estCost > 0 && estWastePerYear > 0 ? ((estCost / estWastePerYear) * 12).toFixed(1) : '5.5';
    const priority = score < 50 ? 'Alta' : score < 80 ? 'Media' : 'Baja';

    return {
      id: h.id || i + 1,
      tienda: h.tienda || 'Sede General',
      sistema: sys,
      macro_sistema: macroSys,
      hallazgo: h.descripcion_item_no_cumple || h.item_no_conforme || 'Desviación detectada',
      accion: h._accion_estandar || h.acciones_especifica || 'Inspección / Mantenimiento',
      costo_remediacion: estCost,
      sobrecosto_anual: estWastePerYear,
      payback_meses: paybackMonths,
      prioridad_inversion: priority,
      estado_implementacion: score < 50 ? 'Pendiente Cotización' : 'En Evaluación'
    };
  });

  const filtered = filterRecords(costItems);

  const totalCapex = filtered.reduce((acc, curr) => acc + (Number(curr.costo_remediacion) || 0), 0);
  const totalWaste = filtered.reduce((acc, curr) => acc + (Number(curr.sobrecosto_anual) || 0), 0);
  const avgPayback = filtered.length > 0 ? (filtered.reduce((acc, curr) => acc + (Number(curr.payback_meses) || 5.5), 0) / filtered.length).toFixed(1) : 0;
  const highPriorityCount = filtered.filter(f => f.prioridad_inversion === 'Alta').length;

  return (
    <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem', alignItems: 'flex-start' }}>
      
      {/* Columna Lateral para Árbol Jerárquico (~5cm / 240px) */}
      <TreeSidebarColumn 
        selectedNode={selectedNode}
        onSelectNode={onSelectNode}
      />

      {/* Contenido Principal de Costos */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Search and Action Bar */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', padding: '0.8rem 1.2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#000', border: '1px solid #333', borderRadius: '4px', padding: '0 10px', width: '380px' }}>
          <Search size={16} color="#666" />
          <input 
            type="text" 
            placeholder="Buscar costos por tienda, sistema, hallazgo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => handleExportExcel(filtered, 'auditoria_costos.xlsx')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem',
              backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
            }}
            title="Descargar matriz de costos en Excel"
          >
            <Download size={15} /> Exportar Excel Costos
          </button>

          <button 
            onClick={onReload}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem',
              backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
            }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Cargando Supabase...' : 'Actualizar Tabla'}
          </button>
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>PRESUPUESTO TOTAL REMEDIACIÓN (CAPEX/OPEX)</span>
            <DollarSign size={18} color="#60a5fa" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#60a5fa' }}>
            S/ {totalCapex.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Inversión estimada para corregir {filtered.length} hallazgos</span>
        </div>

        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>PÉRDIDA / DESPERDICIO ENERGÉTICO ANUAL</span>
            <TrendingUp size={18} color="#f87171" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f87171' }}>
            S/ {totalWaste.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Sobrecosto proyectado por no-conformidades</span>
        </div>

        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>RETORNO DE INVERSIÓN (PAYBACK PROM.)</span>
            <Activity size={18} color="#4ade80" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4ade80' }}>
            {avgPayback} Meses
          </div>
          <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>Recuperación estimada por ahorro energético</span>
        </div>

        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>HALLAZGOS PRIORIDAD ALTA</span>
            <ShieldAlert size={18} color="#fbbf24" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24' }}>
            {highPriorityCount} Críticos
          </div>
          <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Requieren atención o aprobación urgente</span>
        </div>
      </div>

      {/* Table Container */}
      <TableContainer
        data={filtered}
        loading={loading}
        tableName="energia.auditoria_costos"
        columns={[
          { key: 'tienda', label: 'Tienda / Sede' },
          { key: 'sistema', label: 'Sistema / Activo' },
          { key: 'hallazgo', label: 'Hallazgo / No Conformidad' },
          { key: 'accion', label: 'Acción Recomendada' },
          { key: 'costo_remediacion', label: 'Costo Remediación (S/)', format: (v) => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` },
          { key: 'sobrecosto_anual', label: 'Pérdida Anual (S/)', format: (v) => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` },
          { key: 'payback_meses', label: 'Payback', format: (v) => `${v} meses` },
          { 
            key: 'prioridad_inversion', 
            label: 'Prioridad',
            format: (v) => (
              <span style={{
                padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                backgroundColor: v === 'Alta' ? 'rgba(239, 68, 68, 0.2)' : v === 'Media' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: v === 'Alta' ? '#f87171' : v === 'Media' ? '#fbbf24' : '#60a5fa',
                border: `1px solid ${v === 'Alta' ? '#ef4444' : v === 'Media' ? '#f59e0b' : '#3b82f6'}`
              }}>
                {v}
              </span>
            )
          },
          { key: 'estado_implementacion', label: 'Estado' }
        ]}
      />
      </div>
    </div>
  );
};

// Componente de Vista para "Reporte Digital" (Próximamente Checklist Móvil de Auditoría)
const ReporteDigitalView = () => {
  return (
    <div style={{
      backgroundColor: '#09090b',
      border: '2px dashed #334155',
      borderRadius: '16px',
      padding: '3.5rem 2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      marginTop: '1rem',
      minHeight: '520px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Glow Background Effect */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '320px',
        height: '320px',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)',
        pointerEvents: 'none'
      }} />

      {/* Main Icon */}
      <div style={{
        width: '84px',
        height: '84px',
        borderRadius: '24px',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 0 25px rgba(59, 130, 246, 0.25)',
        zIndex: 1
      }}>
        📱
      </div>

      <div style={{ zIndex: 1, maxWidth: '650px' }}>
        <div style={{
          fontSize: '0.8rem',
          fontWeight: 800,
          color: '#60a5fa',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          marginBottom: '0.5rem',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          padding: '0.35rem 1rem',
          borderRadius: '20px',
          display: 'inline-block',
          border: '1px solid rgba(59, 130, 246, 0.25)'
        }}>
          ⚡ MÓDULO EN DESARROLLO • CHECKLIST MÓVIL
        </div>

        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc', margin: '0.75rem 0' }}>
          Checklist Digital de Auditoría Energética
        </h2>

        <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: '1.6', margin: '0.5rem 0 2rem 0' }}>
          Este espacio está reservado para el diseño del <strong>Checklist Interactivo Móvil</strong>. 
          Aquí se implementará la interfaz optimizada para smartphones que permitirá a los 
          <strong> supervisores y auditores de campo</strong> generar auditorías en tiempo real directamente desde sus celulares.
        </p>

        {/* Conceptual Feature Skeletons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
          textAlign: 'left'
        }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1e293b', padding: '1rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>📲</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>Captura desde Smartphone</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Interface optimizada para uso rápido en tienda.</div>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1e293b', padding: '1rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>📷</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>Evidencia Fotográfica</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Registro de fotos y hallazgos en campo.</div>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1e293b', padding: '1rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>🚀</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>Sincronización Inmediata</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Envío automático a Supabase y Telegram.</div>
          </div>
        </div>

      </div>
    </div>
  );
};
// Componente de Columna Lateral Reservada (~5cm de ancho / 240px) "En Desarrollo"
const TreeSidebarColumn = () => {
  return (
    <div style={{
      width: '240px',
      minWidth: '240px',
      backgroundColor: '#09090b',
      border: '2px dashed #334155',
      borderRadius: '12px',
      padding: '1.5rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      userSelect: 'none',
      minHeight: '480px',
      color: '#64748b'
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.6rem',
        color: '#60a5fa'
      }}>
        🛠️
      </div>

      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
          COLUMNA RESERVADA
        </div>
        <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: '700', backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: '0.25rem 0.75rem', borderRadius: '20px', display: 'inline-block' }}>
          ⚡ En Desarrollo
        </div>
      </div>

      <div style={{ fontSize: '0.76rem', color: '#94a3b8', lineHeight: '1.45', maxWidth: '200px' }}>
        Espacio estructural libre de 5 cm reservado para posterior vinculación a las tablas.
      </div>
    </div>
  );
};

export default BotAuditoriaEnPage;
