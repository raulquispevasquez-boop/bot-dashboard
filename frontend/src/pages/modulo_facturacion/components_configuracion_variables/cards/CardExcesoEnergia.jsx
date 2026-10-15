import React, { useState } from 'react';
import { Flame, Activity, CheckCircle2, Info } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#d946ef';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardExcesoEnergia = ({ data, onUpdate, tarifaEnergiaBase = 58.50 }) => {
  const [isHovered, setIsHovered] = useState(false);

  const {
    precioUnitarioMWh = 72.50,
    precioUnitarioHP_MWh = 78.00,
    precioUnitarioHFP_MWh = 68.00,
    unidad = 'USD/MWh',
    modalidad = 'fija', // 'fija' | 'factor' | 'diferenciada'
    factorRecargo = 1.20,
    bloqueEnergiaBaseMWh = 1500.00,
    aplicaSobre = 'factor_carga', // 'factor_carga' | 'bloque_fijo' | 'consumo_total'
  } = data || {};

  // Precio efectivo resultante
  const precioEfectivoMWh = modalidad === 'factor'
    ? Math.round(tarifaEnergiaBase * factorRecargo * 100) / 100
    : precioUnitarioMWh;

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
              background: 'rgba(217, 70, 239, 0.2)',
              border: '1px solid rgba(217, 70, 239, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Flame size={18} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Costos por Exceso de Energía
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Tarifas y recargos por energía fuera de cuota o modulación</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.66rem',
            background: 'rgba(217, 70, 239, 0.15)',
            border: '1px solid rgba(217, 70, 239, 0.35)',
            color: '#f0abfc',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          {modalidad === 'diferenciada'
            ? 'HP / HFP'
            : `$ ${formatearNumero(precioEfectivoMWh, 2)} ${unidad}`}
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
            background: modalidad === 'fija' ? 'rgba(217, 70, 239, 0.25)' : 'transparent',
            border: modalidad === 'fija' ? '1px solid rgba(217, 70, 239, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'fija' ? '#f0abfc' : '#94a3b8',
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
            background: modalidad === 'factor' ? 'rgba(217, 70, 239, 0.25)' : 'transparent',
            border: modalidad === 'factor' ? '1px solid rgba(217, 70, 239, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'factor' ? '#f0abfc' : '#94a3b8',
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
            background: modalidad === 'diferenciada' ? 'rgba(217, 70, 239, 0.25)' : 'transparent',
            border: modalidad === 'diferenciada' ? '1px solid rgba(217, 70, 239, 0.5)' : 'none',
            borderRadius: '5px',
            color: modalidad === 'diferenciada' ? '#f0abfc' : '#94a3b8',
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
              Precio Unitario Exceso Energía:
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#d946ef', fontWeight: 800 }}>$</span>
              <input
                type="number"
                step="any"
                value={precioUnitarioMWh === 0 ? '' : precioUnitarioMWh}
                onChange={(e) => onUpdate({ precioUnitarioMWh: parseFloat(e.target.value) || 0 })}
                placeholder="72.50"
                style={{
                  ...inputFieldStyle,
                  paddingLeft: '1.9rem',
                  color: '#f0abfc',
                  borderColor: 'rgba(217, 70, 239, 0.4)',
                }}
              />
            </div>
          </div>

          <div style={{ width: '125px' }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Unidad:
            </label>
            <select
              value={unidad}
              onChange={(e) => onUpdate({ unidad: e.target.value })}
              style={{
                ...inputFieldStyle,
                color: '#f0abfc',
                fontWeight: 800,
              }}
            >
              <option value="USD/MWh">USD / MWh</option>
              <option value="USD/kWh">USD / kWh</option>
            </select>
          </div>
        </div>
      )}

      {/* Modalidad 2: Factor de Recargo */}
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
                placeholder="1.20"
                style={{
                  ...inputFieldStyle,
                  color: '#f0abfc',
                  borderColor: 'rgba(217, 70, 239, 0.4)',
                  paddingRight: '1.8rem',
                }}
              />
              <span style={{ position: 'absolute', right: '10px', fontSize: '0.74rem', color: '#d946ef', fontWeight: 800 }}>
                x
              </span>
            </div>
          </div>

          <div style={{ background: '#090d16', borderRadius: '7px', padding: '0.4rem 0.6rem', border: '1px solid rgba(217, 70, 239, 0.25)', fontSize: '0.68rem' }}>
            <div style={{ color: '#94a3b8' }}>Precio resultante:</div>
            <strong style={{ color: '#f0abfc', fontSize: '0.85rem' }}>
              $ {formatearNumero(precioEfectivoMWh, 2)} <span style={{ fontSize: '0.65rem' }}>USD/MWh</span>
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
                value={precioUnitarioHP_MWh === 0 ? '' : precioUnitarioHP_MWh}
                onChange={(e) => onUpdate({ precioUnitarioHP_MWh: parseFloat(e.target.value) || 0 })}
                placeholder="78.00"
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
                value={precioUnitarioHFP_MWh === 0 ? '' : precioUnitarioHFP_MWh}
                onChange={(e) => onUpdate({ precioUnitarioHFP_MWh: parseFloat(e.target.value) || 0 })}
                placeholder="68.00"
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

      {/* Criterio y Bloque de Aplicación */}
      <div style={{ display: 'grid', gridTemplateColumns: aplicaSobre === 'bloque_fijo' ? '1fr 1fr' : '1fr', gap: '0.55rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Base de Evaluación del Exceso:
          </label>
          <select
            value={aplicaSobre}
            onChange={(e) => onUpdate({ aplicaSobre: e.target.value })}
            style={{
              ...inputFieldStyle,
              fontSize: '0.78rem',
              color: '#f8fafc',
            }}
          >
            <option value="factor_carga">Por Desviación del Factor de Carga Objetivo</option>
            <option value="bloque_fijo">Sobre Bloque Mensual Asignado (MWh)</option>
            <option value="consumo_total">Por Consumo Adicional sobre Promedio</option>
          </select>
        </div>

        {aplicaSobre === 'bloque_fijo' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
              Bloque Base Mensual:
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="any"
                value={bloqueEnergiaBaseMWh === 0 ? '' : bloqueEnergiaBaseMWh}
                onChange={(e) => onUpdate({ bloqueEnergiaBaseMWh: parseFloat(e.target.value) || 0 })}
                placeholder="1500.00"
                style={{
                  ...inputFieldStyle,
                  paddingRight: '3rem',
                }}
              />
              <span style={{ position: 'absolute', right: '10px', fontSize: '0.72rem', color: '#d946ef', fontWeight: 800 }}>
                MWh
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Nota contractual / resumen */}
      <div
        style={{
          background: '#090d16',
          borderRadius: '7px',
          padding: '0.45rem 0.65rem',
          fontSize: '0.68rem',
          color: '#cbd5e1',
          border: '1px solid rgba(217, 70, 239, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#94a3b8' }}>Tarifa Base Energía:</span>
        <strong style={{ color: '#cbd5e1' }}>
          $ {formatearNumero(tarifaEnergiaBase, 2)} USD/MWh
        </strong>
      </div>
    </div>
  );
};

export default CardExcesoEnergia;
