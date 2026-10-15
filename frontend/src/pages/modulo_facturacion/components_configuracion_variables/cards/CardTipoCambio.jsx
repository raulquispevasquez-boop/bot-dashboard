import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#22c55e';

const CardTipoCambio = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { valor = 3.748, fecha = '2026-08-31', fuente = 'SBS' } = data || {};

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Tipo de Cambio
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Cotización S/. por USD para liquidación</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.55rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Tipo de Cambio (S/. / USD):
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', fontSize: '0.76rem', color: '#4ade80', fontWeight: 800 }}>
              S/.
            </span>
            <input
              type="number"
              step="0.001"
              value={valor === 0 ? '' : valor}
              onChange={(e) => onUpdate({ valor: parseFloat(e.target.value) || 0 })}
              placeholder="3.750"
              style={{
                ...inputFieldStyle,
                paddingLeft: '2.4rem',
                color: '#4ade80',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Fuente:
          </label>
          <select
            value={fuente}
            onChange={(e) => onUpdate({ fuente: e.target.value })}
            style={{
              ...inputFieldStyle,
              color: '#f8fafc',
            }}
          >
            <option value="SBS">SBS (Oficial)</option>
            <option value="SUNAT">SUNAT</option>
            <option value="Manual">Manual</option>
          </select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
          Fecha de Cierre / Facturación:
        </label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => onUpdate({ fecha: e.target.value })}
          style={inputFieldStyle}
        />
      </div>
    </div>
  );
};

export default CardTipoCambio;
