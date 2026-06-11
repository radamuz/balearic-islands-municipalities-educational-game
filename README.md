# Juego Educacional — Illes Balears

Pequeña web app para arrastrar nombres de islas/municipios al mapa SVG.

Instalación y ejecución:

```bash
npm install
npm start
# Abrir http://localhost:3000 en el navegador
```

Detalles:
- Los ficheros con las listas están en `datasource/` (txt). El servidor los expone en `/api/datasources`.
- El SVG del mapa se encuentra en `images/mapa-municipal-de-les-illes-balears.svg` y se inserta inline para aceptar drops.
- Para que el sistema reconozca una zona del mapa, la forma SVG debe tener un `id` o `data-name` que coincida (normalizado) con el nombre del municipio/isla.

## Estructura del proyecto

```
src/
  config/paths.js          # rutas absolutas a public/, images/, datasource/ y mapping.json
  services/
    datasourceService.js   # lee los .txt de datasource/
    mappingService.js       # lee/escribe mapping.json
  routes/
    datasources.js          # GET /api/datasources
    mapping.js               # GET/POST /api/mapping
  app.js                     # configuración de Express (middlewares, estáticos, rutas)
  server.js                  # arranque del servidor (PORT/HOST)

public/
  index.html
  styles/
    base.css                 # layout general, listas de arrastre, responsive
    map.css                  # mapa, toolbar, drop targets, etiquetas SVG
    modal.css                # modal de edición de mapeo
  js/
    main.js                   # orquestación: carga datos, listas, mapa y wiring
    api/client.js             # llamadas fetch a /api/datasources y /api/mapping
    utils/normalize.js         # normalizeKey
    data/islandGroups.js       # ISLAND_GROUPS + islandOf
    game/
      matching.js              # ITEM_KIND, isMatch, getIslandGroup
      gameState.js              # puntuación y grupos ya etiquetados
    ui/
      lists.js                  # listas de nombres arrastrables
      toolbar.js                 # botones de zoom, mapeo, guardar, solución
      notifications.js           # flashNotification
    svg/
      viewport.js                # zoom/pan sobre el viewBox del SVG
      svgLabels.js                # dibuja etiquetas y líneas guía sobre el mapa
      dropTargets.js              # lógica de arrastrar y soltar sobre el SVG
      mappingEditor.js             # modal manual de asignación forma -> nombre
      mappingState.js              # estado del mapeo manual y lista de nombres
      solution.js                  # overlay "ver solución"
```

Cada módulo de `public/js/` tiene una única responsabilidad y se importa con ES modules nativos (`<script type="module">`), sin necesidad de bundler.
