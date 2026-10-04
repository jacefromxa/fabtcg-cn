import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(projectRoot, 'dist', 'data');
const port = parseInt(process.env.PORT || process.argv[2] || '4173', 10);

const MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

function resolveSafePath(urlPath) {
  // Normalise and strip traversal segments so the result stays inside dataDir.
  const normalized = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const resolved = path.join(dataDir, normalized);
  if (!resolved.startsWith(dataDir + path.sep) && resolved !== dataDir) {
    return null;
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    console.log(`405 ${req.method} ${req.url}`);
    return;
  }

  const requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

  // Strip optional /data prefix so both /data/manifest.json and /manifest.json work.
  let relative = requestPath;
  if (relative.startsWith('/data/')) {
    relative = relative.slice('/data/'.length);
  }
  relative = relative.replace(/^\/+/, '');

  if (!relative) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('FABTCG CN Data Server OK');
    return;
  }

  const filePath = resolveSafePath(relative);

  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    console.log(`403 ${requestPath}`);
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      console.log(`404 ${requestPath}`);
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
    console.log(`200 ${requestPath}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
      console.log(`404 ${requestPath}`);
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
      console.error(`500 ${requestPath}: ${err.message}`);
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`FABTCG CN data server running at http://127.0.0.1:${port}/`);
  console.log(`Serving: ${dataDir}`);
  console.log(`Try:   http://127.0.0.1:${port}/manifest.json`);
});
