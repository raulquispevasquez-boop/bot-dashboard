import { useState, useEffect, useMemo } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Trae la lista de botones (tablas permitidas) una vez, y los datos
// completos de la tabla elegida cada vez que cambia — son tablas chicas
// (decenas/cientos de filas), así que el buscador/orden se resuelven acá
// mismo en memoria, sin volver a pedirle nada al servidor por cada tecla.
export function useTablaSistema() {
  const [tablas, setTablas] = useState([]);
  const [tablaId, setTablaId] = useState(null);
  const [estado, setEstado] = useState('idle'); // idle | cargando | error | listo
  const [filas, setFilas] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState({ columna: null, direccion: 'asc' });
  const [actualizadoEl, setActualizadoEl] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [actualizaciones, setActualizaciones] = useState({});

  useEffect(() => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/sistema/tablas`)
      .then((r) => r.json())
      .then((d) => setTablas(d.success ? d.data : []))
      .catch(() => setTablas([]));
    revisarAlarmas();
  }, []);

  // Chequeo barato (solo cuenta filas, ~2 bytes por tabla) para saber qué
  // botones deben mostrar el punto rojo de "hay una actualización".
  const revisarAlarmas = () => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/sistema/estado`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const mapa = {};
        d.data.forEach((t) => { mapa[t.tabla_id] = t.hayActualizacion; });
        setActualizaciones(mapa);
      })
      .catch(() => {});
  };

  const elegirTabla = (id) => {
    setTablaId(id);
    setBusqueda('');
    setOrden({ columna: null, direccion: 'asc' });
    setEstado('cargando');
    fetch(`${backendBaseUrl}/api/itlus-fractal/sistema/tabla/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setEstado('error'); return; }
        setFilas(d.data);
        setTitulo(d.titulo || '');
        setActualizadoEl(d.actualizado_el || null);
        setEstado('listo');
      })
      .catch(() => setEstado('error'));
  };

  // Botón "Actualizar ahora": inicia un job en el servidor y lo consulta
  // cada 400ms para mostrar una barra de progreso con porcentaje real.
  const refrescar = () => {
    if (!tablaId) return;
    const idAlIniciar = tablaId;
    setRefrescando(true);
    setProgreso(0);
    fetch(`${backendBaseUrl}/api/itlus-fractal/sistema/tabla/${idAlIniciar}/actualizar`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !d.jobId) { setRefrescando(false); setProgreso(null); return; }
        const intervalo = setInterval(() => {
          fetch(`${backendBaseUrl}/api/itlus-fractal/sistema/actualizar-estado/${d.jobId}`)
            .then((r) => r.json())
            .then((estadoJob) => {
              if (!estadoJob.success) { clearInterval(intervalo); setRefrescando(false); setProgreso(null); return; }
              setProgreso(estadoJob.progreso ?? 0);
              if (estadoJob.terminado) {
                clearInterval(intervalo);
                if (!estadoJob.error && estadoJob.resultado) {
                  if (tablaId === idAlIniciar) {
                    setFilas(estadoJob.resultado.data);
                    setActualizadoEl(estadoJob.resultado.actualizado_el);
                  }
                  setActualizaciones((prev) => ({ ...prev, [idAlIniciar]: false }));
                }
                setRefrescando(false);
                setTimeout(() => setProgreso(null), 600);
              }
            })
            .catch(() => { clearInterval(intervalo); setRefrescando(false); setProgreso(null); });
        }, 400);
      })
      .catch(() => { setRefrescando(false); setProgreso(null); });
  };

  const columnas = useMemo(() => (filas[0] ? Object.keys(filas[0]) : []), [filas]);

  const cambiarOrden = (columna) => {
    setOrden((prev) => (
      prev.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' }
    ));
  };

  const filasFiltradas = useMemo(() => {
    let resultado = filas;
    if (busqueda.trim()) {
      const texto = busqueda.trim().toLowerCase();
      resultado = resultado.filter((fila) => Object.values(fila).some((v) => String(v ?? '').toLowerCase().includes(texto)));
    }
    if (orden.columna) {
      resultado = [...resultado].sort((a, b) => {
        const va = a[orden.columna] ?? '';
        const vb = b[orden.columna] ?? '';
        const cmp = String(va).localeCompare(String(vb), 'es', { numeric: true });
        return orden.direccion === 'asc' ? cmp : -cmp;
      });
    }
    return resultado;
  }, [filas, busqueda, orden]);

  return {
    tablas, tablaId, elegirTabla, estado, titulo,
    columnas, filasFiltradas, totalFilas: filas.length,
    busqueda, setBusqueda, orden, cambiarOrden,
    actualizadoEl, refrescar, refrescando, progreso,
    actualizaciones,
  };
}
