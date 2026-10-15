import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Package, RotateCw } from 'lucide-react';

// Grilla "profesional azul" combinada: muestra equipos de varias sedes a
// la vez (columna "Sede" para distinguir de dónde viene cada fila) o
// resultados de una búsqueda global — encabezado azul fijo, líneas
// horizontales y verticales en cada celda, como una hoja de cálculo.
const AZUL_HEADER = '#1e3a8a';
const AZUL_BORDE = '#3b82f6';
const CELDA = { padding: '0.5rem 0.75rem', border: `1px solid ${AZUL_BORDE}55`, fontSize: '0.78rem' };

// Con el interruptor "Todas" se pueden prender las 515 sedes de golpe
// (30,000+ equipos ya traídos al navegador) — en vez de intentar pintar
// todas las filas de una (pesado), se renderiza de a tandas: arranca en
// INCREMENTO y va sumando INCREMENTO más cada vez que el scroll llega
// cerca del final, como un scroll infinito.
const INCREMENTO = 3000;
const UMBRAL_PX = 300;

// mostrarVacio: true cuando no hay nada prendido/buscado todavía (estado
// inicial) — distinto de "sin resultados" (una búsqueda que no encontró
// nada), que sí muestra la tabla vacía con su propio mensaje.
const TablaEquiposCombinada = ({ filas, etiqueta, mostrarVacio, tituloVacio, onClickActivoGenerico, calculandoActivoGenerico }) => {
  const [limite, setLimite] = useState(INCREMENTO);
  const contenedorRef = useRef(null);

  useEffect(() => { setLimite(INCREMENTO); }, [filas]);

  const manejarScroll = useCallback(() => {
    const el = contenedorRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_PX) {
      setLimite((prev) => (prev < filas.length ? prev + INCREMENTO : prev));
    }
  }, [filas.length]);

  if (mostrarVacio) {
    return <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{tituloVacio || 'Prende una o varias sedes de la izquierda para ver sus equipos acá.'}</p>;
  }

  const filasAMostrar = filas.slice(0, limite);
  const hayMas = limite < filas.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <Package size={14} color="#60a5fa" />
        {etiqueta && <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700 }}>{etiqueta}</span>}
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
          {filasAMostrar.length} de {filas.length} equipos {hayMas && '· baja para ver más'}
        </span>
      </div>
      <div ref={contenedorRef} onScroll={manejarScroll} style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${AZUL_BORDE}55`, borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={{ ...CELDA, textAlign: 'right', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '3rem' }}>#</th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '220px' }}>Sede</th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2 }}>Descripción</th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '220px' }}>Código</th>
              <th
                onClick={onClickActivoGenerico}
                title="Clic para calcular/ver el resumen de coincidencias"
                style={{
                  ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0,
                  background: AZUL_HEADER, zIndex: 2, width: '200px', cursor: onClickActivoGenerico ? 'pointer' : 'default',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  Activos Genéricos SPSA
                  {calculandoActivoGenerico && <RotateCw size={11} className="spin-anim" />}
                </span>
              </th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '200px' }}>Nombre comercial</th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '160px' }}>CECO</th>
              <th style={{ ...CELDA, textAlign: 'left', color: '#dbeafe', fontWeight: 700, position: 'sticky', top: 0, background: AZUL_HEADER, zIndex: 2, width: '160px' }}>Coordenada</th>
            </tr>
          </thead>
          <tbody>
            {filasAMostrar.map((eq, i) => (
              <tr key={`${eq.sedeId}-${eq.id_item}`} style={{ background: i % 2 === 0 ? '#0f172a' : '#111c34' }}>
                <td style={{ ...CELDA, textAlign: 'right', color: '#64748b' }}>{i + 1}</td>
                <td style={{ ...CELDA, color: '#93c5fd' }}>{eq.sedeDescripcion}</td>
                <td style={{ ...CELDA, color: '#e2e8f0' }}>{eq.description}</td>
                <td style={{ ...CELDA, color: '#93c5fd' }}>{eq.code}</td>
                <td style={{ ...CELDA, color: eq.activo_generico_spsa ? '#e2e8f0' : '#475569' }}>{eq.activo_generico_spsa || '—'}</td>
                <td style={{ ...CELDA, color: '#475569' }}>—</td>
                <td style={{ ...CELDA, color: '#475569' }}>—</td>
                <td style={{ ...CELDA, color: '#475569' }}>—</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={8} style={{ ...CELDA, textAlign: 'center', color: '#64748b' }}>Sin equipos.</td></tr>
            )}
            {hayMas && (
              <tr><td colSpan={8} style={{ ...CELDA, textAlign: 'center', color: '#64748b' }}>Cargando más al bajar…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TablaEquiposCombinada;
