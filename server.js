const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Serve static frontend and images
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// API: read all txt files in datasource and return JSON mapping filename -> lines[]
app.get('/api/datasources', (req, res) => {
  const dsDir = path.join(__dirname, 'datasource');
  fs.readdir(dsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to read datasource directory' });
    const txtFiles = files.filter(f => f.toLowerCase().endsWith('.txt'));
    const result = {};
    txtFiles.forEach((file) => {
      const content = fs.readFileSync(path.join(dsDir, file), 'utf8');
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      result[file] = lines;
    });
    res.json(result);
  });
});

// Mapping endpoints: load and save mapping.json
const MAPPING_PATH = path.join(__dirname, 'mapping.json');
app.get('/api/mapping', (req, res) => {
  try{
    if(fs.existsSync(MAPPING_PATH)){
      const data = fs.readFileSync(MAPPING_PATH, 'utf8');
      return res.json(JSON.parse(data));
    }
    return res.json({});
  }catch(err){
    return res.status(500).json({ error: 'Failed to read mapping' });
  }
});

app.post('/api/mapping', (req, res) => {
  try{
    const mapping = req.body || {};
    fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), 'utf8');
    return res.json({ ok: true });
  }catch(err){
    return res.status(500).json({ error: 'Failed to save mapping' });
  }
});

// Try automatic mapping by scanning SVG attributes and matching datasource names
app.post('/api/auto-mapping', (req, res) => {
  try{
    const svgText = fs.readFileSync(path.join(__dirname, 'images', 'mapa-municipal-de-les-illes-balears.svg'), 'utf8');
    // simple regex to find shape elements and capture id/inkscape:label/name attributes
    const shapeRegex = /<(g|path|polygon|rect|circle|ellipse)([^>]*)>/gi;
    const attrRegex = /(id|data-name|inkscape:label|name)\s*=\s*"([^"]+)"/gi;
    const shapes = [];
    let m;
    while((m = shapeRegex.exec(svgText)) !== null){
      const tag = m[1]; const attrs = m[2];
      const info = { tag, raw: attrs, attrsFound: {} };
      let a;
      while((a = attrRegex.exec(attrs)) !== null){
        info.attrsFound[a[1]] = a[2];
      }
      shapes.push(info);
    }

    // load municipalities
    const dsDir = path.join(__dirname, 'datasource');
    const files = fs.readdirSync(dsDir).filter(f => f.toLowerCase().endsWith('.txt'));
    const municipalities = [];
    files.forEach(file => {
      const lines = fs.readFileSync(path.join(dsDir, file), 'utf8').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      municipalities.push(...lines);
    });

    const norm = s => (s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0000-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const mapping = {};
    const used = new Set();
    municipalities.forEach(name => {
      const n = norm(name);
      for(let i=0;i<shapes.length;i++){
        if(used.has(i)) continue;
        const attrs = Object.values(shapes[i].attrsFound||{}).map(a=>norm(a));
        if(attrs.includes(n) || attrs.some(a=> a.includes(n))){
          mapping[i] = name; used.add(i); break;
        }
      }
    });

    // save mapping
    fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), 'utf8');
    return res.json({ mapping, count: Object.keys(mapping).length });
  }catch(err){
    console.error(err);
    return res.status(500).json({ error: 'auto-mapping failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
