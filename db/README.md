# PostgreSQL — Smart-Tourism

La base es opcional para el panel CSV/demo. Para persistir eventos MQTT se requiere PostgreSQL 17 y Node.js 20+.

## Instalación local
1. Instala dependencias con `npm install`.
2. Instala PostgreSQL o inicia `POSTGRES_PASSWORD=una-clave-fuerte docker compose up -d` (en PowerShell: `$env:POSTGRES_PASSWORD='una-clave-fuerte'; docker compose up -d`).
3. Configura `DATABASE_URL` en el entorno; el archivo `.env.example` es solo una plantilla y Node.js no lo carga automáticamente.
4. Ejecuta `npm run db:migrate` y después `npm run mqtt:worker` en otra terminal.
5. Ejecuta `npm start` para el panel existente. El consumidor MQTT guarda eventos aunque no haya navegadores conectados.

**Nota:** el panel actual continúa mostrando CSV o eventos MQTT de la pestaña; la lectura histórica desde PostgreSQL se incorporará en una etapa posterior. No se importan automáticamente los 2.000 eventos sintéticos. No expongas PostgreSQL a Internet ni publiques contraseñas en Git.

En Proxmox, configura `DATABASE_URL` como variable del servicio systemd del consumidor, no en el repositorio. Crea la base y el rol con los permisos de esquema antes de ejecutar la migración.

## Importar el histórico sintético para Power BI

Con `DATABASE_URL` configurada y la migración aplicada:

```bash
npm run db:import-csv
```

El script importa `powerbi/data/eventos_iot.csv` dentro de una transacción. Valida cada evento, conserva el JSON original con la marca `CSV_SINTETICO`, evita duplicados mediante restricciones únicas y crea registros de alertas. No altera `estado_aforo`, reservado para el aforo en vivo. Una segunda ejecución debe informar `inserted: 0`.

Comprobación:

```bash
runuser -u postgres -- psql -d smart_tourism -c "SELECT session_id, COUNT(*) FROM eventos_iot GROUP BY session_id;"
```

La carga histórica y el consumidor MQTT comparten base, pero sus sesiones se diferencian. El CSV es sintético y no representa mediciones reales.
