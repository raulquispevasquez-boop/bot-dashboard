import React, { useState } from 'react';
import { Tag } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#c084fc';

const CardTarifasClienteLibre = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const {
    tarifaEnergia = 58.50,
    tarifaEnergiaHP,
    tarifaEnergiaHFP,
    unidadEnergia = 'USD/MWh',
    tarifaPotencia = 8.450,
    unidadPotencia = 'USD/kW',
  } = data || {};

  // Si no se han definido por separado, toman el valor de tarifaEnergia ya configurado
  const valorHP = tarifaEnergiaHP !== undefined ? tarifaEnergiaHP : tarifaEnergia;
  const valorHFP = tarifaEnergiaHFP !== undefined ? tarifaEnergiaHFP : tarifaEnergia;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(192, 132, 252, 0.2)', border: '1px solid rgba(192, 132, 252, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Tarifas Cliente Libre
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Precios unitarios en USD ($) sin IGV</span>
          </div>
        </div>
      </div>

      {/* 1. Tarifa Energía Horas Punta (HP) */}
      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.25rem' }}>
            Tarifa Energía Punta (HP):
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 800 }}>$</span>
            <input
              type="number"
              step="any"
              value={valorHP === 0 ? '' : valorHP}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                onUpdate({ tarifaEnergiaHP: val, tarifaEnergia: val });
              }}
              placeholder="0.00"
              style={{
                ...inputFieldStyle,
                paddingLeft: '2rem',
                borderColor: 'rgba(245, 158, 11, 0.4)',
              }}
            />
          </div>
        </div>

        <div style={{ width: '135px' }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Unidad:
          </label>
          <select
            value={unidadEnergia}
            onChange={(e) => onUpdate({ unidadEnergia: e.target.value })}
            style={{
              ...inputFieldStyle,
              color: '#c084fc',
              fontWeight: 800,
            }}
          >
            <option value="USD/MWh">USD / MWh</option>
            <option value="USD/kWh">USD / kWh</option>
          </select>
        </div>
      </div>

      {/* 2. Tarifa Energía Horas Fuera de Punta (HFP) */}
      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.25rem' }}>
            Tarifa Energía Fuera Punta (HFP):
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#38bdf8', fontWeight: 800 }}>$</span>
            <input
              type="number"
              step="any"
              value={valorHFP === 0 ? '' : valorHFP}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                onUpdate({ tarifaEnergiaHFP: val });
              }}
              placeholder="0.00"
              style={{
                ...inputFieldStyle,
                paddingLeft: '2rem',
                borderColor: 'rgba(56, 189, 248, 0.4)',
              }}
            />
          </div>
        </div>

        <div style={{ width: '135px', display: 'flex', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', paddingBottom: '0.55rem' }}>
            {unidadEnergia}
          </span>
        </div>
      </div>

      {/* 3. Tarifa Potencia */}
      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Tarifa Potencia:
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', fontSize: '0.78rem', color: '#38bdf8', fontWeight: 800 }}>$</span>
            <input
              type="number"
              step="any"
              value={tarifaPotencia === 0 ? '' : tarifaPotencia}
              onChange={(e) => onUpdate({ tarifaPotencia: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              style={{
                ...inputFieldStyle,
                paddingLeft: '2rem',
              }}
            />
          </div>
        </div>

        <div style={{ width: '135px' }}>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Unidad:
          </label>
          <select
            value={unidadPotencia}
            onChange={(e) => onUpdate({ unidadPotencia: e.target.value })}
            style={{
              ...inputFieldStyle,
              color: '#38bdf8',
              fontWeight: 800,
            }}
          >
            <option value="USD/kW">USD / kW</option>
            <option value="USD/MW">USD / MW</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default CardTarifasClienteLibre;
