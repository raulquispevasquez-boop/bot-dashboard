import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'facturacion_cliente_libre_medidores_virtuales_v1';

/**
 * Transforma nombres o unidades de Energía a Potencia de manera transparente
 * cuando se utilicen en tablas, cuadros o tarjetas de Potencia (kW / MW).
 */
export const adaptarNombreAPotencia = (texto = '') => {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .replace(/energ[ií]a/gi, (m) => (m === m.toUpperCase() ? 'POTENCIA' : m[0] === m[0].toUpperCase() ? 'Potencia' : 'potencia'))
    .replace(/\bkwh\b/gi, (m) => (m === m.toUpperCase() ? 'KW' : 'kW'))
    .replace(/\bmwh\b/gi, (m) => (m === m.toUpperCase() ? 'MW' : 'MW'));
};

/**
 * Hook y utilidades para gestión de Medidores Virtuales (Canales calculados por suma/resta)
 * Compartido entre Registros de Energía (Botón 1), Potencias (Botón 2) y Cálculos (Botón 4).
 */
export const useMedidoresVirtuales = () => {
  const [medidoresVirtuales, setMedidoresVirtuales] = useState(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error al cargar medidores virtuales de localStorage:', e);
    }
    return [];
  });

  const guardarEnStorage = useCallback((nuevos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos));
      // Notificar a otras ventanas o pestañas
      window.dispatchEvent(new Event('medidores_virtuales_updated'));
    } catch (e) {
      console.warn('Error al guardar medidores virtuales:', e);
    }
  }, []);

  const agregarMedidorVirtual = useCallback((nuevoMedidor) => {
    setMedidoresVirtuales((prev) => {
      const id = nuevoMedidor.id || `mv_${Date.now()}`;
      const medidorCompleto = {
        ...nuevoMedidor,
        id,
        activo: true,
        creadoEn: Date.now(),
      };
      const actualizados = [...prev.filter((m) => m.id !== id), medidorCompleto];
      guardarEnStorage(actualizados);
      return actualizados;
    });
  }, [guardarEnStorage]);

  const eliminarMedidorVirtual = useCallback((id) => {
    setMedidoresVirtuales((prev) => {
      const actualizados = prev.filter((m) => m.id !== id);
      guardarEnStorage(actualizados);
      return actualizados;
    });
  }, [guardarEnStorage]);

  // Escuchar eventos si otra pestaña o componente actualizó los medidores
  useEffect(() => {
    const handleActualizacion = () => {
      try {
        const guardado = localStorage.getItem(STORAGE_KEY);
        if (guardado) {
          const parsed = JSON.parse(guardado);
          if (Array.isArray(parsed)) setMedidoresVirtuales(parsed);
        }
      } catch (e) {}
    };
    window.addEventListener('medidores_virtuales_updated', handleActualizacion);
    window.addEventListener('storage', handleActualizacion);
    return () => {
      window.removeEventListener('medidores_virtuales_updated', handleActualizacion);
      window.removeEventListener('storage', handleActualizacion);
    };
  }, []);

  return {
    medidoresVirtuales,
    agregarMedidorVirtual,
    eliminarMedidorVirtual,
  };
};

/**
 * Inyecta las columnas y valores de los medidores virtuales en los registros existentes.
 * Maneja la suma (+) y resta (-) de forma algebraica fila por fila.
 */
export const aplicarMedidoresVirtuales = (registros = [], columnas = [], medidoresVirtuales = []) => {
  if (!registros || registros.length === 0 || !columnas || columnas.length === 0) {
    return { registros, columnas };
  }

  const virtualesActivos = (medidoresVirtuales || []).filter((m) => m && m.activo && m.operaciones && m.operaciones.length > 0);
  if (virtualesActivos.length === 0) {
    return { registros, columnas };
  }

  // Mapear columnas virtuales para agregarlas al encabezado de la tabla
  const columnasVirtuales = virtualesActivos.map((mv) => ({
    key: `virtual_${mv.id}`,
    alias: mv.nombre,
    codigo: 'MEDIDOR VIRTUAL',
    esVirtual: true,
    idVirtual: mv.id,
    operaciones: mv.operaciones,
    formulaTexto: mv.formulaTexto,
  }));

  const nuevasColumnas = [...columnas, ...columnasVirtuales];

  // Función robusta para emparejar columnas entre Energía y Potencia
  const emparejarColumna = (col, op) => {
    if (col.esVirtual) return false;
    const cAlias = (col.alias || '').trim().toLowerCase();
    const opAlias = (op.columnaAlias || '').trim().toLowerCase();

    if (opAlias && cAlias) {
      if (cAlias === opAlias) return true;
      if (cAlias.includes(opAlias) || opAlias.includes(cAlias)) return true;
    }

    if (op.headerOriginal && col.headerOriginal) {
      const h1 = col.headerOriginal.trim().toLowerCase();
      const h2 = op.headerOriginal.trim().toLowerCase();
      if (h1 === h2 || h1.includes(h2) || h2.includes(h1)) return true;
    }

    if (op.columnaKey && col.key === op.columnaKey) return true;
    return false;
  };

  // Calcular valor de cada medidor virtual para cada fila
  const nuevosRegistros = registros.map((reg) => {
    const filaConVirtuales = { ...reg };

    virtualesActivos.forEach((mv) => {
      let sumaFila = 0;
      let tieneAlMenosUnDato = false;

      mv.operaciones.forEach((op) => {
        // Buscar columna correspondiente por alias / cabecera / key
        const colCoincidente = columnas.find((c) => emparejarColumna(c, op));

        if (colCoincidente) {
          const val = reg[colCoincidente.key];
          if (val !== null && val !== undefined && !isNaN(val)) {
            tieneAlMenosUnDato = true;
            if (op.signo === '-') {
              sumaFila -= val;
            } else {
              sumaFila += val;
            }
          }
        }
      });

      const keyVirtual = `virtual_${mv.id}`;
      // Si la fila es hueco o ninguna columna tenía valor
      if (reg.esHueco && !tieneAlMenosUnDato) {
        filaConVirtuales[keyVirtual] = 0;
      } else {
        filaConVirtuales[keyVirtual] = tieneAlMenosUnDato ? sumaFila : null;
      }
    });

    return filaConVirtuales;
  });

  return {
    registros: nuevosRegistros,
    columnas: nuevasColumnas,
  };
};
