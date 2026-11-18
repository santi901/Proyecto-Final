-- Sprint 6: cancelaciones con motivo + penalización, trabajos programados,
-- precio calculado en el backend y disputas.
--
-- Igual que las anteriores: correr a mano desde el SQL editor de Supabase,
-- DESPUÉS de 001 y 002. Todo es idempotente (IF NOT EXISTS / ON CONFLICT), se
-- puede volver a correr sin romper nada.

-- ─── trabajos: columnas nuevas ───────────────────────────────────────────────
ALTER TABLE trabajos
  -- Cuándo lo aceptó el trabajador: sirve para saber si una cancelación fue
  -- "en caliente" (al toque de aceptar, pesa menos) o no.
  ADD COLUMN IF NOT EXISTS asignado_en timestamptz,
  -- Trabajos programados: fecha/hora en que se tiene que hacer el trabajo.
  -- NULL = trabajo inmediato (lo de siempre).
  ADD COLUMN IF NOT EXISTS fecha_programada timestamptz,
  -- Cuándo el poller lo pasó de 'programado' a 'pendiente'.
  ADD COLUMN IF NOT EXISTS activado_en timestamptz,
  -- Código del motivo de cancelación (ver MOTIVOS_CANCELACION en el backend).
  -- motivo_cancelacion (text, de la migración 001) queda con el texto legible.
  ADD COLUMN IF NOT EXISTS motivo_cancelacion_codigo text;

-- El poller de programados busca por (estado, fecha_programada) cada minuto.
CREATE INDEX IF NOT EXISTS trabajos_programados_idx
  ON trabajos (fecha_programada) WHERE estado = 'programado';

-- Estado nuevo 'programado'. Si "estado" tiene un CHECK con la lista de valores,
-- se reemplaza por uno que lo incluya. Se busca el constraint por su definición
-- (no por nombre, que no lo sabemos) para que funcione igual tenga el nombre que tenga.
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

ALTER TABLE trabajos ADD CONSTRAINT trabajos_estado_check
  CHECK (estado IN ('programado','pendiente','asignado','en_progreso','completado','cancelado'));

-- ─── cancelaciones: una fila por cada cancelación hecha por una persona ──────
-- Las automáticas del sistema no generan fila (no hay a quién penalizar).
-- "peso" es cuánto cuenta para el score de quien canceló (0 = no penaliza).
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

-- Backfill: las cancelaciones de antes del Sprint 6 pasan a la tabla con peso 1
-- (lo mismo que contaban hasta ahora), así el score no cambia de golpe.
INSERT INTO cancelaciones (trabajo_id, cancelado_por, usuario_id, perfil_id, estado_previo, motivo_codigo, detalle, peso, creado_en)
SELECT t.id, 'empleado', e.user_id, e.id, 'asignado', 'otro', t.motivo_cancelacion, 1, COALESCE(t.cancelado_en, now())
FROM trabajos t JOIN empleados e ON e.id = t.trabajador_id
WHERE t.estado = 'cancelado' AND t.cancelado_por = 'empleado'
ON CONFLICT (trabajo_id) DO NOTHING;

INSERT INTO cancelaciones (trabajo_id, cancelado_por, usuario_id, perfil_id, estado_previo, motivo_codigo, detalle, peso, creado_en)
SELECT t.id, 'empleador', p.user_id, p.id,
       CASE WHEN t.trabajador_id IS NULL THEN 'pendiente' ELSE 'asignado' END,
       'otro', t.motivo_cancelacion,
       CASE WHEN t.trabajador_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(t.cancelado_en, now())
FROM trabajos t JOIN perfiles p ON p.id = t.empleador_id
WHERE t.estado = 'cancelado' AND t.cancelado_por = 'empleador'
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
