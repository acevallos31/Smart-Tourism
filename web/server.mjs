import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let storePromise;
function getStore() { return storePromise ??= import('./db.mjs').then(m=>m.createStore()); }

const directory = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.ino': 'text/plain; charset=utf-8', '.h': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

export function createServer() {
  return http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); return response.end(); }
    try {
      const apiPath=new URL(request.url,'http://localhost').pathname;
      if(apiPath==='/api/events' || apiPath==='/api/health') {
        if(!process.env.DATABASE_URL) {response.writeHead(503,{'Content-Type':'application/json'});return response.end(JSON.stringify({error:'Base de datos no configurada'}));}
        const store=await getStore();
        const data=apiPath==='/api/events' ? await store.list(new URL(request.url,'http://localhost').searchParams.get('limit')) : {status:'ok',database:await store.health()};
        response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        return response.end(request.method==='HEAD'?undefined:JSON.stringify(data));
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const root = pathname.startsWith('/data/') ? path.resolve(directory, '../powerbi/data') : path.join(directory, 'dist');
      const relative = pathname.startsWith('/data/') ? pathname.slice(6) : pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) { response.writeHead(403); return response.end('Acceso denegado'); }
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Archivo no encontrado' : 'Solicitud no válida');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.on('error', error => { console.error(`No se pudo iniciar el panel: ${error.message}`); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`SmartTourism disponible en http://${host}:${port}`));
}
