import React from 'react';

// Formatea segundos restantes en formato compacto para caber en el anillo:
// "h:mm" si falta 1 hora o mas, "m:ss" si falta menos de una hora.
const formatRemaining = (secs) => {
  if (secs == null || isNaN(secs)) return '--';
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Anillo animado de cuenta regresiva. Si se conoce totalSeconds, el arco se
// vacía proporcionalmente al tiempo restante (modo INTERVALO). Si no se
// conoce (p.ej. modo HORAS FIJAS, donde no hay un "ciclo total" fijo), el
// anillo respira con un pulso indeterminado en vez de vaciarse con precisión.
const CountdownRing = ({
  remainingSeconds = null,
  totalSeconds = null,
  color = '#e4a02b',
  size = 52,
  label = 'Próxima ejecución',
  active = true
}) => {
  const strokeWidth = Math.max(3, Math.round(size * 0.07));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasTotal = totalSeconds != null && totalSeconds > 0 && remainingSeconds != null;
  const fraction = hasTotal ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : null;
  const dashOffset = hasTotal ? circumference * (1 - fraction) : circumference * 0.28;

  const timeText = formatRemaining(remainingSeconds);

  return (
    <div
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={!hasTotal && active ? 'spin-anim' : ''}
        style={{
          transform: 'rotate(-90deg)',
          filter: active ? `drop-shadow(0 0 6px ${color}88)` : 'none'
        }}
      >
        {/* Pista de fondo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`${color}2A`}
          strokeWidth={strokeWidth}
        />
        {/* Arco de progreso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: hasTotal ? 'stroke-dashoffset 1s linear' : 'none'
          }}
        />
      </svg>
      <div
        className={active ? 'countdown-ring-glow' : ''}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${Math.max(9, Math.round(size * 0.22))}px`,
          fontWeight: 800,
          color: color,
          fontFamily: 'monospace',
          letterSpacing: '-0.02em'
        }}
      >
        {timeText}
      </div>
    </div>
  );
};

export default CountdownRing;
