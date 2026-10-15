import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle, X, ShieldAlert, Calendar } from 'lucide-react';
import { obtenerCortesReales, guardarCortesReales } from '../utils/auditoriaMedicionService';

const GestorCortesEnergia = ({ abierto, onClose, onCortesActualizados }) => {
  const [cortes, setCortes] = useState(() => obtenerCortesReales());
  const [nuevoCorte, setNuevoCorte] = useState({
    fechaInicio: '2026-08-15',
    horaInicio: '02:00',
    fechaFin: '2026-08-15',
    horaFin: '05:00',
    motivo: 'Mantenimiento Preventivo Subestación (SEIN)',
  });
  const [mostrarForm, setMostrarForm] = useState(false);

  if (!abierto) return null;

  const handleToggleActivo = (id) => {
    const actualizados = cortes.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c));
    setCortes(actualizados);
    guardarCortesReales(actualizados);
    if (onCortesActualizados) onCortesActualizados(actualizados);
  };

  const handleEliminar = (id) => {
    const actualizados = cortes.filter((c) => c.id !== id);
    setCortes(actualizados);
    guardarCortesReales(actualizados);
    if (onCortesActualizados) onCortesActualizados(actualizados);
  };

  const handleAgregar = (e) => {
    e.preventDefault();
    if (!nuevoCorte.fechaInicio || !nuevoCorte.fechaFin) return;
    const corte = {
      id: `corte_${Date.now()}`,
      ...nuevoCorte,
      activo: true,
    };
    const actualizados = [...cortes, corte];
    setCortes(actualizados);
    guardarCortesReales(actualizados);
    setMostrarForm(false);
    if (onCortesActualizados) onCortesActualizados(actualizados);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#0b1120',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
            borderBottom: '1px solid #4338ca',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                Gestor de Cortes Reales de Energía / Interrupciones
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#cbd5e1' }}>
                Intervalos declarados como interrupción física del suministro (se excluyen de la imputación R²)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.35rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido / Lista */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.74rem',
              color: '#cbd5e1',
              lineHeight: 1.45,
              marginBottom: '1rem',
            }}
          >
            <strong style={{ color: '#38bdf8' }}>Regla de Liquidación Limpia:</strong> Los intervalos registrados aquí se
            clasifican como <strong>Corte Real</strong>. El medidor en 0 kW / 0 kWh en estos períodos es considerado legítimo
            y <strong>NO se rellenará artificialmente con el algoritmo</strong>, preservando un recibo verídico y auditable.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc' }}>
              Intervalos de Corte Registrados ({cortes.length})
            </span>
            <button
              type="button"
              onClick={() => setMostrarForm(!mostrarForm)}
              style={{
                background: '#2563eb',
                border: '1px solid #3b82f6',
                color: '#fff',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Plus size={14} />
              <span>{mostrarForm ? 'Cancelar' : 'Registrar Nuevo Corte'}</span>
            </button>
          </div>

          {/* Formulario para agregar corte */}
          {mostrarForm && (
            <form
              onSubmit={handleAgregar}
              style={{
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#38bdf8' }}>
                Datos de la Interrupción Programada o Falla de Red
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Fecha Inicio:</label>
                  <input
                    type="date"
                    value={nuevoCorte.fechaInicio}
                    onChange={(e) => setNuevoCorte({ ...nuevoCorte, fechaInicio: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.35rem', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Hora Inicio:</label>
                  <input
                    type="time"
                    value={nuevoCorte.horaInicio}
                    onChange={(e) => setNuevoCorte({ ...nuevoCorte, horaInicio: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.35rem', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Fecha Fin:</label>
                  <input
                    type="date"
                    value={nuevoCorte.fechaFin}
                    onChange={(e) => setNuevoCorte({ ...nuevoCorte, fechaFin: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.35rem', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Hora Fin:</label>
                  <input
                    type="time"
                    value={nuevoCorte.horaFin}
                    onChange={(e) => setNuevoCorte({ ...nuevoCorte, horaFin: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.35rem', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Motivo / Sustento de la Interrupción:</label>
                <input
                  type="text"
                  placeholder="Ej. Parada programada de planta / Mantenimiento de alimentador SEIN"
                  value={nuevoCorte.motivo}
                  onChange={(e) => setNuevoCorte({ ...nuevoCorte, motivo: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '0.4rem', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  style={{ background: '#334155', border: 'none', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: '5px', fontSize: '0.74rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ background: '#10b981', border: 'none', color: '#fff', padding: '0.35rem 0.95rem', borderRadius: '5px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Guardar Corte Real
                </button>
              </div>
            </form>
          )}

          {/* Tabla de Cortes */}
          <div style={{ border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#172033', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Estado</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Intervalo de Corte</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Motivo / Evento</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cortes.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      No hay cortes reales registrados. Los huecos en 0 kW serán tratados por defecto como fallas de medición.
                    </td>
                  </tr>
                ) : (
                  cortes.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1e293b', background: c.activo ? '#090d16' : '#080a11' }}>
                      <td style={{ padding: '0.55rem 0.75rem' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleActivo(c.id)}
                          style={{
                            background: c.activo ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                            border: `1px solid ${c.activo ? '#10b981' : '#64748b'}`,
                            color: c.activo ? '#10b981' : '#94a3b8',
                            borderRadius: '12px',
                            padding: '0.15rem 0.55rem',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {c.activo ? '✓ Activo (Excluir)' : 'Pausado'}
                        </button>
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', fontFamily: 'monospace', color: '#f8fafc' }}>
                        <div>{c.fechaInicio} {c.horaInicio}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.67rem' }}>hasta {c.fechaFin} {c.horaFin}</div>
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', color: '#cbd5e1' }}>
                        {c.motivo}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleEliminar(c.id)}
                          style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '0.25rem' }}
                          title="Eliminar registro de corte"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'flex-end', background: '#090d16' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: '#38bdf8', border: 'none', color: '#090d16', padding: '0.45rem 1.25rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}
          >
            Listo / Aplicar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default GestorCortesEnergia;
