# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This is the **ChanguitApp** monorepo (school project). It contains three independently-versioned projects glued together in one repo, built by different people and merged in later — they do **not** share dependencies, `node_modules`, or a common package.json, and each has its own environment config:

- **Root (`/src`, `/prisma`, `/test`)** — NestJS backend, referred to in code comments as "el backend de Nacho/Ignacio". Originally handled identity verification, location/distance and matching; **as of 2026-07 those three were reimplemented in `backend/`** (see below) and neither app calls them here anymore. What is still live in this project: push notifications, ratings, and job evidence photos — `backend/` reaches it server-to-server (`NACHO_API_URL`) for the first two, and both apps call it directly to register push tokens and upload/list evidence photos (see "Expo apps" below). `verificacion/`, `location/` and `matching/` are kept in the repo but nothing calls them: don't assume that code is what runs.
- **`backend/`** — Express/CommonJS backend ("el backend de Nico"). Handles auth, users, the jobs (`trabajos`) lifecycle (PIN validation, cancellation, automatic reassignment, dual-confirmation completion) including chat and rating, **and now also identity verification, location/distance, and worker matching** (ported from the NestJS project above), plus real-time location sharing over WebSocket and an ephemeral Redis location cache. This is the main backend both Expo apps talk to. See [backend/CLAUDE.md](backend/CLAUDE.md) for its full architecture — read that file before working in `backend/`.
- **`AppEmployee/`** and **`AppEmployer/`** — two near-identical Expo/React Native apps (worker-facing and employer-facing clients), each with its own `package.json`.

## Commands

Root NestJS backend (run from repo root):
- `npm run start:dev` — start with watch mode
- `npm run build` — `nest build`
- `npm run lint` — eslint --fix over `{src,apps,libs,test}`
- `npm run format` — prettier --write over `src`/`test`
- `npm test` — jest unit tests (`*.spec.ts` colocated with source)
- `npm run test:e2e` — e2e tests via `test/jest-e2e.json`
- `npm run test:cov` — coverage
- Single test file: `npx jest src/verificacion/verificacion.service.spec.ts`

`backend/` (Express, run from `backend/`): `npm run dev` (nodemon) or `npm start`. No build step, no test suite, no lint config — see [backend/CLAUDE.md](backend/CLAUDE.md).

`AppEmployee/` and `AppEmployer/` (run from each app's own directory): `npm start` (Expo dev server), `npm run android` / `npm run ios` / `npm run web`, `npm run lint` (`expo lint`).

## Root NestJS backend architecture

Standard Nest module-per-feature layout, wired in `src/app.module.ts`:

```
src/main.ts                        bootstrap, CORS enabled, listens on process.env.PORT ?? 3000
src/verificacion/                  identity verification (DNI + selfie face match)
src/location/                      geocoding, distance/fuel-cost estimation, live location upsert
src/matching/                      worker matching by category, availability, distance and reputation
src/notificaciones/                push notifications (Expo) + notification log
src/evidencia/                     job-completion evidence photo upload/listing
src/calificaciones/                post-job ratings + reputation recalculation
src/supabase/                      global Supabase client provider (service-role key)
prisma/schema.prisma               present but has no models defined yet — not in active use
```

`package.json` also lists deps not used by any module yet (`socket.io`/`@nestjs/websockets`, `firebase-admin`, `@vladmandic/face-api`, `canvas`, `passport`/`passport-jwt`, `@prisma/client`).

### Verificación (`src/verificacion`)

`POST /verificacion/comparar-caras` accepts 2 multipart files under the field names `dni` and `selfie`, rejects identical-byte uploads, then:
1. `StorageService.guardarImagen` uploads both images to S3 (`AWS_BUCKET_NAME`), keyed `${userId}/${tipo}-${uuid}.jpg`, regardless of match outcome. `StorageService` is exported from `VerificacionModule` and reused by `EvidenciaModule` (tipo `'evidencia'`, keyed by `trabajoId` instead of `userId`).
2. `VerificacionService.compararCaras` runs AWS Rekognition `CompareFacesCommand` with `SimilarityThreshold: 80` on the API call, but only declares `coinciden: true` above 90% similarity in the response — the 80% and 90% thresholds are intentionally different (80% is just what AWS returns candidates for).

There used to be a Textract step (`TextractService.validarDni`) that OCR'd the DNI to check for ID keywords before running Rekognition — it was removed (AWS Textract requires a paid plan, same limitation that hit Textract in `backend/`). No document-authenticity check exists today; only the face match runs.

### Location (`src/location`)

`GET /location/calcular-viaje` geocodes two free-text addresses via the public Nominatim (OpenStreetMap) API (no key, but a `User-Agent` header is required or requests get rejected) and returns haversine distance plus an estimated ARS fuel cost using fixed constants `PRECIO_NAFTA_ARS` / `RENDIMIENTO_KM_POR_LITRO` in `location.service.ts` (`calcularDistanciaKm` itself lives in `haversine.util.ts` and is reused by `matching/`).

`POST /location/actualizar-ubicacion` upserts live coordinates into the Supabase `worker_locations` table (using `SUPABASE_ANON_KEY`, not the service key) and, if a `jobId` is passed, also returns remaining distance/cost to that job's stored `lat`/`lng` from the `jobs` table.

Both routes are unauthenticated at the Nest layer — no guards are registered on `LocationController` or `VerificacionController`.

### Matching (`src/matching`)

`GET /matching/trabajadores-disponibles?trabajoId=&radioKm=` finds `empleados` whose `categorias` include the job's `categoria`, within `radioKm` (or the worker's own `radio_busqueda`, default 10km) of the job's own `latitud`/`longitud` (the row on `trabajos`, set by `backend/` when the job is created), excluding workers currently tied to a job in `asignado`/`en_progreso`. Results are sorted by `reputacion` descending, distance ascending as the tiebreaker. **This logic has since been ported into `backend/src/services/matchingService.js`** — `backend/` no longer calls this endpoint; it's kept here unused, same status as `verificacion`/`location` above.

### Notificaciones (`src/notificaciones`)

`POST /notificaciones` sends an Expo push notification and always logs it to the `notificaciones` table first as `'pendiente'`, then updates the row to `'enviado'`/`'fallido'` after attempting the push — so a row exists even if the push itself fails or the recipient never registered a token. `POST /notificaciones/registrar-token` upserts an Expo push token into `push_tokens` keyed by `usuario_id`. `GET /notificaciones?destinatarioId=` lists a user's notification history, most recent first. Both apps install `expo-notifications` and call `registrar-token` directly (`lib/notificaciones.ts`, run when the main tab screen mounts with an active session); `backend/` triggers the pushes server-to-server via its own `NACHO_API_URL`. Getting a token needs an EAS `projectId` in the app config and, on Android, a development build (Expo Go on Android no longer supports remote push) — without that the call fails, is logged, and the app carries on.

### Evidencia (`src/evidencia`)

`POST /trabajos/:trabajoId/evidencia` (multipart field `foto`, body field `subidoPor`) uploads a completion photo via `StorageService` and inserts a row into `evidencias_trabajo` (`trabajo_id`, `s3_key`, `subido_por`, `creado_en`). `GET /trabajos/:trabajoId/evidencia` lists them, most recent first. Both responses add a signed `url` per row (`StorageService.obtenerUrlFirmada`, 1h expiry via `@aws-sdk/s3-request-presigner`) — the bucket is private, so `s3_key` alone isn't viewable by the app. `AppEmployee` uploads the photo from `trabajo-en-curso.tsx` right before completing a job and `AppEmployer` renders that signed `url` in `seguimiento.tsx` (`lib/evidencia.ts` in each app).

### Calificaciones (`src/calificaciones`)

`POST /calificaciones` (`trabajoId`, `calificadorId`, `calificadoId`, `puntaje` 1-5, optional `comentario`) requires the referenced `trabajos` row to be in state `'completado'`, inserts into `calificaciones`, then recalculates and writes the average `puntaje` back to `empleados.reputacion` for `calificadoId` — this desnormalized average is what `matching/` sorts by, so it doesn't have to aggregate on every match query. `GET /calificaciones?empleadoId=` lists an employee's rating history, most recent first. The apps don't call it directly: `AppEmployer` rates through `backend/`'s authenticated `POST /api/trabajos/:id/calificar`, which forwards here.

### Supabase (`src/supabase`)

`SupabaseModule` is `@Global()` and exports a single `SUPABASE_CLIENT` token (created with `SUPABASE_SERVICE_KEY`, not the anon key) that `matching/`, `notificaciones/`, `evidencia/`, and `calificaciones/` all inject via `@Inject(SUPABASE_CLIENT)`. This is separate from `location/`'s own direct Supabase client, which is built inline with `SUPABASE_ANON_KEY`.

### Config

Reads from `.env` via `ConfigModule.forRoot({ isGlobal: true })`: `PORT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

Lint/format: ESLint flat config (`eslint.config.mjs`) using `typescript-eslint` recommendedTypeChecked + `eslint-plugin-prettier`; `@typescript-eslint/no-explicit-any` is off, `no-floating-promises`/`no-unsafe-argument` are warnings not errors. Prettier: single quotes, trailing commas everywhere (`.prettierrc`).

## Expo apps (`AppEmployee/`, `AppEmployer/`)

Both apps are Expo Router + NativeWind (Tailwind) projects with nearly identical structure (`app/`, `components/`, `hooks/`, `lib/`, `constants/`). Differences are in the `(tabs)` screens:
- `AppEmployee`: `buscar.tsx`, `dashboard.tsx` — worker searches for jobs.
- `AppEmployer`: `ofrecer.tsx`, `dashboard.tsx` — employer posts jobs.

Both apps talk mainly to `backend/` (Nico's Express API), plus the NestJS backend above for the two things `backend/` doesn't expose:
- `auth.ts` → `EXPO_PUBLIC_API_URL` (defaults `http://localhost:3000`) — exports `API_URL`, `getAccessToken()` and the authenticated `apiGet`/`apiPost` helpers, used for `/api/auth/*` (login, register, logout, session storage via AsyncStorage), by `lib/trabajos.ts` (jobs lifecycle; in `AppEmployer` also the rating) and by `lib/chat.ts` (`/api/trabajos/:id/mensajes`, polled every few seconds — there are no websockets).
- `lib/ubicacion.ts` imports `API_URL`/`getAccessToken` from `auth.ts` and calls `/api/ubicacion/actualizar-ubicacion` (sends the stored access token as a Bearer header — that route requires auth). `register.tsx` in each app calls `/api/verificacion/comparar-caras` the same way, posting `dni`/`selfie` as separate multipart fields (matching `backend/src/routes/verificacion.js`'s `multer` field names).
- `auth.ts` also exports `NACHO_API_URL` → `EXPO_PUBLIC_NACHO_API_URL` (defaults `http://localhost:3001`), used only by `lib/notificaciones.ts` (`/notificaciones/registrar-token`) and `lib/evidencia.ts` (`/trabajos/:trabajoId/evidencia`). Verification and location go through `API_URL`, not this one; a hardcoded `ngrok-free.app` placeholder URL is leftover from before the consolidation and should be repointed at `API_URL`.

`supabaseClient.ts` in each app hardcodes a Supabase project URL + anon key directly in source (not read from env) — this is the public anon key, used for direct client-side Supabase calls separate from either backend.

Request bodies to the Express backend use camelCase field names (`fechaNacimiento`, `codigoPostal`) — see [backend/CLAUDE.md](backend/CLAUDE.md) for the full camelCase↔snake_case mapping convention.

## Conventions

- Spanish is used throughout for identifiers, JSON field/route names, and user-facing error/exception messages across all three backends and both apps — match this when adding code rather than switching to English.
- `backend/` and the root NestJS project both implement verification and location/distance independently (Express+Supabase vs NestJS+AWS). The NestJS versions are no longer called by either app (see "Repository shape" above) — treat `backend/`'s implementation as the one to fix/extend.
- `backend/` controllers log to `console.error` with a short description at each error branch (validation rejections, AWS/Supabase failures, geocoding failures), not just on unexpected exceptions — keep this pattern when adding new error paths so failures are diagnosable from the server console.
