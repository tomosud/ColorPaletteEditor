const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const files = ['index.html', 'style.css', 'app.js'];
const dirs = ['format'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

for (const dir of dirs) {
  fs.cpSync(path.join(root, dir), path.join(outDir, dir), { recursive: true });
}

fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

