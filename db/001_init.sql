BEGIN;
CREATE TABLE IF NOT EXISTS sitios (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 codigo text NOT NULL UNIQUE,
 nombre text NOT NULL,
 capacidad integer NOT NULL CHECK (capacidad > 0)
);
INSERT INTO sitios(codigo,nombre,capacidad) VALUES ('TAULABE','Cuevas de Taulabé',10) ON CONFLICT(codigo) DO NOTHING;
CREATE TABLE IF NOT EXISTS dispositivos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 sitio_id bigint NOT NULL REFERENCES sitios(id),
 device_id text NOT NULL UNIQUE,
 creado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dispositivos(sitio_id,device_id)
SELECT id,'ACCESO-01' FROM sitios WHERE codigo='TAULABE'
ON CONFLICT(device_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS eventos_iot (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 dispositivo_id bigint NOT NULL REFERENCES dispositivos(id),
 session_id text NOT NULL,
 event_id text NOT NULL,
 sequence bigint NOT NULL CHECK(sequence > 0),
 fecha_hora timestamp NOT NULL,
 recibido_en timestamptz NOT NULL DEFAULT now(),
 direction text NOT NULL CHECK(direction IN ('entrada','salida','indeterminada')),
 validation text NOT NULL CHECK(validation IN ('ACEPTADO','RECHAZADO','REVISAR_DATOS')),
 reason text NOT NULL,
 occupancy integer NOT NULL CHECK(occupancy >= 0),
 capacity integer NOT NULL CHECK(capacity > 0 AND occupancy <= capacity),
 alert text NOT NULL,
 payload jsonb NOT NULL,
 UNIQUE(dispositivo_id,session_id,event_id),
 UNIQUE(dispositivo_id,session_id,sequence)
);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos_iot(fecha_hora DESC);
CREATE TABLE IF NOT EXISTS estado_aforo (
 dispositivo_id bigint PRIMARY KEY REFERENCES dispositivos(id),
 ocupacion integer NOT NULL CHECK(ocupacion >= 0),
 capacidad integer NOT NULL CHECK(capacidad > 0 AND ocupacion <= capacidad),
 ultimo_evento_id bigint REFERENCES eventos_iot(id),
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alertas (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 evento_id bigint NOT NULL UNIQUE REFERENCES eventos_iot(id),
 tipo text NOT NULL,
 creada_en timestamptz NOT NULL DEFAULT now()
);
COMMIT;
