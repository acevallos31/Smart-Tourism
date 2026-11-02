#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Smart-Tourism | Equipo 2 | Simulacion de acceso bidireccional
// Capacidad hipotetica para facilitar las pruebas: 10 personas.
constexpr int SENSOR_A = 18;
constexpr int SENSOR_B = 19;
constexpr int LED_VERDE = 25;
constexpr int LED_AMARILLO = 26;
constexpr int LED_ROJO = 27;
constexpr int CAPACIDAD = 10;
constexpr unsigned long TIEMPO_PASO_MS = 4000;
constexpr unsigned long ANTIRREBOTE_MS = 60;

LiquidCrystal_I2C lcd(0x27, 16, 2);
int ocupacion = 0;
unsigned long secuencia = 0;
unsigned long inicioPaso = 0;
unsigned long ultimoCambioA = 0, ultimoCambioB = 0;
bool estadoA = HIGH, estadoB = HIGH;
bool lecturaAnteriorA = HIGH, lecturaAnteriorB = HIGH;

enum Paso { ESPERANDO, PRIMERO_A, PRIMERO_B, ESPERAR_LIBERACION };
Paso paso = ESPERANDO;

const char* alertaActual() {
  if (ocupacion >= CAPACIDAD) return "CAPACIDAD_MAXIMA";
  if (ocupacion * 100 >= CAPACIDAD * 80) return "ADVERTENCIA_80";
  return "NINGUNA";
}

void mostrarAforo() {
  bool lleno = ocupacion >= CAPACIDAD;
  bool advertencia = ocupacion * 100 >= CAPACIDAD * 80;
  digitalWrite(LED_VERDE, !advertencia);
  digitalWrite(LED_AMARILLO, advertencia && !lleno);
  digitalWrite(LED_ROJO, lleno);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SmartAforo IoT");
  lcd.setCursor(0, 1);
  lcd.print("Aforo: ");
  lcd.print(ocupacion);
  lcd.print("/");
  lcd.print(CAPACIDAD);
}

void registrar(const char* direccion, const char* validacion, const char* motivo) {
  ++secuencia;
  Serial.printf("{\"deviceId\":\"ACCESO-01\",\"eventId\":\"ACCESO-01-%06lu\",\"sequence\":%lu,\"timestamp_ms\":%lu,\"direction\":\"%s\",\"validation\":\"%s\",\"reason\":\"%s\",\"occupancy\":%d,\"capacity\":%d,\"alert\":\"%s\"}\n",
                secuencia, secuencia, millis(), direccion, validacion, motivo,
                ocupacion, CAPACIDAD, alertaActual());
}

void completarPaso(bool entrada) {
  if (entrada) {
    if (ocupacion < CAPACIDAD) {
      ++ocupacion;
      registrar("entrada", "ACEPTADO", "A_B");
    } else {
      registrar("entrada", "RECHAZADO", "AFORO_MAXIMO");
    }
  } else {
    if (ocupacion > 0) {
      --ocupacion;
      registrar("salida", "ACEPTADO", "B_A");
    } else {
      registrar("salida", "RECHAZADO", "AFORO_CERO");
    }
  }
  mostrarAforo();
  paso = ESPERAR_LIBERACION;
}

void setup() {
  Serial.begin(115200);
  pinMode(SENSOR_A, INPUT_PULLUP);
  pinMode(SENSOR_B, INPUT_PULLUP);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  mostrarAforo();
  Serial.println("Smart-Tourism: A->B entrada; B->A salida. Pulsar y soltar cada boton.");
}

void loop() {
  unsigned long ahora = millis();
  bool rawA = digitalRead(SENSOR_A);
  bool rawB = digitalRead(SENSOR_B);
  if (rawA != lecturaAnteriorA) ultimoCambioA = ahora;
  if (rawB != lecturaAnteriorB) ultimoCambioB = ahora;
  lecturaAnteriorA = rawA;
  lecturaAnteriorB = rawB;

  bool pulsoA = false, pulsoB = false;
  if (ahora - ultimoCambioA >= ANTIRREBOTE_MS && rawA != estadoA) {
    estadoA = rawA;
    pulsoA = estadoA == LOW;
  }
  if (ahora - ultimoCambioB >= ANTIRREBOTE_MS && rawB != estadoB) {
    estadoB = rawB;
    pulsoB = estadoB == LOW;
  }

  if (paso == ESPERAR_LIBERACION) {
    if (estadoA == HIGH && estadoB == HIGH) paso = ESPERANDO;
  } else if (paso == ESPERANDO) {
    if (pulsoA && pulsoB) {
      registrar("indeterminada", "REVISAR_DATOS", "SIMULTANEOS");
      paso = ESPERAR_LIBERACION;
    } else if (pulsoA) {
      inicioPaso = ahora;
      paso = PRIMERO_A;
    } else if (pulsoB) {
      inicioPaso = ahora;
      paso = PRIMERO_B;
    }
  } else if (ahora - inicioPaso > TIEMPO_PASO_MS) {
    registrar("indeterminada", "REVISAR_DATOS", "PASO_INCOMPLETO");
    paso = ESPERAR_LIBERACION;
  } else if (paso == PRIMERO_A && pulsoB) {
    completarPaso(true);
  } else if (paso == PRIMERO_B && pulsoA) {
    completarPaso(false);
  }
  delay(5);
}
