import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../talishar-cn.user.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const browserSandbox = { URL };
browserSandbox.window = browserSandbox;
runInNewContext(source, browserSandbox, { filename: sourcePath });

test('remote loader fetches the manifest, index, and only the matching chunk', async () => {
  const calls = [];
  const responses = {
    'https://data.example/manifest.json': {
      schema_version: 1,
      version: 'abc123',
      index_file: 'index.json',
    },
    'https://data.example/index.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        titans_fist: { id: 'titans_fist', chunk: 'chunks/t.json' },
      },
    },
    'https://data.example/chunks/t.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        titans_fist: { id: 'titans_fist', name_zh: '泰坦之拳' },
      },
    },
  };
  const cache = {
    async match() {
      return undefined;
    },
    async put() {},
  };
  const root = {
    fetch: async (url) => {
      calls.push(url);
      return {
        ok: true,
        async json() {
          return responses[url];
        },
        clone() {
          return this;
        },
      };
    },
    caches: {
      async open() {
        return cache;
      },
    },
  };
  const loader = browserSandbox.FabCnProbe.createCardDataLoader(root, 'https://data.example');
  const result = await loader.loadCardForElement({
    tagName: 'IMG',
    src: 'https://images.example/cards/titans_fist.webp',
    attributes: [
      { name: 'src', value: 'https://images.example/cards/titans_fist.webp' },
    ],
  });

  assert.equal(result.key, 'titans_fist');
  assert.equal(result.card.name_zh, '泰坦之拳');
  assert.deepEqual(calls, [
    'https://data.example/manifest.json',
    'https://data.example/index.json',
    'https://data.example/chunks/t.json',
  ]);
});

test('remote loader falls back to the userscript request API when page fetch is blocked', async () => {
  const requests = [];
  let cachePuts = 0;
  const responses = {
    'https://data.example/manifest.json': {
      schema_version: 1,
      version: 'abc123',
      index_file: 'index.json',
    },
    'https://data.example/index.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        titans_fist: { id: 'titans_fist', chunk: 'chunks/t.json' },
      },
    },
    'https://data.example/chunks/t.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        titans_fist: { id: 'titans_fist', name_zh: '泰坦之拳' },
      },
    },
  };
  const fallbackSandbox = {
    URL,
    GM_xmlhttpRequest(options) {
      requests.push(options.url);
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify(responses[options.url]),
      }));
    },
  };
  fallbackSandbox.window = fallbackSandbox;
  runInNewContext(source, fallbackSandbox, { filename: sourcePath });

  const loader = fallbackSandbox.FabCnProbe.createCardDataLoader({
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    caches: {
      async open() {
        return {
          async match() { return undefined; },
          async put() { cachePuts += 1; },
        };
      },
      async keys() { return []; },
    },
  }, 'https://data.example');
  const result = await loader.loadCardForElement({
    tagName: 'IMG',
    src: 'https://images.example/cards/titans_fist.webp',
    attributes: [{ name: 'src', value: 'https://images.example/cards/titans_fist.webp' }],
  });

  assert.equal(result.key, 'titans_fist');
  assert.equal(result.card.name_zh, '泰坦之拳');
  assert.deepEqual(requests, [
    'https://data.example/manifest.json',
    'https://data.example/index.json',
    'https://data.example/chunks/t.json',
  ]);
  assert.equal(cachePuts, 0, 'GM responses have no Fetch Response clone to cache');
});

test('remote loader resolves a printing-id pitch before falling back to alt text', async () => {
  const responses = {
    'https://data.example/manifest.json': {
      schema_version: 1,
      version: 'abc123',
      index_file: 'index.json',
    },
    'https://data.example/index.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        boulder_drop: { id: 'boulder_drop', chunk: 'chunks/t.json' },
      },
    },
    'https://data.example/aliases.json': {
      TCC039: { slug: 'boulder_drop', pitch: '2' },
    },
    'https://data.example/chunks/t.json': {
      schema_version: 1,
      version: 'abc123',
      cards: {
        boulder_drop: {
          id: 'boulder_drop',
          name_zh: '巨石坠击',
          text_zh: '红色效果',
          variants: {
            '1': { pitch: '1', text_zh: '红色效果' },
            '2': { pitch: '2', text_zh: '黄色效果', power: '6' },
          },
        },
      },
    },
  };
  const calls = [];
  const root = {
    fetch: async (url) => {
      calls.push(url);
      return {
        ok: true,
        async json() {
          return responses[url];
        },
        clone() {
          return this;
        },
      };
    },
    caches: {
      async open() {
        return {
          async match() { return undefined; },
          async put() {},
        };
      },
    },
  };
  const loader = browserSandbox.FabCnProbe.createCardDataLoader(root, 'https://data.example');
  const result = await loader.loadCardForElement({
    tagName: 'IMG',
    src: 'https://content.fabrary.net/cards/tcc039.webp',
    alt: 'Boulder Drop',
    attributes: [
      { name: 'src', value: 'https://content.fabrary.net/cards/tcc039.webp' },
      { name: 'alt', value: 'Boulder Drop' },
    ],
  });

  assert.equal(result.pitch, '2');
  assert.equal(result.card.text_zh, '黄色效果');
  assert.equal(result.card.power, '6');
  assert.equal(result.resolution.stage, 'alias');
  assert.equal(result.resolution.aliasStatus, 'loaded');
  assert.ok(calls.includes('https://data.example/aliases.json'));
});
