import React, { useState } from 'react';
import { ShieldCheck, Zap, Sliders, Info, CheckCircle2 } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#10b981';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardPotenciaContratada = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);

  const {
    potenciaKW = 700.00,
    potenciaHP_KW = 700.00,
    potenciaHFP_KW = 700.00,
    unidad = 'kW',
    toleranciaPorcentaje = 5.0,
    suministroCodigo = 'SUM-KALLPA-001',
    precioExcesoKW = 10.50,
    modalidad = 'unica', // 'unica' | 'diferenciada'
  } = data || {};

  // Equivalentes en MW
  const potenciaMW = unidad === 'MW' ? potenciaKW : potenciaKW / 1000;
  const potenciaKW_Efectiva = unidad === 'MW' ? potenciaKW * 1000 : potenciaKW;

  // Umbral máximo con tolerancia sin penalidad
  const limiteToleranciaKW = potenciaKW_Efectiva * (1 + (toleranciaPorcentaje / 100));

  const handleCambioPotenciaPrincipal = (nuevoValor) => {
    const val = parseFloat(nuevoValor) || 0;
    const patch = { potenciaKW: val };
    if (modalidad === 'unica') {
      patch.potenciaHP_KW = val;
      patch.potenciaHFP_KW = val;
    }
    onUpdate(patch);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={18} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Potencia Contratada
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Capacidad de suministro reservada por contrato</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.66rem',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#6ee7b7',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          {unidad === 'MW' ? `${formatearNumero(potenciaKW, 3)} MW` : `${formatearNumero(potenciaKW, 2)} kW`}
        </span>
      </div>

      {/* Selector de Modalidad (Única vs Diferenciada) */}
      <div style={{ display: 'flex', background: '#090d16', borderRadius: '7px', padding: '2px', border: '1px solid #1e293b' }}>
        <button
          type="button"
          onClick={() => onUpdate({ modalidad: 'unica' })}
          style={{
            flex: 1,
            padding: '0.3rem 0.5rem',
            background: modalidad === 'unica' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
            border: modalidad === 'unica' ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'unica' ? '#6ee7b7' : '#94a3b8',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ⚡ Potencia Fija Única
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ modalidad: 'diferenciada' })}
          style={{
            flex: 1,
            padding: '0.3rem 0.5rem',
            background: modalidad === 'diferenciada' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
            border: modalidad === 'diferenciada' ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'diferenciada' ? '#6ee7b7' : '#94a3b8',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ⏱️ Diferenciada (HP / HFP)
        </button>
      </div>

      {/* Modalidad 1: Potencia Única */}
      {modalidad === 'unica' && (
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Potencia Contratada ({unidad}):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="any"
                value={potenciaKW === 0 ? '' : potenciaKW}
                onChange={(e) => handleCambioPotenciaPrincipal(e.target.value)}
                placeholder="700.00"
                style={{
                  ...inputFieldStyle,
                  paddingRight: '3.2rem',
                  color: '#6ee7b7',
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                }}
              />
              <span style={{ position: 'absolute', right: '10px', fontSize: '0.74rem', color: '#10b981', fontWeight: 800 }}>
                {unidad}
              </span>
            </div>
          </div>

          <div style={{ width: '110px' }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Unidad:
            </label>
            <select
              value={unidad}
              onChange={(e) => onUpdate({ unidad: e.target.value })}
              style={{
                ...inputFieldStyle,
                color: '#6ee7b7',
                fontWeight: 800,
              }}
            >
              <option value="kW">kW</option>
              <option value="MW">MW</option>
            </select>
          </div>
        </div>
      )}

      {/* Modalidad 2: Diferenciada HP y HFP */}
      {modalidad === 'diferenciada' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.25rem' }}>
              Contratada en Punta (HP):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="any"
                value={potenciaHP_KW === 0 ? '' : potenciaHP_KW}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdate({ potenciaHP_KW: val, potenciaKW: val });
                }}
                placeholder="700.00"
                style={{
                  ...inputFieldStyle,
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  paddingRight: '2.5rem',
                }}
              />
              <span style={{ position: 'absolute', right: '8px', fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800 }}>
                {unidad}
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.25rem' }}>
              Contratada Fuera Punta (HFP):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="any"
                value={potenciaHFP_KW === 0 ? '' : potenciaHFP_KW}
                onChange={(e) => onUpdate({ potenciaHFP_KW: parseFloat(e.target.value) || 0 })}
                placeholder="700.00"
                style={{
                  ...inputFieldStyle,
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                  paddingRight: '2.5rem',
                }}
              />
              <span style={{ position: 'absolute', right: '8px', fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800 }}>
                {unidad}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Fila Secundaria: Tolerancia y Código de Suministro */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Tolerancia por Exceso (%):
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.5"
              value={toleranciaPorcentaje === 0 ? '' : toleranciaPorcentaje}
              onChange={(e) => onUpdate({ toleranciaPorcentaje: parseFloat(e.target.value) || 0 })}
              placeholder="5.0"
              style={{
                ...inputFieldStyle,
                paddingRight: '2rem',
              }}
            />
            <span style={{ position: 'absolute', right: '10px', fontSize: '0.74rem', color: '#94a3b8', fontWeight: 800 }}>
              %
            </span>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Código de Suministro:
          </label>
          <input
            type="text"
            value={suministroCodigo}
            onChange={(e) => onUpdate({ suministroCodigo: e.target.value })}
            placeholder="SUM-KALLPA-001"
            style={{
              ...inputFieldStyle,
              fontSize: '0.78rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      {/* Resumen de umbrales y equivalencias */}
      <div
        style={{
          background: '#090d16',
          borderRadius: '7px',
          padding: '0.45rem 0.65rem',
          fontSize: '0.68rem',
          color: '#cbd5e1',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8' }}>Capacidad Equivalente:</span>
          <strong style={{ color: '#6ee7b7' }}>
            {unidad === 'MW'
              ? `${formatearNumero(potenciaKW_Efectiva, 2)} kW`
              : `${formatearNumero(potenciaMW, 3)} MW`}
          </strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #1e293b', paddingTop: '0.25rem' }}>
          <span style={{ color: '#94a3b8' }}>Tope sin penalidad ({toleranciaPorcentaje}%):</span>
          <strong style={{ color: '#fde047' }}>
            {formatearNumero(limiteToleranciaKW, 2)} kW
          </strong>
        </div>
      </div>
    </div>
  );
};

export default CardPotenciaContratada;
