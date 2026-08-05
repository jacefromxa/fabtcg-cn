import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTemplatePath = path.join(projectRoot, 'probe/probe.user.js');
const defaultOutputPath = path.join(projectRoot, 'probe/talishar-cn.user.js');

export function buildUserscriptSource(template) {
  if (!template.includes('// ==UserScript==') || !template.includes('// ==/UserScript==')) {
    throw new Error('Template is missing the userscript metadata block.');
  }
  if (template.includes('FAB_CN_DATA') || template.includes('BUILTIN_CARD_DATA')) {
    throw new Error('Template still contains embedded card data.');
  }
  return template;
}

export function buildUserscript(templatePath, outputPath) {
  const template = fs.readFileSync(templatePath, 'utf8');
  const source = buildUserscriptSource(template);
  fs.writeFileSync(outputPath, source, 'utf8');
  return { source };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const templatePath = process.argv[2] || defaultTemplatePath;
  const outputPath = process.argv[3] || defaultOutputPath;
  buildUserscript(templatePath, outputPath);
  console.log(`Built lightweight userscript into ${outputPath}`);
}
