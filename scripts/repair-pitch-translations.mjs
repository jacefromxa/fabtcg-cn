import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  first: 1,
  second: 2,
  third: 3,
  once: 1,
  twice: 2,
  thrice: 3,
  a: 1,
  an: 1,
};

const COLOR_ZH = {
  red: '红色',
  yellow: '黄色',
  blue: '蓝色',
};

const ENGLISH_TOKEN_PATTERN = /((?:\{([a-z])\})+)|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|once|twice|thrice|a|an|red|yellow|blue)\b|(\d+(?:\.\d+)?)/gi;
const CHINESE_TOKEN_PATTERN = /红色|黄色|蓝色|红|黄|蓝|\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+/g;

function tokenizeEnglish(text) {
  return [...String(text || '').matchAll(ENGLISH_TOKEN_PATTERN)].map((match) => {
    if (match[1]) {
      return {
        kind: 'symbol',
        symbol: match[2].toLowerCase(),
        value: (match[1].match(/\{[a-z]\}/gi) || []).length,
        raw: match[0],
      };
    }
    if (match[4]) {
      return { kind: 'number', value: Number(match[4]), raw: match[0] };
    }
    const word = match[3].toLowerCase();
    if (COLOR_ZH[word]) {
      return { kind: 'color', value: word, raw: match[0] };
    }
    return { kind: 'number', value: NUMBER_WORDS[word], raw: match[0] };
  });
}

function chineseNumberValue(raw) {
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const simple = {
    零: 0,
    〇: 0,
    一: 1,
    两: 2,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (simple[raw] !== undefined) return simple[raw];
  if (/^[零〇一二两三四五六七八九十百千万]+$/.test(raw)) {
    // Card text currently uses simple numerals, but handling common compound
    // forms keeps this repair safe for future batches.
    let total = 0;
    let section = 0;
    let digit = 0;
    const digits = { 零: 0, 〇: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
    for (const char of raw) {
      if (digits[char] !== undefined) {
        digit = digits[char];
      } else if (char === '万') {
        section += digit;
        total += section * 10000;
        section = 0;
        digit = 0;
      } else {
        const unit = units[char];
        section += (digit || 1) * unit;
        digit = 0;
      }
    }
    return total + section + digit;
  }
  return null;
}

function tokenizeChinese(text) {
  return [...String(text || '').matchAll(CHINESE_TOKEN_PATTERN)].map((match) => {
    const raw = match[0];
    const color = raw.match(/红|黄|蓝/);
    if (color) return { kind: 'color', value: color[0] === '红' ? 'red' : color[0] === '黄' ? 'yellow' : 'blue', raw, start: match.index, end: match.index + raw.length };
    return { kind: 'number', value: chineseNumberValue(raw), raw, start: match.index, end: match.index + raw.length };
  });
}

function sameToken(left, right) {
  return left && right && left.kind === right.kind && left.value === right.value
    && (left.kind !== 'symbol' || left.symbol === right.symbol);
}

function tokenPairScore(left, right) {
  if (sameToken(left, right)) return 20;
  if (left.kind === right.kind) return 1;
  // A resource/health/defense symbol is often rendered as a Chinese number
  // plus a classifier instead of the icon itself.
  if (left.kind === 'symbol' && ['r', 't'].includes(left.symbol) && right.kind === 'number') {
    return left.value === right.value ? 20 : 0;
  }
  return -5;
}

function alignSequences(left, right, scorePair = tokenPairScore) {
  const gap = -2;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const scores = Array.from({ length: rows }, () => Array(cols).fill(0));
  const choices = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (let i = 1; i < rows; i += 1) {
    scores[i][0] = scores[i - 1][0] + gap;
    choices[i][0] = 'left';
  }
  for (let j = 1; j < cols; j += 1) {
    scores[0][j] = scores[0][j - 1] + gap;
    choices[0][j] = 'right';
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const options = [
        { score: scores[i - 1][j - 1] + scorePair(left[i - 1], right[j - 1]), choice: 'pair' },
        { score: scores[i - 1][j] + gap, choice: 'left' },
        { score: scores[i][j - 1] + gap, choice: 'right' },
      ];
      options.sort((a, b) => b.score - a.score);
      scores[i][j] = options[0].score;
      choices[i][j] = options[0].choice;
    }
  }

  const result = [];
  let i = left.length;
  let j = right.length;
  while (i > 0 || j > 0) {
    const choice = choices[i][j];
    if (choice === 'pair') {
      result.push({ left: i - 1, right: j - 1 });
      i -= 1;
      j -= 1;
    } else if (choice === 'left') {
      result.push({ left: i - 1, right: null });
      i -= 1;
    } else {
      result.push({ left: null, right: j - 1 });
      j -= 1;
    }
  }
  return result.reverse();
}

function englishLineSignature(line) {
  return String(line || '')
    .replace(ENGLISH_TOKEN_PATTERN, '')
    .replace(/[^a-z]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function mapTargetLines(templateLines, targetLines) {
  const result = [];
  let previous = -1;
  for (const targetLine of targetLines) {
    const signature = englishLineSignature(targetLine);
    let index = templateLines.findIndex((line, candidate) => candidate > previous && englishLineSignature(line) === signature);
    if (index < 0) {
      index = templateLines.findIndex((line) => englishLineSignature(line) === signature);
    }
    if (index < 0) index = Math.min(previous + 1, templateLines.length - 1);
    if (index < 0) index = 0;
    result.push(index);
    previous = index;
  }
  return result;
}

function buildVariablePositions(templateEntry, entries) {
  const templateLines = String(templateEntry.text_en || '').split('\n');
  const variablePositions = templateLines.map(() => new Set());
  for (const entry of entries) {
    const targetLines = String(entry.text_en || '').split('\n');
    const lineMap = mapTargetLines(templateLines, targetLines);
    for (let targetLineIndex = 0; targetLineIndex < targetLines.length; targetLineIndex += 1) {
      const templateLineIndex = lineMap[targetLineIndex];
      const templateTokens = tokenizeEnglish(templateLines[templateLineIndex]);
      const targetTokens = tokenizeEnglish(targetLines[targetLineIndex]);
      for (const pair of alignSequences(templateTokens, targetTokens)) {
        if (pair.left === null) continue;
        if (pair.right === null || !sameToken(templateTokens[pair.left], targetTokens[pair.right])) {
          variablePositions[templateLineIndex].add(pair.left);
        }
      }
    }
  }
  return variablePositions;
}

function chineseNumber(value, original) {
  if (original && /^\d/.test(original)) return String(value);
  const values = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (value >= 0 && value <= 10) {
    if (value === 2 && original === '两') return '两';
    return values[value];
  }
  return String(value);
}

function formatChineseToken(target, original) {
  if (target.kind === 'color') {
    const suffix = original && original.endsWith('色') ? '色' : '';
    return `${COLOR_ZH[target.value].replace(/色$/, '')}${suffix}`;
  }
  return chineseNumber(target.value, original);
}

function removeChineseToken(text, token) {
  let start = token.start;
  let end = token.end;
  const before = text[start - 1];
  const after = text[end];
  const separators = '、，,或和';
  if (separators.includes(after)) end += 1;
  else if (separators.includes(before)) start -= 1;
  return text.slice(0, start) + text.slice(end);
}

function transformLine(templateEn, targetEn, templateZh, variableIndices) {
  const templateTokens = tokenizeEnglish(templateEn);
  const targetTokens = tokenizeEnglish(targetEn);
  const chineseTokens = tokenizeChinese(templateZh);
  if (!templateZh || variableIndices.size === 0) return templateZh;

  const templateToChinese = new Map();
  for (const pair of alignSequences(templateTokens, chineseTokens)) {
    if (pair.left !== null && pair.right !== null) templateToChinese.set(pair.left, pair.right);
  }

  // Chinese card prose occasionally moves a qualifier before the number it
  // describes (for example, English "X is 4 if ..." becomes "...牌，X为4")
  // instead of preserving English token order. Recover an otherwise unmapped
  // variable from a unique value match before giving up on the replacement.
  const usedChineseIndices = new Set(templateToChinese.values());
  for (const templateIndex of variableIndices) {
    if (templateToChinese.has(templateIndex)) continue;
    const token = templateTokens[templateIndex];
    const matchIndex = chineseTokens.findIndex((candidate, index) => {
      if (usedChineseIndices.has(index)) return false;
      if (sameToken(token, candidate)) return true;
      return token.kind === 'symbol' && ['r', 't'].includes(token.symbol)
        && candidate.kind === 'number' && token.value === candidate.value;
    });
    if (matchIndex >= 0) {
      templateToChinese.set(templateIndex, matchIndex);
      usedChineseIndices.add(matchIndex);
    }
  }

  const operations = [];
  for (const pair of alignSequences(templateTokens, targetTokens)) {
    if (pair.left === null || !variableIndices.has(pair.left)) continue;
    const chineseIndex = templateToChinese.get(pair.left);
    if (chineseIndex === undefined) continue;
    if (pair.right === null) {
      operations.push({ chineseIndex, replacement: null });
    } else {
      operations.push({
        chineseIndex,
        replacement: formatChineseToken(targetTokens[pair.right], chineseTokens[chineseIndex].raw),
      });
    }
  }

  let result = templateZh;
  const unique = new Map(operations.map((operation) => [operation.chineseIndex, operation]));
  for (const operation of [...unique.values()].sort((left, right) => right.chineseIndex - left.chineseIndex)) {
    const token = tokenizeChinese(result)[operation.chineseIndex];
    if (!token) continue;
    if (operation.replacement === null) result = removeChineseToken(result, token);
    else result = result.slice(0, token.start) + operation.replacement + result.slice(token.end);
  }
  return result;
}

function pitchNumber(entry) {
  const value = Number(entry.pitch);
  return Number.isFinite(value) ? value : 99;
}

function cardIdFromKey(key) {
  return String(key).replace(/__(1|2|3)$/, '');
}

function englishSensitiveSignature(text) {
  const tokens = tokenizeEnglish(text)
    .map((token) => `${token.kind}:${token.symbol || ''}:${token.value}`)
    .join('|');
  return `${String(text || '').split('\n').length}:${tokens}`;
}

function repairGroup(entries) {
  const template = entries.find((entry) => pitchNumber(entry) === 1) || [...entries].sort((a, b) => pitchNumber(a) - pitchNumber(b))[0];
  const templateLines = String(template.text_en || '').split('\n');
  const templateZhLines = String(template.text_zh || '').split('\n');
  const variablePositions = buildVariablePositions(template, entries);
  const repaired = {};

  for (const entry of entries) {
    const targetLines = String(entry.text_en || '').split('\n');
    const lineMap = mapTargetLines(templateLines, targetLines);
    const lines = targetLines.map((targetLine, targetLineIndex) => {
      const templateLineIndex = lineMap[targetLineIndex];
      const templateZhLine = templateZhLines[templateLineIndex] || '';
      return transformLine(
        templateLines[templateLineIndex] || '',
        targetLine,
        templateZhLine,
        variablePositions[templateLineIndex] || new Set(),
      );
    });
    repaired[entry.key] = lines.join('\n');
  }

  // Pull from Beyond had an empty machine-draft translation. Give it a real
  // localized skeleton so color variants are observable and usable.
  if (entries[0].key.startsWith('pull_from_beyond__')) {
    for (const entry of entries) {
      const color = tokenizeEnglish(entry.text_en).find((token) => token.kind === 'color')?.value || 'red';
      repaired[entry.key] = `占卜2\n放逐你牌库顶的一张牌。若其为${COLOR_ZH[color]}，创造一个通往伊阿拉塞尔之门衍生物。\n再动`;
    }
  }

  // The repeated "opt 1" clauses need a line-level repair rather than a
  // number replacement: the lower pitches contain fewer copies of the clause.
  if (entries[0].key.startsWith('read_the_ripples__')) {
    for (const entry of entries) {
      const targetLines = String(entry.text_en || '').split('\n');
      const lineIndex = targetLines.findIndex((line) => /\bopt\b/i.test(line));
      if (lineIndex < 0) continue;
      const optCount = (targetLines[lineIndex].match(/\bopt\b/gi) || []).length;
      const templateLineIndex = mapTargetLines(templateLines, targetLines)[lineIndex];
      const sourceLine = templateZhLines[templateLineIndex] || '';
      const optText = Array.from({ length: optCount }, () => '占卜1').join('、');
      repaired[entry.key] = targetLines.map((line, index) => {
        if (index !== lineIndex) return transformLine(
          templateLines[lineIndex] || '',
          line,
          sourceLine,
          variablePositions[templateLineIndex] || new Set(),
        );
        return sourceLine.replace(/然后占卜.*?，并抽一张牌。?$/, `然后${optText}，并抽一张牌。`);
      }).join('\n');
    }
  }
  return repaired;
}

export function repairPitchTranslations(inputDirectory) {
  const files = fs.readdirSync(inputDirectory).filter((file) => file.endsWith('.json')).sort();
  const allEntries = [];
  const entriesByFile = new Map();
  for (const file of files) {
    const filePath = path.join(inputDirectory, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    entriesByFile.set(file, data);
    for (const [key, value] of Object.entries(data)) allEntries.push({ key, ...value, file });
  }

  const groups = new Map();
  for (const entry of allEntries) {
    if (!/__([123])$/.test(entry.key)) continue;
    const id = cardIdFromKey(entry.key);
    const group = groups.get(id) || [];
    group.push(entry);
    groups.set(id, group);
  }

  let repairedCount = 0;
  for (const entries of groups.values()) {
    const id = cardIdFromKey(entries[0].key);
    const forcedGroups = new Set(['read_the_ripples', 'winters_bite', 'haze_shelter', 'deadly_display']);
    const chineseTexts = new Set(entries.map((entry) => entry.text_zh || ''));
    const englishSignatures = new Set(entries.map((entry) => englishSensitiveSignature(entry.text_en)));
    if (!forcedGroups.has(id) && (chineseTexts.size !== 1 || englishSignatures.size === 1)) continue;
    const repaired = repairGroup(entries);
    for (const entry of entries) {
      if (repaired[entry.key] === entry.text_zh) continue;
      entriesByFile.get(entry.file)[entry.key].text_zh = repaired[entry.key];
      repairedCount += 1;
    }
  }

  for (const [file, data] of entriesByFile) {
    fs.writeFileSync(path.join(inputDirectory, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  return { groups: groups.size, repairedCount };
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDirectory = process.argv[2] || path.join(projectRoot, 'data/translations');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = repairPitchTranslations(inputDirectory);
  console.log(`Repaired ${result.repairedCount} pitch translation records across ${result.groups} pitch groups.`);
}
