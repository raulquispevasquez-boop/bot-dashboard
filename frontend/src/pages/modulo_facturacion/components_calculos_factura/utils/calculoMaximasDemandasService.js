// Servicio de cálculo de Máximas Demandas en Horas Punta (HP) y Fuera de Punta (HFP)
// Cumple con la normativa eléctrica del COES/Osinergmin y la regla modular de < 600 líneas
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';

/**
 * Convierte 'HH:mm' a minutos transcurridos desde las 00:00
 */
const horaMinutos = (horaStr, fallbackMin) => {
  if (!horaStr) return fallbackMin;
  const partes = horaStr.split(':');
  const h = parseInt(partes[0], 10);
  const m = parseInt(partes[1] || '0', 10);
  return isNaN(h) || isNaN(m) ? fallbackMin : h * 60 + m;
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * Calcula las máximas demandas (kW y MW) para HP y HFP identificando la fecha y hora exacta
 * en la que ocurrieron, tanto para el total consolidado como para cada circuito y medidor virtual.
 *
 * @param {Array} registros - Registros de potencia (kW) con fechas
 * @param {Array} columnas - Columnas de la tabla (incluyendo medidores virtuales)
 * @param {object} variablesConfig - Configuración de variables (horario de punta y días feriados)
 * @returns {object} Resultados de máximas demandas
 */
export const calcularMaximasDemandas = (registros = [], columnas = [], variablesConfig = {}) => {
  if (!registros || registros.length === 0 || !columnas || columnas.length === 0) {
    return null;
  }

  const horario = variablesConfig?.horarioPunta || { horaInicio: '18:00', horaFin: '23:00' };
  const inicioMin = horaMinutos(horario.horaInicio, 18 * 60);
  const finMin = horaMinutos(horario.horaFin, 23 * 60);

  // Mapear días no laborables y feriados activos para búsqueda O(1)
  const setDiasNoLaborables = new Set();
  const listaDias = variablesConfig?.diasNoLaborables || [];
  listaDias.forEach((d) => {
    if (d && d.activo && d.fecha) {
      setDiasNoLaborables.add(d.fecha.trim());
    }
  });

  const columnasFisicas = columnas.filter((c) => !c.esVirtual);
  const columnasSuma = columnasFisicas.length > 0 ? columnasFisicas : columnas;

  // Estructuras de acumulación para el Consolidado
  let maxHP_Consolidado = { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };
  let maxHFP_Consolidado = { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' };
  let sumaHP_Consolidado = 0;
  let sumaHFP_Consolidado = 0;
  let conteoHP = 0;
  let conteoHFP = 0;

  // Acumuladores por cada circuito / columna
  const porCircuito = {};
  columnas.forEach((col) => {
    porCircuito[col.key] = {
      key: col.key,
      alias: col.esVirtual ? adaptarNombreAPotencia(col.alias) : col.alias,
      codigo: col.codigo,
      esVirtual: !!col.esVirtual,
      maxHP: { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' },
      maxHFP: { potenciaKW: 0, potenciaMW: 0, fechaDisplay: '—', horaDisplay: '—' },
      sumaHP: 0,
      sumaHFP: 0,
    };
  });

  registros.forEach((reg) => {
    const fechaObj = reg.fecha;
    if (!fechaObj || isNaN(fechaObj.getTime())) return;

    const diaSemana = fechaObj.getDay(); // 0 = Domingo
    const horas = fechaObj.getHours();
    const minutos = fechaObj.getMinutes();
    const intervaloMin = horas * 60 + minutos;

    const fechaYMD = `${fechaObj.getFullYear()}-${pad(fechaObj.getMonth() + 1)}-${pad(fechaObj.getDate())}`;
    const fechaDisplay = `${pad(fechaObj.getDate())}/${pad(fechaObj.getMonth() + 1)}/${fechaObj.getFullYear()}`;
    const horaDisplay = `${pad(horas)}:${pad(minutos)}`;

    // Domingo siempre es 100% Fuera de Punta
    const esDomingo = diaSemana === 0;
    const esNoLaborable = setDiasNoLaborables.has(fechaYMD);

    // Horas Punta: Lunes a Sábado, no feriado, en el rango [inicio, fin)
    const esHP = !esDomingo && !esNoLaborable && (intervaloMin >= inicioMin && intervaloMin < finMin);

    if (esHP) {
      conteoHP++;
    } else {
      conteoHFP++;
    }

    // 1. Suma de columnas físicas para el Total Consolidado
    let sumaFilaFisica = 0;
    columnasSuma.forEach((col) => {
      const v = reg[col.key];
      const num = typeof v === 'number' && !isNaN(v) ? v : 0;
      sumaFilaFisica += num;
    });

    if (esHP) {
      sumaHP_Consolidado += sumaFilaFisica;
      if (sumaFilaFisica > maxHP_Consolidado.potenciaKW) {
        maxHP_Consolidado = {
          potenciaKW: Math.round(sumaFilaFisica * 100) / 100,
          potenciaMW: Math.round((sumaFilaFisica / 1000) * 1000) / 1000,
          fechaDisplay,
          horaDisplay,
          registroId: reg.id,
        };
      }
    } else {
      sumaHFP_Consolidado += sumaFilaFisica;
      if (sumaFilaFisica > maxHFP_Consolidado.potenciaKW) {
        maxHFP_Consolidado = {
          potenciaKW: Math.round(sumaFilaFisica * 100) / 100,
          potenciaMW: Math.round((sumaFilaFisica / 1000) * 1000) / 1000,
          fechaDisplay,
          horaDisplay,
          registroId: reg.id,
        };
      }
    }

    // 2. Acumulación y máximos para cada columna individual (física o virtual)
    columnas.forEach((col) => {
      const v = reg[col.key];
      const num = typeof v === 'number' && !isNaN(v) ? v : 0;
      const dataCol = porCircuito[col.key];

      if (esHP) {
        dataCol.sumaHP += num;
        if (num > dataCol.maxHP.potenciaKW) {
          dataCol.maxHP = {
            potenciaKW: Math.round(num * 100) / 100,
            potenciaMW: Math.round((num / 1000) * 1000) / 1000,
            fechaDisplay,
            horaDisplay,
            registroId: reg.id,
          };
        }
      } else {
        dataCol.sumaHFP += num;
        if (num > dataCol.maxHFP.potenciaKW) {
          dataCol.maxHFP = {
            potenciaKW: Math.round(num * 100) / 100,
            potenciaMW: Math.round((num / 1000) * 1000) / 1000,
            fechaDisplay,
            horaDisplay,
            registroId: reg.id,
          };
        }
      }
    });
  });

  const circuitosProcesados = columnas.map((col) => {
    const d = porCircuito[col.key];
    return {
      key: col.key,
      alias: col.alias,
      codigo: col.codigo,
      esVirtual: !!col.esVirtual,
      maxHP: d.maxHP,
      maxHFP: d.maxHFP,
      promedioHP_kW: conteoHP > 0 ? Math.round((d.sumaHP / conteoHP) * 100) / 100 : 0,
      promedioHFP_kW: conteoHFP > 0 ? Math.round((d.sumaHFP / conteoHFP) * 100) / 100 : 0,
    };
  });

  return {
    consolidado: {
      maxHP: maxHP_Consolidado,
      maxHFP: maxHFP_Consolidado,
      promedioHP_kW: conteoHP > 0 ? Math.round((sumaHP_Consolidado / conteoHP) * 100) / 100 : 0,
      promedioHFP_kW: conteoHFP > 0 ? Math.round((sumaHFP_Consolidado / conteoHFP) * 100) / 100 : 0,
    },
    circuitos: circuitosProcesados,
    meta: {
      totalRegistros: registros.length,
      totalIntervalosHP: conteoHP,
      totalIntervalosHFP: conteoHFP,
      horarioConfigurado: `${horario.horaInicio} - ${horario.horaFin}`,
    },
  };
};
