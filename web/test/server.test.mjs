import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';

test('Sirve panel, módulos, CSV y firmware; rechaza archivos privados y escritura',async(t)=>{
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/','/app.mjs','/model.mjs','/styles.css','/vendor/mqtt.min.js','/data/eventos_iot.csv','/firmware/sketch.ino','/firmware/config.h']){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.ok((await r.text()).length>10);}
  assert.equal((await fetch(base+'/.git/config')).status,403);assert.equal((await fetch(base+'/missing')).status,404);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});

test('Todos los controles usados por JavaScript existen en el documento',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'IDs únicos');
  for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),match[1]);
});
