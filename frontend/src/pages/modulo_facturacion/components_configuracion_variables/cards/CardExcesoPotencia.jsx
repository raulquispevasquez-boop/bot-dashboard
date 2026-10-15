import React, { useState } from 'react';
import { AlertTriangle, ZapOff, CheckCircle2, Info, Percent } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#f43f5e';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardExcesoPotencia = ({ data, onUpdate, tarifaPotenciaBase = 8.450 }) => {
  const [isHovered, setIsHovered] = useState(false);

  const {
    precioUnitarioKW = 10.50,
    precioUnitarioHP_KW = 12.00,
    precioUnitarioHFP_KW = 9.50,
    unidad = 'USD/kW',
    modalidad = 'fija', // 'fija' | 'factor' | 'diferenciada'
    factorRecargo = 1.25,
    toleranciaExcesoKW = 0,
    aplicaEn = 'HP_y_HFP', // 'HP_y_HFP' | 'solo_HP' | 'maximo_mensual'
  } = data || {};

  // Precio efectivo resultante
  const precioEfectivoKW = modalidad === 'factor'
    ? Math.round(tarifaPotenciaBase * factorRecargo * 1000) / 1000
    : precioUnitarioKW;

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
              background: 'rgba(244, 63, 94, 0.2)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={18} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Costos por Exceso de Potencia
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Tarifas y penalidades por sobrepasar potencia contratada</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.66rem',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            color: '#fda4af',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          {modalidad === 'diferenciada'
            ? 'HP / HFP'
            : `$ ${formatearNumero(precioEfectivoKW, 2)} ${unidad}`}
        </span>
      </div>

      {/* Selector de Modalidad (Fija vs Factor vs Diferenciada) */}
      <div style={{ display: 'flex', background: '#090d16', borderRadius: '7px', padding: '2px', border: '1px solid #1e293b' }}>
        <button
          type="button"
          onClick={() => onUpdate({ modalidad: 'fija' })}
          style={{
            flex: 1,
            padding: '0.3rem 0.3rem',
            background: modalidad === 'fija' ? 'rgba(244, 63, 94, 0.25)' : 'transparent',
            border: modalidad === 'fija' ? '1px solid rgba(244, 63, 94, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'fija' ? '#fda4af' : '#94a3b8',
            fontSize: '0.66rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          💲 Tarifa Fija
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ modalidad: 'factor' })}
          style={{
            flex: 1,
            padding: '0.3rem 0.3rem',
            background: modalidad === 'factor' ? 'rgba(244, 63, 94, 0.25)' : 'transparent',
            border: modalidad === 'factor' ? '1px solid rgba(244, 63, 94, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'factor' ? '#fda4af' : '#94a3b8',
            fontSize: '0.66rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ✖️ Factor Recargo
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ modalidad: 'diferenciada' })}
          style={{
            flex: 1,
            padding: '0.3rem 0.3rem',
            background: modalidad === 'diferenciada' ? 'rgba(244, 63, 94, 0.25)' : 'transparent',
            border: modalidad === 'diferenciada' ? '1px solid rgba(244, 63, 94, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'diferenciada' ? '#fda4af' : '#94a3b8',
            fontSize: '0.66rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ⏱️ HP / HFP
        </button>
      </div>

      {/* Modalidad 1: Tarifa Fija Única */}
      {modalidad === 'fija' && (
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Precio Unitario Exceso Potencia:
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#f43f5e', fontWeight: 800 }}>$</span>
              <input
                type="number"
                step="any"
                value={precioUnitarioKW === 0 ? '' : precioUnitarioKW}
                onChange={(e) => onUpdate({ precioUnitarioKW: parseFloat(e.target.value) || 0 })}
                placeholder="10.50"
                style={{
                  ...inputFieldStyle,
                  paddingLeft: '1.9rem',
                  color: '#fda4af',
                  borderColor: 'rgba(244, 63, 94, 0.4)',
                }}
              />
            </div>
          </div>

          <div style={{ width: '120px' }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Unidad:
            </label>
            <select
              value={unidad}
              onChange={(e) => onUpdate({ unidad: e.target.value })}
              style={{
                ...inputFieldStyle,
                color: '#fda4af',
                fontWeight: 800,
              }}
            >
              <option value="USD/kW">USD / kW</option>
              <option value="USD/MW">USD / MW</option>
            </select>
          </div>
        </div>
      )}

      {/* Modalidad 2: Factor Multiplicador de Recargo */}
      {modalidad === 'factor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Factor Recargo (x Tarifa Base):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="0.05"
                value={factorRecargo === 0 ? '' : factorRecargo}
                onChange={(e) => onUpdate({ factorRecargo: parseFloat(e.target.value) || 0 })}
                placeholder="1.25"
                style={{
                  ...inputFieldStyle,
                  color: '#fda4af',
                  borderColor: 'rgba(244, 63, 94, 0.4)',
                  paddingRight: '1.8rem',
                }}
              />
              <span style={{ position: 'absolute', right: '10px', fontSize: '0.74rem', color: '#f43f5e', fontWeight: 800 }}>
                x
              </span>
            </div>
          </div>

          <div style={{ background: '#090d16', borderRadius: '7px', padding: '0.4rem 0.6rem', border: '1px solid rgba(244, 63, 94, 0.25)', fontSize: '0.68rem' }}>
            <div style={{ color: '#94a3b8' }}>Precio resultante:</div>
            <strong style={{ color: '#fda4af', fontSize: '0.85rem' }}>
              $ {formatearNumero(precioEfectivoKW, 3)} <span style={{ fontSize: '0.65rem' }}>USD/kW</span>
            </strong>
          </div>
        </div>
      )}

      {/* Modalidad 3: Diferenciada HP y HFP */}
      {modalidad === 'diferenciada' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.25rem' }}>
              Exceso en Punta (HP):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 800 }}>$</span>
              <input
                type="number"
                step="any"
                value={precioUnitarioHP_KW === 0 ? '' : precioUnitarioHP_KW}
                onChange={(e) => onUpdate({ precioUnitarioHP_KW: parseFloat(e.target.value) || 0 })}
                placeholder="12.00"
                style={{
                  ...inputFieldStyle,
                  paddingLeft: '1.9rem',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.25rem' }}>
              Exceso Fuera Punta (HFP):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#38bdf8', fontWeight: 800 }}>$</span>
              <input
                type="number"
                step="any"
                value={precioUnitarioHFP_KW === 0 ? '' : precioUnitarioHFP_KW}
                onChange={(e) => onUpdate({ precioUnitarioHFP_KW: parseFloat(e.target.value) || 0 })}
                placeholder="9.50"
                style={{
                  ...inputFieldStyle,
                  paddingLeft: '1.9rem',
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Selector de Criterio de Aplicación del Exceso */}
      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
          Criterio de Evaluación del Exceso:
        </label>
        <select
          value={aplicaEn}
          onChange={(e) => onUpdate({ aplicaEn: e.target.value })}
          style={{
            ...inputFieldStyle,
            fontSize: '0.78rem',
            color: '#f8fafc',
          }}
        >
          <option value="HP_y_HFP">Horas Punta y Fuera de Punta (Independientes)</option>
          <option value="solo_HP">Solo cuando la Demanda en Punta (HP) supere lo contratado</option>
          <option value="maximo_mensual">Sobre el Máximo Pico Mensual Absoluto (HP o HFP)</option>
        </select>
      </div>

      {/* Nota contractual / resumen */}
      <div
        style={{
          background: '#090d16',
          borderRadius: '7px',
          padding: '0.45rem 0.65rem',
          fontSize: '0.68rem',
          color: '#cbd5e1',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#94a3b8' }}>Tarifa Base Potencia:</span>
        <strong style={{ color: '#cbd5e1' }}>
          $ {formatearNumero(tarifaPotenciaBase, 3)} USD/kW
        </strong>
      </div>
    </div>
  );
};

export default CardExcesoPotencia;
