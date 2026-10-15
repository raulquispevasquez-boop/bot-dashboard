import { useState, useEffect, useRef } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Tabla chica y editable a mano (a diferencia de las 5 tablas espejo de
// Itlus 2, esta vive directo en public.itlus_palabras_clave del proyecto
// BOT). Cada campo se guarda solo con un pequeño debounce mientras se
// escribe, para no mandar un PATCH por cada tecla.
export function usePalabrasClave() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const timeoutsRef = useRef({});

  useEffect(() => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/palabras-clave`)
      .then((r) => r.json())
      .then((d) => setFilas(d.success ? d.data : []))
      .finally(() => setCargando(false));
  }, []);

  const agregarFila = () => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/palabras-clave`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setFilas((prev) => [...prev, d.data]); });
  };

  const editarCampo = (id, campo, valor) => {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
    const clave = `${id}-${campo}`;
    if (timeoutsRef.current[clave]) clearTimeout(timeoutsRef.current[clave]);
    timeoutsRef.current[clave] = setTimeout(() => {
      fetch(`${backendBaseUrl}/api/itlus-fractal/palabras-clave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      });
    }, 600);
  };

  const quitarFila = (id) => {
    setFilas((prev) => prev.filter((f) => f.id !== id));
    fetch(`${backendBaseUrl}/api/itlus-fractal/palabras-clave/${id}`, { method: 'DELETE' });
  };

  return { filas, cargando, agregarFila, editarCampo, quitarFila };
}
