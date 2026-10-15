import { useState, useEffect, useRef } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Búsqueda GLOBAL: a diferencia del filtro del árbol (que solo busca por
// nombre de sede), esto busca en TODOS los equipos de las 515 sedes en
// el servidor (ya está todo en memoria, instantáneo) — cubre sede,
// descripción y código del equipo.
export function useBusquedaGlobal(query) {
  const [resultados, setResultados] = useState([]);
  const [recortado, setRecortado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const texto = query.trim();
    if (texto.length < 2) {
      setResultados([]);
      setRecortado(false);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setBuscando(true);
      fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/buscar?q=${encodeURIComponent(texto)}`)
        .then((r) => r.json())
        .then((d) => {
          setResultados(d.success ? d.data : []);
          setRecortado(!!d.recortado);
        })
        .catch(() => { setResultados([]); setRecortado(false); })
        .finally(() => setBuscando(false));
    }, 350);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query]);

  return { resultados, recortado, buscando };
}
