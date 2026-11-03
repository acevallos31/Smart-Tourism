import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { parseCSV, normalizeEvent } from '../web/dist/model.mjs';

const source = new URL('../powerbi/data/eventos_iot.csv', import.meta.url);
const sessionId = 'HISTORICO-CSV-2026';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const rows = parseCSV(await readFile(source, 'utf8'));
  if (!rows.length) throw new Error('El CSV está vacío');
  const events = rows.map((row, index) => {
    if (row.origen !== 'SIMULADO') throw new Error('Fila ' + (index + 2) + ': origen inesperado');
    return normalizeEvent(row, { origin: 'CSV', sessionId });
  });
  const unique = new Set(events.map(e => e.key));
  if (unique.size !== events.length) throw new Error('El CSV contiene eventos duplicados');
  const client = await pool.connect();
  let inserted = 0, duplicates = 0, alerts = 0;
  try {
    await client.query('BEGIN');
    const devices = await client.query('SELECT id, device_id FROM dispositivos');
    const ids = new Map(devices.rows.map(row => [row.device_id, row.id]));
    for (const e of events) {
      const deviceId = ids.get(e.deviceId);
      if (!deviceId) throw new Error('Dispositivo no registrado: ' + e.deviceId);
      const result = await client.query(
        `INSERT INTO eventos_iot
        (dispositivo_id,session_id,event_id,sequence,fecha_hora,direction,validation,reason,occupancy,capacity,alert,payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING RETURNING id`,
        [deviceId,e.sessionId,e.eventId,e.sequence,e.timestamp,e.direction,e.validation,e.reason,e.occupancy,e.capacity,e.alert,
         JSON.stringify({ ...rows[events.indexOf(e)], sessionId, fuente:'CSV_SINTETICO' })]
      );
      if (!result.rowCount) { duplicates++; continue; }
      inserted++;
      if (e.alert !== 'NINGUNA' || e.validation !== 'ACEPTADO') {
        await client.query('INSERT INTO alertas(evento_id,tipo) VALUES ($1,$2)',
          [result.rows[0].id,e.alert !== 'NINGUNA' ? e.alert : e.validation]);
        alerts++;
      }
    }
    // No actualizar estado_aforo: la ocupación histórica no es el estado en vivo.
    await client.query('COMMIT');
    console.log(JSON.stringify({ totalCSV: events.length, inserted, duplicates, alerts, sessionId }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
try { await main(); } catch(error) { console.error('Importación cancelada:',error.message); process.exitCode=1; } finally { await pool.end(); }
