import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseCardId } from './translation-review-data.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTranslationsDir = path.join(projectRoot, 'data', 'translations');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function englishNamePattern(name) {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}(?=$|[^A-Za-z0-9])`, 'i');
}

function isCardName(name) {
  return typeof name === 'string' && name.trim().split(/\s+/).length >= 2;
}

function isOrdinaryPayUpPhrase(name, text) {
  if (name.toLowerCase() !== 'pay up') return false;
  return /\bpay up\s+to\b/i.test(text);
}

export function loadTranslationEntries(translationsDir = defaultTranslationsDir) {
  const entries = [];
  for (const file of fs.readdirSync(translationsDir).filter((item) => item.endsWith('.json')).sort()) {
    const batch = file.replace(/\.json$/, '');
    const data = readJson(path.join(translationsDir, file));
    for (const [key, entry] of Object.entries(data)) {
      entries.push({
        batch,
        key,
        card_id: baseCardId(key),
        entry,
      });
    }
  }
  return entries;
}

function buildNameIndex(entries) {
  const byEnglishName = new Map();
  for (const { card_id: cardId, entry } of entries) {
    const nameEn = typeof entry?.name_en === 'string' ? entry.name_en.trim() : '';
    const nameZh = typeof entry?.name_zh === 'string' ? entry.name_zh.trim() : '';
    if (!isCardName(nameEn) || !nameZh) continue;
    if (!byEnglishName.has(nameEn)) byEnglishName.set(nameEn, new Map());
    const byCard = byEnglishName.get(nameEn);
    if (!byCard.has(cardId)) byCard.set(cardId, new Set());
    byCard.get(cardId).add(nameZh);
  }
  return byEnglishName;
}

export function auditTranslationNameConsistency(translationsDir = defaultTranslationsDir) {
  const entries = loadTranslationEntries(translationsDir);
  const byEnglishName = buildNameIndex(entries);
  const names = [...byEnglishName.keys()].sort((left, right) => right.length - left.length || left.localeCompare(right));
  const candidates = [];

  for (const { batch, key, card_id: sourceCardId, entry } of entries) {
    const textEn = typeof entry?.text_en === 'string' ? entry.text_en : '';
    const textZh = typeof entry?.text_zh === 'string' ? entry.text_zh : '';
    if (!textEn.trim() || !textZh.trim()) continue;

    for (const nameEn of names) {
      if (!englishNamePattern(nameEn).test(textEn) || isOrdinaryPayUpPhrase(nameEn, textEn)) continue;
      for (const [referencedCardId, namesZh] of byEnglishName.get(nameEn)) {
        const referencedNames = [...namesZh].sort();
        if (referencedNames.some((nameZh) => textZh.includes(nameZh))) continue;
        candidates.push({
          batch,
          key,
          card_id: sourceCardId,
          reference_type: sourceCardId === referencedCardId ? 'self-reference' : 'cross-reference',
          referenced_card_id: referencedCardId,
          referenced_name_en: nameEn,
          referenced_name_zh: referencedNames.length === 1 ? referencedNames[0] : referencedNames,
          current_name_zh: typeof entry?.name_zh === 'string' ? entry.name_zh : '',
          text_zh: textZh,
        });
      }
    }
  }

  const selfReferenceCount = candidates.filter((candidate) => candidate.reference_type === 'self-reference').length;
  const crossReferenceCount = candidates.length - selfReferenceCount;
  return {
    stats: {
      translationEntryCount: entries.length,
      uniqueCardCount: new Set(entries.map((entry) => entry.card_id)).size,
      indexedEnglishNameCount: byEnglishName.size,
      candidateCount: candidates.length,
      selfReferenceCount,
      crossReferenceCount,
    },
    candidates,
  };
}

function printReport(result) {
  const { stats, candidates } = result;
  console.log(`entries=${stats.translationEntryCount} cards=${stats.uniqueCardCount} names=${stats.indexedEnglishNameCount}`);
  console.log(`candidates=${stats.candidateCount} self=${stats.selfReferenceCount} cross=${stats.crossReferenceCount}`);
  for (const candidate of candidates) {
    const referencedNameZh = Array.isArray(candidate.referenced_name_zh)
      ? candidate.referenced_name_zh.join(' / ')
      : candidate.referenced_name_zh;
    console.log(
      `[${candidate.reference_type}] ${candidate.batch}/${candidate.key} `
      + `${candidate.referenced_name_en} → ${referencedNameZh} | ${candidate.text_zh}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditTranslationNameConsistency(process.argv[2] || defaultTranslationsDir);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
}
