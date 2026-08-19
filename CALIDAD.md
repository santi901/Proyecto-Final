# Estrategia de calidad — ChanguitApp

## Estrategia general

ChanguitApp no es una app web: son dos aplicaciones React Native (Expo) y dos backends
independientes. Eso condicionó todas las decisiones que siguen, así que conviene decirlo
de entrada en vez de justificarlo después.

El criterio que usamos para decidir qué testear fue **dónde duele un error**. En esta app
un bug no significa una pantalla fea: significa que un trabajador va hasta un domicilio y
no puede empezar el trabajo, o que alguien cobra distinto de lo que se le prometió, o que
un trabajador nunca recibe ofertas y no entiende por qué. Priorizamos cubrir eso.

Concretamente separamos en dos capas:

- **Lógica de negocio pura** (precios, PIN, distancias, categorías): son funciones sin
  dependencias, rápidas de testear y donde un error es silencioso. Van con tests
  unitarios y las cubrimos al 100%.
- **El flujo completo del trabajo**: es la razón de ser del producto y atraviesa auth,
  permisos por rol, estados y validación de PIN. Ninguna función suelta garantiza que eso
  funcione junto, así que va con un test E2E que recorre el flujo entero contra el backend
  real.

Deliberadamente **no** testeamos las pantallas. Escribir tests de render de React Native
nos habría dado un número de cobertura más alto sin protegernos de nada: los bugs que
tuvimos en el proyecto no fueron de renderizado, fueron de contratos entre partes. Nos
pareció más honesto tener pocos tests que cubren lo que importa que muchos que inflan una
métrica.

## Herramientas seleccionadas

### Tests unitarios — Vitest

Elegimos **Vitest** sobre Jest por dos razones concretas. La primera es que ya soporta
TypeScript y ESM sin configuración: nuestra lógica está partida entre archivos `.ts`
(las apps, el backend de Ignacio) y `.js` en CommonJS (el backend de Nico), y Vitest
importa las dos cosas sin que tengamos que mantener un `babel.config` aparte solo para
los tests. Con Jest hubiéramos necesitado `ts-jest` o un preset de Babel y configurar el
mapeo de módulos a mano.

La segunda es la velocidad: la suite completa corre en ~1.5 segundos, lo que hace que
realmente se corra antes de cada commit y no solo en CI.

Descartamos Jest (más configuración para el mismo resultado) y Mocha + Chai (habría que
sumar librería de aserciones, de mocks y de cobertura por separado).

### Tests E2E — Vitest contra la API real

Este es el punto donde más vueltas dimos, así que explicamos las tres opciones que
evaluamos:

1. **Maestro o Detox sobre un emulador Android.** Es el E2E "de verdad" de una app móvil:
   toca la UI real. Lo descartamos porque levantar un emulador Android en GitHub Actions
   es lento (varios minutos por corrida) y frágil (falla por timeouts que no tienen que
   ver con el código). Un test que falla al azar deja de ser una señal y el equipo empieza
   a ignorarlo.

2. **Playwright sobre un export web de la app.** Era la opción más parecida a lo que pide
   un proyecto web. La descartamos por un impedimento técnico concreto: la app usa
   `react-native-webview` para todos los mapas (pantalla principal del trabajador, del
   empleador, seguimiento y el paso 2 del registro) y esa librería, en la versión 13.15.0
   que usamos, **no tiene implementación para web**. El export web se rompe justo en las
   pantallas centrales, salvo que escribamos stubs que reemplacen el mapa por un
   placeholder — con lo cual estaríamos testeando una app que no es la que entregamos.

3. **E2E de API sobre el backend** (la que elegimos). Recorre el flujo principal completo
   —registro, publicación, aceptación, PIN, finalización— pegándole por HTTP al backend
   levantado de verdad, contra una base Supabase real. No mockea nada.

La contra de nuestra elección, y la asumimos: **no cubre la UI**. Si alguien rompe un
botón, el E2E sigue en verde. Lo que sí cubre es toda la lógica de estados y permisos, que
es donde están los errores caros. Está documentado más abajo en Limitaciones.

### Lint — ESLint

Usamos el ESLint que ya trae Expo (`eslint-config-expo`) en las dos apps y el de NestJS en
el backend de Ignacio. No agregamos reglas propias: preferimos el default de cada
framework antes que discutir estilo. En CI corre **sin `--fix`**, a propósito: el script
que trae NestJS por defecto arregla los archivos, y un lint que se auto-arregla en CI
siempre pasa y no informa nada.

### CI/CD — GitHub Actions

Ya estamos en GitHub, así que sumar otro servicio (CircleCI, Travis) solo agregaba una
cuenta más para mantener. Actions se integra con los PRs, que es donde queremos que la
señal aparezca.

## Tests desarrollados

### Unitarios (17 tests)

**`tests/unit/pin.test.ts` — PIN de verificación (5 tests)**

El PIN es lo único que impide que un trabajador marque un trabajo como iniciado sin haber
llegado al domicilio. Es la garantía central del flujo.

- *genera siempre 6 dígitos*: 200 iteraciones verificando el formato. Detecta el bug
  clásico de generar un número que a veces sale con 5 dígitos.
- *no devuelve siempre el mismo PIN*: 50 generaciones tienen que dar al menos 40 valores
  distintos. Un generador que devolviera una constante pasaría los otros tests.
- *valida como correcto el PIN que generó el hash*: el roundtrip completo, y además
  verifica que el hash nunca sea igual al PIN en plano.
- *rechaza un PIN incorrecto*: prueba el PIN equivocado, el vacío y uno de 5 dígitos.
- *genera hashes distintos para el mismo PIN*: bcrypt saltea cada hash. Si no lo hiciera,
  dos trabajos con el mismo PIN se verían iguales en la base y se podría deducir uno
  comparando filas.

**`tests/unit/categorias.test.ts` — Categorías compartidas (3 tests)**

Este es el test del que estamos más conformes, porque protege un bug real que nos
advirtió el equipo de backend. El matching de trabajadores compara la categoría del
trabajo contra las categorías del trabajador **por string exacto**. Las dos listas viven
en aplicaciones distintas (`AppEmployee/lib/categorias.ts` y `AppEmployer/lib/categorias.ts`)
y nada impide que alguien toque una y se olvide de la otra. Bastaría escribir "Jardin"
sin tilde de un lado para que el filtro deje de devolver trabajadores **sin ningún error
visible**: la app compila, no tira excepción, simplemente nadie recibe ofertas nunca.

- *las dos apps declaran exactamente la misma lista*
- *coinciden carácter por carácter, incluidas las tildes*: si falla, este dice cuál difiere
- *no tiene categorías repetidas ni vacías*

Verificamos que el test sirve mutándolo a propósito: le sacamos la tilde a "Jardín" en la
app del trabajador y la suite falló señalando `expected 'Jardin' to be 'Jardín'`.

**`tests/unit/precios.test.ts` — Tarifario (4 tests)**

El precio es lo que el empleador paga y lo que el trabajador ve antes de aceptar. Se
calcula en el front y se manda al backend, así que un error acá es plata mal cobrada.

- *devuelve null si no se eligió dificultad*: importa distinguirlo de `0`, porque la
  pantalla muestra "Elegí la dificultad" en vez de "$0" y no deja publicar.
- *tiene precio definido para cada dificultad*
- *cobra más a mayor dificultad*: valida la regla de negocio, no los números
- *respeta los valores acordados*: 2500 / 4500 / 7000

**`tests/unit/haversine.test.ts` — Distancia entre dos puntos (5 tests)**

De esta función dependen el radio de búsqueda (qué trabajos se le ofrecen a cada
trabajador) y el cálculo de nafta del viaje.

- *da 0 para el mismo punto*
- *distancia conocida Obelisco–La Plata*: ~53 km
- *devuelve kilómetros, no metros*: Buenos Aires–Córdoba tiene que dar ~640, no 640.000.
  Si devolviera metros, el radio de búsqueda no filtraría nada.
- *es simétrica*: ida y vuelta miden lo mismo
- *no confunde latitud con longitud*: 10 grados de latitud son siempre ~1112 km, pero 10
  grados de longitud dependen de la latitud. Si la función tomara los argumentos en otro
  orden, este test lo detecta.

### E2E (12 tests)

**`tests/e2e/flujo-trabajo.test.ts`**

Recorre el flujo principal completo, encadenado: cada paso usa el resultado del anterior.
Usa emails y DNI únicos por corrida, así que se puede repetir sin chocar con datos viejos.

1. El empleador se registra y recibe un token
2. Publica un trabajo y el backend le devuelve el PIN (una sola vez)
3. **El trabajo NO expone el PIN al consultarlo** — si el PIN viajara en el `GET`,
   cualquier trabajador podría iniciar el trabajo sin ir al domicilio
4. El trabajador se registra
5. Ve el trabajo entre los disponibles
6. Lo acepta y queda `asignado`
7. **Un PIN incorrecto es rechazado y el trabajo no arranca** — verifica el 401 y además
   que el estado siga en `asignado`
8. El PIN correcto pone el trabajo `en_progreso`
9. Se completa el trabajo

Más tres tests de seguridad del flujo: sin token no se listan trabajos, un empleador no
puede aceptar un trabajo (la ruta es `soloEmpleado`), y el login rechaza la contraseña
equivocada.

## Casos de uso críticos

Priorizamos estos tres, en este orden:

**1. Que nadie pueda iniciar un trabajo sin estar en el domicilio.** Es la garantía que le
damos al empleador. Si se rompe, el producto pierde su razón de existir: cualquiera podría
marcar trabajos como hechos desde el sillón. Lo cubrimos por los dos lados —unitario sobre
la generación y validación del PIN, y E2E verificando que un PIN incorrecto no cambia el
estado y que el PIN no se filtra en la consulta del trabajo.

**2. Que el trabajador reciba las ofertas que le corresponden.** Un trabajador que no
recibe ofertas no se queja: asume que no hay trabajo y se va. Es una falla invisible, y
las fallas invisibles son las más caras. Por eso el test de categorías, que es de dos
líneas pero protege un acoplamiento entre dos aplicaciones que ningún compilador vigila.

**3. Que el dinero sea el correcto.** El precio se calcula en el cliente. Un error acá no
lo detecta nadie hasta que alguien reclama.

Lo que decidimos **no** priorizar: el onboarding, la edición de perfil y las pantallas de
feedback de verificación. Son importantes para la experiencia, pero un error ahí es
visible de inmediato y no tiene consecuencias económicas.

## Cobertura

`npm run test:coverage` reporta **100% de statements y 100% de funciones** sobre los
módulos de lógica de negocio (90% de branches).

Hay que ser preciso sobre qué mide ese número, porque medido sobre el repositorio entero
sería mucho más bajo. El denominador son exactamente estos cinco archivos:

- `backend/src/utils/pin.js`
- `backend-nacho/src/location/haversine.util.ts`
- `AppEmployee/lib/categorias.ts`
- `AppEmployer/lib/categorias.ts`
- `AppEmployer/lib/precios.ts`

Quedan afuera a propósito, y cada exclusión tiene un motivo:

- **Controllers y rutas del backend**: los ejercita el E2E, pero como corre contra el
  backend en otro proceso, V8 no puede instrumentarlo. Están cubiertos, pero no aparecen
  en este número.
- **`lib/ubicacion.ts`, `lib/trabajo.ts`, `lib/perfil.ts`**: son wrappers finos de `fetch`.
  Testearlos sería testear el mock.
- **Las pantallas `.tsx`**: son React Native, no corren en Node.

El 90% de branches viene de una sola rama sin cubrir en `precios.ts` (línea 25): el
fallback `?? null` para una dificultad que no exista en el tarifario. Es inalcanzable
desde TypeScript porque el tipo `Dificultad` es un union cerrado; lo dejamos como red por
si el valor llega de la red sin validar.

## Pipeline de CI/CD

`.github/workflows/ci.yml` se dispara en cada push a `main` y en cada PR contra `main`.
Cuatro jobs encadenados con `needs`:

### 1. `lint`

Instala dependencias y corre ESLint en las dos apps y en el backend de Ignacio. Va
primero porque es el más rápido: si hay un error de estilo o una variable sin usar, no
tiene sentido gastar cinco minutos compilando bundles para enterarse después.

### 2. `test` (needs: lint)

Corre los tests unitarios y el reporte de cobertura. Después, si están los secrets de
Supabase, levanta el backend con `node backend/server.js &`, espera hasta 30 segundos a
que `/health` responda, y corre el E2E contra él.

**Decisión de diseño:** el E2E necesita una base de datos real. Evaluamos mockear Supabase
para que corriera siempre, y lo descartamos: un E2E contra un mock no prueba que el
sistema funcione, prueba que el mock funciona. Preferimos que el paso se saltee con un
warning visible en la corrida cuando faltan los secrets, antes que un test que da verde
sin haber probado nada.

### 3. `build` (needs: test)

Para cada app corre `expo export --platform android`, que arma el bundle real de
producción, y después `tsc --noEmit`. Son dos cosas distintas y hacen falta las dos:
Metro compila TypeScript borrando los tipos, sin chequearlos, así que el bundle puede
armarse perfecto con errores de tipos adentro. Después compila el backend de Ignacio con
`nest build`.

No usamos EAS Build (el build nativo real que produce el `.apk`) porque requiere una
cuenta de Expo con credenciales de firma y tarda ~15 minutos por corrida. Para el
propósito del pipeline —detectar que algo dejó de compilar o de resolver— el export del
bundle da la misma señal en una fracción del tiempo.

### 4. `deploy` (needs: build)

**Qué pasa si algo falla antes:** nada se despliega. `needs: build` implica toda la cadena,
así que un lint roto, un test en rojo o un bundle que no compila cortan el pipeline antes
de llegar acá.

Además tiene `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`: un PR
corre lint, tests y build, pero **nunca** despliega. Solo el merge a `main` llega a
producción.

**Qué desplegamos y por qué.** Acá tomamos una decisión que hay que explicar: desplegamos
el **backend**, no la app. Una aplicación React Native no se distribuye por Vercel: se
distribuye por las tiendas o por EAS Update. Lo que sí es un servicio web desplegable es
la API. El `vercel.json` de la raíz sirve `backend/server.js` como función serverless.

## Limitaciones y deuda técnica

Esta sección es la más importante del documento y es la que escribimos con más cuidado,
porque describe lo que **no** está cubierto.

### La confirmación de finalización está mal implementada

Es el problema más serio que conocemos. El botón "Marcar como finalizado" existe en las
dos apps con su diálogo de confirmación, pero la coordinación entre las dos partes no
existe: `completarTrabajo` pone el estado en `completado` con la **primera** llamada,
venga del trabajador o del empleador. Si el trabajador confirma primero, el empleador
entra y ve directamente la pantalla de "trabajo finalizado" sin poder confirmar nada. Si
confirma primero el empleador, la llamada del trabajador rebota con un 400.

No es una confirmación de ambas partes: es una carrera. Arreglarlo requiere dos columnas
en la tabla (`finalizado_por_empleado` y `finalizado_por_empleador`) y pasar a `completado`
recién cuando estén las dos, más cambiar las dos pantallas para leerlas. Lo dejamos
documentado en vez de disimularlo, y **no escribimos un test que lo dé por bueno**.

### Funcionalidad que depende de campos que el backend todavía no tiene

Tres cosas están implementadas en el front pero no funcionan de punta a punta porque el
backend no expone los campos:

- **La dirección del trabajo** no está en los campos públicos de la API ni se acepta al
  crear el trabajo, así que la pantalla del trabajador siempre muestra "el empleador
  todavía no cargó la dirección".
- **El límite de tiempo de la solicitud** (`segundos_limite`) tampoco existe, así que el
  timer del modal siempre cae al default de 30 segundos.
- **La foto de evidencia** se sube correctamente a Supabase Storage, pero no hay dónde
  guardar la URL, así que el empleador nunca la ve.

Además, la **ubicación en tiempo real** del trabajador no llega al empleador: el backend
de Ignacio tiene `GET /location/calcular-viaje` pero no los endpoints para guardar y leer
la posición de un trabajo. El front ya los llama y degrada mostrando un cartel.

### Lo que el E2E no cubre

No toca la UI. Si alguien rompe un botón, borra una pantalla o deja un formulario que no
valida, el E2E sigue en verde. Cubre la lógica de estados y permisos, que es donde
consideramos que están los errores caros, pero es una elección con costo y lo sabemos.

Tampoco cubre el flujo de verificación de identidad con AWS Rekognition, porque implicaría
consumir cuota de un servicio pago en cada corrida de CI.

### Otras deudas

- **El E2E deja datos en la base.** Crea un empleador, un trabajador y un trabajo por
  corrida y no los borra. Con emails únicos no rompe nada, pero ensucia. Faltaría un
  `afterAll` que limpie, o mejor, una base de test separada de la de desarrollo.
- **No hay tests de los wrappers de API del front.** Si alguien se equivoca en la URL de
  un endpoint en `lib/trabajo.ts`, no lo detecta nada hasta probarlo a mano.
- **El pipeline instala dependencias varias veces.** Los jobs de lint y build hacen `npm ci`
  de las mismas carpetas. Se podría cachear o unificar; con el tamaño actual del proyecto
  no nos pareció que justificara la complejidad.
- **No hay error monitoring.** No integramos Sentry ni equivalente, así que un error en
  producción no nos avisa: nos enteramos si un usuario lo reporta.

## Sobre el uso de herramientas de IA

Usamos un agente de IA (Claude) para acelerar la escritura de los tests, la configuración
del pipeline y el borrador de este documento. Lo que hicimos con lo que produjo:

- **Revisamos los tests uno por uno** y descartamos los que no probaban nada real. La
  primera versión de la cobertura, por ejemplo, incluía en el denominador los controllers
  y las rutas del backend, lo que daba un número artificialmente bajo y sin significado;
  lo acotamos a los módulos de lógica pura y documentamos exactamente qué queda afuera y
  por qué.
- **Verificamos que los tests fallen cuando tienen que fallar.** Mutamos a propósito la
  lista de categorías (sacándole la tilde a "Jardín") y confirmamos que la suite se ponía
  en rojo señalando la diferencia exacta. Un test que nunca vimos fallar no sabemos si
  sirve.
- **Extrajimos lógica a módulos propios** (`AppEmployer/lib/precios.ts`,
  `AppEmployer/lib/categorias.ts`) para poder testearla sin montar React Native. Eso es un
  cambio de diseño que decidimos nosotros a partir de la necesidad de testear.
- **La sección de limitaciones la escribimos a partir de problemas que encontramos
  nosotros** durante el desarrollo del Sprint 4, no de un análisis automático.

Todo lo que está en este documento lo podemos explicar y defender.
