import Parser from 'web-tree-sitter';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { GraphNode, GraphEdge, Language } from '../types/graph';
import { detectLanguage, LanguageConfig } from './languages';
import { extractFromSource, RawImport, RawCall, RawHeritage } from './extractor';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', '.gradle', 'vendor', '.cgraph'];

let parserInitialized = false;

async function initParser(): Promise<void> {
  if (parserInitialized) return;
  await Parser.init({
    locateFile(scriptName: string) {
      const jsFile = require.resolve('web-tree-sitter');
      return path.join(path.dirname(jsFile), scriptName);
    },
  });
  parserInitialized = true;
}

async function loadLanguage(config: LanguageConfig): Promise<Parser.Language> {
  const wasmBase = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
  const wasmPath = path.join(wasmBase, 'out', config.wasmFile);
  return Parser.Language.load(wasmPath);
}

export interface ParseResult {
  nodes: GraphNode[];
  containsEdges: GraphEdge[];
  rawImports: RawImport[];
  rawCalls: RawCall[];
  rawHeritage: RawHeritage[];
  langCounts: Record<string, number>;
  fileCount: number;
}

export async function parseProject(projectPath: string): Promise<ParseResult> {
  await initParser();

  const absPath = path.resolve(projectPath);
  const allNodes: GraphNode[] = [];
  const allContainsEdges: GraphEdge[] = [];
  const allRawImports: RawImport[] = [];
  const allRawCalls: RawCall[] = [];
  const allRawHeritage: RawHeritage[] = [];
  const langCounts: Record<string, number> = {};

  const files = await glob('**/*.*', {
    cwd: absPath,
    ignore: IGNORE_DIRS.map((d) => `**/${d}/**`),
    absolute: true,
    nodir: true,
  });

  const parserCache = new Map<string, { parser: Parser; config: LanguageConfig }>();
  let fileCount = 0;

  for (const filePath of files) {
    const config = detectLanguage(filePath);
    if (!config) continue;

    let cached = parserCache.get(config.language);
    if (!cached) {
      try {
        const lang = await loadLanguage(config);
        const p = new Parser();
        p.setLanguage(lang);
        cached = { parser: p, config };
        parserCache.set(config.language, cached);
      } catch (err) {
        console.warn(`[cgraph] Cannot load grammar for ${config.language}:`, err);
        continue;
      }
    }

    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = path.relative(absPath, filePath);
    const result = extractFromSource(source, relPath, config.language as Language, config, cached.parser);

    allNodes.push(...result.nodes);
    allContainsEdges.push(...result.containsEdges);
    allRawImports.push(...result.rawImports);
    allRawCalls.push(...result.rawCalls);
    allRawHeritage.push(...result.rawHeritage);
    langCounts[config.language] = (langCounts[config.language] ?? 0) + 1;
    fileCount++;

    if (fileCount % 50 === 0) process.stdout.write(`\r  Parsed ${fileCount} files...`);
  }

  if (fileCount >= 50) process.stdout.write('\n');

  return {
    nodes: allNodes,
    containsEdges: allContainsEdges,
    rawImports: allRawImports,
    rawCalls: allRawCalls,
    rawHeritage: allRawHeritage,
    langCounts,
    fileCount,
  };
}
