import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
 if(!process.env.DATABASE_URL) throw new Error('Define DATABASE_URL');
 const sql=await readFile(new URL('./001_init.sql',import.meta.url),'utf8');
 await pool.query(sql);
 console.log('Migración 001 aplicada correctamente');
} finally {await pool.end();}
