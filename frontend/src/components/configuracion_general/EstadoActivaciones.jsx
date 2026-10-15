import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, ListChecks, CheckCircle2, XCircle, Clock, Cpu, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import ActividadTimeline from './ActividadTimeline';

const BLOQUES_DEFAULT = ['indicadores', 'barras_por_bot', 'actividad_tiempo', 'historial'];
const BLOQUE_ORDER_KEY = 'estado_activaciones_block_order';

const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1'
);
const BACKEND = isLocal
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

// Colores de estado (reutiliza los que ya usa el resto de la app: verde/rojo/
// ambar para exito/fallo/en curso — no se inventa una paleta nueva).
const ESTADO_COLOR = {
  exito: '#22c55e',
  fallo: '#ef4444',
  en_curso: '#eab308',
  detenido_manual: '#6b7280',
};
const ESTADO_LABEL = {
  exito: 'Éxito',
  fallo: 'Fallo',
  en_curso: 'En curso',
  detenido_manual: 'Detenido manual',
};
const ESTADO_ICON = {
  exito: CheckCircle2,
  fallo: XCircle,
  en_curso: Clock,
  detenido_manual: XCircle,
};

const BOT_NOMBRES = {
  bot_st_msp: 'Bot ST MSP',
  bot_st_fracttal: 'Bot ST Fracttal',
  bot_ot_fracttal: 'Bot OT Fracttal',
  bot_invitaciones_msp: 'Bot Invitaciones MSP',
  bot_senamhi_spsa: 'Bot SENAMHI V1.0',
  bot_clima_spsa: 'Bot Open-Meteo V1.0',
};

const fmtDuracion = (seg) => {
  if (seg == null) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const fmtHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// ── Tarjeta de indicador (mismo look que las KPI cards de Agente Correo) ──
const StatTile = ({ icon, label, value, sub, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
    borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color }}>
      {icon}
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{sub}</div>}
  </div>
);

// ── Barra horizontal apilada: corridas por bot, coloreadas por estado ──
const BarrasPorBot = ({ porBot }) => {
  const [hover, setHover] = useState(null); // { botId, estado }
  const maxTotal = Math.max(1, ...porBot.map(b => b.total));

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
      borderRadius: '10px', padding: '1.25rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#fff' }}>Corridas por bot</h3>
        {/* Leyenda: color nunca solo — siempre icono + etiqueta */}
        <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {Object.keys(ESTADO_COLOR).map(estado => (
            <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ESTADO_COLOR[estado], display: 'inline-block' }} />
              {ESTADO_LABEL[estado]}
            </div>
          ))}
        </div>
      </div>

      {porBot.length === 0 ? (
        <div style={{ color: '#555', fontSize: '0.8rem', padding: '1rem 0' }}>Sin corridas registradas todavía.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {porBot.map(b => (
            <div key={b.botId} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 46px', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {BOT_NOMBRES[b.botId] || b.botId}
              </span>
              <div style={{ position: 'relative', height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '7px', overflow: 'hidden', display: 'flex' }}>
                {Object.keys(ESTADO_COLOR).map(estado => {
                  const cant = b.porEstado[estado] || 0;
                  if (cant === 0) return null;
                  const widthPct = (cant / maxTotal) * 100;
                  const isHover = hover && hover.botId === b.botId && hover.estado === estado;
                  return (
                    <div
                      key={estado}
                      onMouseEnter={() => setHover({ botId: b.botId, estado })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        width: `${widthPct}%`, height: '100%', background: ESTADO_COLOR[estado],
                        borderRight: '2px solid var(--bg-color)', cursor: 'default',
                        filter: isHover ? 'brightness(1.25)' : 'none', transition: 'filter 0.15s',
                        position: 'relative'
                      }}
                      title={`${ESTADO_LABEL[estado]}: ${cant}`}
                    />
                  );
                })}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {b.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EstadoBadge = ({ estado }) => {
  const Icon = ESTADO_ICON[estado] || Clock;
  const color = ESTADO_COLOR[estado] || '#888';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '0.7rem', fontWeight: 600, color,
      background: `${color}18`, border: `1px solid ${color}55`,
      padding: '0.15rem 0.5rem', borderRadius: '20px', whiteSpace: 'nowrap'
    }}>
      <Icon size={11} /> {ESTADO_LABEL[estado] || estado}
    </span>
  );
};

const OrigenBadge = ({ origen }) => (
  <span style={{
    fontSize: '0.68rem', color: origen === 'master' ? '#3b82f6' : '#a78bfa',
    background: origen === 'master' ? '#3b82f622' : '#a78bfa22',
    padding: '0.1rem 0.45rem', borderRadius: '10px', fontWeight: 600
  }}>
    {origen === 'master' ? 'Master' : 'Individual'}
  </span>
);

const FilaActivacion = ({ row }) => {
  const [abierto, setAbierto] = useState(false);
  const tieneDetalle = row.estado === 'fallo' && (row.error_causa_raiz || row.error_mensaje);

  return (
    <>
      <tr
        onClick={() => tieneDetalle && setAbierto(!abierto)}
        style={{ cursor: tieneDetalle ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <td style={{ padding: '0.55rem 0.6rem', width: '20px' }}>
          {tieneDetalle && (abierto ? <ChevronDown size={14} color="#888" /> : <ChevronRight size={14} color="#888" />)}
        </td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.78rem', color: '#ddd' }}>
          {BOT_NOMBRES[row.bot_id] || row.bot_nombre || row.bot_id}
        </td>
        <td style={{ padding: '0.55rem 0.6rem' }}><OrigenBadge origen={row.origen} /></td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {row.modo_ejecucion === 'autopilot' ? 'Autopiloto' : 'Manual'}
        </td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtHora(row.hora_inicio)}
        </td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtDuracion(row.duracion_seg)}
        </td>
        <td style={{ padding: '0.55rem 0.6rem' }}><EstadoBadge estado={row.estado} /></td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: '#22c55e', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {row.registros_procesados != null ? row.registros_procesados.toLocaleString() : '—'}
        </td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          {row.tipo_escritura || '—'}
        </td>
        <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {row.ram_mb_pico != null ? `${row.ram_mb_pico} MB` : '—'}
        </td>
      </tr>
      {abierto && tieneDetalle && (
        <tr style={{ background: 'rgba(239,68,68,0.05)' }}>
          <td colSpan={10} style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '0.2rem' }}>Causa raíz</div>
                <div style={{ color: '#ccc' }}>{row.error_causa_raiz || row.error_mensaje}</div>
              </div>
              <div>
                <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: '0.2rem' }}>Solución sugerida</div>
                <div style={{ color: '#ccc' }}>{row.error_solucion || '—'}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ── Bloque arrastrable estilo Trello (mismo patrón ya usado en Bot Master
// Climático para reordenar tarjetas): toda la sección se puede tomar y
// soltar sobre otra para cambiar el orden vertical de los bloques.
const BloqueArrastrable = ({ id, dragProps, isDragging, children }) => (
  <div
    draggable="true"
    onDragStart={(e) => dragProps.onDragStart(e, id)}
    onDragEnd={dragProps.onDragEnd}
    onDragOver={dragProps.onDragOver}
    onDragEnter={(e) => dragProps.onDragEnter(e, id)}
    onDrop={dragProps.onDrop}
    style={{
      marginBottom: '1.25rem',
      opacity: isDragging ? 0.35 : 1,
      // "none" (no "scale(1)") cuando no se arrastra: cualquier transform
      // declarado, incluso un scale(1) que no cambia nada visualmente,
      // convierte este div en containing block de sus descendientes con
      // position:fixed — eso recortaba el tooltip del gráfico de abajo.
      transform: isDragging ? 'scale(0.98)' : 'none',
      border: '1px dashed transparent',
      borderRadius: '10px',
      transition: 'opacity 0.15s ease, transform 0.15s ease',
    }}
  >
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.4rem',
      color: '#555', fontSize: '0.66rem', cursor: 'grab', userSelect: 'none', width: 'fit-content',
    }}>
      <GripVertical size={12} /> Arrastra para reordenar
    </div>
    {children}
  </div>
);

const EstadoActivaciones = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroBot, setFiltroBot] = useState('todos');

  const cargar = () => {
    setLoading(true);
    setError(null);
    fetch(`${BACKEND}/api/activaciones?limit=2000`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setRows(res.data || []);
        else setError(res.error || 'Error desconocido');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const exitos = rows.filter(r => r.estado === 'exito').length;
    const fallos = rows.filter(r => r.estado === 'fallo').length;
    const cerradas = exitos + fallos;
    const tasaExito = cerradas > 0 ? Math.round((exitos / cerradas) * 100) : null;

    const duraciones = rows.map(r => r.duracion_seg).filter(v => v != null);
    const duracionProm = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null;

    const rams = rows.map(r => r.ram_mb_pico).filter(v => v != null);
    const ramProm = rams.length ? Math.round((rams.reduce((a, b) => a + b, 0) / rams.length) * 10) / 10 : null;

    const porBotMap = {};
    rows.forEach(r => {
      if (!porBotMap[r.bot_id]) porBotMap[r.bot_id] = { botId: r.bot_id, total: 0, porEstado: {} };
      porBotMap[r.bot_id].total += 1;
      porBotMap[r.bot_id].porEstado[r.estado] = (porBotMap[r.bot_id].porEstado[r.estado] || 0) + 1;
    });
    const porBot = Object.values(porBotMap).sort((a, b) => b.total - a.total);

    return { total, exitos, fallos, tasaExito, duracionProm, ramProm, porBot };
  }, [rows]);

  const rowsFiltradas = filtroBot === 'todos' ? rows : rows.filter(r => r.bot_id === filtroBot);
  const botsDisponibles = useMemo(() => [...new Set(rows.map(r => r.bot_id))], [rows]);

  // Orden de los bloques (indicadores / gráficas / tabla), reordenable estilo
  // Trello y persistido para que la próxima visita recuerde el acomodo.
  const [blockOrder, setBlockOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BLOQUE_ORDER_KEY));
      if (Array.isArray(saved) && BLOQUES_DEFAULT.every(b => saved.includes(b)) && saved.length === BLOQUES_DEFAULT.length) {
        return saved;
      }
    } catch { /* ignore */ }
    return BLOQUES_DEFAULT;
  });
  const updateBlockOrder = (newOrder) => {
    setBlockOrder(newOrder);
    localStorage.setItem(BLOQUE_ORDER_KEY, JSON.stringify(newOrder));
  };
  const [draggedBlock, setDraggedBlock] = useState(null);
  const dragProps = {
    onDragStart: (e, id) => {
      e.dataTransfer.setData('text/plain', id);
      setTimeout(() => setDraggedBlock(id), 0);
    },
    onDragEnd: () => setDraggedBlock(null),
    onDragOver: (e) => e.preventDefault(),
    onDragEnter: (e, targetId) => {
      e.preventDefault();
      if (!draggedBlock || draggedBlock === targetId) return;
      const newOrder = [...blockOrder];
      const di = newOrder.indexOf(draggedBlock);
      const ti = newOrder.indexOf(targetId);
      newOrder.splice(di, 1);
      newOrder.splice(ti, 0, draggedBlock);
      updateBlockOrder(newOrder);
    },
    onDrop: (e) => { e.preventDefault(); setDraggedBlock(null); },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Seguimiento de arranque, éxito/fallo, duración y recursos de cada corrida — por ahora solo Fracttal-Msp.
        </p>
        <button
          onClick={cargar}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem',
            borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.03)',
            color: '#ccc', cursor: loading ? 'default' : 'pointer', fontSize: '0.75rem'
          }}
        >
          <RefreshCw size={13} className={loading ? 'spin-anim' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444455', borderRadius: '8px', color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
          No se pudo cargar: {error}
        </div>
      )}

      {blockOrder.map((bloqueId) => {
        const isDragging = draggedBlock === bloqueId;

        if (bloqueId === 'indicadores') {
          return (
            <BloqueArrastrable key={bloqueId} id={bloqueId} dragProps={dragProps} isDragging={isDragging}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <StatTile icon={<ListChecks size={16} />} label="Total corridas" value={stats.total} color="#3b82f6" sub={`últimas ${stats.total} registradas`} />
                <StatTile icon={<CheckCircle2 size={16} />} label="% Éxito" value={stats.tasaExito != null ? `${stats.tasaExito}%` : '—'} color="#22c55e" sub={`${stats.exitos} éxito · ${stats.fallos} fallo`} />
                <StatTile icon={<Clock size={16} />} label="Duración promedio" value={fmtDuracion(stats.duracionProm)} color="#eab308" sub="por corrida" />
                <StatTile icon={<Cpu size={16} />} label="RAM promedio pico" value={stats.ramProm != null ? `${stats.ramProm} MB` : '—'} color="#a78bfa" sub="por proceso" />
              </div>
            </BloqueArrastrable>
          );
        }

        if (bloqueId === 'barras_por_bot') {
          return (
            <BloqueArrastrable key={bloqueId} id={bloqueId} dragProps={dragProps} isDragging={isDragging}>
              <BarrasPorBot porBot={stats.porBot} />
            </BloqueArrastrable>
          );
        }

        if (bloqueId === 'actividad_tiempo') {
          return (
            <BloqueArrastrable key={bloqueId} id={bloqueId} dragProps={dragProps} isDragging={isDragging}>
              <ActividadTimeline rows={rows} botNombres={BOT_NOMBRES} />
            </BloqueArrastrable>
          );
        }

        if (bloqueId === 'historial') {
          return (
            <BloqueArrastrable key={bloqueId} id={bloqueId} dragProps={dragProps} isDragging={isDragging}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--panel-border)' }}>
                  <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#fff' }}>Historial de corridas</h3>
                  <select
                    value={filtroBot}
                    onChange={e => setFiltroBot(e.target.value)}
                    style={{ background: '#000', color: '#ccc', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.72rem' }}
                  >
                    <option value="todos">Todos los bots</option>
                    {botsDisponibles.map(id => (
                      <option key={id} value={id}>{BOT_NOMBRES[id] || id}</option>
                    ))}
                  </select>
                </div>

                {loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>Cargando...</div>
                ) : rowsFiltradas.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
                    Sin corridas registradas todavía. Se llena sola cuando corras cualquiera de los bots de Fracttal-Msp.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                          <th></th>
                          <th style={th}>Bot</th>
                          <th style={th}>Origen</th>
                          <th style={th}>Modo</th>
                          <th style={th}>Inicio</th>
                          <th style={th}>Duración</th>
                          <th style={th}>Estado</th>
                          <th style={{ ...th, textAlign: 'right' }}>Registros</th>
                          <th style={th}>Escritura</th>
                          <th style={{ ...th, textAlign: 'right' }}>RAM pico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsFiltradas.map(row => <FilaActivacion key={row.id} row={row} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </BloqueArrastrable>
          );
        }

        return null;
      })}
    </div>
  );
};

const th = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' };

export default EstadoActivaciones;
