import React from 'react';
import { Search, ArrowUp, ArrowDown, RotateCw } from 'lucide-react';

const formatearFecha = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

// Grilla genérica de solo lectura para cualquier tabla de Itlus 2:
// buscador, columnas ordenables (clic en el encabezado), columna de
// numeración + encabezado fijos arriba/izquierda (como Excel) — sin
// paginación con flechitas: se renderizan todas las filas de una vez
// (son tablas chicas) dentro de un único contenedor con su propio scroll
// (alto real vía flex, no un cálculo de viewport) para que no aparezca un
// segundo scroll por fuera.
const CELDA_BASE = { padding: '0.55rem 0.7rem', whiteSpace: 'nowrap', borderBottom: '1px solid #334155' };
const FONDO_HEADER = '#0f172a';
const FONDO_FIJO = '#111827';

const VisorTablaGenerica = ({ titulo, columnas, filas, totalFilas, busqueda, setBusqueda, orden, cambiarOrden, actualizadoEl, refrescar, refrescando, progreso, hayActualizacion }) => {
  const fechaLegible = formatearFecha(actualizadoEl);
  return (
    <div className="bot-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {titulo}
            {hayActualizacion && !refrescando && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, color: '#f87171',
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: '999px', padding: '0.1rem 0.5rem',
              }}>
                ● hay una actualización
              </span>
            )}
          </h3>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
            {filas.length === totalFilas ? `${totalFilas} filas` : `${filas.length} de ${totalFilas} filas`}
            {fechaLegible && <> · copia local, actualizada {fechaLegible}</>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {refrescando && progreso !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '130px' }}>
              <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: '#1e293b', overflow: 'hidden' }}>
                <div style={{
                  width: `${progreso}%`, height: '100%', background: '#38bdf8',
                  borderRadius: '999px', transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.7rem', color: '#93c5fd', fontWeight: 700, width: '2.4rem', textAlign: 'right' }}>
                {progreso}%
              </span>
            </div>
          )}
          <button
            onClick={refrescar}
            disabled={refrescando}
            title="Revisar ahora si la tabla original cambió"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: '1px solid #334155', borderRadius: '6px',
              padding: '0.4rem 0.6rem', color: refrescando ? '#475569' : '#93c5fd',
              fontSize: '0.75rem', fontWeight: 600, cursor: refrescando ? 'default' : 'pointer',
            }}
          >
            <RotateCw size={12} className={refrescando ? 'spin-anim' : undefined} />
            {refrescando ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
          <div style={{ position: 'relative' }}>
          <Search size={13} color="#64748b" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en cualquier columna…"
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
              padding: '0.4rem 0.6rem 0.4rem 1.7rem', color: '#fff', fontSize: '0.78rem', minWidth: '220px',
            }}
          />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #334155', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.76rem' }}>
          <thead>
            <tr>
              <th style={{ ...CELDA_BASE, textAlign: 'right', color: '#64748b', fontWeight: 700, position: 'sticky', top: 0, left: 0, background: FONDO_HEADER, zIndex: 3 }}>
                #
              </th>
              {columnas.map((col) => (
                <th
                  key={col}
                  onClick={() => cambiarOrden(col)}
                  style={{
                    ...CELDA_BASE,
                    textAlign: 'left', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer', userSelect: 'none',
                    position: 'sticky', top: 0, background: FONDO_HEADER, zIndex: 2,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    {col}
                    {orden.columna === col && (orden.direccion === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, fi) => (
              <tr key={fi}>
                <td style={{ ...CELDA_BASE, textAlign: 'right', color: '#64748b', position: 'sticky', left: 0, zIndex: 1, background: FONDO_FIJO }}>
                  {fi + 1}
                </td>
                {columnas.map((col) => (
                  <td key={col} style={{ ...CELDA_BASE, color: '#e2e8f0' }}>
                    {fila[col] === null || fila[col] === undefined ? <span style={{ color: '#475569' }}>—</span> : String(fila[col])}
                  </td>
                ))}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={columnas.length + 1} style={{ ...CELDA_BASE, textAlign: 'center', color: '#64748b' }}>Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VisorTablaGenerica;
