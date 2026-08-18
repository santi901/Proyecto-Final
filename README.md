# Proyecto-Final — ChanguitApp

Rama de integración: acá conviven las dos apps y los dos backends.

## Estructura

| Carpeta | Qué es | Quién |
|---|---|---|
| `AppEmployee/` | App del trabajador (Expo Router + NativeWind) | Santi |
| `AppEmployer/` | App del empleador (Expo Router + NativeWind) | Santi |
| `backend/` | API de auth, perfiles y trabajos (Express + Supabase) | Nico |
| `backend-nacho/` | API de verificación de identidad y ubicación (NestJS + AWS) | Ignacio |

`backend-nacho/` vive en una subcarpeta porque en su rama estaba en la raíz del repo y
chocaba con el `package.json` de la raíz. Adentro no cambió nada: es el mismo proyecto
NestJS y se levanta igual, sólo que desde esa carpeta.

## Levantar todo

Cada proyecto tiene sus propias dependencias, así que hay que instalarlas por separado.

```bash
# Backend de Nico (auth, perfiles, trabajos)
cd backend && npm install && npm run dev

# Backend de Ignacio (verificación de identidad, ubicación)
cd backend-nacho && npm install && npm run start:dev

# App del trabajador
cd AppEmployee && npm install && npx expo start

# App del empleador
cd AppEmployer && npm install && npx expo start
```

## Variables de entorno de las apps

Las apps apuntan a los dos backends por separado:

- `EXPO_PUBLIC_API_URL` → backend de Nico (por defecto `http://localhost:3000`)
- `EXPO_PUBLIC_NACHO_API_URL` → backend de Ignacio (la URL de ngrok que él pase)
