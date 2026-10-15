import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle, Filter, Search, Layers, CheckCircle2, Trash2, Eraser, Cpu } from 'lucide-react';
import { formatearEnergia, formatearDuracionSalto } from './utils/analisisEnergiaUtils';
import { useMedidoresVirtuales, aplicarMedidoresVirtuales } from '../medidores_virtuales/useMedidoresVirtuales';
import ModalMedidorVirtual from '../medidores_virtuales/ModalMedidorVirtual';

const ROW_HEIGHT = 37;
const OVERSCAN = 30;
const VIRTUALIZE_THRESHOLD = 1000;

const thBase = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  background: '#090d16',
  whiteSpace: 'nowrap',
};

const TablaMedidasEnergia = ({
  registros = [],
  columnas = [],
  registroEnfocado,
  onEliminarRegistros,
  onVaciarDatos,
}) => {
  const [filtroTexto, setFiltroTexto] = useState('');
  const [soloHuecos, setSoloHuecos] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [filaDestacadaId, setFilaDestacadaId] = useState(null);
  const [idsSeleccionados, setIdsSeleccionados] = useState(new Set());
  const [mensajeToast, setMensajeToast] = useState(null);
  const [mostrarModalVirtual, setMostrarModalVirtual] = useState(false);
  const [hoveredVirtualKey, setHoveredVirtualKey] = useState(null);
  const contenedorScrollRef = useRef(null);

  const { medidoresVirtuales, agregarMedidorVirtual, eliminarMedidorVirtual } = useMedidoresVirtuales();

  // Inyectar columnas y valores de los medidores virtuales
  const { registros: registrosCompletos, columnas: columnasCompletas } = useMemo(() => {
    return aplicarMedidoresVirtuales(registros, columnas, medidoresVirtuales);
  }, [registros, columnas, medidoresVirtuales]);

  // Filtrado reactivo por texto y huecos sobre registrosCompletos
  const registrosFiltrados = registrosCompletos.filter((reg) => {
    if (soloHuecos && !reg.esHueco) return false;
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase();
      const matchStr = (reg.fechaStr || '').toLowerCase().includes(q);
      const matchDisp = (reg.fechaDisplay || '').toLowerCase().includes(q);
      if (!matchStr && !matchDisp) return false;
    }
    return true;
  });

  const totalRows = registrosFiltrados.length;
  const esVirtualizado = totalRows >= VIRTUALIZE_THRESHOLD;

  useEffect(() => {
    if (contenedorScrollRef.current) {
      setContainerHeight(contenedorScrollRef.current.clientHeight || 600);
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.height > 0) setContainerHeight(entry.contentRect.height);
        }
      });
      observer.observe(contenedorScrollRef.current);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    if (contenedorScrollRef.current) contenedorScrollRef.current.scrollTop = 0;
    setScrollTop(0);
    setIdsSeleccionados(new Set());
  }, [filtroTexto, soloHuecos]);

  const handleScroll = (e) => setScrollTop(e.currentTarget.scrollTop);

  const toggleSeleccionarFila = (id) => {
    setIdsSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todosSeleccionados = totalRows > 0 && registrosFiltrados.every((r) => idsSeleccionados.has(r.id));

  const toggleSeleccionarTodos = () => {
    if (todosSeleccionados) setIdsSeleccionados(new Set());
    else setIdsSeleccionados(new Set(registrosFiltrados.map((r) => r.id)));
  };

  const handleEjecutarEliminacion = () => {
    if (idsSeleccionados.size === 0) return;
    const cantidad = idsSeleccionados.size;

    if (window.confirm(`¿Estás seguro de eliminar las ${cantidad} filas seleccionadas?`)) {
      if (onEliminarRegistros) onEliminarRegistros(idsSeleccionados);
      setIdsSeleccionados(new Set());

      setMensajeToast({
        tipo: 'success',
        texto: `Se eliminaron ${cantidad} filas de la tabla correctamente.`,
      });
      setTimeout(() => setMensajeToast(null), 4000);
    }
  };

  const handleEjecutarVaciar = () => {
    if (totalRows === 0) return;
    if (window.confirm('¿Deseas vaciar por completo todos los datos de la tabla?')) {
      if (onVaciarDatos) onVaciarDatos();
      setIdsSeleccionados(new Set());
    }
  };

  // Salto desde el modal a la fila destacada
  useEffect(() => {
    if (!registroEnfocado) return;
    if (filtroTexto) setFiltroTexto('');

    const index = registros.findIndex(
      (r) =>
        r.id === registroEnfocado.id ||
        (registroEnfocado.hasta && (r.fechaDisplay === registroEnfocado.hasta || r.fechaStr === registroEnfocado.hasta))
    );

    if (index !== -1) {
      setFilaDestacadaId(registros[index].id);
      if (contenedorScrollRef.current) {
        const top = Math.max(0, index * ROW_HEIGHT - containerHeight / 2);
        contenedorScrollRef.current.scrollTo({ top, behavior: 'smooth' });
        setScrollTop(top);
      }
      const t = setTimeout(() => setFilaDestacadaId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [registroEnfocado, registros, containerHeight]);

  let startIndex = 0;
  let endIndex = totalRows;
  let topSpacerHeight = 0;
  let bottomSpacerHeight = 0;

  if (esVirtualizado) {
    const rawStart = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    startIndex = Math.max(0, rawStart - OVERSCAN);
    endIndex = Math.min(totalRows, rawStart + visibleCount + OVERSCAN);
    topSpacerHeight = startIndex * ROW_HEIGHT;
    bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);
  }

  const filasVisibles = esVirtualizado ? registrosFiltrados.slice(startIndex, endIndex) : registrosFiltrados;
  const totalCols = columnasCompletas.length + 4;

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Toast informativo */}
      {mensajeToast && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: '7px',
            padding: '0.45rem 0.85rem',
            marginBottom: '0.55rem',
            color: '#34d399',
            fontSize: '0.74rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={15} />
            <span>{mensajeToast.texto}</span>
          </div>
          <button onClick={() => setMensajeToast(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '8px' }} />
            <input
              type="text"
              placeholder="Buscar fecha (ej. 11/08/2026)..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.6rem 0.4rem 1.8rem', color: '#fff', fontSize: '0.75rem', outline: 'none', width: '190px' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setSoloHuecos(!soloHuecos)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: soloHuecos ? 'rgba(239, 68, 68, 0.2)' : '#1e293b', color: soloHuecos ? '#f87171' : '#cbd5e1', border: soloHuecos ? '1px solid #ef4444' : '1px solid #334155', cursor: 'pointer' }}
          >
            <Filter size={13} />
            <span>{soloHuecos ? 'Mostrando solo huecos (en rojo)' : 'Filtrar huecos (en rojo)'}</span>
          </button>

          {/* Botón para Configurar Medidor Virtualizado */}
          <button
            type="button"
            onClick={() => setMostrarModalVirtual(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)'; }}
          >
            <Cpu size={13} />
            <span>+ Medidor Virtual {medidoresVirtuales.length > 0 ? `(${medidoresVirtuales.length})` : ''}</span>
          </button>
        </div>

        {/* Acciones de eliminación e indicador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          {idsSeleccionados.size > 0 && (
            <button
              type="button"
              onClick={handleEjecutarEliminacion}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.75rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700, background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(185, 28, 28, 0.35)' }}
            >
              <Trash2 size={13} />
              <span>Eliminar seleccionadas ({idsSeleccionados.size})</span>
            </button>
          )}

          {totalRows > 0 && (
            <button
              type="button"
              onClick={handleEjecutarVaciar}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.65rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: 600, background: '#1e293b', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'pointer' }}
            >
              <Eraser size={13} />
              <span>Vaciar tabla</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.74rem', color: '#94a3b8' }}>
            <Layers size={14} color="#38bdf8" />
            <span>Total: <strong style={{ color: '#38bdf8' }}>{totalRows.toLocaleString('es-PE')}</strong></span>
            {esVirtualizado && (
              <span style={{ fontSize: '0.67rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                ⚡ Virtualizada
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contenedor de la Tabla con Checkbox a la izquierda */}
      <div ref={contenedorScrollRef} onScroll={handleScroll} style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, border: '1px solid #1e293b', borderRadius: '8px', position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ background: '#090d16', borderBottom: '1px solid #334155' }}>
              <th style={{ ...thBase, textAlign: 'center', padding: '0.65rem 0.5rem', width: '38px', minWidth: '38px' }}>
                <input type="checkbox" checked={todosSeleccionados} onChange={toggleSeleccionarTodos} style={{ cursor: 'pointer', accentColor: '#38bdf8', transform: 'scale(1.15)' }} title="Seleccionar/Deseleccionar todos" />
              </th>
              <th style={{ ...thBase, textAlign: 'center', padding: '0.65rem 0.5rem', color: '#94a3b8', width: '55px', minWidth: '50px' }}>#</th>
              <th style={{ ...thBase, textAlign: 'left', padding: '0.65rem 0.85rem', color: '#cbd5e1' }}>Fecha / Hora</th>
              <th style={{ ...thBase, textAlign: 'center', padding: '0.65rem 0.85rem', color: '#cbd5e1' }}>Intervalo (Δt)</th>
              {columnasCompletas.map((col) => (
                <th
                  key={col.key}
                  onMouseEnter={() => col.esVirtual && setHoveredVirtualKey(col.key)}
                  onMouseLeave={() => col.esVirtual && setHoveredVirtualKey(null)}
                  style={{
                    ...thBase,
                    textAlign: 'right',
                    padding: '0.65rem 0.85rem',
                    color: '#cbd5e1',
                    minWidth: '160px',
                    background: col.esVirtual ? '#141126' : '#090d16',
                    borderLeft: col.esVirtual ? '1px solid rgba(168, 85, 247, 0.4)' : undefined,
                    position: 'relative',
                    cursor: col.esVirtual ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem' }}>
                    {col.esVirtual && (
                      <span style={{ fontSize: '0.62rem', background: 'rgba(168, 85, 247, 0.25)', color: '#c084fc', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                        VIRTUAL
                      </span>
                    )}
                    <div style={{ fontWeight: 700, color: col.esVirtual ? '#d8b4fe' : '#f8fafc' }}>{col.alias}</div>
                  </div>
                  {col.codigo && (
                    <div style={{ fontSize: '0.65rem', color: col.esVirtual ? '#c084fc' : '#64748b', fontWeight: 400 }}>
                      {col.codigo}
                    </div>
                  )}
                  <div style={{ fontSize: '0.65rem', color: col.esVirtual ? '#a855f7' : '#38bdf8', fontWeight: 600 }}>kWh</div>

                  {/* Tooltip flotante con la fórmula y operaciones al pasar el mouse */}
                  {col.esVirtual && hoveredVirtualKey === col.key && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '6px',
                        zIndex: 100,
                        background: '#0f172a',
                        border: '1px solid rgba(168, 85, 247, 0.6)',
                        borderRadius: '8px',
                        padding: '0.65rem 0.85rem',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75)',
                        width: '270px',
                        textAlign: 'left',
                        pointerEvents: 'none',
                        whiteSpace: 'normal',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#d8b4fe', fontWeight: 700, fontSize: '0.74rem' }}>
                        <Cpu size={13} color="#c084fc" />
                        <span>Medidor Virtual (Energía kWh)</span>
                      </div>

                      <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '0.35rem', fontWeight: 600 }}>
                        Fórmula de cálculo:
                      </div>
                      <div
                        style={{
                          fontSize: '0.69rem',
                          color: '#a78bfa',
                          background: 'rgba(168, 85, 247, 0.15)',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          padding: '0.25rem 0.45rem',
                          borderRadius: '4px',
                          marginTop: '0.2rem',
                          fontFamily: 'monospace',
                          wordBreak: 'break-word',
                        }}
                      >
                        {col.formulaTexto || (col.operaciones && col.operaciones.map((op, idx) => `${idx === 0 && op.signo === '+' ? '' : op.signo} [${op.columnaAlias || op.columnaKey}]`).join(' ')) || 'Suma/Resta de celdas'}
                      </div>

                      {col.operaciones && col.operaciones.length > 0 && (
                        <div style={{ marginTop: '0.45rem', borderTop: '1px solid rgba(168, 85, 247, 0.25)', paddingTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{ fontSize: '0.64rem', color: '#cbd5e1', fontWeight: 600 }}>Operaciones aplicadas:</span>
                          {col.operaciones.map((op, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                              <span style={{ color: op.signo === '+' ? '#34d399' : '#f87171', fontWeight: 800 }}>
                                {op.signo} {op.columnaAlias || op.columnaKey}
                              </span>
                              <span style={{ color: op.signo === '+' ? '#a7f3d0' : '#fecaca', fontSize: '0.62rem', background: op.signo === '+' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', padding: '1px 5px', borderRadius: '3px' }}>
                                {op.signo === '+' ? 'Suma (+)' : 'Resta (-)'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop: '0.4rem', fontSize: '0.62rem', color: '#64748b', fontStyle: 'italic', borderTop: '1px dashed #334155', paddingTop: '0.25rem' }}>
                        Calculado en tiempo real en cada intervalo de 15 min.
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalRows === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  No hay registros para mostrar con los filtros seleccionados o la tabla está vacía.
                </td>
              </tr>
            ) : (
              <>
                {esVirtualizado && topSpacerHeight > 0 && (
                  <tr style={{ height: `${topSpacerHeight}px`, border: 'none' }}>
                    <td colSpan={totalCols} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 'none', background: 'transparent' }} />
                  </tr>
                )}

                {filasVisibles.map((fila, i) => {
                  const numFila = esVirtualizado ? startIndex + i + 1 : i + 1;
                  const esHueco = fila.esHueco;
                  const estaDestacada = fila.id === filaDestacadaId;
                  const estaSeleccionada = idsSeleccionados.has(fila.id);

                  let fondoFila = 'transparent';
                  let bordeFila = '1px solid #1e293b';

                  if (estaDestacada) {
                    fondoFila = 'rgba(56, 189, 248, 0.22)';
                    bordeFila = '2px solid #38bdf8';
                  } else if (estaSeleccionada) {
                    fondoFila = 'rgba(56, 189, 248, 0.12)';
                  } else if (esHueco) {
                    fondoFila = 'rgba(244, 63, 94, 0.08)';
                    bordeFila = '1px solid rgba(244, 63, 94, 0.25)';
                  }

                  return (
                    <tr key={fila.id} id={`fila-medida-${fila.id}`} style={{ height: `${ROW_HEIGHT}px`, boxSizing: 'border-box', background: fondoFila, borderBottom: bordeFila, transition: 'background 0.2s ease' }}>
                      <td style={{ height: `${ROW_HEIGHT}px`, boxSizing: 'border-box', padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                        <input type="checkbox" checked={estaSeleccionada} onChange={() => toggleSeleccionarFila(fila.id)} style={{ cursor: 'pointer', accentColor: '#38bdf8', transform: 'scale(1.15)' }} />
                      </td>
                      <td style={{ height: `${ROW_HEIGHT}px`, boxSizing: 'border-box', padding: '0.45rem 0.5rem', textAlign: 'center', color: estaDestacada || estaSeleccionada ? '#38bdf8' : esHueco ? '#f87171' : '#64748b', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {numFila}
                      </td>
                      <td style={{ height: `${ROW_HEIGHT}px`, boxSizing: 'border-box', padding: '0.45rem 0.85rem', color: estaDestacada ? '#38bdf8' : esHueco ? '#fca5a5' : '#e2e8f0', fontWeight: estaDestacada || esHueco ? 700 : 400, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {estaDestacada && <CheckCircle2 size={13} color="#38bdf8" />}
                          <span>{fila.fechaDisplay || fila.fechaStr}</span>
                        </div>
                      </td>
                      <td style={{ height: `${ROW_HEIGHT}px`, boxSizing: 'border-box', padding: '0.45rem 0.85rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {esHueco ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' }}>
                            <AlertCircle size={11} /> Hueco (0 kWh)
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>15 min</span>
                        )}
                      </td>
                      {columnasCompletas.map((col) => {
                        const valor = fila[col.key];
                        return (
                          <td
                            key={col.key}
                            style={{
                              height: `${ROW_HEIGHT}px`,
                              boxSizing: 'border-box',
                              padding: '0.45rem 0.85rem',
                              textAlign: 'right',
                              color: esHueco ? '#ef4444' : valor === null ? '#94a3b8' : col.esVirtual ? '#e9d5ff' : '#f8fafc',
                              fontWeight: esHueco ? 800 : col.esVirtual ? 700 : 400,
                              background: col.esVirtual ? 'rgba(168, 85, 247, 0.05)' : undefined,
                              borderLeft: col.esVirtual ? '1px solid rgba(168, 85, 247, 0.2)' : undefined,
                            }}
                          >
                            {formatearEnergia(valor)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {esVirtualizado && bottomSpacerHeight > 0 && (
                  <tr style={{ height: `${bottomSpacerHeight}px`, border: 'none' }}>
                    <td colSpan={totalCols} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 'none', background: 'transparent' }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear y Gestionar Medidores Virtuales */}
      <ModalMedidorVirtual
        isOpen={mostrarModalVirtual}
        onClose={() => setMostrarModalVirtual(false)}
        columnas={columnas}
        medidoresExistentes={medidoresVirtuales}
        onGuardarMedidor={agregarMedidorVirtual}
        onEliminarMedidor={eliminarMedidorVirtual}
        tipoMedicion="Energía"
      />
    </div>
  );
};

export default TablaMedidasEnergia;
