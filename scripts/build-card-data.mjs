import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { slugifyCardName } from './translate-helper.mjs';

function nullable(value) {
  if (value === undefined || value === null) return null;
  return value;
}

function cardIdFromKey(key) {
  return String(key).replace(/__(1|2|3)$/, '');
}

const PITCH_SENSITIVE_TOKEN_PATTERN = /(?:\{[a-z]\})+|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|once|twice|thrice|red|yellow|blue)\b|\d+(?:\.\d+)?/gi;

function pitchSensitiveSignature(text) {
  const value = String(text || '');
  const tokens = [...value.matchAll(PITCH_SENSITIVE_TOKEN_PATTERN)]
    .map((match) => match[0].toLowerCase());
  return `${value.split('\n').length}:${tokens.join('|')}`;
}

// Detect source records where every pitch still carries the same Chinese
// prose even though the English source contains a pitch-sensitive difference
// (numbers, resource-symbol counts, colors, or line counts). This is kept at
// build time so a future machine-draft import cannot silently regress the
// grouped runtime data back to the red pitch.
export function findPitchTranslationIssues(cardData) {
  const grouped = new Map();
  for (const [key, card] of Object.entries(cardData || {})) {
    const match = key.match(/^(.*)__(1|2|3)$/);
    if (!match) continue;
    const entries = grouped.get(match[1]) || [];
    entries.push({ key, card });
    grouped.set(match[1], entries);
  }

  const issues = [];
  for (const [cardId, entries] of grouped) {
    if (entries.length < 2) continue;
    const englishSignatures = new Set(
      entries.map(({ card }) => pitchSensitiveSignature(card.text_en)),
    );
    const chineseTexts = new Set(entries.map(({ card }) => card.text_zh || ''));
    if (englishSignatures.size > 1 && chineseTexts.size === 1) {
      issues.push({
        cardId,
        keys: entries.map(({ key }) => key),
        text_zh: entries[0].card.text_zh || '',
      });
    }
  }
  return issues;
}

function normalizeVariant(card, primary) {
  const variant = {
    pitch: nullable(card.pitch),
    cost: nullable(card.cost),
    power: nullable(card.power),
    defense: nullable(card.defense),
  };

  // Most pitch versions share their display text. Keep only non-empty fields
  // that differ from the primary version so the published record remains
  // compact while still allowing the runtime to render pitch-specific text.
  for (const field of ['name_zh', 'type_zh', 'text_zh']) {
    if (card[field] && card[field] !== primary[field]) {
      variant[field] = card[field];
    }
  }
  return variant;
}

function normalizeCard(cardId, entries) {
  // Primary display fields come from a human-reviewed entry when one exists;
  // fall back to the first entry otherwise. Without this, a confirmed bare key
  // sitting after its empty machine-draft pitch variants in a batch file would
  // be shadowed by them in the published chunk.
  const first = entries.find((e) => e.status === 'human-reviewed') || entries[0];
  const variants = {};

  for (const entry of entries) {
    const variantKey = entry.pitch === null || entry.pitch === undefined
      ? 'default'
      : String(entry.pitch);
    variants[variantKey] = normalizeVariant(entry, first);
  }

  return {
    id: cardId,
    name_zh: first.name_zh || '',
    name_en: first.name_en || '',
    type_zh: first.type_zh || '',
    type_en: first.type_en || '',
    text_zh: first.text_zh || '',
    text_en: first.text_en || '',
    source: first.source || '',
    status: first.status || '',
    keywords: first.keywords || [],
    variants,
  };
}

export function buildCardArtifacts(cardData, cardBatch) {
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

  // Chunk by translation batch (the file each card came from) instead of by
  // first letter, so editing data/translations/<batch>.json maps to a chunk of
  // the same name. Cards without batch info fall into a misc "_" chunk.
  const chunks = {};
  const indexCards = {};
  for (const [cardId, card] of Object.entries(cards)) {
    const batchName = (cardBatch && cardBatch[cardId]) || '_';
    const chunk = `chunks/${batchName}.json`;
    if (!chunks[chunk]) {
      chunks[chunk] = {
        schema_version: 2,
        version: sourceHash,
        cards: {},
      };
    }
    chunks[chunk].cards[cardId] = card;
    indexCards[cardId] = { id: cardId, chunk };
  }

  const manifest = {
    schema_version: 2,
    version: sourceHash,
    index_file: 'index.json',
    chunk_files: Object.keys(chunks).sort(),
    card_count: Object.keys(cards).length,
  };
  const index = {
    schema_version: 2,
    version: sourceHash,
    cards: indexCards,
  };

  return { manifest, index, chunks };
}

export function writeCardArtifacts(cardData, cardBatch, outputDirectory) {
  const artifacts = buildCardArtifacts(cardData, cardBatch);
  // Remove stale chunk files first so a chunking-scheme change (or a removed
  // batch) never leaves orphan files behind in the published directory.
  const chunksDir = path.join(outputDirectory, 'chunks');
  fs.rmSync(chunksDir, { recursive: true, force: true });
  fs.mkdirSync(chunksDir, { recursive: true });
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
  const cards = {};
  // base slug -> translation batch file base name (e.g. 't3-warrior'), used to
  // chunk the published data by the same batches that translators maintain.
  const cardBatch = {};
  for (const file of files) {
    const batchName = file.replace(/\.json$/, '');
    const entries = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8'));
    for (const [key, value] of Object.entries(entries)) {
      if (cards[key]) {
        throw new Error(`Duplicate card key "${key}" across translation files (${file})`);
      }
      cards[key] = value;
      const base = cardIdFromKey(key);
      if (!cardBatch[base]) cardBatch[base] = batchName;
    }
  }
  return { cards, cardBatch };
}

// The keyword library shipped to the runtime: lowercased English keyword name
// -> { name_zh, desc_zh }, derived from data/glossary.zh-CN.json "keyword".
export function buildKeywordLibrary(glossary) {
  const library = {};
  for (const [keyword, entry] of Object.entries(glossary.keyword || {})) {
    if (!entry || !entry.name_zh) continue;
    library[String(keyword).toLowerCase()] = {
      name_zh: entry.name_zh,
      desc_zh: entry.desc_zh || '',
    };
  }
  return library;
}

// A card keyword resolves in the library either verbatim or as a numbered
// variant ("Arcane Barrier 1" -> "arcane barrier"). Specializations and type
// names ("Rhinar Specialization", "Attack") have no library entry and are
// dropped, so only real mechanic keywords reach the tooltip.
export function resolvesKeyword(keyword, library) {
  const key = String(keyword).toLowerCase();
  if (library[key]) return true;
  return Boolean(library[key.replace(/ \d+$| x$/, '')]);
}

// Join each translated card with its English card_keywords, keeping only the
// keywords that resolve in the glossary keyword library.
export function attachCardKeywords(cardData, englishCards, library) {
  const keywordsById = new Map();
  for (const card of englishCards) {
    if (!Array.isArray(card.card_keywords) || card.card_keywords.length === 0) continue;
    const id = slugifyCardName(card.name);
    if (!id) continue;
    keywordsById.set(id, card.card_keywords);
  }
  const result = {};
  for (const [key, entry] of Object.entries(cardData)) {
    const id = cardIdFromKey(key);
    const raw = keywordsById.get(id) || [];
    const kept = raw.filter((k) => resolvesKeyword(k, library));
    result[key] = kept.length ? { ...entry, keywords: kept } : entry;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputDir = process.argv[2] || defaultInputDir;
  const outputDirectory = process.argv[3] || defaultOutput;
  const { cards, cardBatch } = loadZhTranslations(inputDir);

  // Attach mechanic keywords to each card and ship the keyword library so the
  // tooltip can explain them. Translation source files are never modified.
  const englishSource = path.join(projectRoot, 'data/source/english/card.json');
  const glossarySource = path.join(projectRoot, 'data/glossary.zh-CN.json');
  const keywordLibrary = fs.existsSync(glossarySource)
    ? buildKeywordLibrary(JSON.parse(fs.readFileSync(glossarySource, 'utf8')))
    : {};
  const enriched = fs.existsSync(englishSource)
    ? attachCardKeywords(cards, JSON.parse(fs.readFileSync(englishSource, 'utf8')), keywordLibrary)
    : cards;

  const pitchIssues = findPitchTranslationIssues(enriched);
  if (pitchIssues.length) {
    const examples = pitchIssues.slice(0, 10).map((issue) => issue.cardId).join(', ');
    throw new Error(
      `Pitch translation audit failed for ${pitchIssues.length} card groups (${examples}). ` +
      'Run scripts/repair-pitch-translations.mjs and review the source data.',
    );
  }

  const artifacts = writeCardArtifacts(enriched, cardBatch, outputDirectory);

  // Ship the printing-id alias table so the userscript can resolve FaBrary's
  // printing-id image filenames (e.g. "PEN313.webp") to our slug keys.
  const aliasesSource = path.join(projectRoot, 'data/fabtcg-card-aliases.json');
  if (fs.existsSync(aliasesSource)) {
    fs.copyFileSync(aliasesSource, path.join(outputDirectory, 'aliases.json'));
    console.log('Copied fabtcg-card-aliases.json to dist/data/aliases.json');
  }

  // Ship the keyword explanation library for the tooltip keyword section.
  if (Object.keys(keywordLibrary).length) {
    fs.writeFileSync(
      path.join(outputDirectory, 'keywords.json'),
      `${JSON.stringify(keywordLibrary, null, 2)}\n`,
      'utf8',
    );
    console.log(`Wrote keywords.json (${Object.keys(keywordLibrary).length} keywords) to dist/data/keywords.json`);
  }

  console.log(`Built ${artifacts.manifest.card_count} cards into ${outputDirectory}`);
}
