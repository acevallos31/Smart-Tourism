#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_random.h>
#include <atomic>
#include "config.h"

// Revision de compilacion Wokwi: 2026-11-02-01

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
char sessionId[17];
struct MensajeMQTT { char json[768]; };
QueueHandle_t colaEventos = nullptr;
std::atomic<int> ocupacionPublicada{0};
std::atomic<unsigned long> secuenciaPublicada{0};
std::atomic<unsigned long> eventosDescartados{0};

// Las conexiones de red pueden bloquear. Esta tarea mantiene ese trabajo
// fuera del loop de sensores, y una cola conserva hasta 32 eventos pendientes.
void tareaRed(void*) {
  WiFiClient transporte;
  PubSubClient mqtt(transporte);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setSocketTimeout(2);
  mqtt.setKeepAlive(20);
  if (!mqtt.setBufferSize(1024)) {
    Serial.println("MQTT: memoria insuficiente; el conteo local continua.");
    vTaskDelete(nullptr);
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  char clienteId[48];
  snprintf(clienteId, sizeof(clienteId), "smartaforo-%s", sessionId);
  char topicEstado[200];
  snprintf(topicEstado, sizeof(topicEstado), "%s", MQTT_TOPIC);
  char* sufijo = strrchr(topicEstado, '/');
  if (sufijo && strcmp(sufijo, "/events") == 0) strcpy(sufijo, "/status");
  unsigned long ultimoIntento = millis() - 5000;
  unsigned long ultimoLatido = millis() - 10000;
  for (;;) {
    const unsigned long ahora = millis();
    if (WiFi.status() == WL_CONNECTED) {
      if (!mqtt.connected() && ahora - ultimoIntento >= 5000) {
        ultimoIntento = ahora;
        if (mqtt.connect(clienteId)) {
          Serial.println("MQTT conectado: el panel puede recibir eventos.");
          ultimoLatido = millis() - 10000;
        }
      }
      if (mqtt.connected()) {
        mqtt.loop();
        MensajeMQTT pendiente;
        if (xQueuePeek(colaEventos, &pendiente, 0) == pdTRUE &&
            mqtt.publish(MQTT_TOPIC, pendiente.json, false)) {
          xQueueReceive(colaEventos, &pendiente, 0);
        }
        if (millis() - ultimoLatido >= 10000) {
          char estado[320];
          snprintf(estado, sizeof(estado),
                   "{\"type\":\"heartbeat\",\"deviceId\":\"ACCESO-01\",\"sessionId\":\"%s\",\"occupancy\":%d,\"capacity\":%d,\"sequence\":%lu,\"dropped\":%lu}",
                   sessionId, ocupacionPublicada.load(), CAPACIDAD,
                   secuenciaPublicada.load(), eventosDescartados.load());
          mqtt.publish(topicEstado, estado, false);
          ultimoLatido = millis();
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
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
  ocupacionPublicada.store(ocupacion);
  secuenciaPublicada.store(secuencia);
  MensajeMQTT mensaje;
  int longitud = snprintf(mensaje.json, sizeof(mensaje.json),
                "{\"deviceId\":\"ACCESO-01\",\"eventId\":\"ACCESO-01-%s-%06lu\",\"sessionId\":\"%s\",\"sequence\":%lu,\"timestamp_ms\":%lu,\"direction\":\"%s\",\"validation\":\"%s\",\"reason\":\"%s\",\"occupancy\":%d,\"capacity\":%d,\"alert\":\"%s\"}",
                sessionId, secuencia, sessionId, secuencia, millis(), direccion,
                validacion, motivo, ocupacion, CAPACIDAD, alertaActual());
  if (longitud < 0 || longitud >= static_cast<int>(sizeof(mensaje.json))) {
    eventosDescartados.fetch_add(1);
    Serial.println("Evento demasiado largo; el conteo local se conserva.");
    return;
  }
  Serial.println(mensaje.json);
  if (MQTT_HABILITADO && colaEventos && xQueueSend(colaEventos, &mensaje, 0) != pdTRUE) {
    eventosDescartados.fetch_add(1);
    Serial.println("Cola MQTT llena; consulta este evento en el monitor serial.");
  }
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
  snprintf(sessionId, sizeof(sessionId), "%08lx%08lx",
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
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
  if (MQTT_HABILITADO) {
    colaEventos = xQueueCreate(32, sizeof(MensajeMQTT));
    if (!colaEventos || xTaskCreatePinnedToCore(tareaRed, "red-mqtt", 6144, nullptr, 1, nullptr, 0) != pdPASS) {
      Serial.println("No se pudo iniciar MQTT; el conteo local continua.");
    }
  }
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
