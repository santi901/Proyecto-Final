# ChanguitApp

Aplicación para conectar gente que necesita resolver una tarea corta ("changa") con
trabajadores cerca suyo. El empleador publica el trabajo, el trabajador lo acepta, va al
domicilio, valida un PIN para arrancar y sube una foto al terminar.

## Estructura

| Carpeta | Qué es | Quién |
|---|---|---|
| `AppEmployee/` | App del trabajador (Expo Router + NativeWind) | Santi |
| `AppEmployer/` | App del empleador (Expo Router + NativeWind) | Santi |
| `backend/` | API de auth, perfiles y trabajos (Express + Supabase) | Nico |
| `backend-nacho/` | API de verificación de identidad y ubicación (NestJS + AWS) | Ignacio |
| `tests/` | Tests unitarios y E2E del proyecto | equipo |

`backend-nacho/` vive en una subcarpeta porque en su rama estaba en la raíz del repo y
chocaba con el `package.json` de la raíz. Adentro no cambió nada.

## URL de producción

<!-- Reemplazar cuando esté creado el proyecto en Vercel. -->
`https://PENDIENTE.vercel.app` — API del backend de Nico.

Todavía no está desplegado: falta crear el proyecto en Vercel y cargar los secrets
(ver [Deploy](#deploy)). El pipeline ya tiene el paso listo y se ejecuta solo cuando
esos secrets existan.

## Levantar el proyecto

Cada proyecto tiene sus propias dependencias.

```bash
# Backend de Nico (auth, perfiles, trabajos) — puerto 3000
cd backend && npm install && npm run dev

# Backend de Ignacio (verificación de identidad, ubicación)
cd backend-nacho && npm install && npm run start:dev

# App del trabajador
cd AppEmployee && npm install && npx expo start

# App del empleador
cd AppEmployer && npm install && npx expo start
```

### Variables de entorno

El backend de Nico necesita, en `backend/.env`:

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
```

Las apps apuntan a los dos backends por separado:

- `EXPO_PUBLIC_API_URL` → backend de Nico (por defecto `http://localhost:3000`)
- `EXPO_PUBLIC_NACHO_API_URL` → backend de Ignacio (la URL de ngrok que él pase)

## Calidad

Ver [CALIDAD.md](CALIDAD.md) para la estrategia completa: qué se testea, con qué, y por qué.

```bash
npm install          # una sola vez, en la raíz

npm run lint         # lint de las dos apps + el backend de Ignacio
npm run test:unit    # tests unitarios de lógica de negocio
npm run test:coverage# lo mismo, con reporte de cobertura
npm run test:e2e     # E2E del flujo del trabajo (necesita el backend levantado)
npm run build        # bundles de las apps + build de NestJS
```

El E2E le pega al backend de verdad. Antes de correrlo, levantalo con `npm run backend`
(con el `.env` cargado) o apuntá `E2E_BASE_URL` al entorno que quieras probar.

## Flujo de trabajo en GitHub

### Issues

Toda funcionalidad, mejora o bug arranca con un issue **antes** de escribir código. El
issue tiene título descriptivo, una descripción breve del problema y un responsable
asignado.

### Ramas

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `feature/` | Funcionalidad nueva | `feature/selector-categorias` |
| `fix/` | Corrección de un bug | `fix/pin-expirado` |
| `chore/` | Tooling, config, dependencias | `chore/pipeline-ci` |
| `docs/` | Solo documentación | `docs/calidad-md` |

El nombre después del prefijo va en minúsculas y separado con guiones.

### Pull Requests

Nada se mergea directo a `main`. Todo cambio pasa por un PR que:

1. Referencia el issue que resuelve (`Closes #12`).
2. Es revisado y aprobado por el otro integrante del equipo.
3. Tiene al menos un comentario de revisión real, no una aprobación vacía.
4. Pasa el pipeline completo (lint → tests → build).

El repositorio tiene un [template de PR](.github/pull_request_template.md) con el
checklist correspondiente.

## Pipeline

`.github/workflows/ci.yml` se dispara en cada push a `main` y en cada PR contra `main`:

```
lint → test → build → deploy
```

Cada etapa depende de la anterior, así que el deploy a producción solo ocurre si el lint,
los tests y el build pasaron. Un PR nunca despliega: el deploy corre únicamente en push
a `main`.

### Deploy

El deploy está escrito y listo, pero **inactivo hasta cargar los secrets**. Para activarlo:

1. Crear el proyecto en Vercel apuntando a este repositorio (el `vercel.json` de la raíz
   ya está configurado para servir `backend/server.js` como función serverless).
2. Cargar en **Settings → Secrets and variables → Actions** del repo:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
3. Cargar en el proyecto de Vercel las variables del backend: `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
4. Actualizar la URL de producción en este README.

Mientras falten esos secrets, el pipeline pasa igual y deja un warning avisando que el
deploy no corrió.

Para que el E2E corra en CI hacen falta además los secrets `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `JWT_SECRET` y `JWT_REFRESH_SECRET` en el repositorio.
