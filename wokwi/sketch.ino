#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Smart-Tourism | SmartAforo IoT | Equipo 2
// Capacidad de 100 personas: valor ficticio para la PoC.
const int PIN_ENTRADA = 18;
const int PIN_SALIDA = 19;
const int LED_VERDE = 25;
const int LED_AMARILLO = 26;
const int LED_ROJO = 27;
const int CAPACIDAD = 100;
LiquidCrystal_I2C lcd(0x27, 16, 2);
int ocupacion = 0;
unsigned long secEntrada = 0, secSalida = 0;
bool anteriorEntrada = HIGH, anteriorSalida = HIGH;
unsigned long ultimaEntrada = 0, ultimaSalida = 0;

void emitir(const char* dispositivo, const char* direccion, unsigned long secuencia,
            const char* resultado, const char* alerta) {
  Serial.printf("{\"deviceId\":\"%s\",\"eventId\":\"%s-%04lu\",\"sequence\":%lu,\"timestamp_ms\":%lu,\"metric\":\"paso\",\"value\":1,\"unit\":\"persona\",\"direction\":\"%s\",\"validation\":\"%s\",\"occupancy\":%d,\"capacity\":%d,\"alert\":\"%s\"}\n",
                dispositivo, dispositivo, secuencia, secuencia, millis(), direccion,
                resultado, ocupacion, CAPACIDAD, alerta);
}
void actualizarPanel() {
  digitalWrite(LED_VERDE, ocupacion < 80);
  digitalWrite(LED_AMARILLO, ocupacion >= 80 && ocupacion < CAPACIDAD);
  digitalWrite(LED_ROJO, ocupacion >= CAPACIDAD);
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("SmartAforo IoT");
  lcd.setCursor(0, 1); lcd.print("Aforo: "); lcd.print(ocupacion); lcd.print("/100");
}
void entrada() {
  ++secEntrada;
  if (ocupacion >= CAPACIDAD) {
    emitir("ENT-01", "entrada", secEntrada, "RECHAZADO", "CAPACIDAD_MAXIMA");
    return;
  }
  ++ocupacion;
  const char* alerta = ocupacion == CAPACIDAD ? "CAPACIDAD_MAXIMA" :
                       ocupacion >= 80 ? "ADVERTENCIA_80" : "NINGUNA";
  emitir("ENT-01", "entrada", secEntrada, "ACEPTADO", alerta);
  actualizarPanel();
}
void salida() {
  ++secSalida;
  if (ocupacion == 0) {
    emitir("SAL-01", "salida", secSalida, "RECHAZADO", "SALIDA_SIN_OCUPACION");
    return;
  }
  --ocupacion;
  emitir("SAL-01", "salida", secSalida, "ACEPTADO", "NINGUNA");
  actualizarPanel();
}
void setup() {
  Serial.begin(115200);
  pinMode(PIN_ENTRADA, INPUT_PULLUP);
  pinMode(PIN_SALIDA, INPUT_PULLUP);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  Wire.begin(21, 22);
  lcd.init(); lcd.backlight();
  actualizarPanel();
  Serial.println("Smart-Tourism iniciado. Pulsador azul: entrada; naranja: salida.");
}
void loop() {
  bool e = digitalRead(PIN_ENTRADA), s = digitalRead(PIN_SALIDA);
  unsigned long ahora = millis();
  if (anteriorEntrada == HIGH && e == LOW && ahora - ultimaEntrada > 150) {
    ultimaEntrada = ahora; entrada();
  }
  if (anteriorSalida == HIGH && s == LOW && ahora - ultimaSalida > 150) {
    ultimaSalida = ahora; salida();
  }
  anteriorEntrada = e;
  anteriorSalida = s;
  delay(10);
}
