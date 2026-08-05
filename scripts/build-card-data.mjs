import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function nullable(value) {
  if (value === undefined || value === null) return null;
  return value;
}

function cardIdFromKey(key) {
  return String(key).replace(/__(1|2|3)$/, '');
}

function chunkNameForCardId(cardId) {
  const first = String(cardId).charAt(0).toLowerCase();
  return /^[a-z0-9]$/.test(first) ? first : '_';
}

function normalizeVariant(card) {
  return {
    pitch: nullable(card.pitch),
    cost: nullable(card.cost),
    power: nullable(card.power),
    defense: nullable(card.defense),
  };
}

function normalizeCard(cardId, entries) {
  const first = entries[0];
  const variants = {};

  for (const entry of entries) {
    const variantKey = entry.pitch === null || entry.pitch === undefined
      ? 'default'
      : String(entry.pitch);
    variants[variantKey] = normalizeVariant(entry);
  }

  return {
    id: cardId,
    name_zh: first.name_zh || '',
    name_en: first.name_en || '',
    type_zh: first.type_zh || '',
    text_zh: first.text_zh || '',
    text_en: first.text_en || '',
    source: first.source || '',
    status: first.status || '',
    variants,
  };
}

export function buildCardArtifacts(cardData) {
  const grouped = new Map();
  for (const [key, card] of Object.entries(cardData || {})) {
    const cardId = cardIdFromKey(key);
    if (!grouped.has(cardId)) grouped.set(cardId, []);
    grouped.get(cardId).push(card);
  }

  const cards = Object.fromEntries(
    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardId, entries]) => [cardId, normalizeCard(cardId, entries)]),
  );
  const sourceHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(cards))
    .digest('hex')
    .slice(0, 12);

  const chunks = {};
  const indexCards = {};
  for (const [cardId, card] of Object.entries(cards)) {
    const chunk = `chunks/${chunkNameForCardId(cardId)}.json`;
    if (!chunks[chunk]) {
      chunks[chunk] = {
        schema_version: 1,
        version: sourceHash,
        cards: {},
      };
    }
    chunks[chunk].cards[cardId] = card;
    indexCards[cardId] = { id: cardId, chunk };
  }

  const manifest = {
    schema_version: 1,
    version: sourceHash,
    index_file: 'index.json',
    chunk_files: Object.keys(chunks).sort(),
    card_count: Object.keys(cards).length,
  };
  const index = {
    schema_version: 1,
    version: sourceHash,
    cards: indexCards,
  };

  return { manifest, index, chunks };
}

export function writeCardArtifacts(cardData, outputDirectory) {
  const artifacts = buildCardArtifacts(cardData);
  fs.mkdirSync(path.join(outputDirectory, 'chunks'), { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'index.json'),
    `${JSON.stringify(artifacts.index, null, 2)}\n`,
  );
  for (const [relativePath, chunk] of Object.entries(artifacts.chunks)) {
    fs.writeFileSync(
      path.join(outputDirectory, relativePath),
      `${JSON.stringify(chunk, null, 2)}\n`,
    );
  }
  return artifacts;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInputDir = path.join(projectRoot, 'data/translations');
const defaultOutput = path.join(projectRoot, 'dist/data');

// Load every per-batch translation file under data/translations and merge them
// into a single card map. Translation source is managed per batch/module; this
// aggregate only exists in memory for the build.
export function loadZhTranslations(inputDir = defaultInputDir) {
  const files = fs.readdirSync(inputDir).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) {
    throw new Error(`No translation files found in ${inputDir}`);
  }
  const merged = {};
  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8'));
    for (const [key, value] of Object.entries(entries)) {
      if (merged[key]) {
        throw new Error(`Duplicate card key "${key}" across translation files (${file})`);
      }
      merged[key] = value;
    }
  }
  return merged;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputDir = process.argv[2] || defaultInputDir;
  const outputDirectory = process.argv[3] || defaultOutput;
  const cardData = loadZhTranslations(inputDir);
  const artifacts = writeCardArtifacts(cardData, outputDirectory);

  // Ship the printing-id alias table so the userscript can resolve FaBrary's
  // printing-id image filenames (e.g. "PEN313.webp") to our slug keys.
  const aliasesSource = path.join(projectRoot, 'data/talishar-card-aliases.json');
  if (fs.existsSync(aliasesSource)) {
    fs.copyFileSync(aliasesSource, path.join(outputDirectory, 'aliases.json'));
    console.log('Copied talishar-card-aliases.json to dist/data/aliases.json');
  }

  console.log(`Built ${artifacts.manifest.card_count} cards into ${outputDirectory}`);
}
