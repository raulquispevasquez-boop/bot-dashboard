import { useState, useEffect, useRef, useMemo } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Base completa de sedes+equipos de Fracttal (515 sedes). Se lee de la
// copia local del servidor (instantáneo). Selección MÚLTIPLE por toggle:
// cada sede prendida agrega sus equipos a una tabla combinada (con
// columna "Sede"), no reemplaza la vista como antes.
export function useActivosMaestros() {
  const [sedes, setSedes] = useState([]);
  const [actualizadoEl, setActualizadoEl] = useState(null);
  const [origen, setOrigen] = useState(null);
  const [sedesActivas, setSedesActivas] = useState([]); // ids prendidos, en orden
  const [equiposPorSede, setEquiposPorSede] = useState({}); // id_location -> equipos[]
  const [cargandoIds, setCargandoIds] = useState([]);
  const [actualizando, setActualizando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [mensajeProgreso, setMensajeProgreso] = useState('');
  const [errorActualizar, setErrorActualizar] = useState(null);
  const intervaloRef = useRef(null);

  const cargarSedes = () => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/sedes`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setSedes(d.data);
        setActualizadoEl(d.actualizado_el);
        setOrigen(d.origen);
      })
      .catch(() => {});
  };

  const seguirJob = (jobId) => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    setActualizando(true);
    intervaloRef.current = setInterval(() => {
      fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/actualizar-estado/${jobId}`)
        .then((r) => r.json())
        .then((estadoJob) => {
          if (!estadoJob.success) { clearInterval(intervaloRef.current); setActualizando(false); return; }
          setProgreso(estadoJob.progreso ?? 0);
          setMensajeProgreso(estadoJob.mensaje || '');
          if (estadoJob.sedesParciales) setSedes(estadoJob.sedesParciales);
          if (estadoJob.terminado) {
            clearInterval(intervaloRef.current);
            setActualizando(false);
            if (estadoJob.error) setErrorActualizar(estadoJob.error);
            else { cargarSedes(); setEquiposPorSede({}); }
            setTimeout(() => setProgreso(null), 1200);
          }
        })
        .catch(() => { clearInterval(intervaloRef.current); setActualizando(false); });
    }, 800);
  };

  useEffect(() => {
    cargarSedes();
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/actualizar-estado`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !d.enCurso) return;
        setProgreso(d.progreso ?? 0);
        if (d.sedesParciales) setSedes(d.sedesParciales);
        seguirJob(d.jobId);
      })
      .catch(() => {});
    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
  }, []);

  // Prende/apaga una sede en la tabla combinada — trae sus equipos la
  // primera vez que se prende, después queda en caché en memoria.
  const toggleSede = (idLocation) => {
    const yaActiva = sedesActivas.includes(idLocation);
    if (yaActiva) {
      setSedesActivas((prev) => prev.filter((id) => id !== idLocation));
      return;
    }
    setSedesActivas((prev) => [...prev, idLocation]);
    if (equiposPorSede[idLocation]) return; // ya en caché
    setCargandoIds((prev) => [...prev, idLocation]);
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/sede/${idLocation}`)
      .then((r) => r.json())
      .then((d) => setEquiposPorSede((prev) => ({ ...prev, [idLocation]: d.success ? d.data.equipos : [] })))
      .catch(() => setEquiposPorSede((prev) => ({ ...prev, [idLocation]: [] })))
      .finally(() => setCargandoIds((prev) => prev.filter((id) => id !== idLocation)));
  };

  // Prende/apaga VARIAS sedes de una — para el toggle de cabecera de cada
  // grupo (marca) y el interruptor maestro del árbol completo. Al prender,
  // trae en paralelo solo las que todavía no están en caché.
  const toggleVarias = (ids, encender) => {
    if (!encender) {
      setSedesActivas((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSedesActivas((prev) => Array.from(new Set([...prev, ...ids])));
    const faltantes = ids.filter((id) => !equiposPorSede[id]);
    if (faltantes.length === 0) return;
    setCargandoIds((prev) => Array.from(new Set([...prev, ...faltantes])));
    Promise.all(faltantes.map((id) => (
      fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/sede/${id}`)
        .then((r) => r.json())
        .then((d) => ({ id, equipos: d.success ? d.data.equipos : [] }))
        .catch(() => ({ id, equipos: [] }))
    ))).then((resultados) => {
      setEquiposPorSede((prev) => {
        const nuevo = { ...prev };
        resultados.forEach(({ id, equipos }) => { nuevo[id] = equipos; });
        return nuevo;
      });
      setCargandoIds((prev) => prev.filter((id) => !faltantes.includes(id)));
    });
  };

  const filasCombinadas = useMemo(() => {
    const filas = [];
    sedesActivas.forEach((id) => {
      const sedeInfo = sedes.find((s) => s.id_location === id);
      (equiposPorSede[id] || []).forEach((eq) => {
        filas.push({ ...eq, sedeDescripcion: sedeInfo?.description || '', sedeId: id });
      });
    });
    return filas;
  }, [sedesActivas, equiposPorSede, sedes]);

  const actualizar = () => {
    setActualizando(true);
    setProgreso(0);
    setErrorActualizar(null);
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/actualizar`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !d.jobId) { setActualizando(false); setErrorActualizar(d.error || 'No se pudo iniciar la actualización.'); return; }
        seguirJob(d.jobId);
      })
      .catch(() => { setActualizando(false); setErrorActualizar('No se pudo conectar con el servidor.'); });
  };

  // Actualiza (o agrega) UNA sola sede — usado al hacer clic en una
  // alerta puntual de "Revisar actualizaciones".
  const actualizarUnaSede = (idLocation) => {
    setCargandoIds((prev) => [...prev, idLocation]);
    return fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/sede/${idLocation}/actualizar`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return false;
        const sede = d.data;
        setEquiposPorSede((prev) => (sedesActivas.includes(idLocation) ? { ...prev, [idLocation]: sede.equipos } : prev));
        setSedes((prev) => {
          const existe = prev.some((s) => s.id_location === idLocation);
          const fila = { id_location: sede.id_location, code: sede.code, description: sede.description, total_equipos: sede.equipos.length };
          return existe ? prev.map((s) => (s.id_location === idLocation ? fila : s)) : [...prev, fila];
        });
        return true;
      })
      .catch(() => false)
      .finally(() => setCargandoIds((prev) => prev.filter((id) => id !== idLocation)));
  };

  return {
    sedes, actualizadoEl, origen,
    sedesActivas, toggleSede, toggleVarias, cargandoIds, filasCombinadas,
    actualizar, actualizando, progreso, mensajeProgreso, errorActualizar,
    actualizarUnaSede,
  };
}
