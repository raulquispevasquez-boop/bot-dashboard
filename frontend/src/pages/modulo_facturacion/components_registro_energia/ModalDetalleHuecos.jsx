import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, ExternalLink, Activity, Clock, ShieldAlert } from 'lucide-react';
import { formatearDuracionSalto } from './utils/analisisEnergiaUtils';

const ModalDetalleHuecos = ({ isOpen, onClose, huecos = [], onSeleccionarHueco }) => {
  if (!isOpen || !huecos || huecos.length === 0) return null;

  // Cálculos de totalizados
  const totalSaltos = huecos.length;
  const totalIntervalosPerdidos = huecos.reduce((acc, h) => acc + (h.intervalosPerdidos || 0), 0);
  const totalMinutosPerdidos = huecos.reduce((acc, h) => acc + (h.deltaMinutos || 0), 0);

  const modalJSX = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(5, 10, 20, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d1527',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '860px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 30px rgba(244, 63, 94, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
        }}
      >
        {/* Cabecera Técnica Profesional */}
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(90deg, #111c35 0%, #0d1527 100%)',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={18} color="#fb7185" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', color: '#f8fafc', fontWeight: 700 }}>
                  Auditoría de Saltos Temporales en Medidas
                </h3>
                <span
                  style={{
                    background: '#e11d48',
                    color: '#fff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  {totalSaltos} {totalSaltos === 1 ? 'Salto detectado' : 'Saltos detectados'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                Regla 2.2 (Δt ≠ 15 min). Haz clic en cualquier intervalo para validar el registro en la matriz de medidas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Cerrar ventana"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tabla Estructurada con Columnas y Encabezados Sticky Fijos */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, padding: '0 1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ color: '#94a3b8' }}>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.5rem', textAlign: 'center', width: '40px' }}>
                  #
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.75rem', textAlign: 'left' }}>
                  Desde (Última medida)
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.75rem', textAlign: 'left' }}>
                  Hasta (Reanudación)
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                  Duración del Salto
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                  Int. Faltantes
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 20, background: '#090f1d', borderBottom: '1px solid #334155', padding: '0.65rem 0.75rem', textAlign: 'center', width: '120px' }}>
                  Validar
                </th>
              </tr>
            </thead>
            <tbody>
              {huecos.map((h, idx) => (
                <tr
                  key={idx}
                  onClick={() => onSeleccionarHueco(h)}
                  style={{
                    borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '0.55rem 0.75rem', color: '#cbd5e1', fontWeight: 500 }}>
                    {h.desde}
                  </td>
                  <td style={{ padding: '0.55rem 0.75rem', color: '#f8fafc', fontWeight: 600 }}>
                    {h.hasta}
                  </td>
                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.35)',
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
                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                    <span
                      style={{
                        color: '#fda4af',
                        fontWeight: 700,
                        background: '#27121b',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        border: '1px solid #4c1d2d',
                      }}
                    >
                      -{h.intervalosPerdidos} int
                    </span>
                  </td>
                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeleccionarHueco(h);
                      }}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #38bdf8',
                        color: '#38bdf8',
                        borderRadius: '5px',
                        padding: '3px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#38bdf8';
                        e.currentTarget.style.color = '#0f172a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#1e293b';
                        e.currentTarget.style.color = '#38bdf8';
                      }}
                    >
                      <span>Ver en tabla</span>
                      <ExternalLink size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totalizado Oficial al Pie de la Tabla (Sticky Bottom) */}
            <tfoot>
              <tr style={{ fontWeight: 700, color: '#f8fafc' }}>
                <td
                  colSpan={3}
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#070b16',
                    borderTop: '2px solid #334155',
                    padding: '0.75rem',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#94a3b8', fontSize: '0.73rem' }}>
                    <Activity size={13} color="#38bdf8" />
                    <span>TOTALIZADO GENERAL ({totalSaltos} huecos registrados)</span>
                  </div>
                </td>
                <td
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#070b16',
                    borderTop: '2px solid #334155',
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ color: '#fb7185', fontSize: '0.75rem', fontWeight: 800 }}>
                    {formatearDuracionSalto(totalMinutosPerdidos)} acumulados
                  </div>
                </td>
                <td
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#070b16',
                    borderTop: '2px solid #334155',
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ color: '#fda4af', fontSize: '0.78rem', fontWeight: 800 }}>
                    -{totalIntervalosPerdidos} intervalos
                  </div>
                </td>
                <td
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#070b16',
                    borderTop: '2px solid #334155',
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.67rem', color: '#64748b' }}>Acceso directo</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Barra de estado inferior */}
        <div
          style={{
            padding: '0.6rem 1.25rem',
            background: '#090f1d',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.72rem',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldAlert size={12} color="#fb7185" />
            <span>Validación según procedimiento normativo de facturación libre</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '5px',
              padding: '0.35rem 0.85rem',
              color: '#cbd5e1',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cerrar ventana
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalJSX, document.body) : modalJSX;
};

export default ModalDetalleHuecos;
