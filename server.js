const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
