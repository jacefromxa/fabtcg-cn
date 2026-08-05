import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function nullable(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function slugifyCardName(name) {
  return String(name || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeCardRecord(card) {
  return {
    source_unique_id: nullable(card.unique_id),
    name_en: nullable(card.name),
    pitch: nullable(card.pitch),
    cost: nullable(card.cost),
    power: nullable(card.power),
    defense: nullable(card.defense),
    types: Array.isArray(card.types) ? card.types.map(String) : [],
    text_en: nullable(card.functional_text_plain || card.functional_text) || '',
    type_en: nullable(card.type_text) || '',
    printings: Array.isArray(card.printings)
      ? card.printings.map((printing) => ({
          id: nullable(printing.id),
          set_id: nullable(printing.set_id),
          image_url: nullable(printing.image_url),
        }))
      : [],
  };
}

export function buildEnglishIndex(cards) {
  const index = {};

  for (const card of Array.isArray(cards) ? cards : []) {
    const normalized = normalizeCardRecord(card);
    const baseKey = slugifyCardName(normalized.name_en);
    if (!baseKey) continue;

    let key = baseKey;
    if (index[key]) {
      const pitchKey = slugifyCardName(normalized.pitch || 'no_pitch');
      key = `${baseKey}__${pitchKey}`;
    }
    index[key] = normalized;
  }

  return index;
}

export function importFabCards(inputPath, outputPath) {
  const cards = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const index = buildEnglishIndex(cards);
  fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInput = path.join(projectRoot, 'data/source/english/card.json');
const defaultOutput = path.join(projectRoot, 'data/cards.en.json');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2] || defaultInput;
  const outputPath = process.argv[3] || defaultOutput;
  const index = importFabCards(inputPath, outputPath);
  console.log(`Imported ${Object.keys(index).length} cards into ${outputPath}`);
}
