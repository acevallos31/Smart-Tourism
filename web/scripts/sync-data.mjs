import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const site = new URL('../', import.meta.url);
for (const folder of ['data', 'firmware', 'vendor']) await mkdir(new URL(`dist/${folder}/`, site), { recursive: true });
for (const name of ['eventos_iot.csv', 'ocupacion.csv', 'alertas.csv', 'resumen_diario.csv']) {
  await copyFile(new URL(`../powerbi/data/${name}`, site), new URL(`dist/data/${name}`, site));
}
for (const name of ['sketch.ino', 'diagram.json', 'libraries.txt', 'config.h']) {
  await copyFile(new URL(`../wokwi/${name}`, site), new URL(`dist/firmware/${name}`, site));
}
const mqttBundle = new URL('../node_modules/mqtt/dist/mqtt.min.js', site);
try {
  await access(mqttBundle);
  await copyFile(mqttBundle, new URL('dist/vendor/mqtt.min.js', site));
  await copyFile(new URL('../node_modules/mqtt/LICENSE.md', site), new URL('dist/vendor/MQTT-LICENSE.txt', site));
} catch {
  await access(new URL('dist/vendor/mqtt.min.js', site)).catch(() => { throw new Error('Falta MQTT.js. Ejecuta npm install y luego npm run sync-data.'); });
}
console.log(`CSV y firmware sincronizados en ${fileURLToPath(new URL('dist/', site))}`);
