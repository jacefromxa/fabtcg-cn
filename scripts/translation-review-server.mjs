import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReviewData, listReviewCards } from './translation-review-data.mjs';
import { ReviewQueueError, writeSubmission } from './translation-review-queue.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultStaticDir = path.join(projectRoot, 'tools', 'translation-review');
const defaultTranslationsDir = path.join(projectRoot, 'data', 'translations');
const defaultEnglishPath = path.join(projectRoot, 'data', 'cards.en.json');
const defaultPendingDir = path.join(projectRoot, 'data', 'review-submissions', 'pending');
const MAX_BODY_BYTES = 1024 * 1024;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const extension = path.extname(filePath);
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

function staticPath(staticDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const root = path.resolve(staticDir);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  if (!['index.html', 'app.js', 'styles.css'].includes(path.basename(resolved))) return null;
  return resolved;
}

function requestUrl(req) {
  try {
    return new URL(req.url || '/', 'http://127.0.0.1');
  } catch {
    throw new HttpError(400, 'Invalid request URL');
  }
}

async function handleRequest(req, res, config) {
  const url = requestUrl(req);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/health' && req.method !== 'GET') {
      throw new HttpError(405, 'Method Not Allowed');
    }
    if (pathname === '/api/batches' && req.method !== 'GET') {
      throw new HttpError(405, 'Method Not Allowed');
    }
    if (pathname === '/api/cards' && req.method !== 'GET') {
      throw new HttpError(405, 'Method Not Allowed');
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && pathname === '/api/batches') {
      const data = loadReviewData(config);
      sendJson(res, 200, data.batches);
      return;
    }
    if (req.method === 'GET' && pathname === '/api/cards') {
      const batch = url.searchParams.get('batch');
      if (!batch) throw new HttpError(400, 'batch is required');
      const data = loadReviewData(config);
      sendJson(res, 200, listReviewCards(data, {
        batch,
        q: url.searchParams.get('q') || '',
        page: url.searchParams.get('page') || 1,
        pageSize: url.searchParams.get('page_size') || 50,
      }));
      return;
    }
    if (pathname === '/api/submissions') {
      if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'Content-Type must be application/json');
      }
      const payload = await readJsonBody(req);
      const data = loadReviewData(config);
      const result = writeSubmission(payload, {
        reviewData: data,
        pendingDir: config.pendingDir,
      });
      sendJson(res, 201, {
        fileName: result.fileName,
        changeCount: result.changeCount,
      });
      return;
    }
    throw new HttpError(404, 'Not Found');
  }

  if (req.method !== 'GET') throw new HttpError(405, 'Method Not Allowed');
  const filePath = staticPath(config.staticDir, pathname);
  if (!filePath || !fs.existsSync(filePath)) throw new HttpError(404, 'Not Found');
  sendFile(res, filePath);
}

export function createReviewServer({
  staticDir = defaultStaticDir,
  translationsDir = defaultTranslationsDir,
  englishPath = defaultEnglishPath,
  pendingDir = defaultPendingDir,
  port = 4174,
} = {}) {
  const config = { staticDir, translationsDir, englishPath, pendingDir };
  const server = http.createServer((req, res) => {
    handleRequest(req, res, config).catch((error) => {
      if (error instanceof ReviewQueueError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else if (error instanceof HttpError) {
        sendJson(res, error.statusCode, { error: error.message });
      } else {
        console.error('[translation-review] request failed:', error);
        sendJson(res, 500, { error: 'Internal Server Error' });
      }
    });
  });
  return { server, port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || process.argv[2] || 4174);
  const { server } = createReviewServer({ port });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Translation review tool running at http://127.0.0.1:${port}/`);
    console.log('Pending submissions: data/review-submissions/pending/');
  });
}
