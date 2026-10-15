import React, { useState } from 'react';
import { Clock, Sun, Moon } from 'lucide-react';
import { getTrelloCardStyle, inputFieldStyle } from '../utils/trelloCardStyles';

const ACCENT = '#06b6d4'; // Cyan Eléctrico

const calcularMinutosDesdeMedianoche = (horaStr = '00:00') => {
  const [h = 0, m = 0] = horaStr.split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};

const CardIntervaloHorasPunta = ({ data, onUpdate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const {
    horaInicio = '18:00',
    horaFin = '23:00',
    diasAplica = 'Lunes a Sábado',
  } = data || {};

  // Cálculo automático del intervalo de Horas Punta y Fuera de Punta
  const minInicio = calcularMinutosDesdeMedianoche(horaInicio);
  const minFin = calcularMinutosDesdeMedianoche(horaFin);

  let duracionPuntaMin = minFin >= minInicio ? minFin - minInicio : 24 * 60 - minInicio + minFin;
  let duracionFueraPuntaMin = 24 * 60 - duracionPuntaMin;

  const formatoHoras = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  // Texto del intervalo fuera de punta
  const textoFueraPunta = `${horaFin} a ${horaInicio} (Resto del día) + Domingos y Feriados`;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getTrelloCardStyle(ACCENT, isHovered)}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: ACCENT }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.2)', border: '1px solid rgba(6, 182, 212, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={17} color={ACCENT} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#f8fafc', fontWeight: 800 }}>
              Intervalo Horas Punta (HP) y Fuera de Punta (HFP)
            </h4>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Bloques horarios para facturación de potencia y energía
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
        {/* Bloque 1: Configuración de Horas Punta (Ingreso manual) */}
        <div style={{ background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sun size={14} color="#f59e0b" />
              <span style={{ fontSize: '0.74rem', color: '#f8fafc', fontWeight: 700 }}>Horas Punta (HP)</span>
            </div>
            <span style={{ fontSize: '0.64rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
              {formatoHoras(duracionPuntaMin)} / día
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                Hora Inicio:
              </label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => onUpdate({ horaInicio: e.target.value })}
                style={inputFieldStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                Hora Fin:
              </label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => onUpdate({ horaFin: e.target.value })}
                style={inputFieldStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.66rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
              Días de Aplicación:
            </label>
            <select
              value={diasAplica}
              onChange={(e) => onUpdate({ diasAplica: e.target.value })}
              style={{ ...inputFieldStyle, color: '#f8fafc', fontSize: '0.78rem' }}
            >
              <option value="Lunes a Sábado">Lunes a Sábado (Estándar COES / Perú)</option>
              <option value="Lunes a Viernes">Lunes a Viernes</option>
              <option value="Todos los días">Todos los días (Lunes a Domingo)</option>
            </select>
          </div>
        </div>

        {/* Bloque 2: Horas Fuera de Punta (Por defecto / Calculado restante) */}
        <div style={{ background: '#090d16', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '8px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Moon size={14} color="#38bdf8" />
                <span style={{ fontSize: '0.74rem', color: '#f8fafc', fontWeight: 700 }}>Horas Fuera de Punta (HFP)</span>
              </div>
              <span style={{ fontSize: '0.64rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                Por Defecto (Restante)
              </span>
            </div>

            <div style={{ fontSize: '0.74rem', color: '#67e8f9', fontWeight: 700, background: 'rgba(6, 182, 212, 0.1)', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(6, 182, 212, 0.25)', marginBottom: '0.35rem' }}>
              {textoFueraPunta}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.3 }}>
              Duración en días laborables: <strong style={{ color: '#f8fafc' }}>{formatoHoras(duracionFueraPuntaMin)}</strong> (el 100% de domingos y feriados se liquida como Fuera de Punta).
            </div>
          </div>

          <div style={{ background: '#0f172a', borderRadius: '5px', padding: '0.35rem 0.55rem', fontSize: '0.65rem', color: '#94a3b8', border: '1px solid #1e293b' }}>
            ℹ️ Las potencias y energías medidas en este intervalo se facturarán con la tarifa base de Horas Fuera de Punta.
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardIntervaloHorasPunta;
