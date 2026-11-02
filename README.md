# Smart-Tourism | SmartAforo IoT

Prototipo académico del **Equipo 2** para **Tecnologías Emergentes**. Simula el control de aforo en las Cuevas de Taulabé, Honduras, usando un ESP32 en Wokwi.

**[Abrir prototipo en Wokwi](https://wokwi.com/projects/479603902395583489)**

## Funcionamiento

- Dos pulsadores simulan barreras A (exterior) y B (interior).
- **A → B:** entrada; **B → A:** salida.
- Capacidad **hipotética de 10 personas**, utilizada para facilitar las pruebas.
- LED verde: 0–7; amarillo: 8–9; rojo: 10 (aforo completo).
- LCD con ocupación y eventos JSON en el monitor serial.
- Pasos incompletos o simultáneos se registran para revisión.

Los archivos de Wokwi están en `wokwi/`: `sketch.ino`, `diagram.json` y `libraries.txt`.
