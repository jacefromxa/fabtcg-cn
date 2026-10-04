import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugifyCardName } from './translate-helper.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'data/source/english/card.json');
const defaultOutput = path.join(projectRoot, 'data/fabtcg-card-aliases.json');

// Talishar card images are named by a transliterated slug of the card name
// (e.g. "jarl_vetreidi.webp" for "Jarl Vetreiði", "twelve_petal_kasaya.webp"
// for "Twelve Petal Kāṣāya"), which differs from our slugifyCardName for
// non-ASCII letters. This produces the Talishar-style stem so the alias table
// can bridge the two. Diacritics decompose via NFKD and are stripped; letters
// without a decomposition (eth, thorn, ash, ...) are mapped explicitly.
const CHAR_MAP = {
  ð: 'd', þ: 'th', æ: 'ae', ø: 'o', œ: 'oe', ł: 'l', ß: 'ss', đ: 'd',
  ħ: 'h', ŧ: 't', ŋ: 'ng', ɓ: 'b', ɗ: 'd', ƒ: 'f', ɠ: 'g', ɣ: 'gh',
  ɦ: 'h', ɨ: 'i', ɬ: 'l', ɱ: 'm', ɲ: 'n', ɸ: 'ph', ɹ: 'r', ɻ: 'r',
  ʃ: 'sh', ʈ: 't', ʋ: 'v', ʎ: 'y', ʐ: 'z', ʒ: 'zh', ŉ: 'n', ơ: 'o',
  ư: 'u', ǝ: 'e', ı: 'i', ŵ: 'w', ŷ: 'y',
};
const COMBINING = /[̀-ͯ]/g;

export function talisharStem(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(/[ðÐđĐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[łŁ]/g, 'l')
    .replace(/ß/g, 'ss')
    // Map any remaining non-ASCII letters via CHAR_MAP, drop punctuation, but
    // preserve whitespace so the final slugify step turns it into separators.
    .replace(/[^a-z0-9\s]/gi, (ch) => CHAR_MAP[ch.toLowerCase()] || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Build a map from every printing id (e.g. "PEN313", "TCC039") to the card it
// prints: { slug, pitch }. A printing id uniquely encodes a card AND its pitch
// (Boulder Drop pitch 1 -> APS008, pitch 2 -> TCC039, ...). A few printing ids
// are shared between two cards (tokens / construct cards reuse art), so those
// map to an array of candidates and callers disambiguate with the alt text.
//
// Talishar image stems are added under the same namespace: the Talishar-style
// stem of a card name maps to its canonical slug, so the userscript can resolve
// either a FaBrary printing id or a Talishar image stem with one lookup.
export function buildCardAliases(englishCards) {
  const grouped = new Map();

  for (const card of englishCards) {
    const slug = slugifyCardName(card.name);
    if (!slug) continue;
    const pitch = card.pitch == null || card.pitch === '' ? null : String(card.pitch);
    const record = { slug, pitch, name: card.name };

    for (const printing of card.printings || []) {
      if (!printing.id) continue;
      if (!grouped.has(printing.id)) grouped.set(printing.id, []);
      const list = grouped.get(printing.id);
      if (!list.some((entry) => entry.slug === slug && entry.pitch === pitch)) {
        list.push(record);
      }
    }

    // Talishar names image files by a transliterated slug of the card name;
    // map that stem to our canonical slug so the Talishar image path works.
    const stem = talisharStem(card.name);
    if (stem && stem !== slug) {
      if (!grouped.has(stem)) grouped.set(stem, []);
      const list = grouped.get(stem);
      if (!list.some((entry) => entry.slug === slug && entry.pitch === pitch)) {
        list.push(record);
      }
    }
  }

  const aliases = {};
  for (const [id, list] of grouped) {
    const unique = [];
    for (const entry of list) {
      if (!unique.some((e) => e.slug === entry.slug && e.pitch === entry.pitch)) {
        unique.push({ slug: entry.slug, pitch: entry.pitch });
      }
    }
    aliases[id] = unique.length === 1 ? unique[0] : unique;
  }

  return aliases;
}

export function writeCardAliases(englishCards, outputPath = defaultOutput) {
  const aliases = buildCardAliases(englishCards);
  fs.writeFileSync(outputPath, `${JSON.stringify(aliases, null, 2)}\n`, 'utf8');
  return aliases;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const englishCards = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const aliases = writeCardAliases(englishCards, process.argv[2] || defaultOutput);
  const ambiguous = Object.values(aliases).filter((v) => Array.isArray(v)).length;
  console.log(`Wrote ${Object.keys(aliases).length} printing-id aliases to ${defaultOutput}`);
  console.log(`  ambiguous (multi-card) ids: ${ambiguous}`);
}
