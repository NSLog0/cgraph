"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGraph = buildGraph;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let edgeCounter = 0;
const eid = () => `re_${++edgeCounter}`;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.java', '.go'];
const INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', '__init__.py'];
function readAliases(projectPath) {
    const aliases = [];
    // TypeScript / Next.js: tsconfig.json compilerOptions.paths
    const tsconfigPath = path_1.default.join(projectPath, 'tsconfig.json');
    if (fs_1.default.existsSync(tsconfigPath)) {
        try {
            const tsconfig = JSON.parse(fs_1.default.readFileSync(tsconfigPath, 'utf-8'));
            const paths = tsconfig.compilerOptions?.paths ?? {};
            const baseUrl = (tsconfig.compilerOptions?.baseUrl ?? '.').replace(/^\.\//, '');
            for (const [alias, targets] of Object.entries(paths)) {
                if (!Array.isArray(targets) || !targets.length)
                    continue;
                const aliasPrefix = alias.replace(/\/?\*$/, '/');
                const rawTarget = targets[0].replace(/\/?\*$/, '/').replace(/^\.\//, '');
                const targetPrefix = path_1.default.join(baseUrl, rawTarget).replace(/\\/g, '/').replace(/\/?$/, '/');
                aliases.push({ prefix: aliasPrefix, target: targetPrefix });
            }
        }
        catch { }
    }
    return aliases;
}
function applyAlias(importPath, aliases) {
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
function buildFileIndex(nodes) {
    const idx = new Map();
    for (const n of nodes) {
        if (n.type !== 'file')
            continue;
        const p = n.filePath.replace(/\\/g, '/');
        idx.set(p, n.id);
        idx.set(p.replace(/\.[^/.]+$/, ''), n.id); // strip extension
    }
    return idx;
}
function resolveImport(importPath, sourceFilePath, fileIndex, aliases) {
    const { resolved, isAlias } = applyAlias(importPath, aliases);
    const isRelative = resolved.startsWith('.');
    if (!isRelative && !isAlias)
        return null; // npm package — skip
    // Alias → project-root-relative; relative → join with source file dir
    const base = isAlias
        ? resolved.replace(/\\/g, '/')
        : path_1.default.join(path_1.default.dirname(sourceFilePath), resolved).replace(/\\/g, '/');
    // Exact match
    if (fileIndex.has(base))
        return fileIndex.get(base);
    // With extensions
    for (const ext of SOURCE_EXTENSIONS) {
        if (fileIndex.has(base + ext))
            return fileIndex.get(base + ext);
    }
    // As directory index
    const baseClean = base.replace(/\/$/, '');
    for (const idx of INDEX_NAMES) {
        if (fileIndex.has(`${baseClean}/${idx}`))
            return fileIndex.get(`${baseClean}/${idx}`);
    }
    return null;
}
// ── Symbol index ──────────────────────────────────────────────────────────────
function buildSymbolIndex(nodes) {
    const idx = new Map();
    for (const n of nodes) {
        if (n.type === 'file')
            continue;
        const list = idx.get(n.name) ?? [];
        list.push(n.id);
        idx.set(n.name, list);
    }
    return idx;
}
// ── Build ─────────────────────────────────────────────────────────────────────
function buildGraph(projectPath, result) {
    const { nodes, containsEdges, rawImports, rawCalls, rawHeritage, langCounts, fileCount } = result;
    const projectName = path_1.default.basename(path_1.default.resolve(projectPath));
    const resolvedEdges = [];
    const aliases = readAliases(path_1.default.resolve(projectPath));
    const fileIndex = buildFileIndex(nodes);
    const symbolIndex = buildSymbolIndex(nodes);
    // ── Import edges ──
    const seenImports = new Set();
    for (const { sourceId, importPath, sourceFilePath } of rawImports) {
        const targetId = resolveImport(importPath, sourceFilePath, fileIndex, aliases);
        if (!targetId || targetId === sourceId)
            continue;
        const key = `${sourceId}→${targetId}`;
        if (seenImports.has(key))
            continue;
        seenImports.add(key);
        resolvedEdges.push({ id: eid(), source: sourceId, target: targetId, type: 'imports' });
    }
    // ── Call edges ──
    const seenCalls = new Set();
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const { sourceFileId, calleeName } of rawCalls) {
        const targets = symbolIndex.get(calleeName);
        if (!targets)
            continue;
        const srcNode = nodeById.get(sourceFileId);
        for (const targetId of targets) {
            const tgtNode = nodeById.get(targetId);
            if (!tgtNode || !srcNode || tgtNode.filePath === srcNode.filePath)
                continue;
            const key = `${sourceFileId}→${targetId}`;
            if (seenCalls.has(key))
                continue;
            seenCalls.add(key);
            resolvedEdges.push({ id: eid(), source: sourceFileId, target: targetId, type: 'calls' });
        }
    }
    // ── Heritage edges (extends / implements) ──
    const seenHeritage = new Set();
    for (const { sourceClassId, targetName, type } of rawHeritage) {
        const targets = symbolIndex.get(targetName);
        if (!targets)
            continue;
        for (const targetId of targets) {
            const key = `${sourceClassId}→${targetId}`;
            if (seenHeritage.has(key))
                continue;
            seenHeritage.add(key);
            resolvedEdges.push({ id: eid(), source: sourceClassId, target: targetId, type });
        }
    }
    const allEdges = [...containsEdges, ...resolvedEdges];
    const totalFunctions = nodes.filter((n) => ['function', 'method', 'arrow_function'].includes(n.type)).length;
    const totalClasses = nodes.filter((n) => n.type === 'class').length;
    return {
        projectPath: path_1.default.resolve(projectPath),
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
