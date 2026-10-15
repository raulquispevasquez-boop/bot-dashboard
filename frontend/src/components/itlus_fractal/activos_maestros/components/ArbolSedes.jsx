import React, { useMemo } from 'react';
import { Search } from 'lucide-react';
import GrupoMarca from './GrupoMarca';
import InterruptorMini from './InterruptorMini';
import { clasificarMarca, ORDEN_MARCAS } from '../clasificarMarca';

// Árbol de sedes agrupado por marca (Plaza Vea / Makro / Vivanda / Otros).
// El buscador vive en el padre (busca EQUIPOS de las 515 sedes, no solo
// nombres de sede) — acá se reusa el mismo texto para filtrar la lista de
// sedes visible, así los dos usos comparten una sola caja de búsqueda.
const ArbolSedes = ({ sedes, sedesActivas, cargandoIds, sedesConCambios, onToggle, onToggleGrupo, onActualizarAlerta, busqueda, setBusqueda }) => {
  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return sedes;
    const t = busqueda.trim().toLowerCase();
    return sedes.filter((s) => s.description.toLowerCase().includes(t) || s.code.toLowerCase().includes(t));
  }, [sedes, busqueda]);

  const grupos = useMemo(() => {
    const mapa = {};
    ORDEN_MARCAS.forEach((m) => { mapa[m] = []; });
    filtradas.forEach((s) => {
      const marca = clasificarMarca(s.description);
      (mapa[marca] || (mapa[marca] = [])).push(s);
    });
    return ORDEN_MARCAS.filter((m) => mapa[m]?.length).map((m) => ({ nombre: m, sedes: mapa[m] }));
  }, [filtradas]);

  const todosLosIds = useMemo(() => sedes.map((s) => s.id_location), [sedes]);
  const todasActivas = todosLosIds.length > 0 && todosLosIds.every((id) => sedesActivas.includes(id));
  const algunaActiva = todosLosIds.some((id) => sedesActivas.includes(id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '300px', flexShrink: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <InterruptorMini
          activo={todasActivas}
          parcial={algunaActiva && !todasActivas}
          onClick={() => onToggleGrupo(todosLosIds, !todasActivas)}
          titulo={todasActivas ? `Apagar las ${sedes.length} sedes` : `Prender las ${sedes.length} sedes`}
        />
        <span style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 700 }}>Todas</span>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} color="#64748b" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
              padding: '0.4rem 0.6rem 0.4rem 1.7rem', color: '#fff', fontSize: '0.78rem',
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
        {grupos.map((g) => (
          <GrupoMarca
            key={g.nombre}
            nombre={g.nombre}
            sedes={g.sedes}
            sedesActivas={sedesActivas}
            cargandoIds={cargandoIds}
            sedesConCambios={sedesConCambios}
            onToggle={onToggle}
            onToggleGrupo={onToggleGrupo}
            onActualizarAlerta={onActualizarAlerta}
          />
        ))}
        {grupos.length === 0 && (
          <p style={{ padding: '0.6rem', fontSize: '0.72rem', color: '#64748b' }}>Sin resultados.</p>
        )}
      </div>
    </div>
  );
};

export default ArbolSedes;
