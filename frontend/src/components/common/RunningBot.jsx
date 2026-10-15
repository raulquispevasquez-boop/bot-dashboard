import React from 'react';

const RunningBot = ({ isRunning, size = 36 }) => {
  const containerSize = Math.round(size * 1.16); // e.g. 36 * 1.16 = 42px
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: `${containerSize}px`,
      height: `${containerSize}px`,
      verticalAlign: 'middle',
      marginLeft: '0.5rem'
    }}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={isRunning ? "bot-running-anim" : ""}
        style={{
          color: isRunning ? '#22c55e' : '#6b7280',
          filter: isRunning ? 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.6))' : 'none',
          transition: 'all 0.3s ease',
          width: '100%',
          height: '100%',
          overflow: 'visible'
        }}
      >
        {/* Head */}
        <rect x="9" y="2" width="6" height="5" rx="1.5" fill="currentColor" fillOpacity={isRunning ? "0.2" : "0.1"} />
        {/* Antennas / Ears */}
        <path d="M8 4.5h1M15 4.5h1" />
        {/* Eyes */}
        <circle cx="11" cy="4.5" r="0.5" fill={isRunning ? "#60a5fa" : "#9ca3af"} />
        <circle cx="13" cy="4.5" r="0.5" fill={isRunning ? "#60a5fa" : "#9ca3af"} />
        {/* Neck */}
        <path d="M12 7v1" />
        {/* Body / Chest */}
        <rect x="8" y="8" width="8" height="7" rx="1" fill="currentColor" fillOpacity={isRunning ? "0.15" : "0.05"} />
        {/* Arms & Legs */}
        <path className="bot-arm-left" d="M8 10l-3 2 1 2.5" />
        <path className="bot-arm-right" d="M16 10l3 1-1 2.5" />
        <path className="bot-leg-left" d="M10 15l-1.5 3 1.5 2" />
        <path className="bot-leg-right" d="M14 15l1.5 2.5 1 1.5" />
      </svg>
    </div>
  );
};

export default RunningBot;
