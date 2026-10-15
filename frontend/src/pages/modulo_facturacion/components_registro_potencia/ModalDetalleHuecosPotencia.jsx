import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, CheckCircle2, Eye, Clock, ShieldAlert } from 'lucide-react';
import { formatearDuracionSalto } from './utils/analisisPotenciaUtils';

const thSticky = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  background: '#090d16',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 0 #334155',
};

const ModalDetalleHuecosPotencia = ({ isOpen, onClose, huecos = [], onSeleccionarHueco }) => {
  if (!isOpen) return null;

  const totalMinutosPerdidos = huecos.reduce((acc, h) => acc + (h.deltaMinutos || 0), 0);
  const totalIntervalosPerdidos = huecos.reduce((acc, h) => acc + (h.intervalosPerdidos || 0), 0);

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fb7185',
              }}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: 700 }}>
                Auditoría 2.2: Detalle de Saltos Temporales (Potencia)
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Discontinuidades detectadas en la serie temporal de 15 minutos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
            title="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabla con sticky thead y sticky tfoot */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0.5rem 1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ background: '#090d16' }}>
                <th style={{ ...thSticky, padding: '0.6rem 0.5rem', textAlign: 'center', width: '45px', color: '#94a3b8' }}>#</th>
                <th style={{ ...thSticky, padding: '0.6rem 0.85rem', textAlign: 'left', color: '#cbd5e1' }}>Desde (Última medida válida)</th>
                <th style={{ ...thSticky, padding: '0.6rem 0.85rem', textAlign: 'left', color: '#cbd5e1' }}>Hasta (Reanudación)</th>
                <th style={{ ...thSticky, padding: '0.6rem 0.85rem', textAlign: 'center', color: '#cbd5e1' }}>Duración del Salto</th>
                <th style={{ ...thSticky, padding: '0.6rem 0.85rem', textAlign: 'center', color: '#cbd5e1' }}>Int. Faltantes</th>
                <th style={{ ...thSticky, padding: '0.6rem 0.85rem', textAlign: 'center', width: '100px', color: '#cbd5e1' }}>Validar</th>
              </tr>
            </thead>
            <tbody>
              {huecos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    <CheckCircle2 size={24} color="#22c55e" style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ margin: 0 }}>¡Excelente! No se encontraron saltos temporales ni huecos en los datos.</p>
                  </td>
                </tr>
              ) : (
                huecos.map((h, idx) => (
                  <tr
                    key={h.id || idx}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #1e293b' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '0.5rem 0.85rem', color: '#e2e8f0', borderBottom: '1px solid #1e293b' }}>
                      {h.desde}
                    </td>
                    <td style={{ padding: '0.5rem 0.85rem', color: '#fca5a5', fontWeight: 600, borderBottom: '1px solid #1e293b' }}>
                      {h.hasta}
                    </td>
                    <td style={{ padding: '0.5rem 0.85rem', textAlign: 'center', borderBottom: '1px solid #1e293b' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(244, 63, 94, 0.15)',
                          color: '#fb7185',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                        }}
                      >
                        <Clock size={11} /> {formatearDuracionSalto(h.deltaMinutos)}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.85rem', textAlign: 'center', color: '#f87171', fontWeight: 700, borderBottom: '1px solid #1e293b' }}>
                      -{h.intervalosPerdidos}
                    </td>
                    <td style={{ padding: '0.5rem 0.85rem', textAlign: 'center', borderBottom: '1px solid #1e293b' }}>
                      <button
                        onClick={() => {
                          if (onSeleccionarHueco) onSeleccionarHueco(h);
                          onClose();
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: '#1e293b',
                          border: '1px solid #38bdf888',
                          color: '#38bdf8',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '5px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Eye size={12} /> Ver fila
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {huecos.length > 0 && (
              <tfoot>
                <tr
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#090d16',
                    boxShadow: '0 -2px 0 #334155',
                  }}
                >
                  <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', color: '#38bdf8', fontWeight: 700, background: '#090d16' }}>
                    ∑
                  </td>
                  <td colSpan={2} style={{ padding: '0.65rem 0.85rem', fontWeight: 800, color: '#f8fafc', background: '#090d16' }}>
                    Totalizado General ({huecos.length} saltos en el período)
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#fb7185', fontWeight: 800, background: '#090d16' }}>
                    {formatearDuracionSalto(totalMinutosPerdidos)}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#ef4444', fontWeight: 800, background: '#090d16' }}>
                    -{totalIntervalosPerdidos}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', background: '#090d16' }} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ModalDetalleHuecosPotencia;
