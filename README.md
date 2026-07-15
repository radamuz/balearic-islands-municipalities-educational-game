# Illes Balears Arcade — Juego Educacional

Juego arcade web para aprender la geografía de las Illes Balears: arrastra las
8 islas y los 67 municipios a su lugar en el mapa SVG, lo más rápido y preciso
posible. Suma puntos por velocidad, precisión y combos, y compite en una
clasificación persistente.

Instalación y ejecución:

```bash
npm install
npm start
# Abrir http://localhost:3000 en el navegador
```

Sin credenciales de AWS la app arranca igual: el mapa se lee del `mapping.json`
del repo y la clasificación se queda vacía. Para trabajar contra DynamoDB, copia
`.env.example` a `.env` y rellénalo (ver [Producción](#producción-aws--vercel)).

## Cómo se juega

- **Arrastra** un nombre de la barra lateral sobre su forma en el mapa.
- **Rueda del ratón / pellizco** para hacer zoom; **arrastra el mapa** para
  desplazarte; doble clic para centrar.
- Las etiquetas son **dinámicas con el zoom**: mantienen un tamaño legible y se
  colocan dentro de la forma cuando caben (más cuanto más acercas), o salen al
  lado con una flecha guía cuando no.
- Al colocar las 75 piezas se calcula la puntuación (base + bonus de velocidad ×
  multiplicador de combo + bonus de tiempo final), introduces tu nombre y entras
  en la **clasificación** (🏆 en la barra del mapa).

## Detalles

- Las listas están en `datasource/` (txt) y se exponen en `/api/datasources`.
- El SVG del mapa (`images/...svg`) se inserta inline para aceptar drops. Para
  reconocer una zona, su forma debe tener un `id`/`data-name` que coincida
  (normalizado) con el nombre, o estar asignada en el mapeo.
- El **mapeo, la clasificación y el registro de accesos viven en DynamoDB**. En
  Vercel el disco es efímero y de solo lectura, así que escribir a fichero no
  persistía: por eso la clasificación no funcionaba en producción.
- `mapping.json` sigue versionado y actúa de **fallback de lectura**: si DynamoDB
  falla o está vacía, el mapa se sigue dibujando.

## Panel de administración

La rueda ⚙️ del mapa está oculta hasta iniciar sesión con el botón 🔐. Los
usuarios admin viven en DynamoDB con hash bcrypt (los crea `npm run seed`).

El login no es solo cosmético: `POST /api/mapping`, los imports y todo
`/api/access-log` exigen sesión y responden **401** sin ella. `POST /api/scores`
es público a propósito — es como los jugadores envían su puntuación al acabar.

Desde la rueda, **⬇️ Descarregar** baja el mapeo activo como `mapping.json`. Sirve
para cerrar el ciclo producción → repo: si retocas asignaciones en PRO, te bajas
el fichero y lo commiteas para que el fallback no se quede desactualizado.

## Producción (AWS + Vercel)

Todo el estado vive en una sola tabla DynamoDB (`balears-app`), con `pk`/`sk`
genéricas y el prefijo de `pk` distinguiendo la entidad (`MAPPING`, `SCORE`,
`ACCESS`, `ADMIN`). Las puntuaciones y los accesos son **un item por entrada**:
en Vercel dos jugadores acabando a la vez corren en lambdas distintas, y un
documento compartido se pisaría. Los accesos caducan solos a los 90 días (TTL),
porque guardan IPs y user-agents.

Hay **dos usuarios IAM distintos**, a propósito:

| Usuario | Lo crea | Para qué | Permisos |
|---|---|---|---|
| `balears-app-github` | `setup-github-secrets.sh` | El pipeline despliega el stack | CloudFormation + DynamoDB, solo sobre este stack/tabla |
| `balears-app-vercel` | `setup-aws.sh` | La app lee/escribe datos | Get/Put/Query/Delete, solo sobre esta tabla |

Separarlos evita que la web pública tenga permiso para crear o borrar tablas.
Ninguno de los dos puede borrar la tabla ni tocar nada más de la cuenta.

Puesta en marcha, una sola vez (los scripts los lanzas tú, con tu perfil de
admin; solo imprimen credenciales, no las suben a ningún sitio):

```bash
# 1. Crear el usuario del pipeline e imprimir sus claves
./scripts/setup-github-secrets.sh --profile radamuz
#    Pegar AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en:
#    GitHub > Settings > Secrets and variables > Actions

# 2. Crear la tabla: GitHub > Actions > "Deploy infra (DynamoDB)" > Run workflow

# 3. Crear el usuario de la app e imprimir sus env vars
#    (necesita la tabla creada: lee su ARN del stack)
./scripts/setup-aws.sh --profile radamuz

# 4. Pegar esas variables en Vercel (y en .env para probar en local)

# 5. Subir el mapeo actual y crear tu usuario admin
npm run seed
```

Variables de entorno de la app (ver `.env.example`): `AWS_REGION`,
`DYNAMODB_TABLE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SESSION_SECRET`.

El pipeline `.github/workflows/deploy-infra.yml` despliega la tabla al tocar
`infra/**` o a mano. La tabla tiene `DeletionPolicy: Retain`: al borrar el stack
los datos sobreviven.

Las claves de AWS solo se muestran al crearlas. Si pierdes una, vuelve a lanzar
el script con `--new-key` y borra la antigua en la consola de IAM.

## Estructura del proyecto

```
infra/dynamodb.yml         # CloudFormation: la tabla DynamoDB
scripts/
  setup-github-secrets.sh  # crea el usuario IAM + claves del pipeline (lanzar a mano)
  setup-aws.sh             # crea el usuario IAM + claves para Vercel (lanzar a mano)
  seed.js                  # sube mapping.json a DynamoDB y crea el admin

src/
  config/
    paths.js               # rutas a public/, images/, datasource/, mapping.json
    dynamo.js              # cliente DynamoDB compartido + prefijos de clave
  services/
    datasourceService.js   # lee los .txt de datasource/
    mappingService.js      # mapeo en DynamoDB (fallback a mapping.json)
    scoresService.js       # clasificación en DynamoDB (un item por partida)
    accessLogService.js    # registro de accesos en DynamoDB (TTL 90 días)
    authService.js         # admins en DynamoDB (bcrypt) + cookie de sesión firmada
  middleware/
    requireAdmin.js        # 401 si no hay sesión válida
  routes/
    datasources.js         # GET /api/datasources
    mapping.js             # GET /api/mapping · POST + GET /export (admin)
    scores.js              # GET/POST /api/scores · /export /import (admin)
    accessLog.js           # /api/access-log (todo admin)
    auth.js                # POST /login /logout · GET /me
  app.js                   # configuración de Express
  server.js                # arranque del servidor

public/
  index.html
  favicon.ico
  styles/
    base.css               # tema, layout a pantalla completa, listas
    map.css                # mapa, formas, etiquetas SVG, toolbar, barra de progreso
    game.css               # HUD, popups, overlays (inicio/fin/clasificación)
    modal.css              # modal de edición de mapeo (dev)
  js/
    main.js                # orquestación: datos, mapa, juego y flujo de pantallas
    api/client.js          # fetch a /api/datasources, /api/mapping, /api/scores
    utils/normalize.js     # normalizeKey
    data/islandGroups.js   # ISLAND_GROUPS + islandOf
    game/
      matching.js          # ITEM_KIND, isMatch, getIslandGroup
      scoring.js           # fórmulas de puntuación (combo, velocidad, tiempo)
      gameState.js         # modelo del juego: ciclo de vida, timer, score, combo
    ui/
      lists.js             # listas de piezas arrastrables + filtro de búsqueda
      hud.js               # tiempo / puntos / combo / progreso
      overlays.js          # pantallas de inicio, fin de partida y clasificación
      toolbar.js           # zoom, clasificación y herramientas de mapeo
      adminAuth.js         # login de admin y visibilidad de la rueda ⚙️
      dataTools.js         # gestión de clasificación, accesos y descarga del mapeo
      notifications.js     # toasts y popups de feedback flotantes
    svg/
      viewport.js          # zoom/pan suave del viewBox + suscriptores de cambio
      labelLayer.js        # etiquetas dinámicas según el zoom (dentro / flecha)
      dropTargets.js       # lógica de arrastrar y soltar + puntuación
      mappingEditor.js     # modal manual de asignación forma -> nombre (dev)
      mappingState.js      # estado del mapeo manual y lista de nombres
      solution.js          # overlay "ver solución"
```

Sin bundler: módulos ES nativos (`<script type="module">`).
