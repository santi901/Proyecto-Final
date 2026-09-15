-- Sprint 3 (estado cancelado, reasignación automática, doble confirmación) +
-- Sprint 4 (nada nuevo a nivel schema, geolocalización va por Redis/WebSocket).
--
-- No hay tooling de migraciones en este repo (no hay ORM ni CLI de Supabase
-- versionado acá) — correr esto a mano contra el proyecto de Supabase, por
-- ejemplo desde el SQL editor del dashboard.

ALTER TABLE trabajos
  ADD COLUMN IF NOT EXISTS intentos_reasignacion integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text,
  ADD COLUMN IF NOT EXISTS cancelado_por text,
  ADD COLUMN IF NOT EXISTS cancelado_en timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_empleado_en timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_empleador_en timestamptz;

-- Si la columna "estado" tiene un CHECK constraint con la lista de valores
-- permitidos, hay que agregar 'cancelado' a mano (no se puede introspectar
-- el nombre real del constraint desde acá, ajustar según corresponda):
--
-- ALTER TABLE trabajos DROP CONSTRAINT trabajos_estado_check;
-- ALTER TABLE trabajos ADD CONSTRAINT trabajos_estado_check
--   CHECK (estado IN ('pendiente','asignado','en_progreso','completado','cancelado'));
