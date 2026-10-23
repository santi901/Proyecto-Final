# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This `backend/` folder is one part of the `Proyecto-Final` monorepo (ChanguitApp). It is a **separate Node/Express API** from the NestJS project at the monorepo root (`../src`, `../prisma`) — unrelated codebases that happen to share a repo. Everything the NestJS project used to do (verificación, ubicación, matching, notificaciones, calificaciones, evidencia) has been ported into `backend/`, which makes **no** HTTP calls to it anymore. There are also two Expo apps at the monorepo root, `AppEmployee/` and `AppEmployer/`. Do not mix dependencies or assumptions between this folder and the rest of the repo; treat `backend/` as its own Node project with its own `package.json` and `node_modules`.

## Commands

Run from this `backend/` directory:

- `npm run dev` — start the API with nodemon (auto-restart on change)
- `npm start` — start the API with plain `node server.js`

There is no build step (plain CommonJS, no TypeScript/transpilation), no test suite, and no lint config in this folder.

The server reads config from a `.env` file (not committed) with these keys: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`, and optionally `REDIS_URL` (defaults to `redis://127.0.0.1:6379`; if Redis isn't reachable the app logs one warning and keeps running — see "Redis" below). Payments add `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_API_URL`, `APP_RETORNO_URL`, `ADMIN_API_KEY`; deployment hardening adds `TRUST_PROXY`, `FORZAR_HTTPS`, `CORS_ORIGINS`. `.env.example` documents each one, including how to get MercadoPago test credentials.

Schema changes live as plain SQL files in `backend/migrations/`, run by hand against the Supabase project (no migration tooling/CLI wired up) — `001_trabajos_sprint3_sprint4.sql` adds the columns the cancel/reassignment/dual-confirmation flow below needs; `002_chat_evidencia_notificaciones_calificaciones.sql` creates (IF NOT EXISTS) `mensajes_chat`, `evidencias_trabajo`, `notificaciones`, `push_tokens`, `calificaciones` and the timing columns on `trabajos`; `003_pagos.sql` creates `pagos`/`liquidaciones` and the pricing/payout columns on `trabajos`/`empleados`. Run them in order.

## Architecture

Plain layered Express app, no ORM: `server.js` mounts routers → routers apply middleware and dispatch to controllers → controllers call the Supabase JS client directly (`src/config/supabase.js`, using the service-role key, so RLS is bypassed at this layer). There is no models/repository layer — query logic lives inline in each controller.

```
server.js                             Express app entrypoint; wraps app in http.Server, mounts routers under /api/*,
                                       wires up socket.io and the reassignment poller
src/routes/*.js                       one router per resource, wires middleware + controller fns
src/controllers/*.js                  request handling + all Supabase queries for that resource
src/services/matchingService.js       worker matching by category/radius/availability/reputation (ported from
                                       the NestJS project's src/matching)
src/services/notificacionesService.js logs every notification to `notificaciones`, then sends an Expo push
                                       (plain HTTP to exp.host) to the token in `push_tokens`; notificarNuevoTrabajo
                                       pushes a new-offer notification to every matching candidate
src/services/preciosService.js        server-side pricing (category × difficulty × demand × time of day), tiered
                                       commission, and the signed quote token (JWT, audience 'cotizacion', 10 min)
src/services/mercadoPagoService.js    thin REST client for MP (Checkout Pro preference, payment lookup/search,
                                       refunds, webhook signature check) — plain fetch, no SDK
src/services/pagosService.js          payment domain: approve → publish job, hold, release (liquidación), refund
src/controllers/pagosController.js    MP webhook, post-checkout return page, worker/admin liquidaciones
src/validacion/esquemas.js            zod schemas for every request body/query (Spanish error messages)
src/middleware/validar.js             validar(schema[, 'query']) + validarIdParam (router.param uuid check)
src/middleware/seguridad.js           helmet, HTTPS enforcement / trust proxy, per-route rate limiters
src/middleware/admin.js               soloAdmin: shared-secret header x-admin-key (there is no admin user type)
src/services/ubicacionCacheService.js ephemeral worker-location cache (Redis, best-effort)
src/services/reputacionService.js     worker reputation: simple average + weighted score (Sprint 5)
src/realtime/socket.js                socket.io setup: JWT auth, per-trabajo rooms, emitirUbicacion/emitirFinTrabajo
src/jobs/reasignarTrabajos.js         in-process poller (5 min): expires unpaid trabajos, retries/auto-cancels
                                       'pendiente' ones nobody accepted (with full refund), retries failed refunds
src/middleware/auth.js                autenticar (JWT check), soloEmpleado / soloEmpleador (role gates)
src/middleware/errorHandler.js        catch-all error handler (last app.use in server.js)
src/utils/jwt.js                      access/refresh token sign+verify (separate secrets/expiries)
src/utils/pin.js                      6-digit job-start PIN generation + bcrypt hash/compare
src/utils/participantes.js            esParticipanteTrabajo — shared by the chat and by the socket room-join check
src/utils/storage.js                  S3 upload (returns the key) + 1h presigned GET URL (bucket is private)
src/utils/haversine.js                great-circle distance in km between two lat/lng points
src/config/redis.js                   ioredis client, lazy-connects, degrades silently if unreachable
migrations/*.sql                      schema changes, run by hand against Supabase
```

### Two user types, two profile tables

There are exactly two `tipo_usuario` values, and — confusingly — their profile tables/routes don't share a naming pattern:

- **`empleado`** (worker): profile table `empleados`, routes in `src/routes/empleados.js` (`GET/PUT /api/empleados/perfil`), controller `empleadosController.js`, gated by `soloEmpleado`.
- **`empleador`** (employer): profile table `perfiles`, routes in `src/routes/perfiles.js` (`GET/PUT /api/perfiles/perfil`), controller `perfilesController.js`, gated by `soloEmpleador`.

Both profile tables key off `usuarios.id` via a `user_id` column. Registration (`authController.registrarEmpleado` / `registrarEmpleador`) inserts into `usuarios` first, then the matching profile table, and rolls back the `usuarios` row if the profile insert fails (no DB transaction — this is manual two-step compensation).

### Auth

JWT access tokens (short-lived, `JWT_EXPIRES_IN`) carry `{ id, email, tipo }` and are verified per-request by `autenticar`, which sets `req.usuario`. Refresh tokens (long-lived, `JWT_REFRESH_EXPIRES_IN`) are additionally persisted in the `refresh_tokens` Supabase table and checked against that table (not just signature) on `POST /api/auth/refresh`, so they can be revoked server-side via `logout`.

### Trabajos (jobs) lifecycle

State machine driven by the `estado` column on `trabajos`: `pago_pendiente` (just created, waiting for the MercadoPago payment — not listed to workers, nobody notified; see "Pagos" below) → `pendiente` → (`empleador` creates, gets a one-time 6-digit PIN back in the response — the PIN itself is never stored or re-queryable, only its bcrypt hash + a 24h expiry) → `asignado` (an `empleado` accepts) → `en_progreso` (the assigned `empleado` presents the PIN in person and the `empleador`/dispatcher enters it via `POST /:id/validar-pin`) → `completado`. Every transition re-checks the current `estado` server-side before applying the next one.

`pendiente` also has a `solicitud_expira_en` window (15 min from creation). `src/jobs/reasignarTrabajos.js` polls every 5 min for `pendiente` trabajos past that window: it extends the window and re-runs `notificarNuevoTrabajo` up to `MAX_REINTENTOS` (3) times, then auto-cancels (`estado='cancelado'`, `cancelado_por='sistema'`) if nobody ever accepted.

`completado` requires both parties to confirm: `POST /:id/completar` (same endpoint both apps already call) sets `confirmado_empleado_en`/`confirmado_empleador_en` for whichever side calls it, and only flips `estado` to `completado` once both timestamps are set — a caller who already confirmed gets an idempotent "esperando confirmación" response instead of double-processing.

`cancelado` is reachable via `POST /:id/cancelar` — by the empleador-owner from `pago_pendiente`/`pendiente`/`asignado`, or by the assigned empleado from `asignado` only (counts against their reputation, and the empleador always gets a 100% refund) — or automatically by the poller above. `cancelado_por` records who (`empleador`/`empleado`/`sistema`). It's a terminal state like `completado` — not reachable once `en_progreso`. Cancelling also refunds — see "Pagos".

Transitions that can race each other (accept vs. cancel, poller vs. accept, webhook vs. polling sync) are conditional updates — `.eq('estado', <expected>)` plus `.select()`, then check that a row came back — rather than read-then-write, so the loser gets a 409 instead of overwriting.

`GET /api/trabajos/historial` (both roles; must stay mounted before `/:id`) returns the caller's trabajos — taken (empleado) or published (empleador) — with `estado`, `fecha` (finalizado/cancelado/creado), `duracionSegundos`, `ganancia` (if `completado`: `monto_trabajador` for an empleado, `precio` for an empleador; else 0) and the job's `calificacion`, plus a `resumen` (counts, `gananciaTotal`, `gananciaMes`, total time). It's all derived from existing `trabajos`/`calificaciones` columns — no extra table.

`GET /:id/candidatos` (empleador-owner only) exposes `matchingService.buscarTrabajadoresDisponibles` directly, for visibility into who currently matches a job without waiting for the notification cycle.

### Pagos (MercadoPago, custodial model)

**Simulated mode (the default for the demo):** when `MP_ACCESS_TOKEN` is unset or `PAGOS_SIMULADOS=true`, `mercadoPagoService.pagosSimulados()` is true and MP is never called. `crearPreferencia` returns no checkout URL, refunds return a fake refund object, and the payment is approved by `POST /api/trabajos/:id/pago/simular` (`pagosService.simularPagoAprobado`, which feeds a fake "approved" payment into the same `procesarPagoMp`). AppEmployer then shows its own Mercado Pago–styled `app/checkout.tsx` (no card inputs) instead of opening the browser. Everything below — holding, commission, liquidaciones, refund percentages — behaves the same in both modes.

Money flow: the employer pays the platform's MP account up front → the money is **held** there → on completion it's owed to the worker (minus commission) as a `liquidaciones` row; on cancellation it's refunded through the MP API. MP has no public API for transferring to a third party's CBU/alias, so worker payouts are manual: an admin lists pending `liquidaciones` (`GET /api/pagos/admin/liquidaciones`), transfers to the snapshotted `alias_cobro`, then calls `POST /api/pagos/admin/liquidaciones/:id/pagar { referencia }`. Workers see theirs at `GET /api/pagos/mis-liquidaciones`. Schema: `migrations/003_pagos.sql` (`pagos`, `liquidaciones`, new columns on `trabajos`/`empleados`).

1. **Quote** — `POST /api/trabajos/cotizar { categoria, nivelDificultad, latitud, longitud }`. Price is computed only here (`preciosService.calcularPrecio`; tariffs are constants at the top of that file) — the client never sends a price. Returns `cotizacionToken`, a JWT signed with `JWT_SECRET` but audience `'cotizacion'` (so an access token can't be passed as a quote or vice versa) carrying price, commission, category, difficulty and coordinates, plus `validaHasta`.
2. **Create** — `POST /api/trabajos { titulo, descripcion, cotizacionToken }`. Category/difficulty/location/price come from the verified token, not the body. Inserts the trabajo as `pago_pendiente` with `solicitud_expira_en` = payment deadline (30 min), creates the Checkout Pro preference (`binary_mode`, cash/ATM methods excluded, `external_reference` = trabajo id) and a `pagos` row; if MP fails, the trabajo is deleted (manual rollback). The response includes `pago.checkoutUrl`.
3. **Approval** — `pagosService.procesarPagoMp` runs from the webhook (`POST /api/pagos/webhook`; `x-signature` HMAC checked when `MP_WEBHOOK_SECRET` is set; always re-fetches the payment from MP instead of trusting the body) **or** from `GET /api/trabajos/:id/pago`, which searches MP by `external_reference` while the payment is still pending — the second path is what makes local dev work, since MP can't reach localhost. It checks amount and currency, moves `pagos` to `aprobado` and the trabajo to `pendiente` (fresh 15-min window), then notifies candidates. If the trabajo was cancelled meanwhile, it refunds 100% instead.
4. **Release** — when `completarTrabajo` closes the job, `liberarPago` sets `pagos.estado='liberado'` and creates the `trabajo_completado` liquidación for `trabajos.monto_trabajador`.
5. **Refunds** — `cancelarTrabajo` is the refund endpoint: `pago_pendiente` → nothing was charged; `pendiente` → 100%; `asignado` → 100% within `VENTANA_CANCELACION_GRATIS_SEG` (90 s) of `asignado_en`, otherwise 80%, and the retained 20% becomes a `compensacion_cancelacion` liquidación for the worker. Poller auto-cancellations always refund 100%. A failed MP refund leaves `pagos.estado='reembolso_fallido'` and the poller retries it; the MP idempotency key (`reembolso-<trabajoId>-<porcentaje>`) prevents double refunds.

Commission is tiered on the final price (15% up to $5.000, 12% up to $10.000, 10% above) and stored per trabajo (`comision_porcentaje`, `comision_monto`, `monto_trabajador`), so later tariff changes don't alter existing jobs. All amounts are whole pesos. MP's own processing fee comes out of the platform's commission.

### Seguridad

- **Input validation**: every route with a body or query goes through `validar(esquemas.x)`. Schemas for routes that predate sprint 5 use `z.looseObject` (unknown keys pass through, so older app builds keep working); new ones use `z.object` (unknown keys stripped). `router.param('id', validarIdParam)` rejects non-uuid ids with 400 before they reach Supabase.
- **Rate limiting** (`limites` in `seguridad.js`, in-memory, per IP): a global ceiling plus tight limits on login (failed attempts only), registration, `comparar-caras` (every call costs AWS money), PIN validation (brute force), quoting and job creation. The MP webhook is exempt from the global limit. Running several instances would need a shared store.
- **HTTPS**: TLS is expected to be terminated by the host/proxy. `TRUST_PROXY=1` + `FORZAR_HTTPS=true` makes Express reject non-HTTPS requests with 403 (no redirect, because a redirected POST loses its body); helmet adds HSTS and the standard headers. Both unset locally.
- `actualizar-ubicacion` only accepts `workerId === req.usuario.id`; `comparar-caras` uploads are capped at 5 MB per image and restricted to image MIME types.

### Identity verification (`verificacionController.js`)

`POST /api/verificacion/comparar-caras` takes two images, `dni` and `selfie`, either as JSON base64 strings (what both apps send, via `lib/verificacion.ts`) or as multipart files (legacy). `routes/verificacion.js` normalizes both into `req.files` and checks each one is non-empty, ≤ 5 MB, and actually JPEG/PNG by magic bytes (Rekognition's limits). That route has its own 15 MB `express.json`; `server.js` skips the global 100 kb parser for `/api/verificacion/`. The apps used to append `expo-file-system` `File` objects to a `FormData`; depending on which fetch implementation serialized it, both parts arrived with identical bytes and tripped the "same photo" check. That's why the apps now read each file to base64 themselves. The endpoint then runs Rekognition `CompareFacesCommand` between them, with a match declared only above 90% similarity (note this is stricter than the 80% `SimilarityThreshold` passed to the AWS call itself, which just controls what AWS returns at all). Both images are uploaded to S3 via `storage.guardarImagen` regardless of match outcome.

There used to also be a Textract `DetectDocumentTextCommand` check on the DNI photo (keyword allowlist to reject non-ID images) before the face comparison — it was removed because Textract requires an AWS account off the Free Plan tier (`SubscriptionRequiredException` on Free Plan accounts), while Rekognition works without upgrading. So this endpoint no longer validates that the `dni` image is actually a DNI — it only checks that the two uploaded photos show the same face.

### Ubicación / distance-cost estimation

`ubicacionController.js` geocodes free-text addresses via the public Nominatim (OpenStreetMap) API — no API key, but requires a `User-Agent` header — then uses `haversine.calcularDistanciaKm` plus fixed constants (`PRECIO_NAFTA_ARS`, `RENDIMIENTO_KM_POR_LITRO`) to estimate fuel cost in ARS. `actualizarUbicacion` additionally upserts live coordinates into `worker_locations` (unchanged, persistent) **and** writes an ephemeral copy to Redis via `ubicacionCacheService` (`ubicacion:trabajador:{workerId}`, 120s TTL — matches the app's 10s ping interval with margin); if a `jobId` is given, it returns remaining distance/cost to that job's stored `lat`/`lng` **and**, when the job is `asignado`/`en_progreso`, emits the new coordinates over the `trabajo:{jobId}` WebSocket room via `emitirUbicacion`. `GET /api/ubicacion/:workerId` reads the Redis cache back — a fallback for clients not connected over WebSocket.

### Matching (`src/services/matchingService.js`)

Ported from the NestJS project's `src/matching/matching.service.ts` (same algorithm, same `haversine` formula): finds `empleados` whose `categorias` include the job's `categoria`, within each candidate's own `radio_busqueda` (or an overridden `radioKm`) of the job's own `latitud`/`longitud` (set from the employer's location when the job is published), excluding workers currently tied to a job in `asignado`/`en_progreso`, sorted by the weighted reputation `score` desc (see Reputación below) then distance asc. Used by `notificarNuevoTrabajo` (on creation and on every reassignment retry) and by `GET /api/trabajos/:id/candidatos`.

### Realtime (`src/realtime/socket.js`)

`socket.io` (already a dependency, previously unused) is attached to the same `http.Server` as Express in `server.js`. Connections authenticate with the same JWT access token as the REST API (`socket.handshake.auth.token`, verified with `verificarAccessToken`). Clients join a per-trabajo room by emitting `unirse-trabajo { trabajoId }`, gated by `esParticipanteTrabajo` (the empleado/empleador must actually be part of that trabajo — same check the chat uses). `ubicacionController.actualizarUbicacion` emits `ubicacion-trabajador` into that room while the job is active; `completarTrabajo` (once both parties confirmed) and `cancelarTrabajo` emit `trabajo-finalizado` and force everyone out of the room (`io.socketsLeave`), which is what stops further location updates from reaching clients once a job ends.

### Chat, evidencia, calificación, notificaciones

- **Chat** (`mensajesController.js`): `POST/GET /api/trabajos/:id/mensajes`, participants only (`esParticipanteTrabajo`). Sending is allowed from the moment someone accepts (`asignado`) through `en_progreso`; listing keeps working afterwards as history.
- **Evidencia** (`evidenciaController.js`): `POST /api/trabajos/:id/evidencia` (multipart field `foto`, 10MB max, assigned `empleado` only, job `en_progreso`/`completado`) uploads to S3 under `{trabajoId}/evidencia-*.jpg` and inserts into `evidencias_trabajo`; `GET` (either participant) returns each row with a presigned `url`. Uploading notifies the empleador.
- **Calificación** (`calificarTrabajo`): `POST /api/trabajos/:id/calificar` (empleador-owner, job `completado`, once per job — 409 otherwise; `puntaje` integer 1-5, optional `comentario` up to 500 chars) inserts into `calificaciones` and stores the simple average in `empleados.reputacion`. `GET /:id/calificacion` returns it or `null`.
- **Reputación** (`services/reputacionService.js`, Sprint 5): `promedio` is the plain star average; `score` (what matching sorts by) is computed on the fly — never stored — as a Bayesian average (2 phantom ratings of 3★, so few ratings stay near 3) where each rating weighs `0.5^(age/180 days)`, multiplied by `1 − 0.5 × tasaCancelacion` (worker's own cancellations / (completados + those cancellations); employer/system cancellations don't count). Exposed in `GET /api/empleados/perfil` (`reputacion` next to `perfil`), `GET /api/empleados/:id/reputacion`, the empleador's view of `GET /api/trabajos/:id` (`trabajo.trabajador.reputacion`) and in `/:id/candidatos`.
- **Notificaciones** (`routes/notificaciones.js`): `POST /api/notificaciones/registrar-token` (apps call it on entering the tabs, via `expo-notifications`) upserts into `push_tokens`; `GET /api/notificaciones` lists the caller's history. `notificar()` never throws — a row is always written (`pendiente` → `enviado`/`fallido`) even if there's no token or Expo rejects the push.

### Redis (`src/config/redis.js`)

`ioredis`, `lazyConnect: true`, reads `REDIS_URL` (default `redis://127.0.0.1:6379`). Every call site (`ubicacionCacheService`) wraps Redis calls in try/catch and only logs — if Redis isn't running, the app still starts and every other feature keeps working, just without the ephemeral location cache/`GET /api/ubicacion/:workerId` fallback.

## Conventions

- Spanish is used throughout for identifiers, JSON field names, and user-facing error messages — match this when adding routes/fields rather than switching to English.
- Request bodies use camelCase (`fechaNacimiento`, `codigoPostal`); Supabase columns use snake_case (`fecha_nacimiento`, `codigo_postal`). Controllers do this mapping manually field-by-field — there's no automatic (de)serialization layer.
- Controllers generally catch their own errors and return a scoped JSON `{ error }` with an appropriate status code; `errorHandler.js` is only a last-resort fallback for uncaught exceptions.
