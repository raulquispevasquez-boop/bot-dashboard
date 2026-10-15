import React from 'react';
import { X, RotateCw } from 'lucide-react';

const formatearFecha = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

// Resumen que aparece al hacer clic en el encabezado "Activos Genéricos
// SPSA" ya calculado: con qué valores únicos se llenó, cuántos equipos en
// total y cuántos quedaron sin definir (sin coincidencia suficiente).
const ModalResumenActivosGenericos = ({ resumen, calculando, onCerrar, onRecalcular }) => {
  if (!resumen) return null;
  const fecha = formatearFecha(resumen.calculado_el);

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: '10px',
          width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1.1rem', borderBottom: '1px solid #334155' }}>
          <div>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>Activos Genéricos SPSA</h3>
            {fecha && <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>Calculado {fecha}</p>}
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', padding: '0.9rem 1.1rem', flexShrink: 0 }}>
          <div style={{ flex: 1, background: '#111c34', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#e2e8f0' }}>{resumen.totalEquipos}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>equipos en total</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#4ade80' }}>{resumen.totalAsignados}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>asignados</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(248,113,113,0.1)', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f87171' }}>{resumen.totalSinDefinir}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>sin definir</div>
          </div>
        </div>

        <div style={{ padding: '0 1.1rem 0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
          {resumen.porActivo.length} activos genéricos únicos usados:
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 1.1rem 1rem' }}>
          {resumen.porActivo.map((a) => (
            <div key={a.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.75rem' }}>
              <span style={{ color: '#cbd5e1' }}>{a.nombre}</span>
              <span style={{ color: '#93c5fd', fontWeight: 700, flexShrink: 0 }}>{a.cantidad}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '0.8rem 1.1rem', borderTop: '1px solid #334155' }}>
          <button
            onClick={onRecalcular}
            disabled={calculando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: '1px solid #334155', borderRadius: '6px',
              padding: '0.35rem 0.6rem', color: calculando ? '#475569' : '#93c5fd',
              fontSize: '0.72rem', cursor: calculando ? 'default' : 'pointer',
            }}
          >
            <RotateCw size={11} className={calculando ? 'spin-anim' : undefined} />
            {calculando ? 'Recalculando…' : 'Recalcular'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalResumenActivosGenericos;
