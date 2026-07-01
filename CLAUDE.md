# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This is the **ChanguitApp** monorepo (school project). It contains three independently-versioned projects glued together in one repo, built by different people and merged in later — they do **not** share dependencies, `node_modules`, or a common package.json, and each has its own environment config:

- **Root (`/src`, `/prisma`, `/test`)** — NestJS backend, referred to in code comments as "el backend de Nacho/Ignacio". Handles identity verification and location/distance features.
- **`backend/`** — separate Express/CommonJS backend ("el backend de Nico"). Handles auth, users, and the jobs (`trabajos`) lifecycle. See [backend/CLAUDE.md](backend/CLAUDE.md) for its full architecture — read that file before working in `backend/`.
- **`AppEmployee/`** and **`AppEmployer/`** — two near-identical Expo/React Native apps (worker-facing and employer-facing clients), each with its own `package.json`.

When making changes, don't assume a fix in one project applies to the others even when the logic looks duplicated (e.g. verification and geolocation exist in both the root NestJS backend and `backend/`) — treat each as its own codebase and check which one the app actually calls before editing.

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
prisma/schema.prisma               present but has no models defined yet — not in active use
```

### Verificación (`src/verificacion`)

`POST /verificacion/comparar-caras` accepts 2 multipart files under the field name `imagenes` (`[dni, selfie]`), rejects identical-byte uploads, then:
1. `TextractService.validarDni` runs AWS Textract `DetectDocumentTextCommand` on the DNI image and checks the detected text for a keyword allowlist (`ARGENTINA`, `DNI`, `IDENTIDAD`, etc.) to reject non-ID images.
2. `StorageService.guardarImagen` uploads both images to S3 (`AWS_BUCKET_NAME`), keyed `${userId}/${tipo}-${uuid}.jpg`, regardless of match outcome.
3. `VerificacionService.compararCaras` runs AWS Rekognition `CompareFacesCommand` with `SimilarityThreshold: 80` on the API call, but only declares `coinciden: true` above 90% similarity in the response — the 80% and 90% thresholds are intentionally different (80% is just what AWS returns candidates for).

### Location (`src/location`)

`GET /location/calcular-viaje` geocodes two free-text addresses via the public Nominatim (OpenStreetMap) API (no key, but a `User-Agent` header is required or requests get rejected) and returns haversine distance plus an estimated ARS fuel cost using fixed constants `PRECIO_NAFTA_ARS` / `RENDIMIENTO_KM_POR_LITRO` in `location.service.ts`.

`POST /location/actualizar-ubicacion` upserts live coordinates into the Supabase `worker_locations` table (using `SUPABASE_ANON_KEY`, not the service key) and, if a `jobId` is passed, also returns remaining distance/cost to that job's stored `lat`/`lng` from the `jobs` table.

Both routes are unauthenticated at the Nest layer — no guards are registered on `LocationController` or `VerificacionController`.

### Config

Reads from `.env` via `ConfigModule.forRoot({ isGlobal: true })`: `PORT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

Lint/format: ESLint flat config (`eslint.config.mjs`) using `typescript-eslint` recommendedTypeChecked + `eslint-plugin-prettier`; `@typescript-eslint/no-explicit-any` is off, `no-floating-promises`/`no-unsafe-argument` are warnings not errors. Prettier: single quotes, trailing commas everywhere (`.prettierrc`).

## Expo apps (`AppEmployee/`, `AppEmployer/`)

Both apps are Expo Router + NativeWind (Tailwind) projects with nearly identical structure (`app/`, `components/`, `hooks/`, `lib/`, `constants/`). Differences are in the `(tabs)` screens:
- `AppEmployee`: `buscar.tsx`, `dashboard.tsx` — worker searches for jobs.
- `AppEmployer`: `ofrecer.tsx`, `dashboard.tsx` — employer posts jobs.

Each app talks to **two different backends** with two different base URLs, configured via env vars with a `localhost`/placeholder fallback:
- `auth.ts` → `EXPO_PUBLIC_API_URL` (defaults `http://localhost:3000`) — calls `backend/` (Nico's Express API) for `/api/auth/*` (login, register, logout, session storage via AsyncStorage).
- `lib/ubicacion.ts` → `EXPO_PUBLIC_NACHO_API_URL` (defaults to an ngrok placeholder) — calls the root NestJS backend for location endpoints (no `/api` prefix, e.g. `POST /location`).

`supabaseClient.ts` in each app hardcodes a Supabase project URL + anon key directly in source (not read from env) — this is the public anon key, used for direct client-side Supabase calls separate from either backend.

Request bodies to the Express backend use camelCase field names (`fechaNacimiento`, `codigoPostal`) — see [backend/CLAUDE.md](backend/CLAUDE.md) for the full camelCase↔snake_case mapping convention.

## Conventions

- Spanish is used throughout for identifiers, JSON field/route names, and user-facing error/exception messages across all three backends and both apps — match this when adding code rather than switching to English.
- `backend/` and the root NestJS project both implement verification and location/distance features independently with different implementations (Express+Supabase vs NestJS+AWS). Don't assume changing one updates the other's behavior.
