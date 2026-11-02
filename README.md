# Smart-Tourism | SmartAforo IoT

Prototipo académico del **Equipo 2** para la asignatura **Tecnologías Emergentes**. Simula el control de aforo de visitantes en las Cuevas de Taulabé, Honduras, mediante un ESP32 en Wokwi.

## Prototipo en Wokwi

**[Abrir simulación de Smart-Tourism](https://wokwi.com/projects/479603902395583489)**

## Funcionamiento actual

- Pulsador **ENT-01**: registra una entrada.
- Pulsador **SAL-01**: registra una salida.
- Pantalla LCD: muestra la ocupación.
- LEDs: verde (normal), amarillo (80 %) y rojo (100 %).
- Monitor serial: muestra eventos en formato JSON.

La capacidad de **100 personas** es un valor de ejemplo, no un dato oficial del lugar.

## Archivos

Los archivos del circuito están en [`wokwi/`](wokwi/): `diagram.json`, `sketch.ino` y `libraries.txt`.

> Próxima mejora: dos barreras infrarrojas A/B para detectar automáticamente la dirección de paso en un único acceso bidireccional.
