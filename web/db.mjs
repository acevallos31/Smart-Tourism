import { Pool } from 'pg';
import { normalizeEvent } from './dist/model.mjs';

export function createStore(connectionString=process.env.DATABASE_URL) {
 if(!connectionString) throw new Error('DATABASE_URL no configurada');
 const pool=new Pool({connectionString,max:5});
 return {
  async save(raw) {
   const event=normalizeEvent(raw,{origin:'WOKWI',sessionId:'legacy'});
   const client=await pool.connect();
   try {
    await client.query('BEGIN');
    const device=await client.query('SELECT id FROM dispositivos WHERE device_id=$1',[event.deviceId]);
    if(!device.rowCount) throw new Error('Dispositivo no registrado');
    const d=device.rows[0].id;
    const result=await client.query(`INSERT INTO eventos_iot
     (dispositivo_id,session_id,event_id,sequence,fecha_hora,direction,validation,reason,occupancy,capacity,alert,payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT DO NOTHING RETURNING id`,[d,event.sessionId,event.eventId,event.sequence,event.fecha_hora,event.direction,event.validation,event.reason,event.occupancy,event.capacity,event.alert,raw]);
    if(result.rowCount) {
     const id=result.rows[0].id;
     await client.query(`INSERT INTO estado_aforo(dispositivo_id,ocupacion,capacidad,ultimo_evento_id)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(dispositivo_id) DO UPDATE SET ocupacion=EXCLUDED.ocupacion,capacidad=EXCLUDED.capacidad,
       ultimo_evento_id=EXCLUDED.ultimo_evento_id,actualizado_en=now()
       WHERE estado_aforo.ultimo_evento_id IS NULL OR estado_aforo.ultimo_evento_id < EXCLUDED.ultimo_evento_id`,[d,event.occupancy,event.capacity,id]);
     if(event.alert!=='NINGUNA'||event.validation!=='ACEPTADO')
      await client.query('INSERT INTO alertas(evento_id,tipo) VALUES($1,$2)',[id,event.alert!=='NINGUNA'?event.alert:event.validation]);
    }
    await client.query('COMMIT');
    return {inserted:Boolean(result.rowCount),event};
   } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  },
  async list(limit=100) {
   const r=await pool.query(`SELECT e.event_id AS "eventId",d.device_id AS "deviceId",e.session_id AS "sessionId",
    e.sequence,to_char(e.fecha_hora,'YYYY-MM-DD HH24:MI:SS') AS fecha_hora,
    e.direction,e.validation,e.reason,e.occupancy,e.capacity,e.alert
    FROM eventos_iot e JOIN dispositivos d ON d.id=e.dispositivo_id
    ORDER BY e.id DESC LIMIT $1`,[Math.max(1,Math.min(1000,Number(limit)||100))]);
   return r.rows;
  },
  async health() {await pool.query('SELECT 1');return true;},
  async close() {await pool.end();}
 };
}
