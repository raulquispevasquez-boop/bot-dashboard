import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ComposedChart, XAxis, YAxis, CartesianGrid, Brush, Scatter, ResponsiveContainer,
  useXAxisScale, useYAxisScale, usePlotArea,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

// Paleta categórica por bot (distinta de los colores de estado verde/rojo/ámbar,
// que ya están reservados en esta misma página para éxito/fallo/en curso).
const BOT_COLORS = {
  bot_st_msp: '#3b82f6',
  bot_st_fracttal: '#a78bfa',
  bot_ot_fracttal: '#06b6d4',
  bot_invitaciones_msp: '#f97316',
  bot_senamhi_spsa: '#ec4899',
  bot_clima_spsa: '#14b8a6',
};
const COLOR_FALLBACK = '#9ca3af';

// Etiqueta corta para el nombre vertical sobre cada barra (el nombre completo
// va en la leyenda de arriba; aquí solo se necesita identificar a simple vista).
const BOT_LABEL_CORTO = {
  bot_st_msp: 'ST MSP',
  bot_st_fracttal: 'ST Fracttal',
  bot_ot_fracttal: 'OT Fracttal',
  bot_invitaciones_msp: 'Invitaciones',
  bot_senamhi_spsa: 'SENAMHI',
  bot_clima_spsa: 'Open-Meteo',
};

const TIPO_ESCRITURA_LABEL = {
  destructiva: 'Sobrescribe todo (TRUNCATE + upsert)',
  incremental: 'Actualiza solo lo faltante (upsert)',
};

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
];

// Ancho fijo de barra por preset (más ancho cuando hay menos puntos por ver,
// más angosto cuando la ventana es grande y puede haber muchas corridas juntas).
const ANCHO_BARRA = { hoy: 16, semana: 11, mes: 7, anio: 4 };

const rangoDePreset = (preset) => {
  const ahora = new Date();
  if (preset === 'hoy') {
    const inicio = new Date(ahora); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(ahora); fin.setHours(23, 59, 59, 999);
    return [inicio.getTime(), fin.getTime()];
  }
  const fin = ahora.getTime();
  if (preset === 'semana') return [fin - 7 * 24 * 3600 * 1000, fin];
  if (preset === 'mes') return [fin - 30 * 24 * 3600 * 1000, fin];
  if (preset === 'anio') return [fin - 365 * 24 * 3600 * 1000, fin];
  return ['dataMin', 'dataMax'];
};

// El eje X ahora usa ticks explícitos ubicados en los momentos reales donde
// hubo actividad (ver ticksDeActividad más abajo), no en marcas genéricas
// parejas — por eso la hora siempre va en la etiqueta, sin importar el
// preset/intervalo elegido, para saber exactamente A QUÉ HORA fue cada corrida.
const fmtEjeX = (preset) => (v) => {
  const d = new Date(v);
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (preset === 'hoy') return hora;
  if (preset === 'semana') return `${d.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '')} ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })} ${hora}`;
};

const fmtFecha = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtFechaHora = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDuracion = (seg) => {
  if (seg == null) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// Convierte cada corrida en un punto (ts, pct). Corridas "en_curso" recientes
// (probablemente aún ejecutándose) se omiten del gráfico; una "en_curso" vieja
// (proceso que se cortó sin cerrar el registro) se grafica como interrumpida.
const HORAS_PARA_CONSIDERAR_HUERFANA = 3;

const calcularPunto = (row) => {
  if (row.estado === 'exito') return { pct: 100, interrumpido: false };
  if (row.estado === 'fallo') return { pct: 0, interrumpido: false };
  if (row.estado === 'detenido_manual') return { pct: 50, interrumpido: true };
  if (row.estado === 'en_curso') {
    const horasDesdeInicio = (Date.now() - new Date(row.hora_inicio).getTime()) / 3600000;
    if (horasDesdeInicio < HORAS_PARA_CONSIDERAR_HUERFANA) return null; // probablemente sigue corriendo, aún no hay veredicto
    return { pct: 50, interrumpido: true };
  }
  return null;
};

const rectRedondeado = (x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h);
  return `M ${x},${y + h} L ${x},${y + rr} Q ${x},${y} ${x + rr},${y}
          L ${x + w - rr},${y} Q ${x + w},${y} ${x + w},${y + rr} L ${x + w},${y + h} Z`;
};

// Capa de barras dibujada con las escalas REALES del chart (useXAxisScale /
// useYAxisScale, recharts 3.x). <Bar> asume un eje de categorías (bandScale)
// y con un eje X numérico + series independientes por bot termina calculando
// ancho/alto en 0; por eso las barras se dibujan a mano con las escalas.
const CapaBarras = ({ seriesPorBot, botsPresentes, anchoBarra, onHover }) => {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();
  if (!xScale || !yScale || !plotArea) return null;
  const yBase = yScale(0);
  if (yBase == null) return null;

  // Posición cruda (sin separar) de cada barra en píxeles.
  const crudas = [];
  botsPresentes.forEach((botId) => {
    (seriesPorBot[botId] || []).forEach((punto, i) => {
      const cx = xScale(punto.ts);
      if (cx == null) return;
      crudas.push({ botId, punto, cx, key: `${botId}-${punto.ts}-${i}` });
    });
  });
  crudas.sort((a, b) => a.cx - b.cx);

  // Barras que caerían pegadas o encimadas (a menos de un ancho de barra de
  // distancia) se agrupan en un "cluster" y se reparten lado a lado, en vez
  // de dibujarse todas en el mismo píxel.
  const clusters = [];
  let actual = [];
  crudas.forEach((item) => {
    if (actual.length === 0 || item.cx - actual[actual.length - 1].cx < anchoBarra) {
      actual.push(item);
    } else {
      clusters.push(actual);
      actual = [item];
    }
  });
  if (actual.length) clusters.push(actual);

  const posiciones = [];
  clusters.forEach((cluster) => {
    const centro = cluster.reduce((s, it) => s + it.cx, 0) / cluster.length;
    const n = cluster.length;
    cluster.forEach((item, idx) => {
      posiciones.push({ ...item, cxFinal: centro - (n * anchoBarra) / 2 + idx * anchoBarra + anchoBarra / 2 });
    });
  });

  // El reparto de arriba centra cada cluster por separado, pero dos clusters
  // vecinos pueden terminar con sus bordes encimados (ej. el último de uno
  // muy cerca del primero del siguiente). Pasada final: fuerza el espaciado
  // mínimo de izquierda a derecha sobre TODAS las posiciones ya repartidas.
  posiciones.sort((a, b) => a.cxFinal - b.cxFinal);
  for (let i = 1; i < posiciones.length; i++) {
    if (posiciones[i].cxFinal - posiciones[i - 1].cxFinal < anchoBarra) {
      posiciones[i].cxFinal = posiciones[i - 1].cxFinal + anchoBarra;
    }
  }

  return (
    <g>
      {posiciones.map(({ botId, punto, cxFinal, key }) => {
        const cyTop = yScale(punto.pct);
        if (cyTop == null) return null;
        const w = anchoBarra;
        const h = Math.max(yBase - cyTop, 2);
        const color = BOT_COLORS[botId] || COLOR_FALLBACK;
        const etiqueta = BOT_LABEL_CORTO[botId] || botId;
        const hora = new Date(punto.hora_inicio).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        const cyCentro = cyTop + h / 2;
        return (
          <g key={key}>
            <path
              className="barra-actividad"
              d={rectRedondeado(cxFinal - w / 2, cyTop, w, h, 3)}
              fill={color}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => onHover(punto, e)}
              onMouseMove={(e) => onHover(punto, e)}
              onMouseLeave={() => onHover(null)}
            />
            {/* Etiqueta vertical centrada en la barra — nombre en gris claro y
                hora en blanco puro (más grande), ninguno usa el color de la
                barra para que nunca se mimetice con su propio fondo. */}
            <text
              x={cxFinal} y={cyCentro}
              transform={`rotate(-90, ${cxFinal}, ${cyCentro})`}
              textAnchor="middle" dominantBaseline="middle" fontWeight={600}
              style={{ pointerEvents: 'none' }}
            >
              <tspan fontSize={9} fill="#e5e7eb">{etiqueta} </tspan>
              <tspan fontSize={10} fill="#ffffff">{hora}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
};

// Línea base neón (punteada) a la altura del 100% — el objetivo que cada
// corrida debería alcanzar. Usa usePlotArea() para saber dónde empieza y
// termina el área de trazado (ancho real del gráfico).
const LineaBase100 = () => {
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();
  if (!yScale || !plotArea) return null;
  const y100 = yScale(100);
  if (y100 == null) return null;
  return (
    <g>
      {/* filterUnits="userSpaceOnUse" + región explícita: una línea horizontal
          (y1===y2) tiene alto de bounding-box 0, así que el % por defecto de
          un <filter> ("objectBoundingBox") colapsa la región y el glow no
          se ve — hay que darle una región absoluta con espacio real. */}
      <defs>
        <filter id="neonGlow100" filterUnits="userSpaceOnUse"
          x={plotArea.x - 20} y={y100 - 20} width={plotArea.width + 40} height={40}>
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line
        x1={plotArea.x} x2={plotArea.x + plotArea.width} y1={y100} y2={y100}
        stroke="#22ffe6" strokeWidth={1.75} strokeDasharray="9 6"
        filter="url(#neonGlow100)" opacity={0.95}
      />
    </g>
  );
};

const TooltipFlotante = ({ hover }) => {
  if (!hover) return null;
  const { punto, clientX, clientY } = hover;
  const ANCHO_EST = 280;
  const ALTO_EST = 210;
  const left = clientX + 14 + ANCHO_EST > window.innerWidth ? clientX - ANCHO_EST - 14 : clientX + 14;
  const top = clientY + 14 + ALTO_EST > window.innerHeight ? clientY - ALTO_EST - 14 : clientY + 14;
  // Portal directo a <body>: si se renderiza dentro del árbol normal, un
  // ancestro con overflow/transform (tarjetas con bordes redondeados, el
  // bloque arrastrable, etc.) puede recortar un position:fixed aunque tenga
  // z-index alto — por eso el tooltip se veía cortado contra el siguiente bloque.
  return createPortal(
    <div style={{
      position: 'fixed', left, top, zIndex: 999999, pointerEvents: 'none',
      background: '#181b26', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px',
      padding: '0.75rem 0.9rem', fontSize: '0.75rem', color: '#ddd', maxWidth: '260px',
      boxShadow: '0 12px 28px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: punto.color, display: 'inline-block' }} />
        {punto.botNombre}
      </div>
      <div style={{ color: punto.interrumpido ? '#eab308' : (punto.pct === 100 ? '#22c55e' : '#ef4444'), fontWeight: 600, marginBottom: '0.4rem' }}>
        {punto.interrumpido ? `Interrumpido (~${punto.pct}%, sin avance exacto registrado)` : (punto.pct === 100 ? 'Éxito (100%)' : 'Falló (0%)')}
      </div>
      <div>Inicio: {fmtFechaHora(punto.hora_inicio)}</div>
      <div>Rango de datos: {fmtFecha(punto.fecha_datos_desde)} → {fmtFecha(punto.fecha_datos_hasta)}</div>
      <div>Duración: {fmtDuracion(punto.duracion_seg)}</div>
      <div>Registros: {punto.registros_procesados != null ? punto.registros_procesados.toLocaleString() : '—'}</div>
      <div>Escritura: {TIPO_ESCRITURA_LABEL[punto.tipo_escritura] || punto.tipo_escritura || '—'}</div>
    </div>,
    document.body
  );
};

const ActividadTimeline = ({ rows, botNombres }) => {
  const { seriesPorBot, unionParaBrush, botsPresentes } = useMemo(() => {
    const porBot = {};
    const union = [];
    for (const r of rows) {
      const calc = calcularPunto(r);
      if (!calc) continue;
      const ts = new Date(r.hora_inicio).getTime();
      if (Number.isNaN(ts)) continue;
      const color = BOT_COLORS[r.bot_id] || COLOR_FALLBACK;
      const punto = {
        ts, pct: calc.pct, interrumpido: calc.interrumpido, color,
        botId: r.bot_id, botNombre: botNombres[r.bot_id] || r.bot_nombre || r.bot_id,
        hora_inicio: r.hora_inicio, fecha_datos_desde: r.fecha_datos_desde, fecha_datos_hasta: r.fecha_datos_hasta,
        duracion_seg: r.duracion_seg, registros_procesados: r.registros_procesados, tipo_escritura: r.tipo_escritura,
      };
      if (!porBot[r.bot_id]) porBot[r.bot_id] = [];
      porBot[r.bot_id].push(punto);
      union.push(punto);
    }
    Object.values(porBot).forEach(arr => arr.sort((a, b) => a.ts - b.ts));
    union.sort((a, b) => a.ts - b.ts);
    return { seriesPorBot: porBot, unionParaBrush: union, botsPresentes: Object.keys(porBot) };
  }, [rows, botNombres]);

  // Rango visible: por defecto, el preset elegido (Hoy por defecto). Si el
  // usuario arrastra la franja de zoom manualmente, ese arrastre manda hasta
  // que se elige otro preset.
  const [preset, setPreset] = useState('hoy');
  const [rangoIndices, setRangoIndices] = useState(null); // [startIndex, endIndex] sobre unionParaBrush
  const [hover, setHover] = useState(null);

  useEffect(() => { setRangoIndices(null); }, [unionParaBrush.length]);

  const dominioX = useMemo(() => {
    if (rangoIndices) {
      const [i0, i1] = rangoIndices;
      const desde = unionParaBrush[Math.max(0, Math.min(i0, i1))]?.ts;
      const hasta = unionParaBrush[Math.min(unionParaBrush.length - 1, Math.max(i0, i1))]?.ts;
      if (desde != null && hasta != null) return [desde, hasta];
    }
    return rangoDePreset(preset);
  }, [rangoIndices, preset, unionParaBrush]);

  const formateadorEje = fmtEjeX(rangoIndices ? 'custom' : preset);

  // Ticks explícitos del eje X: en vez de marcas parejas genéricas (que caen
  // en horas donde no pasó nada), se ubican en los momentos REALES donde
  // hubo actividad — agrupando corridas casi simultáneas (mismo disparo de
  // cascada) en un solo tick para no amontonar etiquetas encimadas.
  const ticksDeActividad = useMemo(() => {
    const [d0, d1] = dominioX;
    if (typeof d0 !== 'number' || typeof d1 !== 'number') return undefined;
    const visibles = unionParaBrush.filter((p) => p.ts >= d0 && p.ts <= d1);
    if (!visibles.length) return undefined;
    const umbral = Math.max((d1 - d0) / 100, 60000); // agrupa lo que caiga a <1% del rango visible (mínimo 1 min)
    const grupos = [];
    let actual = [visibles[0]];
    for (let i = 1; i < visibles.length; i++) {
      if (visibles[i].ts - actual[actual.length - 1].ts < umbral) actual.push(visibles[i]);
      else { grupos.push(actual); actual = [visibles[i]]; }
    }
    grupos.push(actual);
    return grupos.map((g) => Math.round(g.reduce((s, p) => s + p.ts, 0) / g.length));
  }, [unionParaBrush, dominioX]);

  const seleccionarPreset = (key) => {
    setPreset(key);
    setRangoIndices(null);
  };

  const manejarHover = (punto, e) => {
    if (!punto) { setHover(null); return; }
    setHover({ punto, clientX: e.clientX, clientY: e.clientY });
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
      borderRadius: '10px', padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={16} color="#3b82f6" />
          <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#fff' }}>Actividad en el tiempo</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {PRESETS.map((p) => {
            const activo = preset === p.key && !rangoIndices;
            return (
              <button
                key={p.key}
                onClick={() => seleccionarPreset(p.key)}
                style={{
                  padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: activo ? '1px solid #3b82f6' : '1px solid var(--panel-border)',
                  background: activo ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                  color: activo ? '#60a5fa' : '#9ca3af',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        Cada barra es una corrida real (100% = éxito, 0% = falló, ~50% = se interrumpió sin cerrar bien). La línea punteada marca el 100% que cada corrida debería alcanzar. Arrastra la franja inferior para hacer zoom.
      </p>

      {/* Leyenda propia (colores por bot, siempre icono + etiqueta) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginBottom: '0.5rem' }}>
        {botsPresentes.map((botId) => (
          <div key={botId} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#ccc' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: BOT_COLORS[botId] || COLOR_FALLBACK, display: 'inline-block' }} />
            {botNombres[botId] || botId}
          </div>
        ))}
      </div>

      {unionParaBrush.length === 0 ? (
        <div style={{ color: '#555', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>
          Sin corridas concluidas todavía para graficar.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={unionParaBrush} margin={{ top: 16, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="ts" type="number" domain={dominioX} allowDataOverflow
              ticks={ticksDeActividad}
              tickFormatter={formateadorEje} tick={{ fontSize: 11, fill: '#9ca3af' }}
              stroke="rgba(255,255,255,0.15)"
            />
            <YAxis
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: '#9ca3af' }} stroke="rgba(255,255,255,0.15)" width={40}
            />
            {/* Ancla invisible: obliga a recharts a registrar la escala real
                de los ejes (sin ningún <Bar>/<Line>/<Scatter> visible, los
                hooks useXAxisScale/useYAxisScale no tienen de dónde leer). */}
            <Scatter data={unionParaBrush} dataKey="pct" shape={() => null} legendType="none" isAnimationActive={false} />
            <LineaBase100 />
            <CapaBarras
              seriesPorBot={seriesPorBot} botsPresentes={botsPresentes}
              anchoBarra={ANCHO_BARRA[preset] || 8} onHover={manejarHover}
            />
            <Brush
              dataKey="ts" height={22} travellerWidth={8}
              stroke="#3b82f6" fill="rgba(59,130,246,0.08)"
              tickFormatter={fmtEjeX('mes')}
              onChange={(range) => setRangoIndices([range.startIndex, range.endIndex])}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <TooltipFlotante hover={hover} />
    </div>
  );
};

export default ActividadTimeline;
