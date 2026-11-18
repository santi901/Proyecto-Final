-- Sprint 6 (parte de Nacho): activación de trabajos programados, cancelaciones con
-- motivo y penalización, y disputas.
--
-- Correr a mano en el SQL editor de Supabase. Es idempotente (IF NOT EXISTS /
-- ON CONFLICT): se puede correr más de una vez. El código funciona aunque esto no
-- esté aplicado (igual que las columnas de suspensión, ver "Schema" en
-- backend/CLAUDE.md): sin estas tablas, las cancelaciones cuentan como antes, no hay
-- bloqueo y el endpoint de disputas responde 503.
--
-- Ya existen en la base y NO se tocan acá: trabajos.programado_para, trabajos.asignado_en.

-- ─── trabajos ────────────────────────────────────────────────────────────────
ALTER TABLE trabajos
  -- Código del motivo de cancelación (motivo_cancelacion queda con el texto legible).
  ADD COLUMN IF NOT EXISTS motivo_cancelacion_codigo text,
  -- Cuándo el poller pasó un programado a 'pendiente' (publicado a los trabajadores).
  ADD COLUMN IF NOT EXISTS activado_en timestamptz;

-- El poller de programados busca por (estado, programado_para) cada minuto.
CREATE INDEX IF NOT EXISTS trabajos_programados_idx
  ON trabajos (programado_para) WHERE estado = 'programado';

-- Estado nuevo 'programado' (pago acreditado, esperando su fecha). Si "estado" tiene
-- un CHECK con la lista de valores, se reemplaza por uno con TODOS los estados que usa
-- el backend, incluido 'pago_pendiente' de pagos. Se busca por definición y no por
-- nombre porque el nombre real no lo conocemos.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'trabajos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE trabajos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE trabajos ADD CONSTRAINT trabajos_estado_check CHECK (estado IN (
  'pago_pendiente', 'programado', 'pendiente', 'asignado', 'en_progreso', 'completado', 'cancelado'
));

-- ─── cancelaciones: una fila por cada cancelación hecha por una persona ──────
-- Las automáticas del sistema no generan fila (no hay a quién penalizar).
-- "peso" = cuánto cuenta para el score de quien canceló (0 = no penaliza).
CREATE TABLE IF NOT EXISTS cancelaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id     uuid NOT NULL UNIQUE,          -- un trabajo se cancela una sola vez
  cancelado_por  text NOT NULL CHECK (cancelado_por IN ('empleado','empleador')),
  usuario_id     uuid NOT NULL,                 -- usuarios.id
  perfil_id      uuid NOT NULL,                 -- empleados.id o perfiles.id según cancelado_por
  estado_previo  text NOT NULL,
  motivo_codigo  text NOT NULL,
  detalle        text,
  peso           numeric(3,2) NOT NULL DEFAULT 1,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cancelaciones_perfil_idx ON cancelaciones (cancelado_por, perfil_id, creado_en DESC);

-- Backfill: las cancelaciones anteriores pasan con el peso que contaban hasta ahora
-- (trabajador: 1; empleador: 1 si ya había trabajador, 0 si no), así ningún score
-- cambia de golpe al correr esto.
INSERT INTO cancelaciones (trabajo_id, cancelado_por, usuario_id, perfil_id, estado_previo, motivo_codigo, detalle, peso, creado_en)
SELECT t.id, 'empleado', e.user_id, e.id, 'asignado', 'otro', t.motivo_cancelacion, 1, COALESCE(t.cancelado_en, now())
FROM trabajos t JOIN empleados e ON e.id = t.trabajador_id
WHERE t.estado = 'cancelado' AND t.cancelado_por = 'empleado' AND e.user_id IS NOT NULL
ON CONFLICT (trabajo_id) DO NOTHING;

INSERT INTO cancelaciones (trabajo_id, cancelado_por, usuario_id, perfil_id, estado_previo, motivo_codigo, detalle, peso, creado_en)
SELECT t.id, 'empleador', p.user_id, p.id,
       CASE WHEN t.trabajador_id IS NULL THEN 'pendiente' ELSE 'asignado' END,
       'otro', t.motivo_cancelacion,
       CASE WHEN t.trabajador_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(t.cancelado_en, now())
FROM trabajos t JOIN perfiles p ON p.id = t.empleador_id
WHERE t.estado = 'cancelado' AND t.cancelado_por = 'empleador' AND p.user_id IS NOT NULL
ON CONFLICT (trabajo_id) DO NOTHING;

-- ─── disputas: reportes de problemas, los revisa el admin ────────────────────
CREATE TABLE IF NOT EXISTS disputas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id      uuid NOT NULL,
  reportado_por   uuid NOT NULL,                -- usuarios.id
  rol_reportante  text NOT NULL CHECK (rol_reportante IN ('empleado','empleador')),
  motivo          text NOT NULL,
  descripcion     text NOT NULL,
  foto_s3_key     text,                         -- la imagen vive en S3 (bucket privado)
  estado          text NOT NULL DEFAULT 'abierta'
                  CHECK (estado IN ('abierta','en_revision','resuelta','rechazada')),
  resolucion      text,
  resuelto_en     timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disputas_estado_idx  ON disputas (estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS disputas_trabajo_idx ON disputas (trabajo_id);
