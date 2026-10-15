// Utilidades de parseo y validación para Registros de Potencia (kW) en intervalos de 15 min
// Cumple estrictamente con el límite de < 600 líneas

export const obtenerDiasEnMes = (year, month) => new Date(year, month, 0).getDate();

// Formateador de potencia a kW con 2 decimales y separador de miles
export const formatearPotencia = (valor) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatearDuracionSalto = (minutos) => {
  if (minutos === null || minutos === undefined || isNaN(minutos)) return '';
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h} ${h === 1 ? 'hora' : 'horas'}` : `${h} ${h === 1 ? 'hora' : 'horas'} y ${m} min`;
  }
  const dias = Math.floor(minutos / 1440);
  const rem = minutos % 1440;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  const pd = `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (h === 0 && m === 0) return pd;
  if (h > 0 && m === 0) return `${pd} y ${h} ${h === 1 ? 'hora' : 'horas'}`;
  if (h === 0 && m > 0) return `${pd} y ${m} min`;
  return `${pd}, ${h} ${h === 1 ? 'hora' : 'horas'} y ${m} min`;
};

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

export const parsearFechaSegura = (str) => {
  if (!str) return null;
  const s = str.trim().replace(/"/g, '');
  const matchIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchIso) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = matchIso;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
  }
  const matchLatam = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchLatam) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = matchLatam;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
  }
  const fallback = new Date(s.replace(' ', 'T'));
  return isNaN(fallback.getTime()) ? null : fallback;
};

// Limpieza de encabezados técnicos con alias, código y [Potencia]
export const limpiarNombreColumnaPotencia = (headerOriginal) => {
  if (!headerOriginal) return { alias: 'Circuito', codigo: '' };
  const partes = headerOriginal.split('|').map((p) => p.trim());

  let alias = partes[0];
  let codigo = '';

  if (partes.length >= 3) {
    alias = partes[1];
    codigo = partes[2].replace(/\[.*?\]/g, '').trim();
  } else if (partes.length === 2) {
    alias = partes[1];
    codigo = partes[0].replace(/\[.*?\]/g, '').trim();
  } else {
    alias = partes[0].replace(/\[.*?\]/g, '').trim();
  }

  return { alias: alias || 'Circuito', codigo };
};

// Parser de CSV para Potencias con factor de conversión a Kilowatts (kW)
export const parsearCSVPotencia = (csvTexto, factorConversion = 1) => {
  const textoLimpio = csvTexto.replace(/^\uFEFF/, '').trim();
  const lineas = textoLimpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return { registros: [], columnas: [] };

  let delimitador = ',';
  const primeraLinea = lineas[0];
  const countComas = (primeraLinea.match(/,/g) || []).length;
  const countPuntosYComas = (primeraLinea.match(/;/g) || []).length;
  const countTabs = (primeraLinea.match(/\t/g) || []).length;

  if (countPuntosYComas > countComas && countPuntosYComas > countTabs) delimitador = ';';
  else if (countTabs > countComas && countTabs > countPuntosYComas) delimitador = '\t';

  const parsearLinea = (linea) => {
    const valores = [];
    let dentroComillas = false;
    let actual = '';

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];
      if (char === '"') dentroComillas = !dentroComillas;
      else if (char === delimitador && !dentroComillas) {
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
    const { alias, codigo } = limpiarNombreColumnaPotencia(h);
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

    const fechaObj = parsearFechaSegura(fechaStr);
    const timestamp = fechaObj ? fechaObj.getTime() : null;

    const filaData = {};
    columnas.forEach((col, idx) => {
      const valRaw = valores[idx + 1];
      if (valRaw === undefined || valRaw === '' || valRaw === null) {
        filaData[col.key] = null;
      } else {
        let cleanVal = String(valRaw).replace(/"/g, '').trim();
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

  registros.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return { registros, columnas };
};

// Análisis de validaciones para Potencias con generación de intervalos de 15 min en valor 0
export const analizarValidacionesPotencia = (registros, columnas = []) => {
  if (!registros || registros.length === 0) return null;

  const primerValido = registros.find((r) => r.timestamp);
  if (!primerValido) return null;
  const ultimoValido = [...registros].reverse().find((r) => r.timestamp);

  const fechaDesde = primerValido.fechaDisplay || primerValido.fechaStr;
  const fechaHasta = ultimoValido ? (ultimoValido.fechaDisplay || ultimoValido.fechaStr) : fechaDesde;

  const fechaInicio = primerValido.fecha;
  const year = fechaInicio.getFullYear();
  const month = fechaInicio.getMonth() + 1;
  const diasMes = obtenerDiasEnMes(year, month);
  const esperadosMes = diasMes * 96;
  const totalRegistrosReales = registros.length;

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
