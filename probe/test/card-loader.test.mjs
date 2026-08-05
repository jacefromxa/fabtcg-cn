import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../probe.user.js', import.meta.url));
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
