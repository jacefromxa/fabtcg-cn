import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTranslationsDir = path.join(projectRoot, 'data', 'translations');
const defaultEnglishPath = path.join(projectRoot, 'data', 'cards.en.json');

export function baseCardId(key) {
  return String(key).replace(/__(1|2|3)$/, '');
}

function firstUsableImage(card) {
  if (!card || !Array.isArray(card.printings)) return null;
  const printing = card.printings.find((item) => item && typeof item.image_url === 'string' && item.image_url.trim());
  return printing ? printing.image_url.trim() : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildRow(batch, cardId, entries, englishById) {
  const sortedEntries = [...entries].sort(([left], [right]) => left.localeCompare(right));
  const variants = sortedEntries.map(([key, entry]) => ({
    key,
    pitch: entry.pitch ?? null,
    name_zh: entry.name_zh || '',
    text_zh: entry.text_zh || '',
    cost: entry.cost ?? null,
    power: entry.power ?? null,
    defense: entry.defense ?? null,
  }));
  const firstEntry = sortedEntries[0]?.[1] || {};
  const english = englishById[cardId] || {};
  const names = Object.fromEntries(variants.map((variant) => [variant.key, variant.name_zh]));
  const uniqueNames = [...new Set(Object.values(names))];

  return {
    card_id: cardId,
    batch,
    name_en: firstEntry.name_en || english.name_en || cardId,
    image_url: firstUsableImage(english),
    source: firstEntry.source || '',
    current_names: names,
    current_name: uniqueNames.length === 1 ? uniqueNames[0] : null,
    variants,
  };
}

export function loadReviewData({
  translationsDir = defaultTranslationsDir,
  englishPath = defaultEnglishPath,
} = {}) {
  const englishById = readJson(englishPath);
  const rowsByBatch = new Map();
  const files = fs.readdirSync(translationsDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  for (const file of files) {
    const batch = file.replace(/\.json$/, '');
    const entries = readJson(path.join(translationsDir, file));
    const grouped = new Map();
    for (const [key, entry] of Object.entries(entries)) {
      const cardId = baseCardId(key);
      if (!grouped.has(cardId)) grouped.set(cardId, []);
      grouped.get(cardId).push([key, entry]);
    }
    const rows = [...grouped.entries()]
      .map(([cardId, cardEntries]) => buildRow(batch, cardId, cardEntries, englishById))
      .sort((left, right) => left.name_en.localeCompare(right.name_en));
    rowsByBatch.set(batch, rows);
  }

  return {
    batches: [...rowsByBatch.entries()].map(([name, rows]) => ({
      name,
      row_count: rows.length,
    })),
    rowsByBatch,
  };
}

export function listReviewCards(data, {
  batch,
  q = '',
  page = 1,
  pageSize = 50,
} = {}) {
  const sourceRows = data.rowsByBatch.get(batch) || [];
  const query = String(q || '').trim().toLocaleLowerCase();
  const filtered = query
    ? sourceRows.filter((row) => {
      const haystack = [
        row.card_id,
        row.name_en,
        ...Object.values(row.current_names),
      ].join('\n').toLocaleLowerCase();
      return haystack.includes(query);
    })
    : sourceRows;
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
  const total = filtered.length;
  const totalPages = total ? Math.ceil(total / normalizedPageSize) : 0;
  const requestedPage = Math.max(1, Number(page) || 1);
  const currentPage = totalPages ? Math.min(requestedPage, totalPages) : 1;
  const start = (currentPage - 1) * normalizedPageSize;

  return {
    items: filtered.slice(start, start + normalizedPageSize),
    total,
    page: currentPage,
    pageSize: normalizedPageSize,
    totalPages,
  };
}
