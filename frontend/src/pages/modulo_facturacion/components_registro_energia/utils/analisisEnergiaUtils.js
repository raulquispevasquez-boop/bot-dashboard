// Utilidades de parseo y validación de medidas de energía en intervalos de 15 min
// Cumple estrictamente con no superar 600 líneas (módulo ligero y enfocado).

export const obtenerDiasEnMes = (year, month) => new Date(year, month, 0).getDate();

// Formateador de números a kWh con 2 decimales y separador de miles
export const formatearEnergia = (valor) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Formateo de duración de salto: menos de 1 hora en minutos, entre 1h y 24h en horas, más de 1 día en días y horas
export const formatearDuracionSalto = (minutos) => {
  if (minutos === null || minutos === undefined || isNaN(minutos)) return '';
  if (minutos < 60) {
    return `${minutos} min`;
  }
  if (minutos < 1440) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (m === 0) {
      return `${h} ${h === 1 ? 'hora' : 'horas'}`;
    }
    return `${h} ${h === 1 ? 'hora' : 'horas'} y ${m} min`;
  }
  const dias = Math.floor(minutos / 1440);
  const restoMinutos = minutos % 1440;
  const h = Math.floor(restoMinutos / 60);
  const m = restoMinutos % 60;

  const parteDias = `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (h === 0 && m === 0) {
    return parteDias;
  }
  if (h > 0 && m === 0) {
    return `${parteDias} y ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  if (h === 0 && m > 0) {
    return `${parteDias} y ${m} min`;
  }
  return `${parteDias}, ${h} ${h === 1 ? 'hora' : 'horas'} y ${m} min`;
};

// Formateo de fecha legible: Día primero, luego Mes, luego Año (DD/MM/YYYY HH:mm:ss)
export const formatearFechaDisplay = (fechaObj, fechaStrOriginal) => {
  if (fechaObj && !isNaN(fechaObj.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    const dia = pad(fechaObj.getDate());
    const mes = pad(fechaObj.getMonth() + 1);
    const anio = fechaObj.getFullYear();
    const hora = pad(fechaObj.getHours());
    const min = pad(fechaObj.getMinutes());
    const seg = pad(fechaObj.getSeconds());
    return `${dia}/${mes}/${anio} ${hora}:${min}:${seg}`;
  }
  if (fechaStrOriginal && typeof fechaStrOriginal === 'string') {
    const match = fechaStrOriginal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/);
    if (match) {
      const [, y, m, d, resto] = match;
      const pad = (s) => s.padStart(2, '0');
      return `${pad(d)}/${pad(m)}/${y}${resto}`;
    }
  }
  return fechaStrOriginal || '';
};

// Parser robusto de fechas capaz de reconocer formatos ISO (YYYY-MM-DD) y Latinoamérica (DD/MM/YYYY)
export const parsearFechaSegura = (str) => {
  if (!str) return null;
  const s = str.trim().replace(/"/g, '');
  // Formato ISO: YYYY-MM-DD HH:mm:ss o YYYY/MM/DD
  const matchIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchIso) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = matchIso;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
  }
  // Formato Latinoamérica: DD-MM-YYYY o DD/MM/YYYY
  const matchLatam = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchLatam) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = matchLatam;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
  }
  const fallback = new Date(s.replace(' ', 'T'));
  return isNaN(fallback.getTime()) ? null : fallback;
};

// Limpieza de encabezados técnicos largos para hacerlos legibles y profesionales
export const limpiarNombreColumna = (headerOriginal) => {
  if (!headerOriginal) return { alias: 'Circuito', codigo: '' };
  const partes = headerOriginal.split('|').map((p) => p.trim());

  let alias = partes[0];
  let codigo = '';

  if (partes.length >= 3) {
    alias = partes[1]; // Nombre descriptivo en el centro
    codigo = partes[2].replace(/\[.*?\]/g, '').trim();
  } else if (partes.length === 2) {
    alias = partes[1];
    codigo = partes[0];
  }

  // Limpiezas comunes
  alias = alias
    .replace(/\[.*?\]/g, '')
    .replace(/^CELDA\s+/i, '')
    .replace(/TGN-B TOTALIZADOR - /i, '')
    .trim();

  return { alias: alias || 'Circuito', codigo };
};

// Parser robusto de CSV para datos de energía con factor de conversión a Kilowatts
export const parsearCSV = (csvTexto, factorConversion = 1) => {
  // Eliminar BOM de UTF-8 (\uFEFF) muy común en archivos CSV exportados desde Excel o Windows
  const textoLimpio = csvTexto.replace(/^\uFEFF/, '').trim();
  const lineas = textoLimpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return { registros: [], columnas: [] };

  // Auto-detectar delimitador en la primera línea (coma, punto y coma, tabulador)
  let delimitador = ',';
  const primeraLinea = lineas[0];
  const countComas = (primeraLinea.match(/,/g) || []).length;
  const countPuntosYComas = (primeraLinea.match(/;/g) || []).length;
  const countTabs = (primeraLinea.match(/\t/g) || []).length;

  if (countPuntosYComas > countComas && countPuntosYComas > countTabs) {
    delimitador = ';';
  } else if (countTabs > countComas && countTabs > countPuntosYComas) {
    delimitador = '\t';
  }

  // Parser simple de línea CSV respetando comillas y delimitador dinámico
  const parsearLinea = (linea) => {
    const valores = [];
    let dentroComillas = false;
    let actual = '';

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];
      if (char === '"') {
        dentroComillas = !dentroComillas;
      } else if (char === delimitador && !dentroComillas) {
        valores.push(actual.trim());
        actual = '';
      } else {
        actual += char;
      }
    }
    valores.push(actual.trim());
    return valores;
  };

  const rawHeaders = parsearLinea(lineas[0]);
  const columnas = rawHeaders.slice(1).map((h, idx) => {
    const { alias, codigo } = limpiarNombreColumna(h);
    return {
      key: `col_${idx}`,
      headerOriginal: h,
      alias,
      codigo,
    };
  });

  const registros = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = parsearLinea(lineas[i]);
    const fechaStr = (valores[0] || '').replace(/"/g, '').trim();
    if (!fechaStr) continue;

    // Normalizar fechaObj y timestamp de forma segura
    const fechaObj = parsearFechaSegura(fechaStr);
    const timestamp = fechaObj ? fechaObj.getTime() : null;

    const filaData = {};
    columnas.forEach((col, idx) => {
      const valRaw = valores[idx + 1];
      if (valRaw === undefined || valRaw === '' || valRaw === null) {
        filaData[col.key] = null;
      } else {
        let cleanVal = String(valRaw).replace(/"/g, '').trim();
        // Soporte para decimales con coma (estilo Latinoamérica / Excel en español)
        if (cleanVal.includes(',') && !cleanVal.includes('.')) {
          cleanVal = cleanVal.replace(',', '.');
        } else if (cleanVal.includes('.') && cleanVal.includes(',')) {
          if (cleanVal.indexOf('.') < cleanVal.indexOf(',')) {
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
          } else {
            cleanVal = cleanVal.replace(/,/g, '');
          }
        }
        const num = parseFloat(cleanVal);
        filaData[col.key] = isNaN(num) ? null : num * factorConversion;
      }
    });

    registros.push({
      id: i,
      fechaStr,
      fechaDisplay: formatearFechaDisplay(fechaObj, fechaStr),
      fecha: fechaObj,
      timestamp,
      ...filaData,
    });
  }

  // Ordenar cronológicamente por timestamp
  registros.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return { registros, columnas };
};

// Análisis de validaciones según tabla de requisitos 2.1 y 2.2 con mapeo de huecos cada 15 min en valor 0
export const analizarValidaciones = (registros, columnas = []) => {
  if (!registros || registros.length === 0) return null;

  // Detección de mes, año y rango de fechas (desde / hasta)
  const primerValido = registros.find((r) => r.timestamp);
  if (!primerValido) return null;
  const ultimoValido = [...registros].reverse().find((r) => r.timestamp);

  const fechaDesde = primerValido.fechaDisplay || primerValido.fechaStr;
  const fechaHasta = ultimoValido ? (ultimoValido.fechaDisplay || ultimoValido.fechaStr) : fechaDesde;

  const fechaInicio = primerValido.fecha;
  const year = fechaInicio.getFullYear();
  const month = fechaInicio.getMonth() + 1;
  const diasMes = obtenerDiasEnMes(year, month);
  const esperadosMes = diasMes * 96; // Regla 2.1: dias_mes x 96
  const totalRegistrosReales = registros.length;

  // 2.2 Detección y mapeo de huecos en data (diferencia != 15 minutos)
  const huecos = [];
  const registrosConEstado = [];
  let nextHuecoId = 500000;

  for (let idx = 0; idx < registros.length; idx++) {
    const reg = registros[idx];
    if (idx === 0) {
      registrosConEstado.push({ ...reg, esHueco: false, deltaMinutos: 15 });
      continue;
    }

    const anterior = registros[idx - 1];
    if (!reg.timestamp || !anterior.timestamp) {
      registrosConEstado.push({ ...reg, esHueco: false, deltaMinutos: 15 });
      continue;
    }

    const deltaMinutos = Math.round((reg.timestamp - anterior.timestamp) / (1000 * 60));
    const esSalto = deltaMinutos !== 15;

    if (esSalto && deltaMinutos > 15) {
      const intervalosPerdidos = Math.max(1, Math.round(deltaMinutos / 15) - 1);
      const primerHuecoTimestamp = anterior.timestamp + 15 * 60 * 1000;
      const primerHuecoId = nextHuecoId;

      huecos.push({
        id: huecos.length + 1,
        registroId: primerHuecoId,
        registroTimestamp: primerHuecoTimestamp,
        desde: anterior.fechaDisplay || anterior.fechaStr,
        hasta: reg.fechaDisplay || reg.fechaStr,
        deltaMinutos,
        intervalosPerdidos,
      });

      // Insertar cada intervalo faltante de 15 min con valor 0 y esHueco = true
      let currTime = primerHuecoTimestamp;
      while (currTime < reg.timestamp) {
        const fechaObj = new Date(currTime);
        const filaHueco = {
          id: nextHuecoId++,
          fecha: fechaObj,
          timestamp: currTime,
          fechaStr: fechaObj.toISOString(),
          fechaDisplay: formatearFechaDisplay(fechaObj),
          esHueco: true,
          deltaMinutos: 15,
        };
        columnas.forEach((col) => {
          filaHueco[col.key] = 0;
        });
        registrosConEstado.push(filaHueco);
        currTime += 15 * 60 * 1000;
      }
    }

    registrosConEstado.push({
      ...reg,
      esHueco: false,
      deltaMinutos: 15,
    });
  }

  // 2.1 Integridad de intervalos basada en registros reales subidos
  const cumpleIntegridad = totalRegistrosReales === esperadosMes;
  const intervalosFaltantes = Math.max(0, esperadosMes - totalRegistrosReales);
  const porcentajeCompletitud = Number(((totalRegistrosReales / esperadosMes) * 100).toFixed(1));

  return {
    year,
    month,
    diasMes,
    esperadosMes,
    totalRegistros: totalRegistrosReales,
    cumpleIntegridad,
    intervalosFaltantes,
    porcentajeCompletitud,
    totalHuecos: huecos.length,
    huecos,
    fechaDesde,
    fechaHasta,
    registrosConEstado,
  };
};

