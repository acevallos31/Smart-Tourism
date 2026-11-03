import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.mjs';

test('API devuelve 503 sin DATABASE_URL y el panel continúa disponible',async t=>{
 const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
 t.after(()=>{if(previous!==undefined)process.env.DATABASE_URL=previous;});
 const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const api=await fetch(base+'/api/events');
 assert.equal(api.status,503);
 assert.match((await api.json()).error,/no configurada/);
 assert.equal((await fetch(base+'/')).status,200);
});
