import React, { useState } from 'react';
import { CheckCircle2, AlertOctagon, AlertTriangle, Clock, Calendar } from 'lucide-react';
import ModalDetalleHuecos from './ModalDetalleHuecos';

const ResumenValidacionCards = ({ validacion, onSeleccionarHueco }) => {
  const [mostrarModalHuecos, setMostrarModalHuecos] = useState(false);

  if (!validacion) return null;

  return (
    <>
      {/* 3 Mini-cuadros compactos horizontales (altura ~46px) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        {/* Mini-cuadro 1: Regla 2.1 Integridad */}
        <div
          title={validacion.cumpleIntegridad ? '100% de intervalos completos' : `Faltan ${validacion.intervalosFaltantes} intervalos de ${validacion.esperadosMes}`}
          style={{
            height: '46px',
            background: '#090d16',
            border: `1px solid ${validacion.cumpleIntegridad ? '#22c55e66' : '#ef444488'}`,
            borderRadius: '7px',
            padding: '0.25rem 0.65rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: '135px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.02em' }}>
              2.1 INTEGRIDAD
            </span>
            {validacion.cumpleIntegridad ? <CheckCircle2 size={13} color="#22c55e" /> : <AlertOctagon size={13} color="#ef4444" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: validacion.cumpleIntegridad ? '#4ade80' : '#f87171' }}>
              {validacion.totalRegistros} / {validacion.esperadosMes}
            </span>
            {!validacion.cumpleIntegridad && (
              <span style={{ fontSize: '0.65rem', color: '#fca5a5', fontWeight: 600 }}>
                (-{validacion.intervalosFaltantes})
              </span>
            )}
          </div>
        </div>

        {/* Mini-cuadro 2: Regla 2.2 Huecos */}
        <div
          onClick={() => validacion.totalHuecos > 0 && setMostrarModalHuecos(true)}
          title={validacion.totalHuecos > 0 ? 'Haz clic para abrir la tabla de saltos temporales' : 'Sin huecos en data'}
          style={{
            height: '46px',
            background: '#090d16',
            border: `1px solid ${validacion.totalHuecos === 0 ? '#22c55e66' : '#fb7185aa'}`,
            borderRadius: '7px',
            padding: '0.25rem 0.65rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: '135px',
            cursor: validacion.totalHuecos > 0 ? 'pointer' : 'default',
            transition: 'border-color 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.02em' }}>
              2.2 HUECOS EN DATA
            </span>
            {validacion.totalHuecos === 0 ? <CheckCircle2 size={13} color="#22c55e" /> : <AlertTriangle size={13} color="#fb7185" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: validacion.totalHuecos === 0 ? '#4ade80' : '#fb7185' }}>
              {validacion.totalHuecos === 0 ? '0 Huecos' : `${validacion.totalHuecos} Huecos`}
            </span>
            {validacion.totalHuecos > 0 && (
              <span style={{ fontSize: '0.62rem', color: '#fda4af', textDecoration: 'underline' }}>
                Ver tabla
              </span>
            )}
          </div>
        </div>

        {/* Mini-cuadro 3: Parámetros del mes */}
        <div
          title={`${validacion.diasMes} días × 96 intervalos = ${validacion.esperadosMes} esperados`}
          style={{
            height: '46px',
            background: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '7px',
            padding: '0.25rem 0.65rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: '130px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.02em' }}>
              PARÁMETROS
            </span>
            <Clock size={13} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
            Mes {validacion.month} / {validacion.year} <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 400 }}>({validacion.diasMes}d×96)</span>
          </div>
        </div>

        {/* Mini-cuadro 4: Período y Cantidad de Saltos */}
        {validacion.fechaDesde && validacion.fechaHasta && (
          <div
            title={`Período registrado: ${validacion.fechaDesde} hasta ${validacion.fechaHasta} (${validacion.totalHuecos} saltos detectados)`}
            style={{
              height: '46px',
              background: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '7px',
              padding: '0.25rem 0.65rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: '175px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.02em' }}>
                PERÍODO Y SALTOS
              </span>
              <Calendar size={13} color="#38bdf8" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                {validacion.fechaDesde.slice(0, 10)} → {validacion.fechaHasta.slice(0, 10)}
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: validacion.totalHuecos > 0 ? '#fda4af' : '#4ade80',
                  background: validacion.totalHuecos > 0 ? 'rgba(244,63,94,0.18)' : 'rgba(34,197,94,0.18)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {validacion.totalHuecos} {validacion.totalHuecos === 1 ? 'salto' : 'saltos'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modal Técnico Profesional para Auditoría de Huecos */}
      <ModalDetalleHuecos
        isOpen={mostrarModalHuecos}
        onClose={() => setMostrarModalHuecos(false)}
        huecos={validacion.huecos}
        onSeleccionarHueco={(hueco) => {
          setMostrarModalHuecos(false);
          if (onSeleccionarHueco) {
            onSeleccionarHueco(hueco);
          }
        }}
      />
    </>
  );
};

export default ResumenValidacionCards;
