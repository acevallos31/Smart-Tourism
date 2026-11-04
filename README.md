# Smart-Tourism | SmartAforo IoT

Prototipo académico del **Equipo 2** para **Tecnologías Emergentes**. Simula el control de aforo en las Cuevas de Taulabé, Honduras, usando un ESP32 en Wokwi.

**[Abrir prototipo en Wokwi](https://wokwi.com/projects/479635156414370817)**

## Panel web interactivo

**[Abrir el panel SmartTourism](https://smart-tourism.nocpbx.com/)** · Panel publicado en la infraestructura Proxmox mediante Cloudflare Tunnel.

El proyecto incluye una página para explorar el histórico, simular entradas y salidas, y recibir eventos de Wokwi por MQTT.

Con Node.js 20 o posterior, desde la raíz del proyecto:

```powershell
npm start
```

Abre **http://localhost:3000**. En **Histórico CSV** verás los 2.000 eventos existentes; **Demostración** permite probar el aforo sin hardware. En **Conexión IoT** puedes descargar el firmware y la configuración para conectar Wokwi. Consulta la [guía del panel](web/README.md) para los pasos, las pruebas y los límites de la conexión.

## Ejecutar la simulación

Necesitas un navegador con conexión a Internet. Para esta opción, Wokwi compila el programa y simula el ESP32; no necesitas una placa física ni instalar Arduino IDE.

1. Abre el enlace del prototipo y pulsa **▶ Start Simulation**.
2. Espera a que termine la compilación. La pantalla LCD debe mostrar `SmartAforo IoT` y `Aforo: 0/10`, con el LED verde encendido.
3. Para simular una **entrada**, pulsa y suelta el botón azul **Barrera A (exterior)**; después pulsa y suelta el botón naranja **Barrera B (interior)**.
4. Para simular una **salida**, repite en orden **B → A**.
5. Revisa los eventos JSON en el monitor serial. El programa usa **115200 baudios**.

Mantén cada pulsación y cada liberación aproximadamente **0,2 segundos**: el programa filtra cambios de menos de 60 ms. Completa cada secuencia en menos de **4 segundos de simulación** y suelta ambos botones antes de iniciar otra. Al reiniciar la simulación, el aforo y la secuencia de eventos vuelven a cero.

### Usar los archivos de este repositorio

El proyecto publicado en Wokwi y los archivos locales son copias independientes. Los cambios locales no se sincronizan automáticamente con el enlace.

Para probar una versión modificada, abre una copia editable del prototipo o crea un [proyecto ESP32 en Wokwi](https://wokwi.com/projects/new/esp32). Copia el contenido de estos archivos en los archivos del mismo nombre del editor:

- `wokwi/sketch.ino`: programa Arduino/C++.
- `wokwi/diagram.json`: componentes y conexiones.
- `wokwi/libraries.txt`: dependencia `LiquidCrystal I2C`.
- `wokwi/config.h`: configuración Wi-Fi, MQTT y canal del panel. La versión conectada también usa `PubSubClient@2.8`, declarada en `libraries.txt`.

Si aparece `LiquidCrystal_I2C.h: No such file or directory`, agrega **LiquidCrystal I2C** desde **Library Manager**. `Arduino.h` y `Wire.h` forman parte del entorno Arduino de Wokwi. Consulta la [guía oficial de bibliotecas](https://docs.wokwi.com/guides/libraries).

### Pruebas manuales

| Prueba | Resultado esperado |
| --- | --- |
| Iniciar la simulación | Aforo `0/10`, LED verde. |
| A → B | Suma una persona; evento `ACEPTADO`, motivo `A_B`. |
| B → A con personas dentro | Resta una persona; evento `ACEPTADO`, motivo `B_A`. |
| Alcanzar 8 o 9 personas | LED amarillo y alerta `ADVERTENCIA_80`. |
| Alcanzar 10 personas | LED rojo y alerta `CAPACIDAD_MAXIMA`. |
| A → B con aforo 10 | Mantiene 10; evento `RECHAZADO`, motivo `AFORO_MAXIMO`. |
| B → A con aforo 0 | Mantiene 0; evento `RECHAZADO`, motivo `AFORO_CERO`. |
| Pulsar solo una barrera y esperar más de 4 segundos | Mantiene el aforo; evento `REVISAR_DATOS`, motivo `PASO_INCOMPLETO`. |

## Funcionamiento

- Dos pulsadores simulan barreras A (exterior) y B (interior).
- **A → B:** entrada; **B → A:** salida.
- Capacidad **hipotética de 10 personas**, utilizada para facilitar las pruebas.
- LED verde: 0–7; amarillo: 8–9; rojo: 10 (aforo completo).
- LCD con ocupación y eventos JSON en el monitor serial.
- Pasos incompletos o simultáneos se registran para revisión.

Los archivos de Wokwi están en `wokwi/`: `sketch.ino`, `diagram.json`, `libraries.txt` y `config.h`. El programa conectado mantiene LCD y serial, y añade el envío MQTT en una tarea separada. Cada reinicio crea una sesión nueva.


## Alertas automáticas por WhatsApp (n8n + WAHA)

El prototipo envía eventos desde **Wokwi ESP32 → broker MQTT → n8n → WAHA → WhatsApp**. Se probó el envío de advertencias, capacidad máxima y pasos incompletos con **varias sesiones** de Wokwi; cada mensaje identifica `sessionId` y `deviceId`.

- Los nodos MQTT Trigger y Webhook Smart-Tourism desembocan en **Evaluar aforo y cambios**, luego en **¿Enviar alerta?** y **Enviar WhatsApp WAHA**.
- Cada simulador tiene estado propio mediante la clave `deviceId:sessionId` y control de secuencia. Se notifica el cambio a 80 %, 100 %, la normalización y `REVISAR_DATOS`; no se repiten avisos por cada lectura del mismo nivel.
- La plantilla [`n8n/smart-tourism-alertas-waha.json`](n8n/smart-tourism-alertas-waha.json) está **desactivada y sin secretos**; configura MQTT, WAHA y el grupo receptor en el servidor.
- Los datos que llegan por MQTT se guardan por separado en PostgreSQL mediante `smart-tourism-mqtt.service`. **n8n no escribe directamente en PostgreSQL** en este flujo.

**[Arquitectura completa, diagramas Mermaid y procedimientos de n8n](docs/n8n-alertas-por-sesion.md)**

La capacidad de 10 es hipotética, solo para demostración; no corresponde al aforo oficial de las Cuevas de Taulabé. El estado estático de n8n no ofrece garantías transaccionales de concurrencia; para producción se recomienda persistir las alertas y su entrega en PostgreSQL.

## Generar los datos para Power BI

Los cuatro CSV de ejemplo ya están en `powerbi/data/`; puedes importarlos sin ejecutar Python. Para regenerarlos necesitas **Python 3**. El generador usa únicamente la biblioteca estándar, sin dependencias de `pip`.

Desde la raíz del repositorio, ejecuta en PowerShell:

```powershell
python --version
python powerbi/scripts/generar_datos.py
```

La ejecución reemplaza los cuatro CSV con los datos reproducibles de la semilla configurada. Con la configuración incluida, la salida es:

```text
Dias: 21 | Eventos: 2000 | Alertas: 1054
```

Si Windows no reconoce `python`, prueba `py -3 powerbi/scripts/generar_datos.py` si tienes instalado el lanzador de Python, o instala Python 3 y vuelve a abrir la terminal.

En **Power BI Desktop → Obtener datos → Texto/CSV**, selecciona los archivos de `powerbi/data/`, usa delimitador **`;`** y codificación **UTF-8**. Los detalles están en [powerbi/README.md](powerbi/README.md).

## Alcance y requisitos

- **Simulación IoT:** se ejecuta en Wokwi. Para trabajar con el ESP32, consulta también la [documentación oficial del simulador](https://docs.wokwi.com/guides/esp32).
- **Datos para Power BI:** son sintéticos; el generador no captura la salida serial de Wokwi. El panel puede exportar los eventos MQTT recibidos como CSV para importarlos en Power BI; no hay actualización automática de Power BI.
- **Informe:** el repositorio incluye CSV, pero no un informe `.pbix`; las visualizaciones se crean en Power BI Desktop.
- **Node.js:** `npm start` o `npm run dev` inicia el panel local. Los recursos web están incluidos; `npm ci` instala las herramientas de desarrollo y pruebas.
- **Ejecución local del firmware:** `platformio.ini` permite compilar con `pio run`. Para simular puedes seguir usando Wokwi web.

## PostgreSQL y despliegue reproducible

La rama `feature/postgresql-persistence` incorpora persistencia PostgreSQL, consumidor MQTT independiente y aforo por sesión. La instalación **no requiere Proxmox**: puede ejecutarse con Node.js 20+ y PostgreSQL en otra computadora. Consulta la **[guía de instalación local y systemd](deploy/README.md)**, las [migraciones de base de datos](db/README.md) y la [guía de inicialización, respaldo y restauración PostgreSQL](db/RESTORE.md).

En el laboratorio se verificaron 2.000 eventos sintéticos importados y varios eventos de sesiones Wokwi independientes. El consumidor MQTT sigue ejecutándose aunque el panel no esté abierto. Los servicios `deploy/systemd/` son plantillas para instalaciones nuevas; no sustituyen automáticamente los servicios del contenedor existente.
