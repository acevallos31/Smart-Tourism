# Inicialización, respaldo y restauración de PostgreSQL — Smart-Tourism

Esta guía corresponde a la rama `feature/postgresql-persistence`. Se puede reconstruir la **base inicial de demostración** desde el repositorio, sin descargar un dump externo: `db/001_init.sql`, `db/002_estado_sesiones.sql` y `powerbi/data/eventos_iot.csv`. Para restaurar datos reales de sesiones Wokwi previamente recibidos, **sí hace falta un respaldo propio** de la base anterior.

> **Seguridad:** el procedimiento de restauración destruye datos si se ejecuta sobre la base equivocada. Primero identifica la base de destino, crea un respaldo, y detén temporalmente solo los procesos que escriben en esa base si vas a sustituirla. No publiques archivos `.dump`, contraseñas ni `DATABASE_URL` en Git.

## Opción A — Crear una base limpia con el histórico inicial

Requisitos: PostgreSQL (probado con 17), Node.js 20+, repositorio clonado y dependencias instaladas con `npm ci`. Ejemplo Linux/Debian; ejecutar los comandos administrativos con un usuario autorizado.

1. Crear usuario y base **solo si no existen**:

```bash
sudo -u postgres psql -c "CREATE ROLE smarttourism_app LOGIN PASSWORD 'REEMPLAZAR_CON_CLAVE_FUERTE';"
sudo -u postgres psql -c "CREATE DATABASE smart_tourism OWNER smarttourism_app;"
sudo -u postgres psql -d smart_tourism -c "GRANT USAGE, CREATE ON SCHEMA public TO smarttourism_app;"
```

El ejemplo usa una contraseña ficticia; cambiarla antes de ejecutar y no compartirla. Si el rol o la base ya existe, **no repitas** estos `CREATE`: revisa la instalación actual.

2. Desde la raíz del repositorio, definir la conexión de forma segura y ejecutar:

```bash
# Ejemplo ilustrativo. Usar una contraseña propia y URL-encode de caracteres especiales.
export DATABASE_URL='postgresql://smarttourism_app:CLAVE_URL_ENCODED@127.0.0.1:5432/smart_tourism'
npm ci
npm run db:migrate
npm run db:import-csv
```

`db:migrate` ejecuta `001_init.sql` y `002_estado_sesiones.sql`. El esquema incluye `sitios`, `dispositivos`, `eventos_iot`, `estado_aforo`, `estado_aforo_sesiones` y `alertas`. La sede inicial es `TAULABE`, capacidad académica 10, y el dispositivo inicial es `ACCESO-01`.

`db:import-csv` importa los **2.000 eventos sintéticos** con `session_id = 'HISTORICO-CSV-2026'`. La importación usa una transacción y `ON CONFLICT DO NOTHING`: repetirla no debería duplicar esos eventos. No sustituye los eventos Wokwi en vivo ni altera `estado_aforo`.

3. Verificar:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS eventos FROM eventos_iot;"
psql "$DATABASE_URL" -c "SELECT session_id, COUNT(*) FROM eventos_iot GROUP BY session_id ORDER BY session_id;"
psql "$DATABASE_URL" -c "SELECT d.device_id, s.session_id, s.ocupacion, s.capacidad, s.ultima_secuencia FROM estado_aforo_sesiones s JOIN dispositivos d ON d.id=s.dispositivo_id ORDER BY s.actualizado_en DESC LIMIT 20;"
```

La primera consulta debería informar **2.000** si se acaba de crear la base y no se han recibido eventos MQTT adicionales. La cantidad aumentará con nuevos eventos. La tabla de sesiones puede incluir el histórico importado; esto **no significa** que una simulación en vivo tenga actualmente ese aforo.

4. Iniciar el panel y el consumidor MQTT en procesos separados, con el `DATABASE_URL` y los datos del broker apropiados:

```bash
npm start
# En una segunda terminal:
npm run mqtt:worker
```

En el laboratorio Proxmox ya existen `smart-tourism.service` y `smart-tourism-mqtt.service`: **no lances una segunda copia del consumidor**. Verifica los servicios existentes con `systemctl status smart-tourism.service smart-tourism-mqtt.service`.

## Opción B — Crear un respaldo de la base actual (incluye sesiones reales)

En el servidor que aloja PostgreSQL, comprobar primero el nombre de la base. Ejemplo con acceso local de administrador:

```bash
sudo install -d -o postgres -g postgres -m 0700 /var/backups/smart-tourism
sudo -u postgres pg_dump -Fc -d smart_tourism \
  -f /var/backups/smart-tourism/smart_tourism_2026-11-03.dump
sudo -u postgres pg_restore --list \
  /var/backups/smart-tourism/smart_tourism_2026-11-03.dump | head -n 20
```

`-Fc` crea un respaldo PostgreSQL en formato personalizado. El archivo contiene **datos de la base existente**, incluidos los eventos Wokwi y el estado persistido por sesión, no solo los CSV del repositorio. La fecha del nombre es ilustrativa: usar la fecha real de cada copia. Proteger estos archivos y conservar una copia externa al servidor.

**Importante:** n8n mantiene el estado de notificaciones de su workflow en sus datos internos; el respaldo `pg_dump` de `smart_tourism` **no incluye** el almacenamiento de n8n, sus credenciales, los workflows ni los datos de WAHA. Es necesario respaldar esas plataformas aparte.

## Opción C — Restaurar un dump en una base vacía

**Preferencia:** restaurar en una base nueva `smart_tourism_restore` y comprobar los datos antes de considerar cualquier sustitución de producción.

```bash
sudo -u postgres createdb -O smarttourism_app smart_tourism_restore
sudo -u postgres pg_restore \
  --verbose --exit-on-error --no-owner --no-acl \
  -d smart_tourism_restore \
  /var/backups/smart-tourism/smart_tourism_2026-11-03.dump
sudo -u postgres psql -d smart_tourism_restore \
  -c "SELECT COUNT(*) AS eventos FROM eventos_iot;"
sudo -u postgres psql -d smart_tourism_restore \
  -c "SELECT COUNT(*) AS sesiones FROM estado_aforo_sesiones;"
```

Al restaurar con el administrador local y `--no-owner --no-acl`, puede ser necesario asignar después el propietario de objetos y los permisos al rol `smarttourism_app`. Una forma más controlada es restaurar usando ese mismo rol sobre una base que le pertenezca y tenga permisos de creación (con la conexión adecuada). **Verificar permisos antes de conectar la aplicación**. No cambiar el `DATABASE_URL` del servicio web hasta validar consultas y permisos.

Para restaurar sobre `smart_tourism` en lugar de una base temporal se requiere una ventana de mantenimiento, respaldo previo, detener escrituras (en particular `smart-tourism-mqtt.service`) y un plan de recuperación. Esta guía **no incluye** ningún comando automático de borrado de producción.

## Integridad y comprobaciones posteriores

```sql
SELECT COUNT(*) AS total_eventos FROM eventos_iot;
SELECT dispositivo_id, session_id, COUNT(*) AS total, MAX(sequence) AS ultima
FROM eventos_iot GROUP BY dispositivo_id, session_id ORDER BY total DESC;
SELECT dispositivo_id, session_id, ocupacion, capacidad, ultima_secuencia
FROM estado_aforo_sesiones ORDER BY actualizado_en DESC;
SELECT COUNT(*) AS alertas FROM alertas;
```

La tabla `eventos_iot` restringe duplicados por `(dispositivo_id,session_id,event_id)` y `(dispositivo_id,session_id,sequence)`. La tabla `estado_aforo_sesiones` conserva un estado independiente por `(dispositivo_id,session_id)`.

Tras un restore, probar `/api/health`, `/api/events?limit=2`, el estado de los servicios systemd y un evento de Wokwi nuevo. El flujo n8n/WAHA se documenta en [`docs/n8n-alertas-por-sesion.md`](../docs/n8n-alertas-por-sesion.md).

## Alcance y procedencia de los datos

- **Inicialización reproducible:** migraciones SQL y 2.000 eventos sintéticos versionados.
- **Restauración de producción/laboratorio:** requiere un `.dump` generado en el servidor correspondiente; **no hay un dump real de producción incorporado al repositorio**.
- La base inicial no reproduce automáticamente las ejecuciones, credenciales, mensajes ni estado interno de n8n, WAHA o WhatsApp.
- Los valores de ocupación, capacidad y eventos son parte del prototipo académico; no describen el aforo autorizado de las Cuevas de Taulabé.
