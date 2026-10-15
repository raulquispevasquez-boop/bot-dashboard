import React from 'react';

const Bot6 = ({ bot, logs, onStart, onStop }) => {
  return (
    <div className="bot-panel">
      <h3 style={{ marginBottom: '1rem' }}>Bot 6</h3>
      <div className="console-container" style={{ minHeight: '300px', backgroundColor: '#000', padding: '1rem', borderRadius: '8px', border: '1px solid #222' }}>
         <div style={{ color: '#666', fontFamily: 'monospace' }}>
            {logs && logs.length > 0 ? (
                logs.map((l, i) => <div key={i}>{l.message}</div>)
            ) : (
                "El bot está inactivo. Presiona 'Iniciar' para comenzar..."
            )}
         </div>
      </div>
    </div>
  );
};

export default Bot6;
