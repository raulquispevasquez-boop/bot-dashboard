import React, { useState } from 'react';
import { Gauge } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#eab308';

const CardParametrosFactorK = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { factorCargaObjetivo = 85.0, parametroK = 1.050 } = data || {};

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gauge size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Factor de Carga Objetivo / Parámetro K
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Parámetros de eficiencia y modulación</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Factor Carga Objetivo (%):
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.1"
              value={factorCargaObjetivo === 0 ? '' : factorCargaObjetivo}
              onChange={(e) => onUpdate({ factorCargaObjetivo: parseFloat(e.target.value) || 0 })}
              placeholder="85.0"
              style={{
                ...inputFieldStyle,
                paddingRight: '2rem',
                color: '#facc15',
              }}
            />
            <span style={{ position: 'absolute', right: '10px', fontSize: '0.76rem', color: '#eab308', fontWeight: 800 }}>
              %
            </span>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.25rem' }}>
            Parámetro K:
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.001"
              value={parametroK === 0 ? '' : parametroK}
              onChange={(e) => onUpdate({ parametroK: parseFloat(e.target.value) || 0 })}
              placeholder="1.050"
              style={inputFieldStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ background: '#090d16', borderRadius: '7px', padding: '0.45rem 0.75rem', fontSize: '0.7rem', color: '#cbd5e1', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
        El <strong style={{ color: '#facc15' }}>Factor de Carga Objetivo</strong> evalúa la relación entre energía y potencia contratada para liquidaciones según contrato.
      </div>
    </div>
  );
};

export default CardParametrosFactorK;
