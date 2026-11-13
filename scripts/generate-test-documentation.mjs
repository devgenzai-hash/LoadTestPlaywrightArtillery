import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests');
const docsDir = path.join(rootDir, 'documentation');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.md']);
const DEFINITION_PATTERNS = [
  symbol => new RegExp(`\\bexport\\s+async\\s+function\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+function\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+const\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+let\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+class\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+interface\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+type\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s+enum\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bexport\\s*\\{[^}]*\\b${escapeRegExp(symbol)}\\b[^}]*\\}`),
  symbol => new RegExp(`\\basync\\s+function\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bfunction\\s+${escapeRegExp(symbol)}\\b`),
  symbol => new RegExp(`\\bconst\\s+${escapeRegExp(symbol)}\\b`),
];

main();

function main() {
  if (!fs.existsSync(testsDir)) {
    throw new Error(`Tests directory not found: ${testsDir}`);
  }

  const sourceFiles = walk(testsDir)
    .filter(file => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  fs.rmSync(docsDir, { recursive: true, force: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const generated = [];

  for (const sourceFile of sourceFiles) {
    const relativeFromTests = normalizePath(path.relative(testsDir, sourceFile));
    const outputFile = path.join(docsDir, `${relativeFromTests}.md`);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, generateDocumentation(sourceFile, outputFile), 'utf8');
    generated.push({ sourceFile, outputFile, relativeFromTests });
  }

  fs.writeFileSync(path.join(docsDir, 'README.md'), generateIndex(generated), 'utf8');

  console.log(`Generated ${generated.length} documentation files in ${docsDir}`);
}

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function generateDocumentation(sourceFile, outputFile) {
  const content = fs.readFileSync(sourceFile, 'utf8');
  const lines = content.split(/\r?\n/);
  const imports = extractImports(content, sourceFile);
  const importUsageIndex = buildImportUsageIndex(imports);
  const sourceRel = workspaceRel(sourceFile);

  const doc = [];
  doc.push(`# ${path.basename(sourceFile)} documentation`);
  doc.push('');
  doc.push(`- Source file: [${sourceRel}](${linkFrom(outputFile, sourceFile)})`);
  doc.push(`- Total lines: ${lines.length}`);
  doc.push(`- Import statements found: ${imports.length}`);
  doc.push('');

  if (imports.length > 0) {
    doc.push('## Imports and linked references');
    doc.push('');
    for (const imp of imports) {
      const sourceLabel = imp.resolvedPath
        ? `[${workspaceRel(imp.resolvedPath)}](${linkFrom(outputFile, imp.resolvedPath)}${imp.symbols[0]?.definitionLine ? `#L${imp.symbols[0].definitionLine}` : ''})`
        : `external module "${imp.moduleSpecifier}"`;

      if (imp.symbols.length === 0) {
        doc.push(`- This file imports ${sourceLabel}.`);
        continue;
      }

      const symbolNotes = imp.symbols.map(symbol => {
        if (!imp.resolvedPath) {
          return `\`${symbol.localName}\``;
        }
        const target = `${linkFrom(outputFile, imp.resolvedPath)}${symbol.definitionLine ? `#L${symbol.definitionLine}` : ''}`;
        return `\`${symbol.localName}\` in [${workspaceRel(imp.resolvedPath)}](${target})`;
      }).join(', ');
      doc.push(`- Imports ${symbolNotes} from ${sourceLabel}.`);
    }
    doc.push('');
  }

  doc.push('## Sequential line-by-line explanation');
  doc.push('');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const explanation = explainLine({
      sourceFile,
      outputFile,
      line,
      lineNumber,
      lines,
      imports,
      importUsageIndex,
    });

    if (line.trim().length === 0) {
      doc.push(`- Line ${lineNumber}: This blank line separates logical sections of the file.`);
    } else {
      doc.push(`- Line ${lineNumber}: "${escapeInline(line)}" — ${explanation}`);
    }
  });

  doc.push('');
  doc.push('## End note');
  doc.push('');
  doc.push('This document was generated to mirror the logic in the source test file and explain each line in plain English.');
  doc.push('');

  return doc.join('\n');
}

function explainLine(context) {
  const { line, lineNumber, imports, importUsageIndex, outputFile } = context;
  const trimmed = line.trim();
  const importBlock = imports.find(item => lineNumber >= item.startLine && lineNumber <= item.endLine);

  if (!trimmed) {
    return 'This blank line separates logical sections of the file.';
  }

  if (importBlock) {
    return explainImportLine(importBlock, trimmed, outputFile);
  }

  if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
    return 'This line starts a block comment that describes the purpose of the file or section.';
  }

  if (trimmed.startsWith('*/')) {
    return 'This line closes the surrounding block comment.';
  }

  if (trimmed.startsWith('*')) {
    return 'This line continues the surrounding block comment with more descriptive detail.';
  }

  if (trimmed.startsWith('//')) {
    return `This single-line comment explains the next action or records intent: ${describeComment(trimmed.slice(2).trim())}`;
  }

  if (isMarkdownHeading(trimmed)) {
    return 'This Markdown heading starts a new documentation section inside the source file.';
  }

  if (trimmed === '---') {
    return 'This Markdown rule visually separates major sections.';
  }

  if (/^```/.test(trimmed)) {
    return 'This line opens or closes a fenced code block in the Markdown file.';
  }

  if (/^\|.*\|$/.test(trimmed)) {
    return 'This line is part of a Markdown table that structures related values into columns.';
  }

  if (/^- /.test(trimmed)) {
    return 'This line adds an item to a Markdown bullet list.';
  }

  if (/^\d+\. /.test(trimmed)) {
    return 'This line adds an item to a numbered list in the Markdown document.';
  }

  if (/^const\s+\w+\s*=/.test(trimmed)) {
    return appendImportUsage('This line creates a constant so later steps can reuse a stable value.', trimmed, importUsageIndex, outputFile);
  }

  if (/^let\s+\w+\s*=/.test(trimmed)) {
    return appendImportUsage('This line creates a mutable variable whose value can change later in the flow.', trimmed, importUsageIndex, outputFile);
  }

  if (/^export\s+async\s+function\s+/.test(trimmed)) {
    return 'This line exports an asynchronous helper function so other files can call it.';
  }

  if (/^export\s+function\s+/.test(trimmed)) {
    return 'This line exports a reusable function from the current file.';
  }

  if (/^export\s+interface\s+/.test(trimmed)) {
    return 'This line exports a TypeScript interface that describes the shape of related data.';
  }

  if (/^export\s+type\s+/.test(trimmed)) {
    return 'This line exports a TypeScript type alias for reuse elsewhere.';
  }

  if (/^export\s+const\s+/.test(trimmed)) {
    return 'This line exports a constant value so other files can reuse the same configuration or helper value.';
  }

  if (/^test\.describe\(/.test(trimmed)) {
    return 'This line starts a Playwright suite that groups related tests under one descriptive label.';
  }

  if (/^test\.setTimeout\(/.test(trimmed)) {
    return 'This line increases the allowed execution time so this longer-running scenario does not fail too early.';
  }

  if (/^test\(/.test(trimmed)) {
    return 'This line defines one Playwright test case and names the scenario being validated.';
  }

  if (/^await\s+seedLogin\(/.test(trimmed)) {
    return appendImportUsage('This line logs in through the shared setup helper before the scenario continues.', trimmed, importUsageIndex, outputFile);
  }

  if (/^await\s+page\.goto\(/.test(trimmed)) {
    return appendImportUsage('This line tells the browser to navigate to the target page.', trimmed, importUsageIndex, outputFile);
  }

  if (/^await\s+page\.waitForURL\(/.test(trimmed)) {
    return appendImportUsage('This line waits until the browser reaches a matching URL before moving on.', trimmed, importUsageIndex, outputFile);
  }

  if (/^await\s+page\.waitForLoadState\(/.test(trimmed)) {
    return appendImportUsage('This line waits for a specific browser loading milestone so later checks run at the right time.', trimmed, importUsageIndex, outputFile);
  }

  if (/^await\s+expect\(/.test(trimmed) || /^expect\(/.test(trimmed)) {
    return appendImportUsage('This line asserts that the application state matches the expected result.', trimmed, importUsageIndex, outputFile);
  }

  if (/^await\s+page\./.test(trimmed)) {
    return appendImportUsage('This line performs an asynchronous browser action or DOM query through Playwright.', trimmed, importUsageIndex, outputFile);
  }

  if (/^console\.log\(/.test(trimmed)) {
    return appendImportUsage('This line writes runtime information to the console so the test output is easier to review.', trimmed, importUsageIndex, outputFile);
  }

  if (/^if\s*\(/.test(trimmed)) {
    return appendImportUsage('This line starts a conditional branch so the code only runs when the stated condition is true.', trimmed, importUsageIndex, outputFile);
  }

  if (/^else\b/.test(trimmed)) {
    return 'This line starts the fallback branch that runs when the earlier condition is false.';
  }

  if (/^for\s*\(/.test(trimmed) || /^for\s+const\s+/.test(trimmed)) {
    return appendImportUsage('This line starts a loop so the same logic can run over several items.', trimmed, importUsageIndex, outputFile);
  }

  if (/^try\s*\{?$/.test(trimmed)) {
    return 'This line starts a protected block that can safely recover if an operation throws an error.';
  }

  if (/^catch\b/.test(trimmed)) {
    return 'This line handles errors from the preceding try block.';
  }

  if (/^return\b/.test(trimmed)) {
    return appendImportUsage('This line returns a value or exits early from the current function.', trimmed, importUsageIndex, outputFile);
  }

  if (/^\}\);?$/.test(trimmed) || /^\}$/.test(trimmed) || /^\]\);?$/.test(trimmed)) {
    return 'This line closes the current block, callback, array, or object structure.';
  }

  if (/^[\]\[{}(),]$/.test(trimmed)) {
    return 'This line continues or closes the surrounding structure.';
  }

  if (/=>/.test(trimmed)) {
    return appendImportUsage('This line defines or continues an arrow function used as a callback or small helper.', trimmed, importUsageIndex, outputFile);
  }

  if (/^[A-Za-z_$][\w$]*\s*:\s*/.test(trimmed)) {
    return appendImportUsage('This line assigns a property value inside an object literal or type shape.', trimmed, importUsageIndex, outputFile);
  }

  return appendImportUsage('This line continues the current statement, configuration block, or control flow.', trimmed, importUsageIndex, outputFile);
}

function explainImportLine(importBlock, trimmed, outputFile) {
  const targetText = importBlock.resolvedPath
    ? `[${workspaceRel(importBlock.resolvedPath)}](${linkFrom(outputFile, importBlock.resolvedPath)})`
    : `external module "${importBlock.moduleSpecifier}"`;

  if (/^import\s+\{?$/.test(trimmed) || /^import\s+type\s+\{?$/.test(trimmed)) {
    return `This line starts a grouped import statement that pulls helpers or types from ${targetText}.`;
  }

  if (/^import\s+\*\s+as\s+/.test(trimmed)) {
    return `This line imports a whole module namespace from ${targetText} so the file can call members through one object.`;
  }

  if (/^import\s+/.test(trimmed) && /from\s+['"]/i.test(trimmed)) {
    return `This line imports dependencies from ${targetText}.`;
  }

  if (/^}\s+from\s+['"]/i.test(trimmed) || /^}\s*from\s+['"]/i.test(trimmed)) {
    return `This line finishes the grouped import and points it at ${targetText}.`;
  }

  const symbolsUsed = importBlock.symbols.filter(symbol => {
    const importedRegex = new RegExp(`\\b${escapeRegExp(symbol.importedName)}\\b`);
    const localRegex = new RegExp(`\\b${escapeRegExp(symbol.localName)}\\b`);
    return importedRegex.test(trimmed) || localRegex.test(trimmed);
  });
  if (symbolsUsed.length > 0) {
    const details = symbolsUsed.map(symbol => {
      if (!importBlock.resolvedPath) return `\`${symbol.localName}\``;
      const target = `${linkFrom(outputFile, importBlock.resolvedPath)}${symbol.definitionLine ? `#L${symbol.definitionLine}` : ''}`;
      return `\`${symbol.localName}\` in [${workspaceRel(importBlock.resolvedPath)}](${target})`;
    }).join(', ');
    return `This line lists imported symbols: ${details}.`;
  }

  return `This line continues the import block that references ${targetText}.`;
}

function appendImportUsage(baseText, trimmed, importUsageIndex, outputFile) {
  const usages = findImportUsages(trimmed, importUsageIndex);
  if (usages.length === 0) {
    return baseText;
  }

  const unique = [];
  const seen = new Set();
  for (const usage of usages) {
    const key = `${usage.localName}|${usage.targetPath || usage.moduleSpecifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(usage);
    }
  }

  const usageText = unique.map(usage => {
    if (!usage.targetPath) {
      return `the imported symbol \`${usage.localName}\` from external module "${usage.moduleSpecifier}"`;
    }
    const target = `${linkFrom(outputFile, usage.targetPath)}${usage.definitionLine ? `#L${usage.definitionLine}` : ''}`;
    return `the imported symbol \`${usage.localName}\` from [${workspaceRel(usage.targetPath)}](${target})`;
  }).join(', ');

  return `${baseText} It uses ${usageText}.`;
}

function findImportUsages(trimmed, importUsageIndex) {
  const usages = [];
  for (const entry of importUsageIndex) {
    const name = entry.localName;
    if (!name || name === 'type' || name.length === 0) continue;
    const regex = new RegExp(`\\b${escapeRegExp(name)}\\b`);
    if (regex.test(trimmed)) {
      usages.push(entry);
    }
  }
  return usages;
}

function buildImportUsageIndex(imports) {
  return imports.flatMap(imp => imp.symbols.map(symbol => ({
    localName: symbol.localName,
    importedName: symbol.importedName,
    targetPath: imp.resolvedPath,
    moduleSpecifier: imp.moduleSpecifier,
    definitionLine: symbol.definitionLine,
  })));
}

function extractImports(content, sourceFile) {
  const imports = [];
  const importRegex = /(^|\n)import[\s\S]*?(?:from\s+['"][^'"]+['"]\s*;?|['"][^'"]+['"]\s*;?)/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const statement = match[0].replace(/^\n/, '');
    const startIndex = match.index + (match[0].startsWith('\n') ? 1 : 0);
    const startLine = lineNumberFromIndex(content, startIndex);
    const endLine = lineNumberFromIndex(content, startIndex + statement.length - 1);

    const fromMatch = statement.match(/from\s+['"]([^'"]+)['"]/);
    const sideEffectMatch = statement.match(/^import\s+['"]([^'"]+)['"]/m);
    const moduleSpecifier = fromMatch?.[1] ?? sideEffectMatch?.[1] ?? '';

    const clauseMatch = statement.match(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/m);
    const clause = clauseMatch ? clauseMatch[1].trim() : '';
    const resolvedPath = moduleSpecifier.startsWith('.') ? resolveImportTarget(sourceFile, moduleSpecifier) : null;
    const symbols = parseImportClause(clause).map(symbol => ({
      ...symbol,
      definitionLine: resolvedPath ? findDefinitionLine(resolvedPath, symbol.importedName) : null,
    }));

    imports.push({
      moduleSpecifier,
      resolvedPath,
      clause,
      symbols,
      startLine,
      endLine,
    });
  }

  return imports;
}

function parseImportClause(clause) {
  if (!clause) return [];
  let normalized = clause.replace(/^type\s+/, '').trim();
  const symbols = [];

  if (normalized.startsWith('* as ')) {
    const localName = normalized.slice(5).trim();
    return [{ importedName: localName, localName, kind: 'namespace' }];
  }

  const topLevelComma = findTopLevelComma(normalized);
  if (topLevelComma !== -1 && !normalized.startsWith('{')) {
    const firstComma = topLevelComma;
    const firstPart = normalized.slice(0, firstComma).trim();
    const rest = normalized.slice(firstComma + 1).trim();
    if (firstPart) {
      symbols.push({ importedName: firstPart, localName: firstPart, kind: 'default' });
    }
    normalized = rest;
  }

  if (normalized.startsWith('{')) {
    const inner = normalized
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .trim();
    const parts = inner.split(',').map(part => part.trim()).filter(Boolean);
    for (const part of parts) {
      const cleaned = part.replace(/^type\s+/, '').trim();
      const aliasMatch = cleaned.match(/^(.+?)\s+as\s+(.+)$/);
      if (aliasMatch) {
        const importedName = aliasMatch[1].trim();
        const localName = aliasMatch[2].trim();
        symbols.push({ importedName, localName, kind: 'named' });
      } else {
        symbols.push({ importedName: cleaned, localName: cleaned, kind: 'named' });
      }
    }
    return symbols;
  }

  if (normalized) {
    symbols.push({ importedName: normalized, localName: normalized, kind: 'default' });
  }

  return symbols;
}

function resolveImportTarget(sourceFile, specifier) {
  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.md`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function findDefinitionLine(filePath, symbol) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const buildPattern of DEFINITION_PATTERNS) {
      if (buildPattern(symbol).test(line)) {
        return i + 1;
      }
    }
  }
  return null;
}

function generateIndex(generated) {
  const lines = [];
  lines.push('# Test documentation index');
  lines.push('');
  lines.push('This folder mirrors the structure of the source `tests` folder and adds one plain-English explanation file for every source file.');
  lines.push('');
  lines.push('## Files');
  lines.push('');
  for (const item of generated) {
    const docRel = normalizePath(path.relative(docsDir, item.outputFile));
    const sourceRel = workspaceRel(item.sourceFile);
    lines.push(`- [${docRel}](${docRel}) → source [${sourceRel}](${linkFrom(path.join(docsDir, 'README.md'), item.sourceFile)})`);
  }
  lines.push('');
  return lines.join('\n');
}

function lineNumberFromIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function workspaceRel(filePath) {
  return normalizePath(path.relative(rootDir, filePath));
}

function linkFrom(fromFile, toFile) {
  let rel = normalizePath(path.relative(path.dirname(fromFile), toFile));
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

function escapeInline(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/"/g, '\\"')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function describeComment(text) {
  if (!text) return 'the author leaves a short note for readers';
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}

function isMarkdownHeading(trimmed) {
  return /^#{1,6}\s+/.test(trimmed);
}

function findTopLevelComma(value) {
  let braceDepth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '{') braceDepth++;
    if (char === '}') braceDepth--;
    if (char === ',' && braceDepth === 0) {
      return i;
    }
  }
  return -1;
}
