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

### Schema

There is no migration tooling and no SQL kept in the repo: schema changes are run by hand in the Supabase SQL editor and the project's database is the source of truth. All of them are already applied there. Old migration files can be found in git history if a fresh DB is ever needed (`git show 0d374c3:backend/migrations/` for Sprint 3/4; the admin/cobro/programados change was applied and deleted without being committed, so for that one use the column list below). The last change added `usuarios.suspendido/suspendido_motivo/suspendido_en/verificado/verificado_en/verificado_nota`, `empleados.titular_cobro/cobro_actualizado_en`, `trabajos.programado_para` and the `webhooks_mp` table.

**Sprint 6 (Nacho) is the exception**: `migrations/sprint6_programados_cancelaciones_disputas.sql` is kept in the repo because it is **not applied yet** — run it once in the SQL editor (it's idempotent). It adds `trabajos.motivo_cancelacion_codigo/activado_en`, replaces any CHECK on `trabajos.estado` with one listing every state the code uses (`pago_pendiente`, `programado`, `pendiente`, `asignado`, `en_progreso`, `completado`, `cancelado`), and creates `cancelaciones` (backfilled from existing cancelled jobs, so no score changes on apply) and `disputas`. Delete the file once it's applied, like the others.

Code that touches those columns is written to survive a DB that doesn't have them: `cuentasService` treats a missing `suspendido` column as "nobody is suspended" (logs once), `webhooksService` skips logging, `crearTrabajo` only sends `programado_para` when one was given, and `PUT /api/empleados/metodo-cobro` falls back to saving just `alias_cobro`. Keep that property when extending these features — `faltaMigracion(error)` in `cuentasService.js` detects the "column/table doesn't exist" error codes (`42703`, `PGRST204`, `42P01`, `PGRST205`). The Sprint 6 code follows the same rule: without its migration, cancellations count as in Sprint 5 and nobody is blocked, the cancel update retries without `motivo_cancelacion_codigo`, a paid scheduled job is published right away if the DB rejects `'programado'` (CHECK violation `23514`) instead of being treated as cancelled/refunded, and `POST /:id/disputas` answers 503.

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
src/controllers/adminController.js    /api/admin/*: summary, users (suspend/verify), jobs, transactions, MP webhooks
public/admin/                         admin panel UI (plain HTML + JS, no build), served at GET /admin
src/services/cuentasService.js        account state (suspension), tolerant of the suspension columns being missing
src/services/webhooksService.js       logs each MP webhook to `webhooks_mp` and processes/reprocesses it
src/controllers/programacionController.js  scheduled jobs API (list, reschedule)
src/utils/cobro.js                    CBU/CVU check-digit validation + alias format (mirrored in AppEmployee/lib/cobro.ts)
src/utils/programacion.js             allowed window for a scheduled job's date + estadoAlPublicar (Sprint 6)
src/jobs/activarProgramados.js        in-process poller (1 min): 'programado' → 'pendiente' 60 min before programado_para
src/services/cancelacionesService.js  cancel reasons per role, penalty weight per cancellation, weekly-limit block (Sprint 6)
src/controllers/disputasController.js disputes: users report (motivo/descripción/foto), admin reviews (Sprint 6)
src/utils/imagenes.js                 JPEG/PNG detection by magic bytes (verificación + disputas)
src/services/ubicacionCacheService.js ephemeral worker-location cache (Redis, best-effort)
src/services/reputacionService.js     worker reputation: simple average + weighted score (Sprint 5); employer score (Sprint 6)
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

`cancelado` is reachable via `POST /:id/cancelar` — by the empleador-owner from `pago_pendiente`/`programado`/`pendiente`/`asignado`, or by the assigned empleado from `asignado` only (counts against their reputation, and the empleador always gets a 100% refund) — or automatically by the poller above. `cancelado_por` records who (`empleador`/`empleado`/`sistema`). It's a terminal state like `completado` — not reachable once `en_progreso`. Cancelling also refunds — see "Pagos" — and requires a reason with a reputation penalty — see "Cancelaciones con motivo y penalización".

### Cancelaciones con motivo y penalización (Sprint 6)

`POST /:id/cancelar` requires `{ motivo, detalle? }`: `motivo` is a code from `MOTIVOS_CANCELACION[rol]` in `cancelacionesService.js` (exposed at `GET /api/trabajos/motivos-cancelacion` for the caller's role); `detalle` (≤300) is mandatory when `motivo` is `otro`. The job keeps the readable text in `motivo_cancelacion` and the code in `motivo_cancelacion_codigo`; notifications to the other party include the text.

Each person-initiated cancellation also inserts a `cancelaciones` row with a **weight**: 0 if nobody had accepted (`pago_pendiente`/`programado`/`pendiente`), 0.5 within `VENTANA_GRACIA_SEG` (90 s — the same window in which the employer gets a 100% refund, `VENTANA_CANCELACION_GRATIS_SEG` now reads it) of `asignado_en`, 1.5 if the job is scheduled less than 2 h ahead, 1 otherwise. Consequences: (1) `reputacionService` sums weights instead of counting cancellations (`tasa = peso / (completados + peso)`, same `× (1 − 0.5 × tasa)` formula), for workers and for employers — employers now have a score, `5 × (1 − 0.5 × tasa)`, returned to workers as `trabajo.empleador.reputacion` in `GET /api/trabajos` and `GET /:id`; (2) ≥3 weight in 7 days blocks accepting (empleado) / creating jobs (empleador) for 24 h from the last cancellation — 403 with `bloqueadoHasta`. The cancel response includes `penalizacion { peso, penaliza, bloqueadoHasta }`. The block check fails open (DB error → not blocked), like account suspension.

Transitions that can race each other (accept vs. cancel, poller vs. accept, webhook vs. polling sync) are conditional updates — `.eq('estado', <expected>)` plus `.select()`, then check that a row came back — rather than read-then-write, so the loser gets a 409 instead of overwriting.

`GET /api/trabajos/historial` (both roles; must stay mounted before `/:id`) returns the caller's trabajos — taken (empleado) or published (empleador) — with `estado`, `fecha` (finalizado/cancelado/creado), `duracionSegundos`, `ganancia` (if `completado`: `monto_trabajador` for an empleado, `precio` for an empleador; else 0) and the job's `calificacion`, plus a `resumen` (counts, `gananciaTotal`, `gananciaMes`, total time). It's all derived from existing `trabajos`/`calificaciones` columns — no extra table.

`GET /:id/candidatos` (empleador-owner only) exposes `matchingService.buscarTrabajadoresDisponibles` directly, for visibility into who currently matches a job without waiting for the notification cycle.

### Pagos (MercadoPago, custodial model)

**Simulated mode (the default for the demo):** when `MP_ACCESS_TOKEN` is unset or `PAGOS_SIMULADOS=true`, `mercadoPagoService.pagosSimulados()` is true and MP is never called. `crearPreferencia` returns no checkout URL, refunds return a fake refund object, and the payment is approved by `POST /api/trabajos/:id/pago/simular` (`pagosService.simularPagoAprobado`, which feeds a fake "approved" payment into the same `procesarPagoMp`). AppEmployer then shows its own Mercado Pago–styled `app/checkout.tsx` (no card inputs) instead of opening the browser. Everything below — holding, commission, liquidaciones, refund percentages — behaves the same in both modes.

Money flow: the employer pays the platform's MP account up front → the money is **held** there → on completion it's owed to the worker (minus commission) as a `liquidaciones` row; on cancellation it's refunded through the MP API. MP has no public API for transferring to a third party's CBU/alias, so worker payouts are manual: an admin lists pending `liquidaciones` (`GET /api/pagos/admin/liquidaciones`), transfers to the snapshotted `alias_cobro`, then calls `POST /api/pagos/admin/liquidaciones/:id/pagar { referencia }`. Workers see theirs at `GET /api/pagos/mis-liquidaciones`. Schema: tables `pagos`, `liquidaciones` plus pricing/payout columns on `trabajos`/`empleados` (already applied to the DB).

1. **Quote** — `POST /api/trabajos/cotizar { categoria, nivelDificultad, latitud, longitud }`. Price is computed only here (`preciosService.calcularPrecio`; tariffs are constants at the top of that file) — the client never sends a price. Returns `cotizacionToken`, a JWT signed with `JWT_SECRET` but audience `'cotizacion'` (so an access token can't be passed as a quote or vice versa) carrying price, commission, category, difficulty and coordinates, plus `validaHasta`.
2. **Create** — `POST /api/trabajos { titulo, descripcion, cotizacionToken }`. Category/difficulty/location/price come from the verified token, not the body. Inserts the trabajo as `pago_pendiente` with `solicitud_expira_en` = payment deadline (30 min), creates the Checkout Pro preference (`binary_mode`, cash/ATM methods excluded, `external_reference` = trabajo id) and a `pagos` row; if MP fails, the trabajo is deleted (manual rollback). The response includes `pago.checkoutUrl`.
3. **Approval** — `pagosService.procesarPagoMp` runs from the webhook (`POST /api/pagos/webhook`; `x-signature` HMAC checked when `MP_WEBHOOK_SECRET` is set; always re-fetches the payment from MP instead of trusting the body) **or** from `GET /api/trabajos/:id/pago`, which searches MP by `external_reference` while the payment is still pending — the second path is what makes local dev work, since MP can't reach localhost. It checks amount and currency, moves `pagos` to `aprobado` and the trabajo to `pendiente` (fresh 15-min window), then notifies candidates. If the trabajo was cancelled meanwhile, it refunds 100% instead.
4. **Release** — when `completarTrabajo` closes the job, `liberarPago` sets `pagos.estado='liberado'` and creates the `trabajo_completado` liquidación for `trabajos.monto_trabajador`.
5. **Refunds** — `cancelarTrabajo` is the refund endpoint: `pago_pendiente` → nothing was charged; `pendiente` → 100%; `asignado` → 100% within `VENTANA_CANCELACION_GRATIS_SEG` (90 s) of `asignado_en`, otherwise 80%, and the retained 20% becomes a `compensacion_cancelacion` liquidación for the worker. Poller auto-cancellations always refund 100%. A failed MP refund leaves `pagos.estado='reembolso_fallido'` and the poller retries it; the MP idempotency key (`reembolso-<trabajoId>-<porcentaje>`) prevents double refunds.

Commission is tiered on the final price (15% up to $5.000, 12% up to $10.000, 10% above) and stored per trabajo (`comision_porcentaje`, `comision_monto`, `monto_trabajador`), so later tariff changes don't alter existing jobs. All amounts are whole pesos. MP's own processing fee comes out of the platform's commission.

**Webhook log**: every `payment` notification is recorded in `webhooks_mp` (`webhooksService.js`) *after* the response is sent, so logging never delays or breaks the webhook: `recibido` → `procesado`/`error`, or `rechazado` for a bad signature. `POST /api/admin/webhooks/:id/reprocesar` re-fetches the payment from MP and runs `procesarPagoMp` again (safe, it's idempotent). If MP reports a payment we hold (`aprobado`/`liberado`) as `refunded`/`charged_back` (chargeback or a refund made from MP's own dashboard), `procesarPagoMp` only logs it and sets `pagos.ultimo_error` — it deliberately doesn't change state, since a liquidación may already exist.

**Payment history** — `GET /api/pagos/historial` (both roles). Employer: each charged payment (states in `ESTADOS_COBRADOS`) with `monto`, `comision { porcentaje, monto }` (included in the price), `montoReembolsado`, `montoNeto`, plus a `resumen`. Worker: each liquidación with `montoBruto` (job price), `comision`, `montoNeto` (what's transferred), `estado`; compensations for cancellation carry no commission. `GET /mis-liquidaciones` still exists for older app builds.

**Payout method** — `GET/PUT /api/empleados/metodo-cobro { valor, titular? }`. `valor` is validated by `utils/cobro.js` (CBU/CVU: 22 digits with both check digits; `000…` = CVU; alias: 6-20 chars, all-digit aliases rejected as a half-copied CBU). The value stays in `empleados.alias_cobro`, which is what liquidaciones snapshot; the type is always derived from the value (not stored), since `PUT /perfil { aliasCobro }` can still change it. Saving a new alias (either endpoint) also rewrites `alias_cobro` on the worker's **pending** liquidaciones, so the admin transfers to the current account; paid ones are left alone.

### Trabajos programados

The date is quoted: `POST /api/trabajos/cotizar` accepts an optional `programadoPara` (ISO date-time **with** timezone offset, 60 min to 30 days ahead — `utils/programacion.js`); the night/Sunday surcharge is computed for **that** date and the date travels inside the signed quote token. `POST /api/trabajos` takes `programado_para` from the token (a different `programadoPara` in the body → 400, re-quote). `GET /api/trabajos/programados` lists them (employer: own; worker: assigned + available `disponibles`), `PUT /:id/programacion { programadoPara | null }` lets the owner reschedule while the job is `pago_pendiente`/`programado`/`pendiente`. The PIN of a scheduled job expires 24 h after `programado_para`, not after creation.

**Activation (Sprint 6)**: when the payment is approved, `pagosService.procesarPagoMp` uses `estadoAlPublicar(programado_para)`: more than `ANTICIPACION_PUBLICACION_MINUTOS` (60) away → the job goes to **`programado`** (paid, not listed, nobody notified; the employer gets "we'll start looking an hour before"); otherwise `pendiente` as before. `jobs/activarProgramados.js` runs every minute (and once at startup): `programado` jobs whose date is ≤60 min away go to `pendiente` with a fresh 15-min `solicitud_expira_en`, `intentos_reasignacion = 0` and `activado_en`, and candidates are notified — from there it's the normal flow, reassignment poller included. If the date already passed by more than 30 min (server was down), the job is cancelled by `sistema` with a 100% refund. Every transition is a conditional update on `estado`, so several instances / a concurrent cancel can't double-activate or double-notify. Rescheduling re-applies the rule: a `programado` moved to "as soon as possible" or near is activated immediately, a `pendiente` moved far away goes back to `programado`. `programado_para` is still not in `CAMPOS_PUBLICOS`; `GET /:id` and the worker listing read it separately (tolerant to the column missing) so the worker sees the time before accepting.

### Administración

`/api/admin/*` (`routes/admin.js`): `soloAdmin` + `limites.admin` (counts only 403s, so the key can't be brute-forced). `GET /resumen`, `GET /usuarios?tipo=&q=&suspendido=`, `GET /trabajos?estado=&categoria=`, `GET /transacciones?tipo=pagos|liquidaciones&estado=`, `GET /webhooks`, all paginated (`pagina`, `porPagina`); `POST /usuarios/:id/suspension { suspendido, motivo }`, `POST /usuarios/:id/verificacion { verificado, nota }`, `POST /webhooks/:id/reprocesar`. Liquidaciones are still marked paid through the older `/api/pagos/admin/liquidaciones/:id/pagar`.

**Disputas (Sprint 6)** — `POST /api/trabajos/:id/disputas` (multipart `motivo`, `descripcion` 10-1000, optional `foto` ≤10 MB, JPEG/PNG checked by magic bytes, uploaded to S3 as `{trabajoId}/disputa-*.jpg`) follows the contract the apps already used (`lib/disputas.ts`): `motivo` is one of the **texts** in the apps' `MOTIVOS_DISPUTA` (mirrored in `disputasController.MOTIVOS_DISPUTA` — change both together), response `201 { disputa: { id, estado: 'abierta', creado_en, … } }`. Participants only, job `asignado`/`en_progreso`/`completado`/`cancelado` with a worker, up to 7 days after closing, one open dispute per user and job (409). The other party is notified that a report exists (without its content). Admin: `GET /disputas?estado=` (paginated, with job title, reporter email and a 1h presigned photo URL), `GET /disputas/:id` (+ job, evidence URLs and the chat), `POST /disputas/:id/estado { estado, resolucion }` with transitions `abierta → en_revision → resuelta|rechazada` (resolving/rejecting requires `resolucion`; final states can't change, 409; conditional update so two admins can't both win). The reporter is notified on every change. The panel has a "Disputas" tab (photo shown as a link: the panel's CSP only allows `img-src 'self'`).

The panel UI (`public/admin/`) is static and served without auth — the key is typed in the page, kept in `sessionStorage` and sent as `x-admin-key`. It gets its own CSP (`CSP_PANEL_ADMIN` in `seguridad.js`) because helmet's default includes `upgrade-insecure-requests`, which breaks loading `panel.js` over plain `http://localhost`. No inline scripts or `on*=` attributes (CSP), and API data is only ever inserted with `textContent`.

**Suspension** (`cuentasService.js`): login (after the password check, so it doesn't leak which emails are suspended) and refresh return 403 `{ codigo: 'cuenta_suspendida' }`; suspending also deletes the user's refresh tokens, so an open session dies when its access token expires (≤ `JWT_EXPIRES_IN`) — `autenticar` doesn't hit the DB per request. Suspended workers are filtered out of `matchingService`. Jobs already in progress aren't touched. **Verification** (`usuarios.verificado`) is set only by an admin; it's shown in the panel but isn't sent in the auth payload, because `AppEmployee/(tabs)/buscar.tsx` blocks the app when `usuario.verificado === false` and every existing user would start as `false`.

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
