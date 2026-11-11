const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const types = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'
};
const imageTypes = new Set(['.png','.jpg','.jpeg','.webp','.svg','.ico']);
const port = Number(process.env.PORT) || 4173;
http.createServer((req,res) => {
  const name = req.url === '/' ? '/index.html' : (req.url || '').split('?')[0];
  const file = path.resolve(root, `.${decodeURIComponent(name)}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root,'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file,(err,body) => {
    if (err) {res.writeHead(404);res.end('Not found');return;}
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200,{'Content-Type':types[ext] || 'application/octet-stream','Cache-Control':imageTypes.has(ext) ? 'public, max-age=3600' : 'no-store'});
    res.end(body);
  });
}).listen(port,'127.0.0.1',() => console.log(`Speaking AI Pro: http://127.0.0.1:${port}`));
