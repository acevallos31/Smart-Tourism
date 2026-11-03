import mqtt from 'mqtt';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeEvent, DEFAULT_BROKER } from '../dist/model.mjs';

// Prueba aislada: nunca publica en el canal del panel ni altera sus datos.
const id=randomUUID();const topic=`smart-tourism/qa/${id}/events`;
const payload={deviceId:'ACCESO-01',eventId:`QA-${id}`,sessionId:id,sequence:1,timestamp_ms:1000,direction:'entrada',validation:'ACEPTADO',reason:'A_B',occupancy:1,capacity:10,alert:'NINGUNA'};
const clients=[];
try {
  const subscriber=mqtt.connect(DEFAULT_BROKER,{connectTimeout:12000,reconnectPeriod:0});clients.push(subscriber);
  await new Promise((resolve,reject)=>{subscriber.once('connect',resolve);subscriber.once('error',reject);});
  await subscriber.subscribeAsync(topic);
  const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No se recibió el evento de prueba en 20 segundos')),20000);subscriber.once('message',(_,data)=>{clearTimeout(timer);resolve(JSON.parse(data.toString()));});subscriber.once('error',reject);});
  const publisher=mqtt.connect('mqtt://broker.emqx.io:1883',{connectTimeout:12000,reconnectPeriod:0});clients.push(publisher);
  await new Promise((resolve,reject)=>{publisher.once('connect',resolve);publisher.once('error',reject);});
  await publisher.publishAsync(topic,JSON.stringify(payload),{retain:false,qos:0});
  const event=normalizeEvent(await received,{origin:'WOKWI'});assert.equal(event.occupancy,1);assert.equal(event.eventId,payload.eventId);
  console.log('OK: publicación MQTT TCP (ESP32) -> broker EMQX -> suscripción WSS (panel).');
} finally { for(const client of clients)client.end(true); }
