import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Search, Save, ShieldCheck } from 'lucide-react';
import { MESES_DEL_ANIO } from '../utils/feriadosPeruData';
import { getTrelloCardStyle } from '../utils/trelloCardStyles';
import ModalGuardadoPersistencia from '../ModalGuardadoPersistencia';

const ACCENT = '#ef4444';

const CardTablaDiasNoLaborables = ({
  dias = [],
  onToggle,
  onToggleTodos,
  onAgregar,
  onEliminar,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [modalPersistencia, setModalPersistencia] = useState({ isOpen: false, detalle: null });

  // Formulario nuevo día
  const [nuevoMes, setNuevoMes] = useState('Enero');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaDesc, setNuevaDesc] = useState('');

  const diasFiltrados = dias.filter((d) => {
    if (mesFiltro !== 'todos' && d.mes !== mesFiltro) return false;
    if (filtro) {
      const q = filtro.toLowerCase();
      const matchDesc = (d.descripcion || '').toLowerCase().includes(q);
      const matchFecha = (d.fecha || '').toLowerCase().includes(q);
      const matchMes = (d.mes || '').toLowerCase().includes(q);
      if (!matchDesc && !matchFecha && !matchMes) return false;
    }
    return true;
  });

  const totalActivos = dias.filter((d) => d.activo).length;
  const todosFiltradosActivos = diasFiltrados.length > 0 && diasFiltrados.every((d) => d.activo);

  const handleToggleCheck = (item) => {
    onToggle(item.id);
  };

  const handleToggleTodos = () => {
    if (onToggleTodos) {
      onToggleTodos(!todosFiltradosActivos);
    }
  };

  const handleGuardarVariacionManual = () => {
    setModalPersistencia({
      isOpen: true,
      detalle: {
        mensaje: 'La configuración de días no laborables y domingos ha sido verificada y persistida en memoria local.',
        totalActivos,
        totalTotal: dias.length,
      },
    });
  };

  const handleCrearDia = (e) => {
    e.preventDefault();
    if (!nuevaFecha || !nuevaDesc.trim()) return;

    let fechaFinal = nuevaFecha;
    if (nuevaFecha.includes('-')) {
      const [y, m, d] = nuevaFecha.split('-');
      fechaFinal = `${d}/${m}/${y}`;
    }

    onAgregar({
      id: `custom-${Date.now()}`,
      mes: nuevoMes,
      fecha: fechaFinal,
      descripcion: nuevaDesc.trim(),
      tipo: 'Personalizado',
      activo: true,
    });

    setNuevaFecha('');
    setNuevaDesc('');
    setMostrarForm(false);
  };

  return (
    <>
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...getTrelloCardStyle(ACCENT, isHovered),
          height: '100%',
          minHeight: '410px',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={17} color={ACCENT} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', fontWeight: 800 }}>
                Días No Laborables (domingos y feriados)
              </h4>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                Calendario oficial del Perú y domingos · Total: {dias.length} registros
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={handleGuardarVariacionManual}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                color: '#fff',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Save size={13} />
              <span>Guardar Variación</span>
            </button>

            <button
              type="button"
              onClick={() => setMostrarForm(!mostrarForm)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                color: '#38bdf8',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} />
              <span>{mostrarForm ? 'Cancelar' : 'Agregar Día'}</span>
            </button>
          </div>
        </div>

        {/* Formulario rápido para agregar */}
        {mostrarForm && (
          <form onSubmit={handleCrearDia} style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.2rem' }}>Mes:</label>
              <select value={nuevoMes} onChange={(e) => setNuevoMes(e.target.value)} style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.38rem', color: '#fff', fontSize: '0.76rem' }}>
                {MESES_DEL_ANIO.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.2rem' }}>Fecha:</label>
              <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} required style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.36rem', color: '#fff', fontSize: '0.76rem' }} />
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.2rem' }}>Descripción del Día:</label>
              <input type="text" placeholder="Ej. Domingo especial / Feriado local..." value={nuevaDesc} onChange={(e) => setNuevaDesc(e.target.value)} required style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.38rem 0.55rem', color: '#fff', fontSize: '0.76rem' }} />
            </div>
            <button type="submit" style={{ padding: '0.4rem 0.85rem', borderRadius: '5px', border: 'none', background: '#0284c7', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
              Guardar
            </button>
          </form>
        )}

        {/* Barra de Filtros */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="#64748b" style={{ position: 'absolute', left: '8px' }} />
            <input
              type="text"
              placeholder="Filtrar por descripción o fecha..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              style={{ width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '0.38rem 0.6rem 0.38rem 1.7rem', color: '#f8fafc', fontSize: '0.75rem', outline: 'none' }}
            />
          </div>
          <select
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
            style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '0.38rem 0.55rem', color: '#cbd5e1', fontSize: '0.75rem', outline: 'none' }}
          >
            <option value="todos">Todos los meses</option>
            {MESES_DEL_ANIO.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Tabla con Mes en 1ª Columna, Fecha en 2ª Columna, Descripción en 3ª Columna */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #334155', borderRadius: '7px', background: '#090d16', maxHeight: '280px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 2, borderBottom: '1px solid #334155' }}>
              <tr>
                <th style={{ textAlign: 'center', padding: '0.55rem 0.45rem', width: '38px' }}>
                  <input
                    type="checkbox"
                    checked={todosFiltradosActivos}
                    onChange={handleToggleTodos}
                    title="Seleccionar / Deseleccionar todos"
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#38bdf8' }}
                  />
                </th>
                <th style={{ textAlign: 'left', padding: '0.55rem 0.75rem', color: '#38bdf8', fontWeight: 800, width: '100px' }}>
                  1. Mes
                </th>
                <th style={{ textAlign: 'left', padding: '0.55rem 0.75rem', color: '#f8fafc', fontWeight: 700, width: '150px' }}>
                  2. Fecha
                </th>
                <th style={{ textAlign: 'left', padding: '0.55rem 0.75rem', color: '#f8fafc', fontWeight: 700 }}>
                  3. Descripción del Día No Laborable / Feriado
                </th>
                <th style={{ textAlign: 'center', padding: '0.55rem 0.5rem', color: '#94a3b8', width: '60px' }}>
                  Borrar
                </th>
              </tr>
            </thead>
            <tbody>
              {diasFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                    No se encontraron días no laborables con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                diasFiltrados.map((item, idx) => {
                  const estaActivo = item.activo !== false;
                  const esDomingo = item.tipo === 'Domingo';
                  return (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: estaActivo ? (esDomingo ? 'rgba(56, 189, 248, 0.04)' : 'transparent') : 'rgba(255, 255, 255, 0.02)',
                        opacity: estaActivo ? 1 : 0.45,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.45rem 0.45rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={estaActivo}
                          onChange={() => handleToggleCheck(item)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#22c55e' }}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', fontWeight: 800, color: '#38bdf8', whiteSpace: 'nowrap' }}>
                        {item.mes}
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', color: esDomingo ? '#38bdf8' : '#e2e8f0', fontFamily: 'monospace', fontSize: '0.74rem' }}>
                        {item.fecha}
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: esDomingo ? 700 : 500 }}>{item.descripcion}</span>
                          {item.tipo && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                color: esDomingo ? '#38bdf8' : item.tipo === 'No Laborable' ? '#fbbf24' : '#ef4444',
                                background: esDomingo ? 'rgba(56, 189, 248, 0.15)' : item.tipo === 'No Laborable' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                              }}
                            >
                              {item.tipo}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                        {item.id?.startsWith('custom-') && (
                          <button
                            type="button"
                            onClick={() => onEliminar(item.id)}
                            title="Eliminar día personalizado"
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef4444',
                              color: '#f87171',
                              borderRadius: '4px',
                              padding: '3px 6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra Inferior Informativa de Persistencia */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#94a3b8', background: '#090d16', padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={14} color="#22c55e" />
            <span>Checks activos seleccionados: <strong style={{ color: '#4ade80' }}>{totalActivos} de {dias.length}</strong></span>
          </div>
          <span style={{ color: '#64748b' }}>Persistencia automática permanente</span>
        </div>
      </div>

      <ModalGuardadoPersistencia
        isOpen={modalPersistencia.isOpen}
        onClose={() => setModalPersistencia({ isOpen: false, detalle: null })}
        detalle={modalPersistencia.detalle}
      />
    </>
  );
};

export default CardTablaDiasNoLaborables;
