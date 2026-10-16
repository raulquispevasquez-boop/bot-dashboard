import React, { useState, useEffect } from 'react';
import { Snowflake, Settings, X, Bell, Gauge, Download } from 'lucide-react';
import RunningBot from '../../common/RunningBot';

// Cuadrito independiente del Bot Consolidado HVAC.
// Cada bot de la familia PME (HVAC, Alumbrado, Frio, General...) vive en su propio
// archivo de tarjeta para mantener el codigo ordenado conforme se agregan mas bots.
const BOT_ID = 'bot_pme_hvac';

const AGREGACION_OPCIONES = [
  { id: 'hora', label: 'Por hora' },
  { id: 'dia', label: 'Por día' }
];

const BotPmeHvacCard = ({ bot, logs = [], isSelected, onSelectView, onStart, onStop, socket }) => {
  const isRunning = bot?.status === 'running';
  const [diasHistorico, setDiasHistorico] = useState(3);
  const [agregacion, setAgregacion] = useState('hora');
  // Solo lectura aqui: la alerta de consumo (horario/destinatarios/mensaje) se
  // configura de forma centralizada en el Bot Master PME > Configuracion & Credenciales.
  const [alertaConsumo, setAlertaConsumo] = useState({ activo: false, hora_inicio: '23:00', hora_fin: '06:00' });
  const [showConfig, setShowConfig] = useState(false);
  const [showDesconectados, setShowDesconectados] = useState(false);
  const [sedesAlerta, setSedesAlerta] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statusTxt, setStatusTxt] = useState('Detenido');
  // Descarga puntual de un rango FIJO (backfill) - separada del intervalo
  // movil de arriba, no se guarda en la config recurrente del bot.
  const [fechaInicioFija, setFechaInicioFija] = useState('');
  const [fechaFinFija, setFechaFinFija] = useState('');
  // Que rango fijo esta corriendo AHORA MISMO (o null si la corrida activa
  // es del intervalo normal) - solo para mostrarlo en la tarjeta mientras
  // dura esta corrida puntual; se limpia sola al terminar.
  const [rangoFijoActivo, setRangoFijoActivo] = useState(null);

  // Mismo protocolo de eventos que el resto de bots del dashboard
  // ({type:'status_val', key:'progress'|'status_txt', value:...})
  useEffect(() => {
    let nuevoProgress, nuevoStatus;
    logs.forEach(l => {
      if (l.type === 'status_val' && l.key === 'progress') nuevoProgress = l.value;
      if (l.type === 'status_val' && l.key === 'status_txt') nuevoStatus = l.value;
    });
    if (nuevoProgress !== undefined) setProgress(nuevoProgress);
    if (nuevoStatus !== undefined) setStatusTxt(nuevoStatus);
  }, [logs]);

  useEffect(() => {
    if (!isRunning) {
      setStatusTxt('Detenido');
      setRangoFijoActivo(null);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('get_bot_config', BOT_ID);

    const handleConfig = (d) => {
      if (d.id === BOT_ID && d.config) {
        setDiasHistorico(d.config.dias_historico || 3);
        setAgregacion(d.config.agregacion || 'hora');
        if (d.config.alerta_consumo) setAlertaConsumo(prev => ({ ...prev, ...d.config.alerta_consumo }));
      }
    };
    socket.on('bot_config', handleConfig);
    return () => socket.off('bot_config', handleConfig);
  }, [socket]);

  const [lastRun, setLastRun] = useState(null);
  useEffect(() => {
    if (!socket) return;
    socket.emit('get_last_run_stats');
    const handleStats = (stats) => {
      if (stats && stats[BOT_ID]) setLastRun(stats[BOT_ID]);
    };
    socket.on('last_run_stats', handleStats);
    return () => socket.off('last_run_stats', handleStats);
  }, [socket]);

  const cargarAlertas = () => {
    const backendBaseUrl = window.location.origin.replace('5173', '3001');
    fetch(`${backendBaseUrl}/api/pme/estado-medidores?servicio=HVAC`)
      .then(r => r.json())
      .then(d => setSedesAlerta(d.success ? d.data : []))
      .catch(() => {});
  };

  // Carga inicial y cada vez que el bot termina de correr (running -> stopped)
  useEffect(() => { cargarAlertas(); }, []);
  useEffect(() => {
    if (!isRunning) cargarAlertas();
  }, [isRunning]);

  const guardarConfig = (cambios) => {
    const nuevo = { dias_historico: diasHistorico, agregacion, alerta_consumo: alertaConsumo, ...cambios };
    setDiasHistorico(nuevo.dias_historico);
    setAgregacion(nuevo.agregacion);
    if (socket) {
      socket.emit('save_bot_config', { botId: BOT_ID, config: nuevo });
    }
  };

  const descargarRangoFijo = () => {
    if (!fechaInicioFija || !fechaFinFija || !socket) return;
    const tInicio = new Date(fechaInicioFija).getTime();
    const tFin = new Date(fechaFinFija).getTime();
    if (isNaN(tInicio) || isNaN(tFin)) {
      window.alert('Por favor, ingresa fechas válidas (año de 4 dígitos, ej: 2026).');
      return;
    }
    if (tInicio > tFin) {
      window.alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }
    socket.emit('start_bot_rango_fijo', { botId: BOT_ID, fecha_inicio: fechaInicioFija, fecha_fin: fechaFinFija });
    setRangoFijoActivo({ inicio: fechaInicioFija, fin: fechaFinFija });
    setShowConfig(false);
  };

  const agregacionLabel = AGREGACION_OPCIONES.find(o => o.id === agregacion)?.label || 'Por hora';

  return (
    <div
      style={{
        padding: '1.2rem',
        borderRadius: '10px',
        border: isSelected ? '1px solid #3b82f6' : (isRunning ? '1px solid #22c55e' : '1px solid #222'),
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : '#0a0d14',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Snowflake size={16} color="#38bdf8" />
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>1. Bot Consolidado HVAC</h4>
          <RunningBot isRunning={isRunning} size={18} />
        </div>
        <span style={{
          fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
          backgroundColor: isRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          color: isRunning ? '#4ade80' : '#888',
          border: isRunning ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #333'
        }}>
          {isRunning ? '🟢 En Ejecución' : '⚪ Listo'}
        </span>
      </div>

      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, lineHeight: 1.3 }}>
        Extrae el histórico de climatización (HVAC) de las 55 sedes y lo consolida en Supabase.
      </p>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.72rem' }}>
          <span style={{ color: '#94a3b8' }}>{statusTxt}</span>
          <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
            borderRadius: '999px',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
          }} />
        </div>
      </div>

      {!isRunning && lastRun && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.72rem', color: '#94a3b8',
          padding: '0.35rem 0.55rem', borderRadius: '6px',
          backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #1f2430'
        }}>
          <span>Terminó: <strong style={{ color: '#e2e8f0' }}>{lastRun.time || '—'}</strong></span>
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{lastRun.records ? Number(lastRun.records).toLocaleString() : '0'} registros</span>
        </div>
      )}

      {sedesAlerta.length > 0 && (
        <button
          onClick={() => setShowDesconectados(true)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.75rem', textAlign: 'left',
            color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px', padding: '0.5rem 0.6rem', cursor: 'pointer', width: '100%'
          }}
        >
          <Gauge size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            <strong>{sedesAlerta.filter(s => !s.ultima_fecha_con_datos).length} nunca reportaron</strong>
            {' · '}
            <strong>{sedesAlerta.filter(s => s.ultima_fecha_con_datos).length} dejaron de reportar</strong>
            {' '}— ambos requieren revisión, clic para ver detalle
          </span>
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#64748b', flexWrap: 'wrap' }}>
        {isRunning && rangoFijoActivo ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.5rem',
            borderRadius: '999px', background: 'rgba(56,189,248,0.12)', border: '1px solid #38bdf855', color: '#7dd3fc', fontWeight: 700
          }}>
            📅 Descargando rango fijo: {rangoFijoActivo.inicio} a {rangoFijoActivo.fin}
          </span>
        ) : (
          <>
            <span>Intervalo: <strong style={{ color: '#38bdf8' }}>{diasHistorico} días</strong></span>
            <span>· Agregación: <strong style={{ color: '#38bdf8' }}>{agregacionLabel}</strong></span>
          </>
        )}
        {alertaConsumo.activo && (
          <span title="Configurado en Bot Master PME > Configuración & Credenciales">
            · <Bell size={11} style={{ verticalAlign: 'middle' }} color="#fbbf24" /> <strong style={{ color: '#fbbf24' }}>{alertaConsumo.hora_inicio}-{alertaConsumo.hora_fin}</strong>
          </span>
        )}
        <button
          onClick={() => setShowConfig(true)}
          title="Configurar intervalo y agregación"
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', padding: '2px' }}
        >
          <Settings size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
        <button
          onClick={onSelectView}
          style={{
            flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #333',
            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : '#12151e',
            color: isSelected ? '#60a5fa' : '#ccc', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
          }}
        >
          {isSelected ? '👁️ Viendo Consola' : 'Ver Logs'}
        </button>

        <button
          onClick={() => isRunning ? onStop(BOT_ID) : onStart(BOT_ID, 'manual')}
          style={{
            padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none',
            backgroundColor: isRunning ? '#ef4444' : '#22c55e', color: '#fff',
            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
          }}
        >
          {isRunning ? 'Detener' : 'Ejecutar'}
        </button>
      </div>

      {showConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>Descarga de datos</h4>
              <button onClick={() => setShowConfig(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                Intervalo de tiempo
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[3, 7, 15].map(d => (
                  <button
                    key={d}
                    onClick={() => guardarConfig({ dias_historico: d })}
                    style={{
                      flex: 1, padding: '0.6rem', borderRadius: '8px',
                      border: diasHistorico === d ? '1px solid #22c55e' : '1px solid #475569',
                      background: diasHistorico === d ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                      color: diasHistorico === d ? '#4ade80' : '#cbd5e1',
                      fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Últimos {d} días
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                Agregación
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {AGREGACION_OPCIONES.map(op => (
                  <button
                    key={op.id}
                    onClick={() => guardarConfig({ agregacion: op.id })}
                    style={{
                      flex: 1, padding: '0.6rem', borderRadius: '8px',
                      border: agregacion === op.id ? '1px solid #22c55e' : '1px solid #475569',
                      background: agregacion === op.id ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                      color: agregacion === op.id ? '#4ade80' : '#cbd5e1',
                      fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>
                Mismas opciones que "Configuración del gadget → Periodo de visualización" en PME.
                No se incluye "Por día de la semana" porque agrupa datos de varias semanas en un solo punto
                y no encaja en el historial por fecha/hora que guardamos.
              </p>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                Descarga puntual de un rango fijo
              </label>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 0, marginBottom: '0.6rem' }}>
                Para rellenar un período histórico específico (ej. comparar julio-agosto) que el intervalo móvil de
                arriba nunca cubrió. Es una corrida única — no cambia el intervalo configurado.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Fecha inicio</label>
                  <input
                    type="date" value={fechaInicioFija} onChange={e => setFechaInicioFija(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#cbd5e1', fontSize: '0.8rem' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Fecha fin</label>
                  <input
                    type="date" value={fechaFinFija} onChange={e => setFechaFinFija(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#cbd5e1', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
              <button
                onClick={descargarRangoFijo}
                disabled={isRunning || !fechaInicioFija || !fechaFinFija}
                style={{
                  width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #38bdf855',
                  background: 'rgba(56,189,248,0.1)', color: (isRunning || !fechaInicioFija || !fechaFinFija) ? '#475569' : '#7dd3fc',
                  fontWeight: 700, cursor: (isRunning || !fechaInicioFija || !fechaFinFija) ? 'default' : 'pointer', fontSize: '0.8rem'
                }}
              >
                Descargar este rango
              </button>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <Bell size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
                La alerta de "consumo fuera de horario" (horario, línea base, destinatarios y mensaje) se configura de forma centralizada para las 4 especialidades en <strong style={{ color: '#cbd5e1' }}>Bot Master PME → ⚙️ Configuración &amp; Credenciales</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {showDesconectados && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
          <div style={{ width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Gauge size={16} color="#fca5a5" /> Medidores sin datos ({sedesAlerta.length})
              </h4>
              <button onClick={() => setShowDesconectados(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.75rem' }}>
              PME no devolvió ningún registro reciente para estas sedes — posible medidor desconectado o que requiera mantenimiento.
            </p>

            <a
              href={`${window.location.origin.replace('5173', '3001')}/api/pme/excel-medidores?servicio=HVAC`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.55rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a',
                color: '#60a5fa', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', marginBottom: '1rem'
              }}
            >
              <Download size={14} /> Descargar Excel (detalle + plan de acción)
            </a>

            {['Nunca reportaron', 'Dejaron de reportar'].map((titulo, idx) => {
              const grupo = sedesAlerta.filter(s => idx === 0 ? !s.ultima_fecha_con_datos : s.ultima_fecha_con_datos);
              if (grupo.length === 0) return null;
              return (
                <div key={titulo} style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                    {titulo} ({grupo.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {grupo.map((s, i) => (
                      <div key={i} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>{s.sede}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>Medidor: {s.medidor_nombre || `${s.sede} - HVAC`}</div>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                          Última fecha con datos: {s.ultima_fecha_con_datos || 'nunca reportó'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BotPmeHvacCard;
