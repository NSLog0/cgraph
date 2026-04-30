import path from 'path';
import fs from 'fs';
import { CodeGraph, GraphEdge, GraphNode } from '../types/graph';
import { ParseResult } from '../parser';

let edgeCounter = 0;
const eid = () => `re_${++edgeCounter}`;

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.java', '.go'];
const INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', '__init__.py'];

// ── Alias resolution ──────────────────────────────────────────────────────────

interface AliasMap {
  prefix: string;   // e.g. "@/"
  target: string;   // e.g. "src/"
}

function readAliases(projectPath: string): AliasMap[] {
  const aliases: AliasMap[] = [];

  // TypeScript / Next.js: tsconfig.json compilerOptions.paths
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {};
      const baseUrl = (tsconfig.compilerOptions?.baseUrl ?? '.').replace(/^\.\//, '');

      for (const [alias, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || !targets.length) continue;
        const aliasPrefix = alias.replace(/\/?\*$/, '/');
        const rawTarget = targets[0].replace(/\/?\*$/, '/').replace(/^\.\//, '');
        const targetPrefix = path.join(baseUrl, rawTarget).replace(/\\/g, '/').replace(/\/?$/, '/');
        aliases.push({ prefix: aliasPrefix, target: targetPrefix });
      }
    } catch {}
  }

  return aliases;
}

function applyAlias(importPath: string, aliases: AliasMap[]): { resolved: string; isAlias: boolean } {
  for (const { prefix, target } of aliases) {
    if (importPath.startsWith(prefix)) {
      // Strip leading ./ so result is project-root-relative, not source-relative
      const r = (target + importPath.slice(prefix.length)).replace(/^\.\//, '');
      return { resolved: r, isAlias: true };
    }
  }
  return { resolved: importPath, isAlias: false };
}

// ── File index ────────────────────────────────────────────────────────────────

function buildFileIndex(nodes: GraphNode[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const n of nodes) {
    if (n.type !== 'file') continue;
    const p = n.filePath.replace(/\\/g, '/');
    idx.set(p, n.id);
    idx.set(p.replace(/\.[^/.]+$/, ''), n.id); // strip extension
  }
  return idx;
}

function resolveImport(importPath: string, sourceFilePath: string, fileIndex: Map<string, string>, aliases: AliasMap[]): string | null {
  const { resolved, isAlias } = applyAlias(importPath, aliases);
  const isRelative = resolved.startsWith('.');

  if (!isRelative && !isAlias) return null; // npm package — skip

  // Alias → project-root-relative; relative → join with source file dir
  const base = isAlias
    ? resolved.replace(/\\/g, '/')
    : path.join(path.dirname(sourceFilePath), resolved).replace(/\\/g, '/');

  // Exact match
  if (fileIndex.has(base)) return fileIndex.get(base)!;

  // With extensions
  for (const ext of SOURCE_EXTENSIONS) {
    if (fileIndex.has(base + ext)) return fileIndex.get(base + ext)!;
  }

  // As directory index
  const baseClean = base.replace(/\/$/, '');
  for (const idx of INDEX_NAMES) {
    if (fileIndex.has(`${baseClean}/${idx}`)) return fileIndex.get(`${baseClean}/${idx}`)!;
  }

  return null;
}

// ── Symbol index ──────────────────────────────────────────────────────────────

function buildSymbolIndex(nodes: GraphNode[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.type === 'file') continue;
    const list = idx.get(n.name) ?? [];
    list.push(n.id);
    idx.set(n.name, list);
  }
  return idx;
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildGraph(projectPath: string, result: ParseResult): CodeGraph {
  const { nodes, containsEdges, rawImports, rawCalls, rawHeritage, langCounts, fileCount } = result;
  const projectName = path.basename(path.resolve(projectPath));
  const resolvedEdges: GraphEdge[] = [];

  const aliases = readAliases(path.resolve(projectPath));
  const fileIndex = buildFileIndex(nodes);
  const symbolIndex = buildSymbolIndex(nodes);

  // ── Import edges ──
  const seenImports = new Set<string>();
  for (const { sourceId, importPath, sourceFilePath } of rawImports) {
    const targetId = resolveImport(importPath, sourceFilePath, fileIndex, aliases);
    if (!targetId || targetId === sourceId) continue;
    const key = `${sourceId}→${targetId}`;
    if (seenImports.has(key)) continue;
    seenImports.add(key);
    resolvedEdges.push({ id: eid(), source: sourceId, target: targetId, type: 'imports' });
  }

  // ── Call edges ──
  const seenCalls = new Set<string>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const { sourceFileId, calleeName } of rawCalls) {
    const targets = symbolIndex.get(calleeName);
    if (!targets) continue;
    const srcNode = nodeById.get(sourceFileId);
    for (const targetId of targets) {
      const tgtNode = nodeById.get(targetId);
      if (!tgtNode || !srcNode || tgtNode.filePath === srcNode.filePath) continue;
      const key = `${sourceFileId}→${targetId}`;
      if (seenCalls.has(key)) continue;
      seenCalls.add(key);
      resolvedEdges.push({ id: eid(), source: sourceFileId, target: targetId, type: 'calls' });
    }
  }

  // ── Heritage edges (extends / implements) ──
  const seenHeritage = new Set<string>();
  for (const { sourceClassId, targetName, type } of rawHeritage) {
    const targets = symbolIndex.get(targetName);
    if (!targets) continue;
    for (const targetId of targets) {
      const key = `${sourceClassId}→${targetId}`;
      if (seenHeritage.has(key)) continue;
      seenHeritage.add(key);
      resolvedEdges.push({ id: eid(), source: sourceClassId, target: targetId, type });
    }
  }

  const allEdges = [...containsEdges, ...resolvedEdges];
  const totalFunctions = nodes.filter((n) => ['function', 'method', 'arrow_function'].includes(n.type)).length;
  const totalClasses = nodes.filter((n) => n.type === 'class').length;

  return {
    projectPath: path.resolve(projectPath),
    projectName,
    analyzedAt: new Date().toISOString(),
    stats: {
      totalFiles: fileCount,
      totalFunctions,
      totalClasses,
      languages: langCounts,
    },
    nodes,
    edges: allEdges,
  };
}
