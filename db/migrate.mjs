import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
 if(!process.env.DATABASE_URL) throw new Error('Define DATABASE_URL');
 for (const name of ['001_init.sql','002_estado_sesiones.sql']) {
  const sql=await readFile(new URL('./'+name,import.meta.url),'utf8');
  await pool.query(sql);
  console.log('Migración aplicada:',name);
 }
} finally {await pool.end();}
