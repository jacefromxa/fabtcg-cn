import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseCardId } from './translation-review-data.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTranslationsDir = path.join(projectRoot, 'data', 'translations');
const defaultPendingDir = path.join(projectRoot, 'data', 'review-submissions', 'pending');
const defaultProcessedDir = path.join(projectRoot, 'data', 'review-submissions', 'processed');

export class ReviewApplyError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ReviewApplyError';
    this.details = details;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeBatchPath(translationsDir, batch) {
  if (typeof batch !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(batch)) return null;
  const root = path.resolve(translationsDir);
  const filePath = path.resolve(root, `${batch}.json`);
  return filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

function writeJsonAtomic(filePath, value) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function validateQueueDocument(document) {
  if (!document || document.schema_version !== 1 || !Array.isArray(document.changes) || document.changes.length === 0) {
    throw new ReviewApplyError('Invalid translation review queue document', [
      { card_id: '(document)', reason: 'schema_version 1 and a non-empty changes array are required' },
    ]);
  }
}

export function applySubmissionFile(filePath, {
  translationsDir = defaultTranslationsDir,
  processedDir = defaultProcessedDir,
  now = () => new Date(),
} = {}) {
  const document = readJson(filePath);
  validateQueueDocument(document);
  const details = [];
  const seenCards = new Set();
  const sourceByBatch = new Map();
  const pathByBatch = new Map();
  const updatesByBatch = new Map();

  for (const change of document.changes) {
    const cardId = typeof change?.card_id === 'string' ? change.card_id : '';
    const batch = typeof change?.batch === 'string' ? change.batch : '';
    if (seenCards.has(cardId)) {
      details.push({ card_id: cardId, reason: 'duplicate card' });
      continue;
    }
    seenCards.add(cardId);

    const batchPath = safeBatchPath(translationsDir, batch);
    if (!batchPath || !fs.existsSync(batchPath)) {
      details.push({ card_id: cardId, reason: `batch file not found: ${batch}` });
      continue;
    }
    if (!Array.isArray(change.variants) || !change.variants.length || typeof change.new_name_zh !== 'string' || !change.new_name_zh.trim()) {
      details.push({ card_id: cardId, reason: 'change requires a non-empty new_name_zh and variants array' });
      continue;
    }

    if (!sourceByBatch.has(batch)) {
      sourceByBatch.set(batch, readJson(batchPath));
      pathByBatch.set(batch, batchPath);
    }
    const source = sourceByBatch.get(batch);
    const sourceKeys = Object.keys(source).filter((key) => baseCardId(key) === cardId).sort();
    const submittedKeys = change.variants.map((variant) => variant?.key).sort();
    if (sourceKeys.length !== submittedKeys.length || sourceKeys.some((key, index) => key !== submittedKeys[index])) {
      details.push({ card_id: cardId, reason: 'source variants no longer match the submission snapshot' });
      continue;
    }
    const seenVariants = new Set();
    for (const variant of change.variants) {
      if (!variant || typeof variant.key !== 'string' || seenVariants.has(variant.key)) {
        details.push({ card_id: cardId, reason: 'duplicate or invalid variant key' });
        continue;
      }
      seenVariants.add(variant.key);
      if (!source[variant.key] || source[variant.key].name_zh !== variant.current_name_zh) {
        details.push({ card_id: cardId, reason: `stale name snapshot for ${variant.key}` });
      }
    }
    if (!updatesByBatch.has(batch)) updatesByBatch.set(batch, []);
    updatesByBatch.get(batch).push({ cardId, newName: change.new_name_zh.trim(), variants: change.variants });
  }

  if (details.length) throw new ReviewApplyError('Translation review submission conflicts with current source', details);

  const updatedByBatch = new Map();
  for (const [batch, updates] of updatesByBatch) {
    const updated = structuredClone(sourceByBatch.get(batch));
    for (const update of updates) {
      for (const variant of update.variants) updated[variant.key].name_zh = update.newName;
    }
    updatedByBatch.set(batch, updated);
  }
  for (const [batch, updated] of updatedByBatch) writeJsonAtomic(pathByBatch.get(batch), updated);

  fs.mkdirSync(processedDir, { recursive: true });
  const processedPath = path.join(processedDir, path.basename(filePath));
  if (fs.existsSync(processedPath)) {
    throw new ReviewApplyError('Processed submission already exists', [
      { card_id: '(document)', reason: processedPath },
    ]);
  }
  fs.renameSync(filePath, processedPath);
  const processedTime = now();
  const processedDocument = {
    ...document,
    processed_at: (processedTime instanceof Date ? processedTime : new Date(processedTime)).toISOString(),
  };
  writeJsonAtomic(processedPath, processedDocument);

  return {
    cardCount: document.changes.length,
    variantCount: document.changes.reduce((sum, change) => sum + change.variants.length, 0),
    processedPath,
  };
}

function listPending(pendingDir) {
  if (!fs.existsSync(pendingDir)) return [];
  return fs.readdirSync(pendingDir)
    .filter((file) => file.startsWith('submission-') && file.endsWith('.json'))
    .sort()
    .map((file) => path.join(pendingDir, file));
}

export function applyPendingSubmissions({
  pendingDir = defaultPendingDir,
  processedDir = defaultProcessedDir,
  translationsDir = defaultTranslationsDir,
} = {}) {
  const files = listPending(pendingDir);
  const results = [];
  for (const filePath of files) {
    results.push(applySubmissionFile(filePath, { translationsDir, processedDir }));
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  try {
    const results = filePath
      ? [applySubmissionFile(path.resolve(filePath))]
      : applyPendingSubmissions();
    for (const result of results) {
      console.log(`Applied ${result.cardCount} cards / ${result.variantCount} variants -> ${result.processedPath}`);
    }
  } catch (error) {
    console.error(error.message);
    if (error.details) {
      for (const detail of error.details) console.error(`  ${detail.card_id}: ${detail.reason}`);
    }
    process.exitCode = 1;
  }
}
