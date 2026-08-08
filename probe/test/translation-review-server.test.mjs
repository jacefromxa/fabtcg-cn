import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createReviewServer } from '../../scripts/translation-review-server.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startFixtureServer() {
  const root = tempDir('fab-cn-review-server-');
  const translationsDir = path.join(root, 'translations');
  const staticDir = path.join(root, 'static');
  const pendingDir = path.join(root, 'pending');
  fs.mkdirSync(translationsDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.writeFileSync(path.join(translationsDir, 't3-guardian.json'), JSON.stringify({
    boulder_drop__1: {
      name_en: 'Boulder Drop', name_zh: '巨石一击', text_zh: '粉碎一。',
      pitch: '1', cost: '3', power: '7', defense: '3', source: 'https://cards.example/boulder',
    },
    boulder_drop__2: {
      name_en: 'Boulder Drop', name_zh: '巨石二击', text_zh: '粉碎二。',
      pitch: '2', cost: '3', power: '6', defense: '3', source: 'https://cards.example/boulder',
    },
    titan_fist: {
      name_en: "Titan's Fist", name_zh: '泰坦之拳', text_zh: '攻击。',
      pitch: null, cost: null, power: '3', defense: null, source: 'https://cards.example/titan',
    },
  }));
  const englishPath = path.join(root, 'cards.en.json');
  fs.writeFileSync(englishPath, JSON.stringify({
    boulder_drop: { name_en: 'Boulder Drop', printings: [{ image_url: 'https://images.example/boulder.webp' }] },
    titan_fist: { name_en: "Titan's Fist", printings: [] },
  }));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>review</title>');
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'console.log("review");');
  fs.writeFileSync(path.join(staticDir, 'styles.css'), 'body { color: black; }');

  const { server } = createReviewServer({
    staticDir,
    translationsDir,
    englishPath,
    pendingDir,
    port: 0,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  return { root, pendingDir, server, baseUrl: `http://127.0.0.1:${port}` };
}

test('serves health and static assets while blocking traversal', async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.server.close());

  const health = await fetch(`${fixture.baseUrl}/api/health`);
  const html = await fetch(`${fixture.baseUrl}/`);
  const script = await fetch(`${fixture.baseUrl}/app.js`);
  const traversal = await fetch(`${fixture.baseUrl}/../cards.en.json`);

  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal(traversal.status, 404);
});

test('returns batches and paginated card rows with search', async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.server.close());

  const batches = await fetch(`${fixture.baseUrl}/api/batches`);
  const cards = await fetch(`${fixture.baseUrl}/api/cards?batch=t3-guardian&q=泰坦&page=1&page_size=1`);

  assert.equal(batches.status, 200);
  assert.deepEqual(await batches.json(), [{ name: 't3-guardian', row_count: 2 }]);
  assert.equal(cards.status, 200);
  const body = await cards.json();
  assert.equal(body.total, 1);
  assert.equal(body.items[0].card_id, 'titan_fist');
  assert.equal(body.items[0].image_url, null);
});

test('writes a valid POST submission into the pending directory', async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.server.close());
  const response = await fetch(`${fixture.baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      changes: [{
        card_id: 'boulder_drop',
        batch: 't3-guardian',
        name_en: 'Boulder Drop',
        new_name_zh: '巨石坠击',
        variants: [
          { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
          { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
        ],
      }],
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.changeCount, 1);
  assert.match(body.fileName, /^submission-.*\.json$/);
  const files = fs.readdirSync(fixture.pendingDir);
  assert.deepEqual(files, [body.fileName]);
});

test('returns precise errors for malformed input, missing batch, wrong content type, and methods', async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.server.close());

  const malformed = await fetch(`${fixture.baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  const missingBatch = await fetch(`${fixture.baseUrl}/api/cards`);
  const wrongType = await fetch(`${fixture.baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  });
  const method = await fetch(`${fixture.baseUrl}/api/health`, { method: 'PUT' });

  assert.equal(malformed.status, 400);
  assert.equal(missingBatch.status, 400);
  assert.equal(wrongType.status, 415);
  assert.equal(method.status, 405);
});
