import React, { useState } from 'react';
import { Database, Tags, Boxes } from 'lucide-react';
import { useTablaSistema } from './hooks/useTablaSistema';
import VisorTablaGenerica from './components/VisorTablaGenerica';
import TablaPalabrasClave from '../palabras_clave/TablaPalabrasClave';
import ActivosMaestrosFracttal from '../activos_maestros/ActivosMaestrosFracttal';

// Itlus 2: un botón por cada tabla permitida del OTRO proyecto Supabase
// ("API SISTEMA MANTENIMIENTO"), a la izquierda. Al elegir una, se trae
// completa (son tablas chicas) y se muestra en una grilla con buscador,
// orden por columna y paginación.
const VisorTablasSistema = () => {
  const {
    tablas, tablaId, elegirTabla, estado, titulo, columnas, filasFiltradas, totalFilas,
    busqueda, setBusqueda, orden, cambiarOrden, actualizadoEl, refrescar, refrescando, progreso,
    actualizaciones,
  } = useTablaSistema();
  const [vistaEspecial, setVistaEspecial] = useState(null); // null | 'palabras_clave' | 'activos_maestros'

  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '220px', flexShrink: 0 }}>
        {tablas.map((t) => (
          <button
            key={t.id}
            onClick={() => { elegirTabla(t.id); setVistaEspecial(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
              background: !vistaEspecial && tablaId === t.id ? 'rgba(56,189,248,0.12)' : 'transparent',
              border: `1px solid ${!vistaEspecial && tablaId === t.id ? '#38bdf855' : '#334155'}`, borderRadius: '8px',
              padding: '0.6rem 0.8rem', color: !vistaEspecial && tablaId === t.id ? '#38bdf8' : '#cbd5e1',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Database size={14} style={{ flexShrink: 0 }} />
            {t.titulo}
            {actualizaciones[t.id] && (
              <span
                title="Hay una actualización en Supabase"
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#f87171', flexShrink: 0, marginLeft: 'auto',
                  boxShadow: '0 0 0 2px rgba(248,113,113,0.25)',
                }}
              />
            )}
          </button>
        ))}
        {tablas.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Cargando lista de tablas…</p>
        )}
        <button
          onClick={() => setVistaEspecial('activos_maestros')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
            background: vistaEspecial === 'activos_maestros' ? 'rgba(56,189,248,0.12)' : 'transparent',
            border: `1px solid ${vistaEspecial === 'activos_maestros' ? '#38bdf855' : '#334155'}`, borderRadius: '8px',
            padding: '0.6rem 0.8rem', color: vistaEspecial === 'activos_maestros' ? '#38bdf8' : '#cbd5e1',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Boxes size={14} style={{ flexShrink: 0 }} />
          Activos Maestros Fracttal
        </button>
        <button
          onClick={() => setVistaEspecial('palabras_clave')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
            background: vistaEspecial === 'palabras_clave' ? 'rgba(56,189,248,0.12)' : 'transparent',
            border: `1px solid ${vistaEspecial === 'palabras_clave' ? '#38bdf855' : '#334155'}`, borderRadius: '8px',
            padding: '0.6rem 0.8rem', color: vistaEspecial === 'palabras_clave' ? '#38bdf8' : '#cbd5e1',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Tags size={14} style={{ flexShrink: 0 }} />
          Palabras Clave
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {vistaEspecial === 'activos_maestros' ? (
          <ActivosMaestrosFracttal />
        ) : vistaEspecial === 'palabras_clave' ? (
          <TablaPalabrasClave />
        ) : estado === 'idle' ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Elige una tabla de la izquierda para verla acá.</p>
        ) : estado === 'cargando' ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Cargando…</p>
        ) : estado === 'error' ? (
          <p style={{ color: '#f87171', fontSize: '0.85rem' }}>No se pudo cargar esta tabla.</p>
        ) : estado === 'listo' && (
          <VisorTablaGenerica
            titulo={titulo}
            columnas={columnas}
            filas={filasFiltradas}
            totalFilas={totalFilas}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            orden={orden}
            cambiarOrden={cambiarOrden}
            actualizadoEl={actualizadoEl}
            refrescar={refrescar}
            refrescando={refrescando}
            progreso={progreso}
            hayActualizacion={!!actualizaciones[tablaId]}
          />
        )}
      </div>
    </div>
  );
};

export default VisorTablasSistema;
