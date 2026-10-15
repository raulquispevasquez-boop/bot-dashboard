import React, { useState, useEffect, useRef } from 'react';
import { Mail, Trash2, Download, HardDrive, Inbox, CheckSquare, Server,
         AlertCircle, Search, Bot, Wifi, WifiOff, Activity, Paperclip,
         FileX, CheckCircle, ClipboardList, Zap } from 'lucide-react';

const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1'
);
const BACKEND = isLocal
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

// ─── Tipos de log → colores ──────────────────────────────────────────────────
const logColor = (msg) => {
  const m = msg.toLowerCase();
  if (m.includes('error') || m.includes('❌') || m.includes('falló')) return '#ef4444';
  if (m.includes('✅') || m.includes('exitoso') || m.includes('completado') || m.includes('guardado')) return '#22c55e';
  if (m.includes('⚠') || m.includes('advertencia') || m.includes('no se pudo')) return '#f59e0b';
  if (m.includes('login') || m.includes('sesión') || m.includes('contraseña') || m.includes('correo')) return '#a78bfa';
  if (m.includes('carpeta') || m.includes('folder') || m.includes('navegando')) return '#38bdf8';
  if (m.includes('procesando') || m.includes('extrayendo') || m.includes('excel')) return '#34d399';
  return '#94a3b8';
};

const AgenteCorreo = () => {
  // ─── Inputs ──────────────────────────────────────────────────────────────
  const [email,        setEmail]        = useState(() => localStorage.getItem('ac_email') || '');
  const [password,     setPassword]     = useState(() => localStorage.getItem('ac_password') || '');
  const [folder,       setFolder]       = useState(() => localStorage.getItem('ac_folder') || '');
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem('ac_apikey') || '');
  const [downloadPath, setDownloadPath] = useState(() => localStorage.getItem('ac_downloadPath') || '');
  const [soloAdjuntos, setSoloAdjuntos] = useState(() => localStorage.getItem('ac_soloAdjuntos') === 'true');
  const [batchSize,    setBatchSize]    = useState(() => localStorage.getItem('ac_batchSize') || '2000');

  useEffect(() => {
    localStorage.setItem('ac_email', email);
    localStorage.setItem('ac_password', password);
    localStorage.setItem('ac_folder', folder);
    localStorage.setItem('ac_apikey', apiKey);
    localStorage.setItem('ac_downloadPath', downloadPath);
    localStorage.setItem('ac_soloAdjuntos', soloAdjuntos);
    localStorage.setItem('ac_batchSize', batchSize);
  }, [email, password, folder, apiKey, downloadPath, soloAdjuntos, batchSize]);

  // ─── Estado UI ────────────────────────────────────────────────────────────
  const [isRunning,  setIsRunning]  = useState(false);
  const [botStatus,  setBotStatus]  = useState('idle'); // idle | running | done | error
  const [sseOnline,  setSseOnline]  = useState(false);
  const [progress,   setProgress]   = useState({ current: 0, total: 0, excelPath: '' });
  const [logs,       setLogs]       = useState([]);
  const [emails,     setEmails]     = useState([]);
  const [selectAll,  setSelectAll]  = useState(false);
  const [stats,      setStats]      = useState({ totalCount: 0, totalSizeStr: '0 MB', failedCount: 0, conAdjuntos: 0, sinAdjuntos: 0, totalProcesados: 0 });
  const [deleted,    setDeleted]    = useState(0);
  const [lastAction, setLastAction] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // all | con_adjuntos | sin_adjuntos | fallidos | procesados
  const [isPaused,     setIsPaused]   = useState(false);

  // Estado inventario / checkpoint
  const [inventarioInfo,  setInventarioInfo]  = useState(null); // { total_catalogados, guardado_en, turbo_skip }
  const [turboSkip,       setTurboSkip]       = useState(null); // { current, total }

  const logsBodyRef  = useRef(null);
  const sseRef       = useRef(null);

  // ─── Auto-scroll consola (solo el scroll interno, nunca el de la pagina) ──
  useEffect(() => {
    if (logsBodyRef.current) {
      logsBodyRef.current.scrollTop = logsBodyRef.current.scrollHeight;
    }
  }, [logs]);

  // ─── Conectar SSE al montar ───────────────────────────────────────────────
  useEffect(() => {
    const connectSSE = () => {
      const es = new EventSource(`${BACKEND}/api/correo/logs`);
      sseRef.current = es;

      es.addEventListener('open', () => {
        setSseOnline(true);
        addLog('🔗 Canal de logs en tiempo real conectado.', 'SYSTEM');
      });

      // Log de texto del bot
      es.addEventListener('log', (e) => {
        const { msg, ts } = JSON.parse(e.data);
        addLog(msg, 'BOT', ts);
      });

      // Resultado final del bot
      es.addEventListener('result', (e) => {
        const data = JSON.parse(e.data);
        if (data.success) {
          if (data.emails) {
            // Resultado de analizar
            setEmails(data.emails.map(em => ({ ...em, seleccionado: false })));
            setStats({ totalCount: data.totalCount, totalSizeStr: data.totalSizeStr });
            addLog(`✅ Análisis listo: ${data.totalCount} correos en "${data.folder}"`, 'SUCCESS');
          } else if (data.excel_path) {
            // Resultado de extraer
            addLog(`✅ Excel generado: ${data.excel_path}`, 'SUCCESS');
            addLog(`📊 ${data.procesados} correos procesados y exportados.`, 'SUCCESS');
          }
          setBotStatus('done');
        } else {
          addLog(`❌ ${data.error}`, 'ERROR');
          setBotStatus('error');
        }
        setIsRunning(false);
      });

      // Inicio de extracción: recibe total de correos
      es.addEventListener('extract_start', (e) => {
        const { total, excel_path } = JSON.parse(e.data);
        setProgress({ current: 0, total, excelPath: excel_path });
        addLog(`📂 Excel creado: ${excel_path}`, 'SYSTEM');
        addLog(`🚀 Iniciando extracción de ${total} correos...`, 'INFO');
      });

      // Progreso por correo: actualiza tabla en tiempo real
      es.addEventListener('email_progress', (e) => {
        const { index, total, email: em } = JSON.parse(e.data);
        setProgress(prev => ({ ...prev, current: index, total }));
        setStats(prev => ({ 
          ...prev, 
          totalProcesados: index,
          conAdjuntos: em.adjuntos_count > 0 ? (prev.conAdjuntos || 0) + 1 : (prev.conAdjuntos || 0),
          sinAdjuntos: em.adjuntos_count === 0 ? (prev.sinAdjuntos || 0) + 1 : (prev.sinAdjuntos || 0),
          failedCount: em.fallido ? (prev.failedCount || 0) + 1 : (prev.failedCount || 0)
        }));
        // Agregar fila a la tabla en tiempo real
        setEmails(prev => [...prev, { ...em, seleccionado: false }]);
      });

      // Estado del proceso
      es.addEventListener('status', (e) => {
        const { running, paused } = JSON.parse(e.data);
        if (!running) setProgress(prev => ({ ...prev, current: prev.total }));
        setBotStatus(running ? 'running' : 'done');
        setIsPaused(!!paused);
      });

      // Checkpoint detectado al reiniciar
      es.addEventListener('checkpoint_found', (e) => {
        const d = JSON.parse(e.data);
        setInventarioInfo(d);
        addLog(`📍 CHECKPOINT encontrado: ${d.total_catalogados} correos ya catalogados (guardado: ${d.guardado_en})`, 'SUCCESS');
        addLog(`⚡ Turbo-skip activado: saltando ${d.turbo_skip} correos a alta velocidad...`, 'INFO');
      });

      // Progreso del turbo-skip
      es.addEventListener('turbo_skip_start', (e) => {
        const { count } = JSON.parse(e.data);
        setTurboSkip({ current: 0, total: count });
        addLog(`⚡ TURBO-SKIP iniciado: ${count} correos para saltar (~${Math.round(count * 0.1 / 60)} min)`, 'INFO');
      });
      es.addEventListener('turbo_skip_progress', (e) => {
        const { current, total } = JSON.parse(e.data);
        setTurboSkip({ current, total });
      });
      es.addEventListener('turbo_skip_done', (e) => {
        const { skipped } = JSON.parse(e.data);
        setTurboSkip(null);
        addLog(`✅ Turbo-skip completado: ${skipped} correos saltados. Reanudando captura normal.`, 'SUCCESS');
      });

      // Ping de keep-alive (ignorar silenciosamente)
      es.addEventListener('ping', () => {});

      es.onerror = () => {
        setSseOnline(false);
        es.close();
        // Reintentar en 3s
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();
    return () => sseRef.current?.close();
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const addLog = (msg, type = 'INFO', ts = null) => {
    const time = ts || new Date().toLocaleTimeString('es-PE');
    setLogs(prev => [...prev.slice(-200), { time, msg, type }]);
  };

  const clearLogs = () => setLogs([]);

  // ─── Detener bot ──────────────────────────────────────────────
  const handleDetener = async () => {
    addLog('⏹ Enviando señal de detención al bot...', 'WARN');
    try {
      await fetch(`${BACKEND}/api/correo/detener`, { method: 'POST' });
    } catch (_) {}
    setIsRunning(false);
    setIsPaused(false);
    setBotStatus('idle');
    setProgress(prev => ({ ...prev }));
    addLog('⛔ Bot detenido.', 'ERROR');
  };

  const handlePausar = async () => {
    try { await fetch(`${BACKEND}/api/correo/pausar`, { method: 'POST' }); } catch (_) {}
  };

  const handleReanudar = async () => {
    try { await fetch(`${BACKEND}/api/correo/reanudar`, { method: 'POST' }); } catch (_) {}
  };

  const handleKillExcel = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/correo/kill-excel`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) addLog('🔨 Instancias fantasma de Excel eliminadas.', 'SUCCESS');
      else addLog('ℹ ' + data.msg, 'INFO');
    } catch (e) {
      addLog('❌ Error al intentar cerrar Excel.', 'ERROR');
    }
  };


  // ─── Acción: Inventario Masivo ────────────────────────────────────────────
  const handleInventario = async () => {
    if (!email || !password || !folder || !downloadPath) {
      addLog('⚠ Completa: correo, contraseña, carpeta y RUTA DE DESCARGA (es donde se guardará el inventario).', 'WARN');
      return;
    }
    setIsRunning(true);
    setBotStatus('running');
    setLastAction('inventario');
    setEmails([]);
    setProgress({ current: 0, total: 0, excelPath: '' });
    setInventarioInfo(null);
    setTurboSkip(null);
    clearLogs();
    addLog(`📋 Iniciando INVENTARIO MASIVO → "${folder}"`, 'INFO');
    addLog(`📂 Excel de inventario se guardará en: ${downloadPath}`, 'INFO');
    addLog(`📦 Tamaño de lote: ${batchSize} correos por sesión`, 'INFO');
    addLog('🔍 Verificando checkpoint previo...', 'INFO');

    try {
      const res = await fetch(`${BACKEND}/api/correo/inventario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, folder, downloadPath, batchSize: parseInt(batchSize) }),
        signal: AbortSignal.timeout(30_000_000), // sin timeout practico
      });
      const data = await res.json();
      if (!data.success && data.error) {
        addLog(`❌ ${data.error}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      } else if (data.success) {
        addLog(`✅ Lote completado: ${data.procesados} correos catalogados.`, 'SUCCESS');
        addLog(`📊 Total acumulado: ${data.total_acumulado || '?'} correos en el inventario.`, 'SUCCESS');
        addLog(`📍 Checkpoint guardado en: ${data.checkpoint}`, 'SUCCESS');
        addLog(`💡 Puedes apagar la máquina y relanzar mañana — continuará desde donde quedó.`, 'INFO');
      }
    } catch (err) {
      if (!err.name?.includes('Abort')) {
        addLog(`❌ Error de red: ${err.message}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    }
  };

  // ─── Acción: Analizar ─────────────────────────────────────────────────────
  const handleAnalizar = async () => {
    if (!email || !password || !folder) {
      addLog('⚠ Completa: correo, contraseña y carpeta origen.', 'WARN');
      return;
    }
    setIsRunning(true);
    setBotStatus('running');
    setLastAction('analizar');
    setEmails([]);
    setProgress({ current: 0, total: 0, excelPath: '' });
    clearLogs();
    addLog(`▶ Iniciando bot — carpeta: "${folder}"`, 'INFO');
    addLog('🌐 Abriendo Chromium y navegando a Outlook Web...', 'INFO');

    try {
      const res = await fetch(`${BACKEND}/api/correo/analizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, folder }),
        signal: AbortSignal.timeout(400_000),
      });
      const data = await res.json();
      if (!data.success && data.error) {
        addLog(`❌ ${data.error}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    } catch (err) {
      if (!err.name?.includes('Abort')) {
        addLog(`❌ Error de red: ${err.message}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    }
  };

  // ─── Acción: Extraer ──────────────────────────────────────────────────────
  const handleExtraer = async () => {
    if (!email || !password || !folder || !downloadPath) {
      addLog('⚠ Completa: correo, contraseña, carpeta y ruta de descarga.', 'WARN');
      return;
    }
    setIsRunning(true);
    setBotStatus('running');
    setLastAction('extraer');
    setEmails([]);
    setProgress({ current: 0, total: 0, excelPath: '' });
    setStats(prev => ({ ...prev, failedCount: 0 }));
    addLog(`▶ Iniciando extracción masiva → ${downloadPath}`, 'INFO');

    try {
      const res = await fetch(`${BACKEND}/api/correo/extraer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, folder, downloadPath, apiKey, soloAdjuntos }),
        signal: AbortSignal.timeout(600_000),
      });
      const data = await res.json();
      if (!data.success && data.error) {
        addLog(`❌ ${data.error}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    } catch (err) {
      if (!err.name?.includes('Abort')) {
        addLog(`❌ Error de red: ${err.message}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    }
  };

  // ─── Acción: Seleccionar ──────────────────────────────────────────────────
  const handleSeleccionar = async () => {
    if (!email || !password || !folder || !downloadPath) {
      addLog('⚠ Completa: correo, contraseña, carpeta y ruta de descarga.', 'WARN');
      return;
    }
    setIsRunning(true);
    setBotStatus('running');
    setLastAction('seleccionar');
    setEmails([]);
    setProgress({ current: 0, total: 0, excelPath: '' });
    addLog(`▶ Iniciando selección de correos extraídos → ${folder}`, 'INFO');

    try {
      const res = await fetch(`${BACKEND}/api/correo/seleccionar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, folder, downloadPath }),
        signal: AbortSignal.timeout(600_000),
      });
      const data = await res.json();
      if (!data.success && data.error) {
        addLog(`❌ ${data.error}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      } else if (data.success) {
        if (data.seleccionados !== undefined) {
           alert(`¡Proceso completado!\nSe seleccionaron ${data.seleccionados} correos exitosamente en Outlook Web.\nPuedes ir a Chrome y eliminarlos manualmente.`);
        }
      }
    } catch (err) {
      if (!err.name?.includes('Abort')) {
        addLog(`❌ Error de red: ${err.message}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    }
  };

  // ─── Acción: Eliminar Automáticamente ───────────────────────────────────────
  const handleEliminar = async () => {
    if (!email || !password || !folder || !downloadPath) {
      addLog('⚠ Completa: correo, contraseña, carpeta y ruta de descarga.', 'WARN');
      return;
    }
    setIsRunning(true);
    setBotStatus('running');
    setLastAction('eliminar');
    setEmails([]);
    setProgress({ current: 0, total: 0, excelPath: '' });
    addLog(`▶ Iniciando eliminación automática de correos extraídos → ${folder}`, 'INFO');

    try {
      const res = await fetch(`${BACKEND}/api/correo/eliminar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, folder, downloadPath }),
        signal: AbortSignal.timeout(600_000),
      });
      const data = await res.json();
      if (!data.success && data.error) {
        addLog(`❌ ${data.error}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      } else if (data.success) {
        if (data.seleccionados !== undefined) {
           alert(`¡Proceso completado!\nSe eliminaron ${data.seleccionados} correos exitosamente en Outlook Web.`);
        }
      }
    } catch (err) {
      if (!err.name?.includes('Abort')) {
        addLog(`❌ Error de red: ${err.message}`, 'ERROR');
        setBotStatus('error');
        setIsRunning(false);
      }
    }
  };

  const handleSelectAll  = () => { setSelectAll(!selectAll); setEmails(emails.map(e => ({ ...e, seleccionado: !selectAll }))); };
  const handleSelectOne  = (id) => setEmails(emails.map(e => e.id === id ? { ...e, seleccionado: !e.seleccionado } : e));
  
  const displayEmails = emails.filter(em => {
    if (filterMode === 'con_adjuntos') return em.adjuntos_count > 0;
    if (filterMode === 'sin_adjuntos') return em.adjuntos_count === 0;
    if (filterMode === 'fallidos') return em.fallido;
    return true;
  });
  const selectedCount = displayEmails.filter(e => e.seleccionado).length;

  // ─── Indicador de estado del bot ─────────────────────────────────────────
  const statusConfig = {
    idle:    { color: '#64748b', label: 'Inactivo',   dot: '⬤' },
    running: { color: isPaused ? '#f59e0b' : '#3b82f6', label: isPaused ? 'Pausado' : 'Ejecutando', dot: '⬤' },
    done:    { color: '#22c55e', label: 'Completado', dot: '⬤' },
    error:   { color: '#ef4444', label: 'Error',      dot: '⬤' },
  };
  const sc = statusConfig[botStatus];

  return (
    <div style={{ padding: '1.5rem', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#020617' }}>
      <style>{`
        @keyframes progress-slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }
        @keyframes bot-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .log-line { animation: fade-in 0.2s ease; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.2); transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary { transition: all 0.2s; }
      `}</style>

      {/* ── Cabecera fija (header + KPIs), no se mueve con el scroll ── */}
      <div style={{ flexShrink: 0 }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Mail color="#3b82f6" size={22} /> Agente Avanzado de Correo y Limpieza
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}>
            {/* SSE status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: sseOnline ? '#22c55e' : '#ef4444' }}>
              {sseOnline ? <Wifi size={14}/> : <WifiOff size={14}/>}
              {sseOnline ? 'Canal activo' : 'Reconectando...'}
            </div>
            {/* Bot status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '20px',
              background: `${sc.color}15`, border: `1px solid ${sc.color}40`,
              color: sc.color, fontWeight: 'bold',
            }}>
              <span style={{ animation: botStatus === 'running' ? 'pulse-dot 1s infinite' : 'none' }}>
                {sc.dot}
              </span>
              Bot — {sc.label}
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <KpiCard icon={<Inbox color="#3b82f6"/>} title="Total Correos (Carpeta)" value={stats.totalCount} sub="Listos para escanear" color="#3b82f6" active={filterMode==='all'} onClick={() => setFilterMode('all')} />
          <KpiCard icon={<ClipboardList color="#a855f7"/>} title="Inventariados" value={inventarioInfo?.total_catalogados ?? stats.totalProcesados ?? 0} sub={inventarioInfo ? `Checkpoint: ${inventarioInfo.guardado_en}` : 'Sesión actual'} color="#a855f7" />
          <KpiCard icon={<CheckCircle color="#8b5cf6"/>} title="Correos Procesados" value={stats.totalProcesados || 0} sub="Extracción exitosa" color="#8b5cf6" active={filterMode==='procesados'} onClick={() => setFilterMode('procesados')} />
          <KpiCard icon={<Paperclip color="#0ea5e9"/>} title="Con Adjuntos" value={stats.conAdjuntos || 0} sub="Archivos capturados" color="#0ea5e9" active={filterMode==='con_adjuntos'} onClick={() => setFilterMode('con_adjuntos')} />
          <KpiCard icon={<AlertCircle color="#f59e0b"/>} title="Fallos MSG" value={stats.failedCount || 0} sub="Generados en hoja Resumen" color="#f59e0b" active={filterMode==='fallidos'} onClick={() => setFilterMode('fallidos')} />
        </div>
      </div>

      {/* ── Region scrolleable: config + preview + consola ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>

        {/* ── Panel izquierdo: Configuración ── */}
        <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: '12px', padding: '1.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16}/> Configuración del Bot
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Field label="Cuenta de Correo">
              <input type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="raul.quispe@spsa.pe" style={inputStyle}/>
            </Field>
            <Field label="Contraseña Web">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Tu contraseña de Outlook Web" style={inputStyle}/>
            </Field>
            <Field label="Carpeta Origen (Ej. 10.10.2023)">
              <input type="text" value={folder} onChange={e => setFolder(e.target.value)}
                placeholder="Nombre de la carpeta" style={inputStyle}/>
            </Field>

            {/* Botón Analizar */}
            <button className="btn-primary" onClick={handleAnalizar} disabled={isRunning}
              style={{ ...btnBase, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid #3b82f6' }}>
              <Search size={15}/> {isRunning && lastAction === 'analizar' ? 'Analizando...' : '1. Analizar Correos'}
            </button>

            {/* Botón Detener y Pausar */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn-primary" onClick={handleDetener} title="Fuerza la detención del bot en cualquier momento"
                style={{ ...btnBase, flex: 1,
                  background: isRunning ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.05)', 
                  color: isRunning ? '#ef4444' : '#ef444455', 
                  border: isRunning ? '1px solid #ef4444' : '1px solid #ef444433', 
                }}>
                <span style={{ fontSize: '1rem' }}>⏹</span> Detener
              </button>

              <button className="btn-primary" onClick={isPaused ? handleReanudar : handlePausar} disabled={!isRunning}
                style={{ ...btnBase, flex: 1,
                  background: isRunning ? (isPaused ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)') : 'rgba(245,158,11,0.05)', 
                  color: isRunning ? (isPaused ? '#22c55e' : '#f59e0b') : '#f59e0b55', 
                  border: isRunning ? (isPaused ? '1px solid #22c55e' : '1px solid #f59e0b') : '1px solid #f59e0b33', 
                  animation: (isRunning && !isPaused) ? 'pulse-dot 1.5s infinite' : 'none',
                }}>
                <span style={{ fontSize: '1rem' }}>{isPaused ? '▶️' : '⏸️'}</span> {isPaused ? 'Reanudar' : 'Pausar'}
              </button>
            </div>



            {/* Indicador de actividad */}
            {isRunning && (
              <div style={{ padding: '0.85rem', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', border: '1px solid #3b82f633' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Bot size={20} color="#3b82f6" style={{ animation: 'bot-bounce 1s infinite' }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#60a5fa', marginBottom: '5px' }}>
                      <span>Bot en ejecución</span>
                      {progress.total > 0
                        ? <span style={{ color: '#34d399', fontWeight: 'bold' }}>{progress.current}/{progress.total}</span>
                        : <Activity size={12} style={{ animation: 'pulse-dot 1.5s infinite' }}/>}
                    </div>
                    {/* Barra de progreso: determinada si hay total, indeterminada si no */}
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      {progress.total > 0 ? (
                        <div style={{
                          height: '100%',
                          width: `${Math.round((progress.current / progress.total) * 100)}%`,
                          background: 'linear-gradient(90deg, #3b82f6, #34d399)',
                          transition: 'width 0.4s ease',
                          borderRadius: '3px'
                        }}/>
                      ) : (
                        <div style={{ height: '100%', width: '40%', background: '#3b82f6', animation: 'progress-slide 1.4s infinite ease-in-out' }}/>
                      )}
                    </div>
                    {progress.total > 0 && (
                      <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                        {Math.round((progress.current / progress.total) * 100)}% completado
                      </div>
                    )}
                  </div>
                </div>
                {progress.excelPath && (
                  <div style={{ fontSize: '0.65rem', color: '#34d399', marginTop: '4px', wordBreak: 'break-all' }}>
                    💾 {progress.excelPath}
                  </div>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }}/>

            <Field label="API Key IA (Opcional — para análisis inteligente)">
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..." style={inputStyle}/>
            </Field>
            <Field label="Ruta de Descarga / Inventario">
              <input type="text" value={downloadPath} onChange={e => setDownloadPath(e.target.value)}
                placeholder="G:/Mi unidad/1.Correos SPSA" style={inputStyle}/>
              <div style={{ fontSize: '0.62rem', color: '#60a5fa', marginTop: '3px' }}>
                📂 El inventario y los EML se guardarán aquí
              </div>
            </Field>

            <Field label="Correos por sesión (lote)">
              <input type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)}
                min="100" max="10000" step="100" style={inputStyle}/>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '3px' }}>
                Recomendado: 2000 inventario · 500 descarga · ~0.35s/correo
              </div>
            </Field>

            {/* Turbo-skip progress */}
            {turboSkip && (
              <div style={{ padding: '0.75rem', background: 'rgba(168,85,247,0.08)', borderRadius: '8px', border: '1px solid #a855f740' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Zap size={14} color="#a855f7" style={{ animation: 'pulse-dot 0.5s infinite' }}/>
                  <span style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 'bold' }}>TURBO-SKIP activo</span>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: 'auto' }}>
                    {turboSkip.current}/{turboSkip.total}
                  </span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: turboSkip.total > 0 ? `${Math.round(turboSkip.current / turboSkip.total * 100)}%` : '0%',
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                    transition: 'width 0.3s ease'
                  }}/>
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '3px' }}>
                  Avanzando al punto de reanudación a 0.1s/correo...
                </div>
              </div>
            )}

            {/* Inventario checkpoint badge */}
            {inventarioInfo && !turboSkip && (
              <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(168,85,247,0.08)', borderRadius: '8px', border: '1px solid #a855f730', fontSize: '0.7rem' }}>
                <div style={{ color: '#a855f7', fontWeight: 'bold', marginBottom: '2px' }}>📍 Checkpoint detectado</div>
                <div style={{ color: '#94a3b8' }}>{inventarioInfo.total_catalogados} correos ya catalogados</div>
                <div style={{ color: '#64748b' }}>Guardado: {inventarioInfo.guardado_en}</div>
              </div>
            )}

            {/* ── Botón Inventario Masivo ── */}
            <button className="btn-primary" onClick={handleInventario} disabled={isRunning}
              style={{ ...btnBase, background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid #a855f7' }}>
              <ClipboardList size={15}/> {isRunning && lastAction === 'inventario' ? 'Inventariando...' : '0. Inventario Masivo'}
            </button>
            <div style={{ fontSize: '0.63rem', color: '#64748b', textAlign: 'center', marginTop: '-4px' }}>
              Escanea todos los correos sin descargar · Retomable al reiniciar
            </div>

            {/* Botón Extraer */}
            <button className="btn-primary" onClick={handleExtraer} disabled={isRunning}
              style={{ ...btnBase, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid #10b981' }}>
              <Download size={15}/> {isRunning && lastAction === 'extraer' ? 'Descargando...' : '2. Descargar'}
            </button>
            {/* Botón Seleccionar Descargados */}
            <button className="btn-primary" onClick={handleSeleccionar} disabled={isRunning}
              style={{ ...btnBase, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid #3b82f6', marginTop: '10px' }}>
              <CheckSquare size={15}/> {isRunning && lastAction === 'seleccionar' ? 'Seleccionando...' : '3. Marcar Descargados'}
            </button>
            {/* Botón Eliminar Automáticamente */}
            <button className="btn-primary" onClick={handleEliminar} disabled={isRunning}
              style={{ ...btnBase, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid #ef4444', marginTop: '10px' }}>
              <Trash2 size={15}/> {isRunning && lastAction === 'eliminar' ? 'Eliminando...' : '4. Eliminar Automáticamente'}
            </button>
            
            {/* Botón Desatascar Excel */}
            <button className="btn-primary" onClick={handleKillExcel}
              style={{ ...btnBase, background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid #f97316', marginTop: '10px' }}>
              <AlertCircle size={15}/> Forzar Cierre de Excel
            </button>
          </div>
        </div>

        {/* ── Panel derecho ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Tabla de correos */}
          <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', height: '280px' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Pre-visualización de Correos {filterMode !== 'all' ? `(Filtro: ${filterMode.replace('_', ' ').toUpperCase()})` : ''}</h3>
              {selectedCount > 0 && (
                <button onClick={() => { setDeleted(d => d + selectedCount); setEmails(emails.filter(e => !e.seleccionado)); setSelectAll(false); }}
                  style={{ ...btnBase, background: '#ef444420', color: '#f87171', border: '1px solid #ef4444', padding: '0.35rem 0.9rem', fontSize: '0.75rem', width: 'auto' }}>
                  <Trash2 size={13}/> Eliminar ({selectedCount})
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0f172a' }}>
                    <th style={th}><input type="checkbox" checked={selectAll} onChange={handleSelectAll}/></th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Remitente</th>
                    <th style={th}>Asunto</th>
                    <th style={{ ...th, borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Enlace Web</th>
                    <th style={{ ...th, borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', width: '90px', textAlign: 'right' }}>Tamaño</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.8rem' }}>
                      Presiona "1. Analizar Correos" para cargar la lista
                    </td></tr>
                  ) : displayEmails.map((em, idx) => (
                    <tr key={em.id} onClick={() => handleSelectOne(em.id)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: em.seleccionado ? 'rgba(59,130,246,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'background 0.15s' }}>
                      <td style={td}><input type="checkbox" checked={em.seleccionado} onChange={() => handleSelectOne(em.id)} onClick={e => e.stopPropagation()}/></td>
                      <td style={{ ...td, color: '#94a3b8' }}>{em.fecha}</td>
                      <td style={td}>{em.remitente}</td>
                      <td style={{ ...td, color: '#60a5fa' }}>{em.asunto}</td>
                      <td style={{ ...td, fontSize: '0.75rem' }}>
                        {em.enlace_web ? (
                          <a href={em.enlace_web} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>🌐 Abrir</a>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...td, color: '#fbbf24', textAlign: 'right' }}>{em.tamaño}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Consola de logs en tiempo real ── */}
          <div style={{ background: '#060d1a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '220px' }}>
            <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569' }}>
                <Activity size={13} color={isRunning ? '#3b82f6' : '#475569'}
                  style={{ animation: isRunning ? 'pulse-dot 1s infinite' : 'none' }}/>
                Consola — Logs en tiempo real
                {isRunning && <span style={{ color: '#3b82f6', fontSize: '0.7rem' }}>● EN VIVO</span>}
              </div>
              <button onClick={clearLogs} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.7rem' }}>
                Limpiar
              </button>
            </div>
            <div ref={logsBodyRef} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', maxHeight: '250px' }}>
              {logs.length === 0 ? (
                <div style={{ color: '#334155' }}>[SISTEMA] Esperando acción del usuario...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="log-line" style={{ color: logColor(log.msg), marginBottom: '3px', lineHeight: '1.5' }}>
                    <span style={{ color: '#334155', marginRight: '6px' }}>[{log.time}]</span>
                    {log.msg}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
      </div>
    </div>
  );
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '4px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{label}</label>
    {children}
  </div>
);

const KpiCard = ({ icon, title, value, sub, color, onClick, active }) => (
  <div onClick={onClick} style={{ 
    background: active ? `${color}25` : 'rgba(30,41,59,0.7)', 
    padding: '1rem', borderRadius: '12px', 
    border: `1px solid ${active ? color : color + '25'}`, 
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    transform: active ? 'translateY(-2px)' : 'none',
    boxShadow: active ? `0 4px 12px ${color}20` : 'none'
  }}>
    <div style={{ padding: '7px', background: `${color}12`, borderRadius: '8px' }}>{icon}</div>
    <div>
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', margin: '3px 0' }}>{value}</div>
      <div style={{ fontSize: '0.6rem', color }}>{sub}</div>
    </div>
  </div>
);

// ─── Estilos base ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '0.55rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)',
  color: '#fff', outline: 'none', fontSize: '0.78rem', boxSizing: 'border-box',
};
const btnBase = {
  width: '100%', padding: '0.7rem', borderRadius: '8px', fontWeight: 'bold',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '7px', fontSize: '0.82rem',
};
const th = { padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 'normal' };
const td = { padding: '0.6rem 0.75rem' };

export default AgenteCorreo;
