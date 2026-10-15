import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import FilaSedeToggle from './FilaSedeToggle';
import InterruptorMini from './InterruptorMini';

// Un grupo colapsable del árbol (Plaza Vea / Makro / Vivanda / Otros).
// Abierto por defecto solo si tiene pocas sedes, para no abrumar con
// las 515 desplegadas de una — el usuario abre lo que le interesa.
// El interruptor de la cabecera prende/apaga TODAS las sedes del grupo.
const GrupoMarca = ({ nombre, sedes, sedesActivas, cargandoIds, sedesConCambios, onToggle, onToggleGrupo, onActualizarAlerta }) => {
  const [abierto, setAbierto] = useState(sedes.length <= 15);

  const ids = sedes.map((s) => s.id_location);
  const todasActivas = ids.length > 0 && ids.every((id) => sedesActivas.includes(id));
  const algunaActiva = ids.some((id) => sedesActivas.includes(id));

  return (
    <div style={{ borderBottom: '1px solid #334155' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.6rem' }}>
        <InterruptorMini
          activo={todasActivas}
          parcial={algunaActiva && !todasActivas}
          onClick={() => onToggleGrupo(ids, !todasActivas)}
          titulo={todasActivas ? `Apagar las ${sedes.length} sedes de ${nombre}` : `Prender las ${sedes.length} sedes de ${nombre}`}
        />
        <button
          onClick={() => setAbierto((a) => !a)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, textAlign: 'left',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: '#93c5fd', fontSize: '0.78rem', fontWeight: 700,
          }}
        >
          {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {nombre}
          <span style={{ color: '#64748b', fontWeight: 500 }}>({sedes.length})</span>
        </button>
      </div>
      {abierto && sedes.map((sede) => (
        <FilaSedeToggle
          key={sede.id_location}
          sede={sede}
          activa={sedesActivas.includes(sede.id_location)}
          cargando={cargandoIds.includes(sede.id_location)}
          tieneAlerta={sedesConCambios.includes(sede.id_location)}
          onToggle={onToggle}
          onActualizarAlerta={onActualizarAlerta}
        />
      ))}
    </div>
  );
};

export default GrupoMarca;
