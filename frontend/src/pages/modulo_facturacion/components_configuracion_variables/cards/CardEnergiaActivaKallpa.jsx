import React, { useState } from 'react';
import { Flame, Building2, Gauge } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#f97316';
const ACCENT_SEDE = '#38bdf8';

const CardEnergiaActivaKallpa = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const {
    valor = 0,
    unidad = 'MWh',
    valorSede = 0,
    unidadSede = 'MWh',
  } = data || {};

  const handleCambioValor = (e) => {
    const val = parseFloat(e.target.value);
    onUpdate({ valor: isNaN(val) ? 0 : val });
  };

  const handleCambioUnidad = (nuevaUnidad) => {
    onUpdate({ unidad: nuevaUnidad });
  };

  const handleCambioValorSede = (e) => {
    const val = parseFloat(e.target.value);
    onUpdate({ valorSede: isNaN(val) ? 0 : val });
  };

  const handleCambioUnidadSede = (nuevaUnidad) => {
    onUpdate({ unidadSede: nuevaUnidad });
  };

  // Conversiones Barra de Generación
  const valorBarraKWh = unidad === 'MWh' ? valor * 1000 : valor;
  const valorBarraMWh = unidad === 'MWh' ? valor : valor / 1000;

  // Conversiones Medidor en Sede
  const valorSedeKWh = unidadSede === 'MWh' ? valorSede * 1000 : valorSede;
  const valorSedeMWh = unidadSede === 'MWh' ? valorSede : valorSede / 1000;

  // Cálculo del Factor de Pérdida (Sede / Barra Generación en unidades homogéneas)
  const factorPerdida = valorBarraKWh > 0 ? valorSedeKWh / valorBarraKWh : 0;
  const porcentajePerdida = valorBarraKWh > 0 ? (1 - factorPerdida) * 100 : 0;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      {/* Barra de acento visual superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      {/* Cabecera de la Tarjeta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.2)', border: '1px solid rgba(249, 115, 22, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flame size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800, letterSpacing: '0.01em' }}>
              Energía Activa B.G Kallpa La Curva
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Ingreso manual de energía base y medidor en sede</span>
          </div>
        </div>
      </div>

      {/* 1. ENERGÍA EN BARRA DE GENERACIÓN */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Flame size={13} color={ACCENT} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fed7aa' }}>
            Energía en Barra Generación:
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.2rem' }}>
              Valor de Energía:
            </label>
            <input
              type="number"
              step="any"
              value={valor === 0 ? '' : valor}
              onChange={handleCambioValor}
              placeholder="0.00"
              style={inputFieldStyle}
            />
          </div>

          <div style={{ width: '135px' }}>
            <label style={{ display: 'block', fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.2rem' }}>
              Unidad:
            </label>
            <div style={{ display: 'flex', background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => handleCambioUnidad('MWh')}
                style={{
                  flex: 1,
                  padding: '0.35rem 0',
                  border: 'none',
                  borderRadius: '4px',
                  background: unidad === 'MWh' ? ACCENT : 'transparent',
                  color: unidad === 'MWh' ? '#fff' : '#94a3b8',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                MWh
              </button>
              <button
                type="button"
                onClick={() => handleCambioUnidad('kWh')}
                style={{
                  flex: 1,
                  padding: '0.35rem 0',
                  border: 'none',
                  borderRadius: '4px',
                  background: unidad === 'kWh' ? ACCENT : 'transparent',
                  color: unidad === 'kWh' ? '#fff' : '#94a3b8',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                kWh
              </button>
            </div>
          </div>
        </div>

        {/* Equivalencia en tiempo real Barra Generación */}
        <div style={{ background: '#090d16', borderRadius: '6px', padding: '0.35rem 0.65rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#cbd5e1', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
          <span style={{ color: '#94a3b8' }}>Equivalente Barra:</span>
          <strong style={{ color: '#fdba74' }}>
            {unidad === 'MWh'
              ? `${valorBarraKWh.toLocaleString('es-PE', { maximumFractionDigits: 2 })} kWh`
              : `${valorBarraMWh.toLocaleString('es-PE', { maximumFractionDigits: 4 })} MWh`}
          </strong>
        </div>
      </div>

      {/* Separador estilizado */}
      <div style={{ borderTop: '1px dashed rgba(148, 163, 184, 0.2)', margin: '0.2rem 0' }} />

      {/* 2. ENERGÍA EN MEDIDOR (EN SEDE) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Building2 size={13} color={ACCENT_SEDE} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#bae6fd' }}>
            Energía en Medidor (en Sede):
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.2rem' }}>
              Valor en Medidor:
            </label>
            <input
              type="number"
              step="any"
              value={valorSede === 0 ? '' : valorSede}
              onChange={handleCambioValorSede}
              placeholder="0.00"
              style={inputFieldStyle}
            />
          </div>

          <div style={{ width: '135px' }}>
            <label style={{ display: 'block', fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.2rem' }}>
              Unidad:
            </label>
            <div style={{ display: 'flex', background: '#090d16', border: '1px solid #334155', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => handleCambioUnidadSede('MWh')}
                style={{
                  flex: 1,
                  padding: '0.35rem 0',
                  border: 'none',
                  borderRadius: '4px',
                  background: unidadSede === 'MWh' ? ACCENT_SEDE : 'transparent',
                  color: unidadSede === 'MWh' ? '#0f172a' : '#94a3b8',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                MWh
              </button>
              <button
                type="button"
                onClick={() => handleCambioUnidadSede('kWh')}
                style={{
                  flex: 1,
                  padding: '0.35rem 0',
                  border: 'none',
                  borderRadius: '4px',
                  background: unidadSede === 'kWh' ? ACCENT_SEDE : 'transparent',
                  color: unidadSede === 'kWh' ? '#0f172a' : '#94a3b8',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                kWh
              </button>
            </div>
          </div>
        </div>

        {/* Equivalencia en tiempo real Medidor en Sede */}
        <div style={{ background: '#090d16', borderRadius: '6px', padding: '0.35rem 0.65rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#cbd5e1', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
          <span style={{ color: '#94a3b8' }}>Equivalente Sede:</span>
          <strong style={{ color: '#7dd3fc' }}>
            {unidadSede === 'MWh'
              ? `${valorSedeKWh.toLocaleString('es-PE', { maximumFractionDigits: 2 })} kWh`
              : `${valorSedeMWh.toLocaleString('es-PE', { maximumFractionDigits: 4 })} MWh`}
          </strong>
        </div>
      </div>

      {/* 3. INDICADOR: FACTOR DE PÉRDIDA */}
      <div
        style={{
          marginTop: '0.35rem',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.8) 100%)',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Gauge size={16} color="#fb923c" />
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.01em' }}>
              Factor de Pérdida
            </span>
          </div>
          <span
            style={{
              fontSize: '0.63rem',
              color: '#94a3b8',
              background: '#090d16',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              border: '1px solid #334155',
              fontWeight: 600,
            }}
          >
            Sede / Barra B.G
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '1.45rem',
                fontWeight: 900,
                color: '#f97316',
                fontFamily: 'monospace',
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              {valorBarraKWh > 0 ? factorPerdida.toFixed(4) : '0.0000'}
            </span>
            {valorBarraKWh > 0 && (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fdba74' }}>
                ({(factorPerdida * 100).toFixed(2)}%)
              </span>
            )}
          </div>

          {valorBarraKWh > 0 ? (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.64rem', color: '#94a3b8', display: 'block' }}>
                Pérdida en transmisión:
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: porcentajePerdida >= 0 ? '#f87171' : '#34d399',
                }}
              >
                {porcentajePerdida >= 0
                  ? `${porcentajePerdida.toFixed(2)}%`
                  : `+${Math.abs(porcentajePerdida).toFixed(2)}% (Excedente)`}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
              Ingrese valores para calcular
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default CardEnergiaActivaKallpa;
