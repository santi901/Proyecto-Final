-- Sprint 3/4: tablas que usan el chat, la evidencia, las notificaciones y las
-- calificaciones ahora que todo vive en backend/ (antes notificaciones,
-- calificaciones y evidencia estaban en el backend NestJS).
--
-- Todo es IF NOT EXISTS: si alguna tabla/columna ya se había creado a mano en
-- Supabase, esto no la toca. Correr a mano desde el SQL editor del dashboard,
-- DESPUÉS de 001_trabajos_sprint3_sprint4.sql.

-- Tiempo límite de la solicitud + duración del trabajo
ALTER TABLE trabajos
  ADD COLUMN IF NOT EXISTS solicitud_expira_en timestamptz,
  ADD COLUMN IF NOT EXISTS iniciado_en timestamptz,
  ADD COLUMN IF NOT EXISTS finalizado_en timestamptz;

-- Chat por trabajo (solo se puede escribir mientras estado = 'en_progreso')
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id     uuid NOT NULL,
  remitente_id   uuid NOT NULL,
  remitente_tipo text NOT NULL,
  mensaje        text NOT NULL,
  enviado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_chat_trabajo_idx ON mensajes_chat (trabajo_id, enviado_en);

-- Fotos de evidencia al terminar el trabajo (la imagen vive en S3, acá solo la key)
CREATE TABLE IF NOT EXISTS evidencias_trabajo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL,
  s3_key     text NOT NULL,
  subido_por uuid NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidencias_trabajo_trabajo_idx ON evidencias_trabajo (trabajo_id);

-- Historial de notificaciones (se registra siempre, aunque el push falle)
CREATE TABLE IF NOT EXISTS notificaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL,
  tipo            text NOT NULL,
  trabajo_id      uuid,
  titulo          text,
  mensaje         text NOT NULL,
  estado_envio    text NOT NULL DEFAULT 'pendiente',
  enviado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_destinatario_idx ON notificaciones (destinatario_id, enviado_en DESC);

-- Un Expo push token por usuario
CREATE TABLE IF NOT EXISTS push_tokens (
  usuario_id      uuid PRIMARY KEY,
  expo_push_token text NOT NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Calificaciones (una por trabajo) + reputación desnormalizada en empleados
CREATE TABLE IF NOT EXISTS calificaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id     uuid NOT NULL UNIQUE,
  calificador_id uuid NOT NULL,
  calificado_id  uuid NOT NULL,
  puntaje        integer NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  comentario     text,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS reputacion numeric(3,2);
