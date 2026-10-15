import { useState, useEffect, useCallback, useRef } from 'react';
import { VARIABLES_FACTURACION_DEFAULT } from './utils/defaultVariablesData';
import { FERIADOS_PERU_OFICIALES } from './utils/feriadosPeruData';
import { generarVentana12Meses, formatearMesNombre } from './utils/periodoFacturacionUtils';

const STORAGE_KEY = 'facturacion_cliente_libre_variables_v3';

const obtenerHoraActual = () => {
  const ahora = new Date();
  return ahora.toLocaleTimeString('es-PE', { hour12: false });
};

// Fusiona la lista oficial (con domingos) con lo que el usuario haya personalizado en localStorage
const fusionarDiasNoLaborables = (guardados = []) => {
  const mapaGuardados = new Map();
  if (Array.isArray(guardados)) {
    guardados.forEach((item) => {
      if (item && item.id) {
        mapaGuardados.set(item.id, item);
      }
    });
  }

  // 1. Agregar todos los oficiales garantizando que los domingos y feriados existan
  const resultado = FERIADOS_PERU_OFICIALES.map((oficial) => {
    if (mapaGuardados.has(oficial.id)) {
      const guardado = mapaGuardados.get(oficial.id);
      return {
        ...oficial,
        activo: typeof guardado.activo === 'boolean' ? guardado.activo : true,
      };
    }
    return { ...oficial, activo: true };
  });

  // 2. Agregar cualquier día personalizado agregado por el usuario
  if (Array.isArray(guardados)) {
    guardados.forEach((item) => {
      if (item && item.id && item.id.startsWith('custom-') && !resultado.some((r) => r.id === item.id)) {
        resultado.push(item);
      }
    });
  }

  return resultado;
};

export const useVariablesFacturacion = () => {
  const [variables, setVariables] = useState(() => {
    try {
      // Intentar cargar v3 o migrar v2/v1
      const saved = localStorage.getItem(STORAGE_KEY) ||
                    localStorage.getItem('facturacion_cliente_libre_variables_v2') ||
                    localStorage.getItem('facturacion_cliente_libre_variables_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        const diasFusionados = fusionarDiasNoLaborables(parsed.diasNoLaborables);
        const periodoFacturacion = parsed.periodoFacturacion || VARIABLES_FACTURACION_DEFAULT.periodoFacturacion || '2026-08';
        const historicoGuardado = parsed.historicoPotencias || {};
        const historicoVentana = generarVentana12Meses(periodoFacturacion, historicoGuardado);

        return {
          ...VARIABLES_FACTURACION_DEFAULT,
          ...parsed,
          periodoFacturacion,
          energiaKallpa: {
            ...VARIABLES_FACTURACION_DEFAULT.energiaKallpa,
            ...(parsed.energiaKallpa || {}),
          },
          historicoPotencias: historicoVentana,
          diasNoLaborables: diasFusionados,
        };
      }
    } catch (e) {
      console.warn('Error al cargar variables de facturación de localStorage:', e);
    }
    return VARIABLES_FACTURACION_DEFAULT;
  });

  const [toastMensaje, setToastMensaje] = useState(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(obtenerHoraActual());
  const variablesRef = useRef(variables);

  useEffect(() => {
    variablesRef.current = variables;
  }, [variables]);

  // Guardado persistente inmediato en cada cambio de variables
  const guardarEnStorage = useCallback((nuevasVariables) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasVariables));
      setUltimaActualizacion(obtenerHoraActual());
    } catch (e) {
      console.warn('Error al guardar variables en localStorage:', e);
    }
  }, []);

  const mostrarNotificacion = (texto, tipo = 'success') => {
    setToastMensaje({ texto, tipo });
    setTimeout(() => setToastMensaje(null), 3500);
  };

  // 1. Energía Activa Kallpa
  const updateEnergiaKallpa = useCallback((patch) => {
    setVariables((prev) => {
      const updated = { ...prev, energiaKallpa: { ...prev.energiaKallpa, ...patch } };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 2. Demanda Coincidente
  const updateDemandaCoincidente = useCallback((patch) => {
    setVariables((prev) => {
      const updated = { ...prev, demandaCoincidente: { ...prev.demandaCoincidente, ...patch } };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 3. Tipo de Cambio
  const updateTipoCambio = useCallback((patch) => {
    setVariables((prev) => {
      const updated = { ...prev, tipoCambio: { ...prev.tipoCambio, ...patch } };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 4. Tarifas Cliente Libre
  const updateTarifas = useCallback((patch) => {
    setVariables((prev) => {
      const updated = { ...prev, tarifas: { ...prev.tarifas, ...patch } };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 5. Potencia Contratada del Suministro
  const updatePotenciaContratada = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        potenciaContratada: {
          ...(prev.potenciaContratada || {}),
          ...patch,
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 6. Parámetros Contrato (Factor de Carga y K)
  const updateParametrosContrato = useCallback((patch) => {
    setVariables((prev) => {
      const updated = { ...prev, parametrosContrato: { ...prev.parametrosContrato, ...patch } };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 6. Días No Laborables
  const updateDiasNoLaborables = useCallback((nuevosDias) => {
    setVariables((prev) => {
      const updated = { ...prev, diasNoLaborables: nuevosDias };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  const toggleDiaNoLaborable = useCallback((id) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        diasNoLaborables: prev.diasNoLaborables.map((d) =>
          d.id === id ? { ...d, activo: !d.activo } : d
        ),
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  const toggleTodosDiasNoLaborables = useCallback((activarTodos) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        diasNoLaborables: prev.diasNoLaborables.map((d) => ({ ...d, activo: activarTodos })),
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  const agregarDiaNoLaborable = useCallback((nuevoDia) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        diasNoLaborables: [nuevoDia, ...prev.diasNoLaborables],
      };
      guardarEnStorage(updated);
      return updated;
    });
    mostrarNotificacion('Día no laborable agregado y guardado en memoria.');
  }, [guardarEnStorage]);

  const eliminarDiaNoLaborable = useCallback((id) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        diasNoLaborables: prev.diasNoLaborables.filter((d) => d.id !== id),
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 6.5. Periodo y Mes a Facturar (sincroniza ventana móvil de 12 meses y fecha de cierre)
  const updatePeriodoFacturacion = useCallback((nuevoPeriodo) => {
    if (!nuevoPeriodo || typeof nuevoPeriodo !== 'string' || !nuevoPeriodo.includes('-')) return;
    setVariables((prev) => {
      const historicoActualizado = generarVentana12Meses(nuevoPeriodo, prev.historicoPotencias || {});
      const [y, m] = nuevoPeriodo.split('-').map(Number);
      const ultimoDiaMes = new Date(y, m, 0).getDate();
      const fechaCierre = `${nuevoPeriodo}-${String(ultimoDiaMes).padStart(2, '0')}`;

      const updated = {
        ...prev,
        periodoFacturacion: nuevoPeriodo,
        historicoPotencias: historicoActualizado,
        tipoCambio: {
          ...prev.tipoCambio,
          fecha: fechaCierre,
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
    mostrarNotificacion(`Mes de facturación cambiado a ${formatearMesNombre(nuevoPeriodo)}`);
  }, [guardarEnStorage]);

  // 7. Histórico de Potencias (Soporta HP, HFP y almacenamiento por circuito/medidor)
  const updatePotenciaMes = useCallback((id, nuevoValorKW, seccion = 'ultimos12Meses', campo = 'potenciaKW', circuitoKey = 'total') => {
    const keySeccion = seccion === 'anteriores' ? 'anteriores' : 'ultimos12Meses';
    setVariables((prev) => {
      const historicoActual = prev?.historicoPotencias || VARIABLES_FACTURACION_DEFAULT.historicoPotencias;
      const porCircuitoActual = historicoActual.porCircuito || {};
      const historicoCircuito = porCircuitoActual[circuitoKey] || {
        ultimos12Meses: historicoActual.ultimos12Meses || [],
        anteriores: historicoActual.anteriores || [],
      };

      const seccionActual = Array.isArray(historicoCircuito[keySeccion])
        ? historicoCircuito[keySeccion]
        : (Array.isArray(historicoActual[keySeccion]) ? historicoActual[keySeccion] : []);

      const valorLimpio = nuevoValorKW === '' ? '' : (isNaN(Number(nuevoValorKW)) ? 0 : Number(nuevoValorKW));

      const listaActualizada = seccionActual.map((item) => {
        if (item.id === id) {
          const modificado = { ...item, [campo]: valorLimpio };
          if (campo === 'potenciaHP_KW' || campo === 'potenciaHFP_KW') {
            const hp = campo === 'potenciaHP_KW' ? (Number(valorLimpio) || 0) : (Number(item.potenciaHP_KW) || 0);
            const hfp = campo === 'potenciaHFP_KW' ? (Number(valorLimpio) || 0) : (Number(item.potenciaHFP_KW) || 0);
            modificado.potenciaKW = Math.max(hp, hfp);
          }
          return modificado;
        }
        return item;
      });

      const nuevoHistoricoCircuito = {
        ...historicoCircuito,
        [keySeccion]: listaActualizada,
      };

      const updated = {
        ...prev,
        historicoPotencias: {
          ...historicoActual,
          circuitoSeleccionado: circuitoKey,
          porCircuito: {
            ...porCircuitoActual,
            [circuitoKey]: nuevoHistoricoCircuito,
          },
          ...(circuitoKey === 'total' ? { [keySeccion]: listaActualizada } : {}),
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // Inyectar automáticamente las potencias calculadas del mes a facturar en el circuito adecuado junto con fecha y hora
  const inyectarPotenciasMesFacturacion = useCallback((circuitoKey, periodo, potHP, potHFP, fechaHP = '', horaHP = '', fechaHFP = '', horaHFP = '') => {
    setVariables((prev) => {
      const historicoActual = prev?.historicoPotencias || VARIABLES_FACTURACION_DEFAULT.historicoPotencias;
      const porCircuitoActual = historicoActual.porCircuito || {};
      const historicoCircuito = porCircuitoActual[circuitoKey] || {
        ultimos12Meses: historicoActual.ultimos12Meses || [],
        anteriores: historicoActual.anteriores || [],
      };

      const ultimosActualizados = (historicoCircuito.ultimos12Meses || []).map((item) => {
        if (item.periodo === periodo) {
          return {
            ...item,
            potenciaHP_KW: potHP,
            potenciaHFP_KW: potHFP,
            potenciaKW: Math.max(potHP, potHFP),
            fechaHP: fechaHP || item.fechaHP || '',
            horaHP: horaHP || item.horaHP || '',
            fechaHFP: fechaHFP || item.fechaHFP || '',
            horaHFP: horaHFP || item.horaHFP || '',
          };
        }
        return item;
      });

      const nuevoHistoricoCircuito = {
        ...historicoCircuito,
        ultimos12Meses: ultimosActualizados,
      };

      const updated = {
        ...prev,
        historicoPotencias: {
          ...historicoActual,
          circuitoSeleccionado: circuitoKey,
          porCircuito: {
            ...porCircuitoActual,
            [circuitoKey]: nuevoHistoricoCircuito,
          },
          ...(circuitoKey === 'total' ? { ultimos12Meses: ultimosActualizados } : {}),
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // Actualizar el medidor o circuito activo en el historial de potencias
  const updateCircuitoHistorico = useCallback((circuitoKey) => {
    setVariables((prev) => {
      const historicoActual = prev?.historicoPotencias || VARIABLES_FACTURACION_DEFAULT.historicoPotencias;
      const updated = {
        ...prev,
        historicoPotencias: {
          ...historicoActual,
          circuitoSeleccionado: circuitoKey,
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 8. Peajes y Cargos Regulados
  const updatePeajesRegulados = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        peajesRegulados: { ...prev.peajesRegulados, ...patch },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 9. Otros Cargos (FOSE y LER)
  const updateOtrosCargos = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        otrosCargos: { ...prev.otrosCargos, ...patch },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 10. Horario de Horas Punta y Fuera de Punta
  const updateHorarioPunta = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        horarioPunta: { ...prev.horarioPunta, ...patch },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 11. Costos por Exceso de Potencia
  const updateExcesoPotencia = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        excesoPotencia: {
          ...(prev.excesoPotencia || {}),
          ...patch,
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // 12. Costos por Exceso de Energía
  const updateExcesoEnergia = useCallback((patch) => {
    setVariables((prev) => {
      const updated = {
        ...prev,
        excesoEnergia: {
          ...(prev.excesoEnergia || {}),
          ...patch,
        },
      };
      guardarEnStorage(updated);
      return updated;
    });
  }, [guardarEnStorage]);

  // Restablecer a valores por defecto
  const restablecerPorDefecto = useCallback(() => {
    setVariables(VARIABLES_FACTURACION_DEFAULT);
    guardarEnStorage(VARIABLES_FACTURACION_DEFAULT);
    mostrarNotificacion('Se restablecieron todas las variables a los valores por defecto.');
  }, [guardarEnStorage]);

  return {
    variables,
    toastMensaje,
    ultimaActualizacion,
    setToastMensaje,
    mostrarNotificacion,
    updateEnergiaKallpa,
    updateDemandaCoincidente,
    updateTipoCambio,
    updateTarifas,
    updatePotenciaContratada,
    updateParametrosContrato,
    updateDiasNoLaborables,
    toggleDiaNoLaborable,
    toggleTodosDiasNoLaborables,
    agregarDiaNoLaborable,
    eliminarDiaNoLaborable,
    updatePeriodoFacturacion,
    updatePotenciaMes,
    inyectarPotenciasMesFacturacion,
    updateCircuitoHistorico,
    updatePeajesRegulados,
    updateOtrosCargos,
    updateHorarioPunta,
    updateExcesoPotencia,
    updateExcesoEnergia,
    restablecerPorDefecto,
  };
};
