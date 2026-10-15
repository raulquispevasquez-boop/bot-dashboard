import React from 'react';
import { Loader2 } from 'lucide-react';
import InterruptorMini from './InterruptorMini';

// Una sede dentro del árbol: interruptor on/off (prende/apaga sus
// equipos en la tabla combinada) + punto de alerta si "Revisar
// actualizaciones" detectó un cambio en ella.
const FilaSedeToggle = ({ sede, activa, cargando, tieneAlerta, onToggle, onActualizarAlerta }) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem 0.4rem 1.4rem',
      borderBottom: '1px solid #1e293b', fontSize: '0.73rem',
    }}
  >
    <InterruptorMini activo={activa} onClick={() => onToggle(sede.id_location)} titulo={activa ? 'Apagar' : 'Prender'} />
    <span style={{ flex: 1, color: activa ? '#e2e8f0' : '#94a3b8', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {sede.description}
    </span>
    <span style={{ color: '#475569', fontSize: '0.68rem', flexShrink: 0 }}>{sede.total_equipos}</span>
    {cargando && <Loader2 size={11} className="spin-anim" color="#64748b" style={{ flexShrink: 0 }} />}
    {tieneAlerta && !cargando && (
      <button
        onClick={() => onActualizarAlerta(sede.id_location)}
        title="Hay cambios en esta sede — clic para actualizarla"
        style={{
          width: '8px', height: '8px', borderRadius: '50%', background: '#f87171', border: 'none',
          cursor: 'pointer', flexShrink: 0, boxShadow: '0 0 0 2px rgba(248,113,113,0.25)',
        }}
      />
    )}
  </div>
);

export default FilaSedeToggle;
