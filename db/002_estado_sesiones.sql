BEGIN;
-- Cada ejecucion de Wokwi tiene su propio aforo. La tabla de eventos permanece compartida.
CREATE TABLE IF NOT EXISTS estado_aforo_sesiones (
 dispositivo_id bigint NOT NULL REFERENCES dispositivos(id),
 session_id text NOT NULL,
 ocupacion integer NOT NULL CHECK (ocupacion >= 0),
 capacidad integer NOT NULL CHECK (capacidad > 0 AND ocupacion <= capacidad),
 ultimo_evento_id bigint REFERENCES eventos_iot(id),
 ultima_secuencia bigint NOT NULL CHECK (ultima_secuencia > 0),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(dispositivo_id,session_id)
);
-- Reconstruye el ultimo estado de cada sesion, incluyendo las ya importadas.
INSERT INTO estado_aforo_sesiones(dispositivo_id,session_id,ocupacion,capacidad,ultimo_evento_id,ultima_secuencia)
SELECT DISTINCT ON (dispositivo_id,session_id)
 dispositivo_id,session_id,occupancy,capacity,id,sequence
FROM eventos_iot
ORDER BY dispositivo_id,session_id,sequence DESC,id DESC
ON CONFLICT(dispositivo_id,session_id) DO UPDATE SET
 ocupacion=EXCLUDED.ocupacion, capacidad=EXCLUDED.capacidad,
 ultimo_evento_id=EXCLUDED.ultimo_evento_id, ultima_secuencia=EXCLUDED.ultima_secuencia,
 actualizado_en=now()
WHERE estado_aforo_sesiones.ultima_secuencia < EXCLUDED.ultima_secuencia;
COMMIT;
