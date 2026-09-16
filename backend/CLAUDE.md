# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This `backend/` folder is one part of the `Proyecto-Final` monorepo (ChanguitApp). It is a **separate Node/Express API** from the NestJS project at the monorepo root (`../src`, `../prisma`) — the two are unrelated codebases that happen to share a repo. There are also two Expo apps at the monorepo root, `AppEmployee/` and `AppEmployer/`. Do not mix dependencies or assumptions between this folder and the rest of the repo; treat `backend/` as its own Node project with its own `package.json` and `node_modules`.

## Commands

Run from this `backend/` directory:

- `npm run dev` — start the API with nodemon (auto-restart on change)
- `npm start` — start the API with plain `node server.js`

There is no build step (plain CommonJS, no TypeScript/transpilation), no test suite, and no lint config in this folder.

The server reads config from a `.env` file (not committed) with these keys: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`.

## Architecture

Plain layered Express app, no ORM: `server.js` mounts routers → routers apply middleware and dispatch to controllers → controllers call the Supabase JS client directly (`src/config/supabase.js`, using the service-role key, so RLS is bypassed at this layer). There is no models/repository layer — query logic lives inline in each controller.

```
server.js                        Express app entrypoint, mounts all routers under /api/*
src/routes/*.js                  one router per resource, wires middleware + controller fns
src/controllers/*.js             request handling + all Supabase queries for that resource
src/middleware/auth.js           autenticar (JWT check), soloEmpleado / soloEmpleador (role gates)
src/middleware/errorHandler.js   catch-all error handler (last app.use in server.js)
src/utils/jwt.js                 access/refresh token sign+verify (separate secrets/expiries)
src/utils/pin.js                 6-digit job-start PIN generation + bcrypt hash/compare
src/utils/storage.js             uploads a buffer to S3, returns the object key
src/utils/haversine.js           great-circle distance in km between two lat/lng points
```

### Two user types, two profile tables

There are exactly two `tipo_usuario` values, and — confusingly — their profile tables/routes don't share a naming pattern:

- **`empleado`** (worker): profile table `empleados`, routes in `src/routes/empleados.js` (`GET/PUT /api/empleados/perfil`), controller `empleadosController.js`, gated by `soloEmpleado`.
- **`empleador`** (employer): profile table `perfiles`, routes in `src/routes/perfiles.js` (`GET/PUT /api/perfiles/perfil`), controller `perfilesController.js`, gated by `soloEmpleador`.

Both profile tables key off `usuarios.id` via a `user_id` column. Registration (`authController.registrarEmpleado` / `registrarEmpleador`) inserts into `usuarios` first, then the matching profile table, and rolls back the `usuarios` row if the profile insert fails (no DB transaction — this is manual two-step compensation).

### Auth

JWT access tokens (short-lived, `JWT_EXPIRES_IN`) carry `{ id, email, tipo }` and are verified per-request by `autenticar`, which sets `req.usuario`. Refresh tokens (long-lived, `JWT_REFRESH_EXPIRES_IN`) are additionally persisted in the `refresh_tokens` Supabase table and checked against that table (not just signature) on `POST /api/auth/refresh`, so they can be revoked server-side via `logout`.

### Trabajos (jobs) lifecycle

State machine driven by the `estado` column on `trabajos`: `pendiente` → (`empleador` creates, gets a one-time 6-digit PIN back in the response — the PIN itself is never stored or re-queryable, only its bcrypt hash + a 24h expiry) → `asignado` (an `empleado` accepts) → `en_progreso` (the assigned `empleado` presents the PIN in person and the `empleador`/dispatcher enters it via `POST /:id/validar-pin`) → `completado`. Every transition re-checks the current `estado` server-side before applying the next one.

### Identity verification (`verificacionController.js`)

`POST /api/verificacion/comparar-caras` takes two multipart images (`dni`, `selfie`) and runs Rekognition `CompareFacesCommand` between them, with a match declared only above 90% similarity (note this is stricter than the 80% `SimilarityThreshold` passed to the AWS call itself, which just controls what AWS returns at all). Both images are uploaded to S3 via `storage.guardarImagen` regardless of match outcome.

There used to also be a Textract `DetectDocumentTextCommand` check on the DNI photo (keyword allowlist to reject non-ID images) before the face comparison — it was removed because Textract requires an AWS account off the Free Plan tier (`SubscriptionRequiredException` on Free Plan accounts), while Rekognition works without upgrading. So this endpoint no longer validates that the `dni` image is actually a DNI — it only checks that the two uploaded photos show the same face.

### Ubicación / distance-cost estimation

`ubicacionController.js` geocodes free-text addresses via the public Nominatim (OpenStreetMap) API — no API key, but requires a `User-Agent` header — then uses `haversine.calcularDistanciaKm` plus fixed constants (`PRECIO_NAFTA_ARS`, `RENDIMIENTO_KM_POR_LITRO`) to estimate fuel cost in ARS. `actualizarUbicacion` additionally upserts live coordinates into `worker_locations` and, if a `jobId` is given, returns remaining distance/cost to that job's stored `lat`/`lng`.

## Conventions

- Spanish is used throughout for identifiers, JSON field names, and user-facing error messages — match this when adding routes/fields rather than switching to English.
- Request bodies use camelCase (`fechaNacimiento`, `codigoPostal`); Supabase columns use snake_case (`fecha_nacimiento`, `codigo_postal`). Controllers do this mapping manually field-by-field — there's no automatic (de)serialization layer.
- Controllers generally catch their own errors and return a scoped JSON `{ error }` with an appropriate status code; `errorHandler.js` is only a last-resort fallback for uncaught exceptions.
