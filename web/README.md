# Panel SmartTourism

Panel web en español para explorar los datos de SmartAforo y recibir eventos del ESP32 simulado. Incluye resumen, gráficas, filtros por fecha/dirección/validación, búsqueda, paginación, importación CSV/JSON del monitor serial y exportación compatible con Power BI.

## Abrir en tu equipo

Desde la raíz de Smart-Tourism, con Node.js 20 o posterior:

```powershell
npm start
```

Abre **http://localhost:3000**. Detén el servidor con Ctrl+C. Los recursos del navegador, incluido MQTT.js, están incluidos; no hace falta instalar paquetes para visualizar la página. No abras `index.html` directamente: la lectura de CSV requiere HTTP.

Si el puerto está ocupado, en PowerShell:

```powershell
$env:PORT = '3001'
npm start
```

## Modos de datos

- **Histórico CSV:** carga los 2.000 eventos sintéticos del proyecto. Las gráficas se calculan a partir de esos eventos y coinciden con los resúmenes diarios de Power BI. La ocupación del indicador es la del último evento visible, no la diferencia de todas las entradas y salidas: los datos reinician el aforo cada día.
- **Demostración:** los botones Entrada, Salida y Paso incompleto generan eventos solo en la pestaña. Respeta el aforo de 0 a 10 y muestra rechazos en los extremos. Reiniciar demo no modifica el histórico.
- **Wokwi en vivo:** recibe eventos MQTT del dispositivo. Solo conserva los recibidos en la pestaña, hasta 5.000. Exporta antes de cerrar o recargar. No hay una base de datos ni garantía de historial completo.

Los filtros afectan los indicadores y la exportación. La gráfica de ocupación muestra el promedio de las lecturas por día, no un promedio ponderado por tiempo. En Alertas se incluyen avisos de ocupación, rechazos y pasos indeterminados.

El servidor local lee `powerbi/data/` directamente. Si regeneras los CSV con Python, recarga el panel. Para actualizar la copia estática que se publica, o los archivos de firmware descargables:

```powershell
npm run sync-data
```

## Conectar Wokwi

1. Abre el panel y selecciona **Conexión IoT**.
2. Descarga `sketch.ino`, `libraries.txt` y `diagram.json` desde esa sección. Reemplaza esos archivos en una copia editable del proyecto de Wokwi.
3. Descarga **config.h** desde el panel y agrégalo con ese nombre al editor de Wokwi. El archivo contiene el mismo canal que ve el panel.
4. Pulsa **Conectar** en la página y **▶** en Wokwi. La biblioteca `PubSubClient@2.8` se instala a través de `libraries.txt`.
5. Comprueba **Broker: conectado** y **Dispositivo: señal reciente**. Son estados distintos: conectarse al broker no implica que el ESP32 esté enviando.
6. Selecciona **Wokwi en vivo → Vista general**. Pulsa y suelta A, luego B, para entrar; B, luego A, para salir. Cada pulsación/liberación debe durar al menos 60 ms y la secuencia debe completarse en menos de 4 segundos de simulación.

El proyecto publicado originalmente en Wokwi no se actualiza al cambiar este repositorio. Debes copiar el firmware nuevo para que envíe MQTT. No se necesita ThingSpeak ni una cuenta de EMQX para esta demostración.

### Conexión y límites

- Firmware: `broker.emqx.io:1883` (MQTT TCP).
- Navegador: `wss://broker.emqx.io:8084/mqtt` (WebSocket con TLS).
- Canal de eventos: el valor de `MQTT_TOPIC` en `wokwi/config.h`. El estado usa el mismo prefijo y termina en `/status`.
- El broker es **público y de pruebas**, sin autenticación ni almacenamiento garantizado. El canal evita mezclar accidentalmente prototipos, pero no proporciona privacidad. Usar solo datos simulados; para operación real se requiere un broker privado con autenticación y almacenamiento.
- MQTT y Wi-Fi se ejecutan en otra tarea del ESP32 para no bloquear los pulsadores. Se mantienen hasta 32 eventos pendientes. Si se llena la cola, el evento sigue apareciendo en serial y el contador de descartados se informa al panel.
- El envío usa QoS 0. No garantiza entrega. El panel detecta saltos de secuencia durante una sesión observada; no reconstruye eventos previos a la conexión.
- Cada arranque crea un `sessionId`; evita confundir eventos después de un reinicio. El panel descarta duplicados y formatos inválidos.
- Un latido cada 10 segundos de simulación informa el estado. Tras 30 segundos sin mensajes nuevos se muestra “Sin señal reciente”. En simulaciones lentas ese aviso puede aparecer aunque Wokwi siga ejecutándose.
- `timestamp_ms` es tiempo desde el arranque, no fecha real. Para MQTT, la fecha/hora visible es la **recepción en el navegador**, en Honduras (UTC−6); un evento encolado puede mostrarse después de haber ocurrido. Los CSV conservan su fecha original.
- En un registro serial antiguo, sin `sessionId`, importa cada sesión por separado. Importar datos reemplaza el histórico en la pestaña; no modifica los archivos originales.

Para usar exclusivamente LCD/serial, cambia `MQTT_HABILITADO` a `false` en `config.h`.

## Verificación y desarrollo

```powershell
npm ci
npm test
npm run test:ui
npm run test:mqtt
```

`npm test` verifica datos, límites, filtros, importación/exportación y servidor. `test:ui` usa Edge instalado, sin abrir una ventana ni utilizar tu perfil personal; puedes seleccionar otro canal instalado con `BROWSER_CHANNEL`. `test:mqtt` requiere Internet y publica un único evento sintético en un canal de pruebas aleatorio, separado del panel. Las capturas de las pruebas quedan en `.site-artifacts/`, excluido de Git.

Para compilar el firmware con PlatformIO instalado:

```powershell
pio run
```

La configuración fija la plataforma ESP32 y las versiones de bibliotecas. La simulación web de Wokwi no necesita PlatformIO.

## Publicación

`dist/` contiene el sitio estático completo. `.openai/hosting.json` identifica el sitio privado registrado en Sites. El panel publicado carga la copia de CSV de `dist/data/`; ejecuta `npm run sync-data` antes de publicar cambios de datos o firmware.

Documentación: [Wokwi Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi), [EMQX público](https://www.emqx.com/en/mqtt/public-mqtt5-broker), [MQTT.js](https://github.com/mqttjs/MQTT.js).
