import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getTrelloCardStyle } from '../utils/trelloCardStyles';

const ACCENT = '#f43f5e';

const CardOtrosCargos = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { factorFose = 2.30, cargoLer = 11.000, cargoFise = 1.315200 } = data || {};

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', fontWeight: 800 }}>
              OTROS CARGOS NORMATIVOS (FOSE, LER, FISE)
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Parámetros de subsidios sociales y electrificación rural</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
        {/* 1. Recargo FOSE % */}
        <div
          style={{
            background: '#090d16',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.76rem', color: '#f8fafc', fontWeight: 700 }}>
              Fondo Compensación Social (FOSE)
            </span>
            <span style={{ fontSize: '0.65rem', color: '#fda4af', fontWeight: 800, background: 'rgba(251, 113, 133, 0.18)', padding: '1px 6px', borderRadius: '4px' }}>
              % Recargo
            </span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              value={factorFose === 0 ? '' : factorFose}
              onChange={(e) => onUpdate({ factorFose: parseFloat(e.target.value) || 0 })}
              placeholder="2.30"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '0.45rem 2.2rem 0.45rem 0.65rem',
                color: '#fda4af',
                fontSize: '0.9rem',
                fontWeight: 800,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', right: '10px', fontSize: '0.75rem', color: '#fda4af', fontWeight: 800 }}>
              %
            </span>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3 }}>
            Aplica sobre la base tarifaria de <strong>Gen + Transm + Distr</strong> (excluye Mantenimiento y Alumbrado Público según Ley 31429).
          </span>
        </div>

        {/* 2. Cargo LER */}
        <div
          style={{
            background: '#090d16',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.76rem', color: '#f8fafc', fontWeight: 700 }}>
              Electrificación Rural (LER)
            </span>
            <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 800, background: 'rgba(56, 189, 248, 0.18)', padding: '1px 6px', borderRadius: '4px' }}>
              S/./MWh
            </span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.001"
              value={cargoLer === 0 ? '' : cargoLer}
              onChange={(e) => onUpdate({ cargoLer: parseFloat(e.target.value) || 0 })}
              placeholder="11.000"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '0.45rem 4.5rem 0.45rem 0.65rem',
                color: '#38bdf8',
                fontSize: '0.9rem',
                fontWeight: 800,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', right: '10px', fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700 }}>
              S/./MWh
            </span>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3 }}>
            Ley 28749. Aplica sobre la energía activa retirada en <strong>Barra BRG</strong> (Kallpa La Curva).
          </span>
        </div>

        {/* 3. Cargo FISE */}
        <div
          style={{
            background: '#090d16',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.76rem', color: '#f8fafc', fontWeight: 700 }}>
              Fondo Inclusión Social (FISE)
            </span>
            <span style={{ fontSize: '0.65rem', color: '#c084fc', fontWeight: 800, background: 'rgba(192, 132, 252, 0.18)', padding: '1px 6px', borderRadius: '4px' }}>
              ctm. S/./kWh
            </span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              step="0.000001"
              value={cargoFise === 0 ? '' : cargoFise}
              onChange={(e) => onUpdate({ cargoFise: parseFloat(e.target.value) || 0 })}
              placeholder="1.315200"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '0.45rem 6.5rem 0.45rem 0.65rem',
                color: '#c084fc',
                fontSize: '0.9rem',
                fontWeight: 800,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', right: '10px', fontSize: '0.68rem', color: '#c084fc', fontWeight: 700 }}>
              ctm. S/./kWh
            </span>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3 }}>
            Ley 29852 / Osinergmin. Aplica sobre la energía activa en <strong>Barra BRG</strong> (Kallpa La Curva).
          </span>
        </div>
      </div>
    </div>
  );
};

export default CardOtrosCargos;
