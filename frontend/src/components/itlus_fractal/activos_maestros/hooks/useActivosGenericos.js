import { useState, useEffect } from 'react';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// Cruza la Descripción de cada equipo contra la Tabla de Activos Maestros
// (columna "ACTIVOS GENERICOS SPSA") para clasificarlo con su nombre
// genérico estándar. El cálculo vive en el servidor (recorre las 30,000+
// filas ya cargadas en memoria); acá solo se dispara y se guarda el
// resumen para mostrarlo al hacer clic en el encabezado.
export function useActivosGenericos() {
  const [calculando, setCalculando] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);
  const [mostrarResumen, setMostrarResumen] = useState(false);

  useEffect(() => {
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/resumen-activos-genericos`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.resumen) setResumen(d.resumen); })
      .catch(() => {});
  }, []);

  const calcular = () => {
    setCalculando(true);
    setError(null);
    fetch(`${backendBaseUrl}/api/itlus-fractal/activos-maestros/calcular-activos-genericos`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setError(d.error || 'No se pudo calcular.'); return; }
        setResumen(d.resumen);
        setMostrarResumen(true);
      })
      .catch(() => setError('No se pudo conectar con el servidor.'))
      .finally(() => setCalculando(false));
  };

  // Clic en el encabezado: si ya hay un resumen calculado, solo lo
  // muestra; si no, lo calcula primero (y de paso rellena la columna).
  const alHacerClicEncabezado = () => {
    if (resumen) setMostrarResumen(true);
    else calcular();
  };

  return { calcular, calculando, resumen, error, mostrarResumen, setMostrarResumen, alHacerClicEncabezado };
}
