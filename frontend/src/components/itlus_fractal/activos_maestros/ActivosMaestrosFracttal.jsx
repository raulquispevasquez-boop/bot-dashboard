import React, { useState } from 'react';
import { RotateCw, AlertTriangle, RefreshCw } from 'lucide-react';
import { useActivosMaestros } from './hooks/useActivosMaestros';
import { useRevisarCambios } from './hooks/useRevisarCambios';
import { useBusquedaGlobal } from './hooks/useBusquedaGlobal';
import { useActivosGenericos } from './hooks/useActivosGenericos';
import ArbolSedes from './components/ArbolSedes';
import TablaEquiposCombinada from './components/TablaEquiposCombinada';
import BannerSedesNuevas from './components/BannerSedesNuevas';
import ModalResumenActivosGenericos from './components/ModalResumenActivosGenericos';

const formatearFecha = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

// Base completa de Activos Maestros de Fracttal (515 sedes, 30,000+
// equipos). El botón principal es "Revisar actualizaciones" (liviano:
// detecta sedes nuevas/con cambios y deja alertas puntuales — nunca
// reconstruye todo solo). "Reconstruir todo" queda aparte, para el
// refresco mensual real o si hace falta forzarlo.
const ActivosMaestrosFracttal = () => {
  const {
    sedes, actualizadoEl, origen,
    sedesActivas, toggleSede, toggleVarias, cargandoIds, filasCombinadas,
    actualizar, actualizando, progreso, mensajeProgreso, errorActualizar,
    actualizarUnaSede,
  } = useActivosMaestros();
  const {
    revisar, revisando, progreso: progresoRevision, mensaje: mensajeRevision,
    alertas, error: errorRevision, quitarAlertaSede, quitarAlertaNueva,
  } = useRevisarCambios();
  const [busqueda, setBusqueda] = useState('');
  const { resultados: resultadosBusqueda, recortado: busquedaRecortada, buscando } = useBusquedaGlobal(busqueda);
  const enModoBusqueda = busqueda.trim().length >= 2;
  const {
    calculando: calculandoActivoGenerico, resumen: resumenActivoGenerico, error: errorActivoGenerico,
    mostrarResumen, setMostrarResumen, alHacerClicEncabezado, calcular: recalcularActivoGenerico,
  } = useActivosGenericos();

  const fechaLegible = formatearFecha(actualizadoEl);

  const actualizarPuntual = async (idLocation) => {
    const ok = await actualizarUnaSede(idLocation);
    if (ok) { quitarAlertaSede(idLocation); quitarAlertaNueva(idLocation); }
  };

  return (
    <div className="bot-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Activos Maestros Fracttal</h3>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
              {sedes.length} sedes
              {fechaLegible && <> · copia local, actualizada {fechaLegible}</>}
              {!actualizadoEl && sedes.length === 0 && ' · sin datos todavía'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {revisando && progresoRevision !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '220px' }}>
                <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: '#1e293b', overflow: 'hidden' }}>
                  <div style={{ width: `${progresoRevision}%`, height: '100%', background: '#22c55e', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: '#86efac', fontWeight: 700, width: '2.4rem', textAlign: 'right' }}>{progresoRevision}%</span>
              </div>
            )}
            <button
              onClick={revisar}
              disabled={revisando}
              title="Chequeo liviano: detecta sedes nuevas o con cambios sin reconstruir nada — deja alertas puntuales para actualizar solo lo necesario"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                background: revisando ? 'none' : 'rgba(34,197,94,0.12)', border: `1px solid ${revisando ? '#334155' : '#22c55e55'}`,
                borderRadius: '6px', padding: '0.4rem 0.7rem', color: revisando ? '#475569' : '#4ade80',
                fontSize: '0.78rem', fontWeight: 700, cursor: revisando ? 'default' : 'pointer',
              }}
            >
              <RefreshCw size={13} className={revisando ? 'spin-anim' : undefined} />
              {revisando ? 'Revisando…' : 'Revisar actualizaciones'}
            </button>
          </div>
        </div>

        {revisando && mensajeRevision && <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>{mensajeRevision}</p>}
        {errorRevision && <p style={{ margin: 0, fontSize: '0.72rem', color: '#f87171' }}>{errorRevision}</p>}
        <BannerSedesNuevas sedesNuevas={alertas.sedesNuevas} cargandoIds={cargandoIds} onAgregar={actualizarPuntual} />

        {origen === 'supabase' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)',
            borderRadius: '6px', padding: '0.5rem 0.7rem', color: '#fca5a5', fontSize: '0.75rem',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            La copia local del archivo se perdió y esta vista se reconstruyó desde el respaldo en Supabase al iniciar el servidor — revisa que el archivo local esté bien.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
          {actualizando && progreso !== null && (
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{mensajeProgreso} ({progreso}%)</span>
          )}
          <button
            onClick={actualizar}
            disabled={actualizando}
            title="Reconstruye las 515 sedes completas desde cero (~15-25 min) — normalmente no hace falta, usa 'Revisar actualizaciones'"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: 'none', color: actualizando ? '#475569' : '#64748b',
              fontSize: '0.68rem', cursor: actualizando ? 'default' : 'pointer', textDecoration: 'underline',
            }}
          >
            <RotateCw size={11} className={actualizando ? 'spin-anim' : undefined} />
            {actualizando ? 'Reconstruyendo…' : 'Reconstruir todo desde cero'}
          </button>
        </div>
        {errorActualizar && <p style={{ margin: 0, fontSize: '0.72rem', color: '#f87171', textAlign: 'right' }}>{errorActualizar}</p>}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1rem' }}>
        <ArbolSedes
          sedes={sedes}
          sedesActivas={sedesActivas}
          cargandoIds={cargandoIds}
          sedesConCambios={alertas.sedesConCambios}
          onToggle={toggleSede}
          onToggleGrupo={toggleVarias}
          onActualizarAlerta={actualizarPuntual}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {enModoBusqueda && (
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: '#64748b' }}>
              {buscando ? 'Buscando…' : `Resultados para "${busqueda.trim()}" en las 515 sedes${busquedaRecortada ? ' (recortado a las primeras 3000 coincidencias)' : ''}`}
            </p>
          )}
          {errorActivoGenerico && <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: '#f87171' }}>{errorActivoGenerico}</p>}
          <TablaEquiposCombinada
            filas={enModoBusqueda ? resultadosBusqueda : filasCombinadas}
            etiqueta={enModoBusqueda ? null : (sedesActivas.length > 0 ? `${sedesActivas.length} sede${sedesActivas.length > 1 ? 's' : ''} prendida${sedesActivas.length > 1 ? 's' : ''}` : null)}
            mostrarVacio={enModoBusqueda ? resultadosBusqueda.length === 0 : sedesActivas.length === 0}
            tituloVacio={enModoBusqueda ? (buscando ? 'Buscando…' : 'Sin coincidencias.') : undefined}
            onClickActivoGenerico={alHacerClicEncabezado}
            calculandoActivoGenerico={calculandoActivoGenerico}
          />
        </div>
      </div>
      {mostrarResumen && (
        <ModalResumenActivosGenericos
          resumen={resumenActivoGenerico}
          calculando={calculandoActivoGenerico}
          onCerrar={() => setMostrarResumen(false)}
          onRecalcular={recalcularActivoGenerico}
        />
      )}
    </div>
  );
};

export default ActivosMaestrosFracttal;
