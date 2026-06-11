const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
