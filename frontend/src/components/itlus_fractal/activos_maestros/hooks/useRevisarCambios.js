import { useState, useEffect, useRef } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Botón único "Revisar actualizaciones": chequeo liviano (no descarga
// equipos, solo cuenta) que detecta sedes nuevas y sedes con cambios —
// nunca actualiza nada solo, deja los resultados como alertas para que
// el usuario decida qué actualizar puntualmente (ver useActivosMaestros).
export function useRevisarCambios() {
  const [revisando, setRevisando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [alertas, setAlertas] = useState({ sedesNuevas: [], sedesConCambios: [] });
  const [error, setError] = useState(null);
  const intervaloRef = useRef(null);

  const seguirJob = (jobId) => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    setRevisando(true);
    intervaloRef.current = setInterval(() => {
      fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/revisar-cambios/estado/${jobId}`)
        .then((r) => r.json())
        .then((estadoJob) => {
          if (!estadoJob.success) { clearInterval(intervaloRef.current); setRevisando(false); return; }
          setProgreso(estadoJob.progreso ?? 0);
          setMensaje(estadoJob.mensaje || '');
          if (estadoJob.terminado) {
            clearInterval(intervaloRef.current);
            setRevisando(false);
            if (estadoJob.error) setError(estadoJob.error);
            else if (estadoJob.resultado) setAlertas(estadoJob.resultado);
            setTimeout(() => setProgreso(null), 1200);
          }
        })
        .catch(() => { clearInterval(intervaloRef.current); setRevisando(false); });
    }, 1000);
  };

  useEffect(() => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/revisar-cambios/estado`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.enCurso) { setProgreso(d.progreso ?? 0); seguirJob(d.jobId); } })
      .catch(() => {});
    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
  }, []);

  const revisar = () => {
    setError(null);
    setProgreso(0);
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/revisar-cambios`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !d.jobId) { setError(d.error || 'No se pudo iniciar la revisión.'); return; }
        seguirJob(d.jobId);
      })
      .catch(() => setError('No se pudo conectar con el servidor.'));
  };

  const quitarAlertaSede = (idLocation) => {
    setAlertas((prev) => ({ ...prev, sedesConCambios: prev.sedesConCambios.filter((id) => id !== idLocation) }));
  };
  const quitarAlertaNueva = (idLocation) => {
    setAlertas((prev) => ({ ...prev, sedesNuevas: prev.sedesNuevas.filter((s) => s.id_location !== idLocation) }));
  };

  return { revisar, revisando, progreso, mensaje, alertas, error, quitarAlertaSede, quitarAlertaNueva };
}
