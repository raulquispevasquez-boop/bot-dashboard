import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { getTrelloCardStyle } from '../utils/trelloCardStyles';

const ACCENT = '#14b8a6';

const CAMPOS_PEAJES = [
  { key: 'peajePrincipal', label: 'Peaje Principal', unidad: 'S/./kW', step: '0.001' },
  { key: 'peajeSecundarioAD15', label: 'Peaje Secundario (AD15-MT)', unidad: 'ctm. S/./kWh', step: '0.001' },
  { key: 'peajeSecundarioAD7', label: 'Peaje Secundario (AD7-MT)', unidad: 'ctm. S/./kWh', step: '0.001' },
  { key: 'peajeSecundarioCPSEE', label: 'Peaje Secundario (CPSEE)', unidad: 'ctm. S/./kWh', step: '0.001' },
  { key: 'cargoFijo', label: 'Cargo Fijo', unidad: 'S/.', step: '0.01' },
  { key: 'cargoMantenimiento', label: 'Cargo por Mantenimiento', unidad: 'S/.', step: '0.01' },
  { key: 'alumbradoPublico', label: 'Alumbrado Público', unidad: 'S/. (alícuota)', step: '0.01' },
  { key: 'vadHorasPunta', label: 'VAD - Horas Punta', unidad: 'S/./kW', step: '0.001' },
  { key: 'vadHorasFueraPunta', label: 'VAD - Horas Fuera de Punta', unidad: 'S/./kW', step: '0.001' },
  { key: 'excesoReactivaInductiva', label: 'Exceso Energía Reactiva Inductiva', unidad: 'ctm. S/./kVarh', step: '0.001' },
  { key: 'excesoReactivaCapacitiva', label: 'Exceso Energía Reactiva Capacitiva', unidad: 'ctm. S/./kVarh', step: '0.001' },
];

const CardPeajesRegulados = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const valores = data || {};

  const handleCambio = (key, valStr) => {
    const num = parseFloat(valStr);
    onUpdate({ [key]: isNaN(num) ? 0 : num });
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(20, 184, 166, 0.2)', border: '1px solid rgba(20, 184, 166, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', fontWeight: 800 }}>
              PEAJES Y CARGOS REGULADOS
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Precios unitarios regulados por Osinergmin</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.65rem' }}>
        {CAMPOS_PEAJES.map((item) => {
          const val = valores[item.key] ?? 0;
          return (
            <div
              key={item.key}
              style={{
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0.45rem 0.65rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: '0.64rem', color: '#2dd4bf', fontWeight: 700 }}>{item.unidad}</span>
              </div>
              <input
                type="number"
                step={item.step}
                value={val === 0 ? '' : val}
                onChange={(e) => handleCambio(item.key, e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '5px',
                  padding: '0.35rem 0.55rem',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardPeajesRegulados;
