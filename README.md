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
