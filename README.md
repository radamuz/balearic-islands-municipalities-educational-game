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
  (normalizado) con el nombre, o estar asignada en `mapping.json`.
- Las puntuaciones se guardan en `scores.json` (no versionado) vía `/api/scores`.

## Estructura del proyecto

```
src/
  config/paths.js          # rutas a public/, images/, datasource/, mapping.json, scores.json
  services/
    datasourceService.js   # lee los .txt de datasource/
    mappingService.js      # lee/escribe mapping.json
    scoresService.js       # lee/escribe scores.json (clasificación)
  routes/
    datasources.js         # GET /api/datasources
    mapping.js             # GET/POST /api/mapping
    scores.js              # GET/POST /api/scores
  app.js                   # configuración de Express
  server.js                # arranque del servidor

public/
  index.html
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
