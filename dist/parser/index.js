"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProject = parseProject;
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const languages_1 = require("./languages");
const extractor_1 = require("./extractor");
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', '.gradle', 'vendor', '.cgraph'];
let parserInitialized = false;
async function initParser() {
    if (parserInitialized)
        return;
    await web_tree_sitter_1.default.init({
        locateFile(scriptName) {
            const jsFile = require.resolve('web-tree-sitter');
            return path_1.default.join(path_1.default.dirname(jsFile), scriptName);
        },
    });
    parserInitialized = true;
}
async function loadLanguage(config) {
    const wasmBase = path_1.default.dirname(require.resolve('tree-sitter-wasms/package.json'));
    const wasmPath = path_1.default.join(wasmBase, 'out', config.wasmFile);
    return web_tree_sitter_1.default.Language.load(wasmPath);
}
async function parseProject(projectPath) {
    await initParser();
    const absPath = path_1.default.resolve(projectPath);
    const allNodes = [];
    const allContainsEdges = [];
    const allRawImports = [];
    const allRawCalls = [];
    const allRawHeritage = [];
    const langCounts = {};
    const files = await (0, glob_1.glob)('**/*.*', {
        cwd: absPath,
        ignore: IGNORE_DIRS.map((d) => `**/${d}/**`),
        absolute: true,
        nodir: true,
    });
    const parserCache = new Map();
    let fileCount = 0;
    for (const filePath of files) {
        const config = (0, languages_1.detectLanguage)(filePath);
        if (!config)
            continue;
        let cached = parserCache.get(config.language);
        if (!cached) {
            try {
                const lang = await loadLanguage(config);
                const p = new web_tree_sitter_1.default();
                p.setLanguage(lang);
                cached = { parser: p, config };
                parserCache.set(config.language, cached);
            }
            catch (err) {
                console.warn(`[cgraph] Cannot load grammar for ${config.language}:`, err);
                continue;
            }
        }
        let source;
        try {
            source = fs_1.default.readFileSync(filePath, 'utf-8');
        }
        catch {
            continue;
        }
        const relPath = path_1.default.relative(absPath, filePath);
        const result = (0, extractor_1.extractFromSource)(source, relPath, config.language, config, cached.parser);
        allNodes.push(...result.nodes);
        allContainsEdges.push(...result.containsEdges);
        allRawImports.push(...result.rawImports);
        allRawCalls.push(...result.rawCalls);
        allRawHeritage.push(...result.rawHeritage);
        langCounts[config.language] = (langCounts[config.language] ?? 0) + 1;
        fileCount++;
        if (fileCount % 50 === 0)
            process.stdout.write(`\r  Parsed ${fileCount} files...`);
    }
    if (fileCount >= 50)
        process.stdout.write('\n');
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
