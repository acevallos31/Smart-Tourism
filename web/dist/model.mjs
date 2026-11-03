export const CAPACITY = 10;
export const DIRECTIONS = ['entrada', 'salida', 'indeterminada'];
export const VALIDATIONS = ['ACEPTADO', 'RECHAZADO', 'REVISAR_DATOS'];
export const REASONS = ['A_B', 'B_A', 'AFORO_MAXIMO', 'AFORO_CERO', 'PASO_INCOMPLETO', 'SIMULTANEOS'];
export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
export const DEFAULT_TOPIC = 'smart-tourism/taulabe/6ae93b438bcc8191/events';

export function parseCSV(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ';' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar.');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  const headers = rows.shift()?.map(x => x.trim());
  if (!headers?.includes('eventId') || !headers.includes('occupancy')) throw new Error('Selecciona eventos_iot.csv, con delimitador punto y coma (;).');
  if (new Set(headers).size !== headers.length) throw new Error('El CSV contiene columnas repetidas.');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`La fila ${i + 2} no tiene ${headers.length} columnas.`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}

export function localTime(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
}

export function alertFor(occupancy, capacity = CAPACITY) {
  return occupancy >= capacity ? 'CAPACIDAD_MAXIMA' : occupancy / capacity >= .8 ? 'ADVERTENCIA_80' : 'NINGUNA';
}

function integer(value, name, minimum, maximum) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw new Error(`Falta ${name}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} no es válido.`);
  return number;
}

export function normalizeEvent(raw, { origin = 'CSV', receivedAt = new Date(), sessionId = 'csv' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('El evento debe ser un objeto JSON.');
  if (!DIRECTIONS.includes(raw.direction) || !VALIDATIONS.includes(raw.validation) || !REASONS.includes(raw.reason)) throw new Error('Dirección, validación o motivo desconocidos.');
  const capacity = integer(raw.capacity, 'capacity', 1, 10000);
  const occupancy = integer(raw.occupancy, 'occupancy', 0, capacity);
  const sequence = integer(raw.sequence, 'sequence', 1, Number.MAX_SAFE_INTEGER);
  const eventId = String(raw.eventId || ''); const deviceId = String(raw.deviceId || '');
  if (!/^[\w.-]{1,128}$/.test(eventId) || !/^[\w.-]{1,80}$/.test(deviceId)) throw new Error('Identificador de evento o dispositivo no válido.');
  const validPair = raw.validation === 'ACEPTADO' ? (raw.direction === 'entrada' && raw.reason === 'A_B') || (raw.direction === 'salida' && raw.reason === 'B_A')
    : raw.validation === 'RECHAZADO' ? (raw.direction === 'entrada' && raw.reason === 'AFORO_MAXIMO' && occupancy === capacity) || (raw.direction === 'salida' && raw.reason === 'AFORO_CERO' && occupancy === 0)
    : raw.direction === 'indeterminada' && ['SIMULTANEOS', 'PASO_INCOMPLETO'].includes(raw.reason);
  if (!validPair) throw new Error('La dirección y el motivo no coinciden con la validación.');
  const timestamp = raw.fecha_hora || localTime(receivedAt);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp.replace(' ', 'T') + '-06:00'))) throw new Error('Fecha del evento no válida.');
  const check = localTime(new Date(timestamp.replace(' ', 'T') + '-06:00'));
  if (check !== timestamp) throw new Error('La fecha del evento no existe.');
  const session = String(raw.sessionId || sessionId);
  if (!/^[\w.-]{1,80}$/.test(session)) throw new Error('Sesión no válida.');
  const uptime = raw.timestamp_ms === undefined || raw.timestamp_ms === null || raw.timestamp_ms === '' ? null : integer(raw.timestamp_ms, 'timestamp_ms', 0, Number.MAX_SAFE_INTEGER);
  return { eventId, deviceId, sessionId: session, key: `${deviceId}:${session}:${eventId}`, sequence, timestamp, date: timestamp.slice(0, 10), direction: raw.direction, validation: raw.validation, reason: raw.reason, occupancy, capacity, alert: alertFor(occupancy, capacity), origin, timestamp_ms: uptime };
}

export function filterEvents(events, { from = '', to = '', direction = '', validation = '', query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return events.filter(e => (!from || e.date >= from) && (!to || e.date <= to) && (!direction || e.direction === direction) && (!validation || e.validation === validation) && (!needle || `${e.eventId} ${e.deviceId} ${e.reason} ${e.direction} ${e.validation}`.toLowerCase().includes(needle)));
}

export function summarize(events) {
  const result = { total: events.length, entries: 0, exits: 0, rejected: 0, review: 0, alerts: 0, max: 0, avg: 0, days: [], latest: events.at(-1) || null };
  const days = new Map(); let sum = 0;
  for (const e of events) {
    const entry = e.validation === 'ACEPTADO' && e.direction === 'entrada';
    const exit = e.validation === 'ACEPTADO' && e.direction === 'salida';
    result.entries += Number(entry); result.exits += Number(exit);
    result.rejected += Number(e.validation === 'RECHAZADO'); result.review += Number(e.validation === 'REVISAR_DATOS');
    result.alerts += Number(e.alert !== 'NINGUNA' || e.validation !== 'ACEPTADO'); result.max = Math.max(result.max, e.occupancy); sum += e.occupancy;
    if (!days.has(e.date)) days.set(e.date, { date: e.date, entries: 0, exits: 0, max: 0, sum: 0, total: 0 });
    const day = days.get(e.date); day.entries += Number(entry); day.exits += Number(exit); day.max = Math.max(day.max, e.occupancy); day.sum += e.occupancy; day.total++;
  }
  result.avg = events.length ? sum / events.length : 0;
  result.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ ...day, avg: day.sum / day.total }));
  return result;
}

export function makeDemoEvent(events, direction, reason) {
  const previous = events.at(-1)?.occupancy || 0; let occupancy = previous;
  let validation = 'ACEPTADO';
  if (direction === 'entrada') {
    if (previous >= CAPACITY) { validation = 'RECHAZADO'; reason = 'AFORO_MAXIMO'; } else { occupancy++; reason = 'A_B'; }
  } else if (direction === 'salida') {
    if (previous <= 0) { validation = 'RECHAZADO'; reason = 'AFORO_CERO'; } else { occupancy--; reason = 'B_A'; }
  } else { validation = 'REVISAR_DATOS'; reason ||= 'PASO_INCOMPLETO'; }
  const sequence = (events.at(-1)?.sequence || 0) + 1;
  return normalizeEvent({ deviceId: 'DEMO-01', eventId: `DEMO-${String(sequence).padStart(6, '0')}`, sequence, direction, validation, reason, occupancy, capacity: CAPACITY }, { origin: 'DEMO', sessionId: 'demo' });
}

export function exportCSV(events) {
  const headers = ['eventId', 'deviceId', 'sequence', 'fecha_hora', 'fecha', 'direction', 'validation', 'reason', 'occupancy', 'capacity', 'alert', 'origen', 'sessionId', 'timestamp_ms'];
  const escape = value => { const text = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return /[;"\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe; };
  return '\uFEFF' + [headers.join(';'), ...events.map(e => [e.eventId, e.deviceId, e.sequence, e.timestamp, e.date, e.direction, e.validation, e.reason, e.occupancy, e.capacity, e.alert, e.origin, e.sessionId, e.timestamp_ms].map(escape).join(';'))].join('\r\n');
}

export function validateTopic(topic) {
  return /^smart-tourism\/[a-zA-Z0-9/_-]{6,150}\/events$/.test(topic);
}

export function firmwareConfig(topic) {
  if (!validateTopic(topic)) throw new Error('El canal debe comenzar con smart-tourism/ y terminar con /events.');
  return `#pragma once\n// Canal de pruebas publico: usar solo datos simulados.\nconstexpr bool MQTT_HABILITADO = true;\nconstexpr char WIFI_SSID[] = "Wokwi-GUEST";\nconstexpr char WIFI_PASSWORD[] = "";\nconstexpr char MQTT_HOST[] = "broker.emqx.io";\nconstexpr unsigned short MQTT_PORT = 1883;\nconstexpr char MQTT_TOPIC[] = "${topic}";\n`;
}
