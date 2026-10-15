import { useState, useRef, useEffect } from 'react';

// Selector de activo en 2 pasos, replicando el flujo real de Fracttal:
// 1) Buscar y elegir la Ubicación (texto libre, ej. "la perla").
// 2) Elegir el Equipo puntual entre TODOS los que hay bajo esa ubicación
//    (puede haber 200+ — el filtro dentro de ese paso es local, en el
//    navegador, no otra llamada al servidor).
// Cada fila de la tabla manual usa su propia instancia de este hook — no
// se comparte estado entre filas.
const backendBaseUrl = window.location.origin.replace('5173', '3001');

export function useActivoPicker(initialUbicacionTexto = '') {
  const [pasoUbicacion, setPasoUbicacion] = useState({
    texto: initialUbicacionTexto || '', buscando: false, candidatos: [], mostrarLista: false, elegida: null,
  });
  const [pasoEquipo, setPasoEquipo] = useState({
    cargando: false, todos: [], filtroTexto: '', elegido: null,
  });
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (initialUbicacionTexto && initialUbicacionTexto.trim()) {
      buscarUbicacion(initialUbicacionTexto.trim());
    }
  }, [initialUbicacionTexto]);

  const buscarUbicacion = (texto) => {
    setPasoUbicacion((p) => ({ ...p, texto, elegida: null }));
    setPasoEquipo({ cargando: false, todos: [], filtroTexto: '', elegido: null });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!texto.trim()) {
      setPasoUbicacion((p) => ({ ...p, candidatos: [], mostrarLista: false }));
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setPasoUbicacion((p) => ({ ...p, buscando: true, mostrarLista: true }));
      fetch(`${backendBaseUrl}/api/itlus-fractal/buscar-activo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
        .then((r) => r.json())
        .then((d) => setPasoUbicacion((p) => ({ ...p, candidatos: d.success ? d.data : [], buscando: false })))
        .catch(() => setPasoUbicacion((p) => ({ ...p, candidatos: [], buscando: false })));
    }, 400);
  };

  const elegirUbicacion = (ubicacion) => {
    setPasoUbicacion((p) => ({ ...p, elegida: ubicacion, texto: ubicacion.description, mostrarLista: false, candidatos: [] }));
    setPasoEquipo({ cargando: true, todos: [], filtroTexto: '', elegido: null });
    fetch(`${backendBaseUrl}/api/itlus-fractal/listar-equipos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_location: ubicacion.id_item }),
    })
      .then((r) => r.json())
      .then((d) => setPasoEquipo((p) => ({ ...p, todos: d.success ? d.data : [], cargando: false })))
      .catch(() => setPasoEquipo((p) => ({ ...p, todos: [], cargando: false })));
  };

  const filtrarEquipo = (texto) => setPasoEquipo((p) => ({ ...p, filtroTexto: texto }));

  const elegirEquipo = (equipo) => setPasoEquipo((p) => ({ ...p, elegido: equipo }));

  const equiposFiltrados = pasoEquipo.filtroTexto.trim()
    ? pasoEquipo.todos.filter((e) => e.description.toLowerCase().includes(pasoEquipo.filtroTexto.trim().toLowerCase()))
    : pasoEquipo.todos;

  const reiniciar = () => {
    setPasoUbicacion({ texto: '', buscando: false, candidatos: [], mostrarLista: false, elegida: null });
    setPasoEquipo({ cargando: false, todos: [], filtroTexto: '', elegido: null });
  };

  return {
    pasoUbicacion, buscarUbicacion, elegirUbicacion,
    pasoEquipo, equiposFiltrados, filtrarEquipo, elegirEquipo,
    activoFinal: pasoEquipo.elegido,
    reiniciar,
  };
}
