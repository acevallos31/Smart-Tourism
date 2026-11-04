# Despliegue reproducible de Smart-Tourism

La instalación local no depende de Proxmox ni de smart-tourism.nocpbx.com. Requiere Node.js 20+, PostgreSQL (probado en 17) y acceso a Internet para Wokwi/MQTT. El panel y el consumidor son procesos separados. La base de datos almacena eventos y aforo por `sessionId`.

## 1. Clonar e instalar

```bash
git clone -b feature/postgresql-persistence https://github.com/acevallos31/Smart-Tourism.git
cd Smart-Tourism
npm ci
npm test
```

## 2. Crear PostgreSQL

Crea una base `smart_tourism` y un rol `smarttourism_app` con contraseña **propia**. Ejemplo en una instalación local de PostgreSQL, desde una sesión de administrador:

```sql
CREATE ROLE smarttourism_app LOGIN PASSWORD 'REEMPLAZAR_CON_CLAVE_FUERTE';
CREATE DATABASE smart_tourism;
GRANT CONNECT ON DATABASE smart_tourism TO smarttourism_app;
```

Conectado a la base `smart_tourism` como administrador:

```sql
GRANT USAGE, CREATE ON SCHEMA public TO smarttourism_app;
```

No uses una contraseña de ejemplo en un despliegue real. Mantén PostgreSQL escuchando solo en la interfaz local salvo necesidad justificada.

## 3. Variables de entorno

Copia `.env.example` como referencia. Node.js **no carga automáticamente** ese archivo. En una terminal Bash puedes exportar:

```bash
export DATABASE_URL='postgresql://smarttourism_app:CLAVE_URL_ENCODED@127.0.0.1:5432/smart_tourism'
export MQTT_URL='mqtt://broker.emqx.io:1883'
export MQTT_TOPIC='smart-tourism/taulabe/6ae93b438bcc8191/events'
```

Codifica los caracteres especiales de la contraseña para una URL. No compartas `DATABASE_URL` ni la agregues a Git. El broker indicado es público, solo para datos sintéticos de demostración.

## 4. Migrar y ejecutar

```bash
npm run db:migrate
npm run db:import-csv
npm start
```

Abre `http://127.0.0.1:3000`. En otra terminal con las mismas variables exportadas:

```bash
npm run mqtt:worker
```

La importación de CSV es opcional y repetible: los 2.000 registros son sintéticos. El panel permite elegir la fuente PostgreSQL. En Wokwi, inicia la simulación conectada al mismo tópico y verifica la recepción en los registros del consumidor. El navegador puede cerrarse: el consumidor sigue guardando eventos mientras su proceso esté activo.

Verificación:

```bash
curl -fsS http://127.0.0.1:3000/api/health
psql "$DATABASE_URL" -c 'SELECT session_id, COUNT(*) FROM eventos_iot GROUP BY session_id;'
psql "$DATABASE_URL" -c 'SELECT session_id, ocupacion, capacidad, ultima_secuencia FROM estado_aforo_sesiones;'
```

## 5. Debian / Proxmox con systemd (opcional)

Los archivos en `deploy/systemd/` son **plantillas** con ruta de producción `/opt/smart-tourism`. En el laboratorio actual se utiliza `/opt/smart-tourism-dev` y el servicio web ya existe: **no sobrescribas su configuración en funcionamiento**.

En una instalación nueva, crea el usuario de servicio, instala el repositorio en `/opt/smart-tourism`, ejecuta `npm ci` y concede lectura del proyecto a `smarttourism`. Crea `/etc/smart-tourism/database.env` como root con permisos `0600` y contenido de tipo `DATABASE_URL=...`, `MQTT_URL=...`, `MQTT_TOPIC=...`. Systemd lee ese archivo y entrega las variables al proceso del usuario de servicio.

```bash
install -m 0644 deploy/systemd/smart-tourism.service /etc/systemd/system/
install -m 0644 deploy/systemd/smart-tourism-mqtt.service /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/smart-tourism*.service
systemctl daemon-reload
systemctl enable --now smart-tourism.service smart-tourism-mqtt.service
systemctl status smart-tourism.service smart-tourism-mqtt.service --no-pager
journalctl -u smart-tourism-mqtt.service -n 30 --no-pager
```

No ejecutes dos consumidores simultáneos contra el mismo tópico sin un diseño de reparto de carga. El servidor web y el consumidor deben usar la misma base de datos y el mismo tópico del firmware. En Proxmox, el inicio automático del contenedor (`onboot: 1`) se configura en el host Proxmox, no dentro de este repositorio.

## Limitaciones

La conexión MQTT usa QoS 0 sobre un broker público: no garantiza entrega ni privacidad. Los datos CSV son simulados, no mediciones reales de las Cuevas de Taulabé. La separación de sesiones en PostgreSQL fue comprobada con dos simuladores Wokwi; también se observaron notificaciones WhatsApp etiquetadas por sesión mediante n8n/WAHA. No se ha efectuado una prueba de carga ni demostrado atomicidad del estado interno de n8n.

## Recuperación y flujos de notificación

- **[Inicialización/restore de PostgreSQL](../db/RESTORE.md)**: esquema SQL, carga histórica, respaldo personalizado y restauración en base de prueba.
- **[Arquitectura y diagramas n8n/WAHA](../docs/n8n-alertas-por-sesion.md)**: flujo de cinco nodos, alertas y estados por sesión.
- La URL MQTT de `.env.example` es un valor **de ejemplo**. En la instalación del laboratorio se utiliza el broker de la Raspberry Pi; configurar `MQTT_URL` y `MQTT_TOPIC` según la topología real antes de activar el consumidor.
