import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCSV, normalizeEvent, summarize, makeDemoEvent, filterEvents, exportCSV, validateTopic, firmwareConfig } from '../dist/model.mjs';

const csv = await readFile(new URL('../../powerbi/data/eventos_iot.csv',import.meta.url),'utf8');
const events = parseCSV(csv).map(e=>normalizeEvent(e));

test('El panel reproduce los 2000 eventos y los 21 resúmenes diarios de Power BI',async()=>{
  const stats=summarize(events);assert.equal(stats.total,2000);assert.equal(stats.alerts,1054);assert.equal(stats.days.length,21);assert.equal(stats.latest.occupancy,7);
  const summary=(await readFile(new URL('../../powerbi/data/resumen_diario.csv',import.meta.url),'utf8')).trim().replace(/^\uFEFF/,'').split(/\r?\n/);
  const fields=summary.shift().split(';');
  for(const line of summary){const s=Object.fromEntries(fields.map((key,i)=>[key,line.split(';')[i]]));const d=stats.days.find(day=>day.date===s.fecha);assert.equal(d.entries,Number(s.entradas));assert.equal(d.exits,Number(s.salidas));assert.equal(d.total,Number(s.total_eventos));assert.equal(d.max,Number(s.ocupacion_maxima));assert.equal(Number(d.avg.toFixed(2)),Number(s.ocupacion_promedio));}
});

test('Los filtros de fecha, dirección y validación incluyen ambos extremos',()=>{
  const selected=filterEvents(events,{from:'2026-10-01',to:'2026-10-01',direction:'entrada',validation:'ACEPTADO'});assert.equal(selected.length,48);
  assert.equal(filterEvents(events,{query:'AFORO_CERO'}).every(e=>e.reason==='AFORO_CERO'),true);
  assert.equal(filterEvents(events,{from:'2026-10-21',to:'2026-10-01'}).length,0);
});

test('La demostración respeta el aforo cero, el máximo y los pasos incompletos',()=>{
  const demo=[];demo.push(makeDemoEvent(demo,'salida'));assert.equal(demo[0].reason,'AFORO_CERO');
  for(let i=0;i<10;i++)demo.push(makeDemoEvent(demo,'entrada'));
  assert.equal(demo.at(-1).occupancy,10);assert.equal(demo.at(-1).alert,'CAPACIDAD_MAXIMA');
  demo.push(makeDemoEvent(demo,'entrada'));assert.equal(demo.at(-1).reason,'AFORO_MAXIMO');assert.equal(demo.at(-1).occupancy,10);
  demo.push(makeDemoEvent(demo,'indeterminada'));assert.equal(demo.at(-1).occupancy,10);assert.equal(demo.at(-1).validation,'REVISAR_DATOS');
  demo.push(makeDemoEvent(demo,'salida'));assert.equal(demo.at(-1).occupancy,9);assert.equal(demo.at(-1).alert,'ADVERTENCIA_80');
});

test('CSV exportado se puede reimportar sin perder los valores',()=>{
  const exported=exportCSV(events);const back=parseCSV(exported).map(e=>normalizeEvent(e));assert.equal(back.length,events.length);assert.deepEqual(back.map(e=>[e.eventId,e.occupancy,e.date]),events.map(e=>[e.eventId,e.occupancy,e.date]));
  const sample=csv.split(/\r?\n/).slice(0,2).join('\r\n');assert.equal(parseCSV(sample).length,1);
  assert.throws(()=>parseCSV('eventId;occupancy\n"incompleto;2'),/comillas/);
});

test('Rechaza datos malformados y separa las sesiones del dispositivo',()=>{
  const raw=parseCSV(csv)[1];assert.throws(()=>normalizeEvent({...raw,occupancy:11}),/occupancy/);assert.throws(()=>normalizeEvent({...raw,eventId:'<script>'}),/Identificador/);
  assert.throws(()=>normalizeEvent({...raw,fecha_hora:'2026-02-31 12:00:00'}),/fecha/i);assert.throws(()=>normalizeEvent({...raw,sequence:''}),/sequence/);
  assert.throws(()=>normalizeEvent({...raw,direction:'salida'}),/dirección/);
  assert.notEqual(normalizeEvent({...raw,sessionId:'a'}).key,normalizeEvent({...raw,sessionId:'b'}).key);
});

test('La configuración descargada restringe comodines e inyección de código',()=>{
  assert.equal(validateTopic('smart-tourism/taulabe/prueba01/events'),true);assert.equal(validateTopic('smart-tourism/+/events'),false);assert.equal(validateTopic('smart-tourism/";hack();/events'),false);
  assert.match(firmwareConfig('smart-tourism/taulabe/prueba01/events'),/MQTT_TOPIC/);
});
