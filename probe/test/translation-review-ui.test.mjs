import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const uiDir = path.join(projectRoot, 'tools', 'translation-review');

test('translation review UI ships its three-column shell and controls', () => {
  const htmlPath = path.join(uiDir, 'index.html');
  const appPath = path.join(uiDir, 'app.js');
  const cssPath = path.join(uiDir, 'styles.css');
  assert.equal(fs.existsSync(htmlPath), true);
  assert.equal(fs.existsSync(appPath), true);
  assert.equal(fs.existsSync(cssPath), true);

  const html = fs.readFileSync(htmlPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(html, /id=["']batch-tabs["']/);
  assert.match(html, /id=["']search-input["']/);
  assert.match(html, /id=["']card-table-body["']/);
  assert.match(html, /卡名/);
  assert.match(html, /现译名/);
  assert.match(html, /更新译名/);
  assert.match(html, /id=["']submit-button["']/);
  assert.match(html, /id=["']card-preview["']/);
  assert.match(app, /\/api\/batches/);
  assert.match(app, /\/api\/cards/);
  assert.match(app, /\/api\/submissions/);
  assert.match(app, /textContent/);
  assert.doesNotMatch(app, /innerHTML/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /sticky/);
});
