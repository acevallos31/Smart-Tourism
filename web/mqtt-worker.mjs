import mqtt from 'mqtt';
import { DEFAULT_TOPIC } from './dist/model.mjs';
import { createStore } from './db.mjs';
const store=createStore();
const url=process.env.MQTT_URL||'mqtt://broker.emqx.io:1883';
const topic=process.env.MQTT_TOPIC||DEFAULT_TOPIC;
const client=mqtt.connect(url,{clientId:'st-backend-'+Math.random().toString(36).slice(2),reconnectPeriod:5000,connectTimeout:15000});
client.on('connect',()=>client.subscribe(topic,{qos:0},e=>e?console.error('Suscripción:',e):console.log('MQTT escuchando',topic)));
client.on('message',async(t,p)=>{
 if(t!==topic||p.length>16384)return;
 try {const r=await store.save(JSON.parse(p.toString('utf8')));if(r.inserted)console.log('Guardado:',r.event.eventId);}
 catch(e){console.error('Evento descartado:',e.message);}
});
client.on('error',e=>console.error('MQTT:',e.message));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{client.end(true);store.close().finally(()=>process.exit(0));});
