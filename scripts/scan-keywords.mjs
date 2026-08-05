import fs from 'node:fs';

// Scan the English source for keyword usage: which keywords exist, how many
// cards carry each, and whether any card text carries a full "Keyword - …"
// reminder sentence that could be harvested as an explanation.

const cards = JSON.parse(fs.readFileSync(new URL('../data/source/english/card.json', import.meta.url), 'utf8'));

const counts = new Map(); // keyword -> { cards: number, withReminderText: number, sample: string }
function bump(keyword, text) {
  const entry = counts.get(keyword) || { cards: 0, withReminderText: 0, sample: '' };
  entry.cards += 1;
  // A keyword looks "defined" when the card text spells out "Keyword - …" or
  // "Keyword *(…)*". Bare keyword names carry no explanation.
  const hasReminder = new RegExp(`\\b${keyword}\\b\\s*[-—–(*(]`).test(text) || new RegExp(`\\b${keyword}\\s+\\(`).test(text);
  if (hasReminder && !entry.sample) {
    entry.withReminderText += 1;
    const line = text.split('\n').find((l) => l.includes(keyword)) || text;
    entry.sample = line.slice(0, 140);
  }
  counts.set(keyword, entry);
}

for (const card of cards) {
  const text = card.functional_text_plain || '';
  for (const kw of card.card_keywords || []) bump(kw, text);
  for (const kw of card.ability_and_effect_keywords || []) bump(kw, text);
  for (const kw of card.granted_keywords || []) bump(kw, text);
}

console.log('distinct keywords:', counts.size);
console.log('--- keywords WITH at least one card spelling out a reminder/definition ---');
let defined = 0;
for (const [kw, e] of [...counts.entries()].sort((a, b) => b[1].cards - a[1].cards)) {
  if (!e.sample) continue;
  defined++;
  console.log(`  [${kw}] (${e.cards} cards)`);
  console.log(`      ${e.sample}`);
}
console.log(`\n=> ${defined} / ${counts.size} keywords have an extractable reminder sentence in some card text.`);
