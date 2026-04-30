#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = __importDefault(require("path"));
const parser_1 = require("../parser");
const builder_1 = require("../graph/builder");
const storage_1 = require("../graph/storage");
const registry_1 = require("../graph/registry");
const generator_1 = require("../claude-md/generator");
const server_1 = require("../mcp/server");
const server_2 = require("../web/server");
const setup_1 = require("../setup");
commander_1.program.name('cgraph').description('Code intelligence graph for AI agents').version('1.0.0');
// ── analyze ───────────────────────────────────────────────────────────────────
commander_1.program
    .command('analyze <path>')
    .description('Parse a project and build its code graph')
    .option('--no-claude-md', 'Skip CLAUDE.md generation')
    .option('--force', 'Re-index even if graph is up to date')
    .action(async (projectPath, options) => {
    const abs = path_1.default.resolve(projectPath);
    const existing = (0, storage_1.loadGraph)(abs);
    if (existing && !options.force) {
        const ageMin = (Date.now() - new Date(existing.analyzedAt).getTime()) / 60000;
        console.log(`\n⚡ Graph already exists (${ageMin.toFixed(0)}m ago). Use --force to re-index.\n`);
        console.log(`   ${existing.stats.totalFiles} files · ${existing.stats.totalFunctions} functions · ${existing.stats.totalClasses} classes`);
        console.log(`\nRun "cgraph serve ${projectPath}" to start.\n`);
        return;
    }
    console.log(`\n🔍 Analyzing: ${abs}\n`);
    const start = Date.now();
    const result = await (0, parser_1.parseProject)(abs);
    const graph = (0, builder_1.buildGraph)(abs, result);
    (0, storage_1.saveGraph)(graph);
    (0, registry_1.registerProject)({
        name: graph.projectName,
        projectPath: abs,
        analyzedAt: graph.analyzedAt,
        stats: graph.stats,
    });
    const importCount = graph.edges.filter((e) => e.type === 'imports').length;
    const callCount = graph.edges.filter((e) => e.type === 'calls').length;
    const heritageCount = graph.edges.filter((e) => e.type === 'extends' || e.type === 'implements').length;
    console.log(`\n✅ Graph built in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(`   ${graph.stats.totalFiles} files · ${graph.stats.totalFunctions} functions · ${graph.stats.totalClasses} classes`);
    console.log(`   Edges: ${importCount} imports · ${callCount} calls · ${heritageCount} heritage`);
    console.log(`   Languages: ${Object.entries(graph.stats.languages).map(([l, c]) => `${l}(${c})`).join(', ')}`);
    if (options.claudeMd) {
        (0, generator_1.generateClaudeMd)(abs, graph);
        console.log(`   CLAUDE.md updated ✓`);
    }
    console.log(`\nNext: "cgraph serve ${projectPath}" or "cgraph setup ${projectPath}"\n`);
});
// ── serve ─────────────────────────────────────────────────────────────────────
commander_1.program
    .command('serve <path>')
    .description('Start MCP server + Web UI')
    .option('--mcp-port <port>', 'MCP server port', '8667')
    .option('--web-port <port>', 'Web UI port', '8668')
    .action(async (projectPath, options) => {
    const abs = path_1.default.resolve(projectPath);
    const mcpPort = parseInt(options.mcpPort, 10);
    const webPort = parseInt(options.webPort, 10);
    console.log(`\n🚀 Starting cgraph for: ${abs}\n`);
    const graph = (0, storage_1.loadGraph)(abs);
    if (!graph) {
        console.error(`❌ No graph found. Run "cgraph analyze ${projectPath}" first.`);
        process.exit(1);
    }
    const importCount = graph.edges.filter((e) => e.type === 'imports').length;
    const callCount = graph.edges.filter((e) => e.type === 'calls').length;
    console.log(`   ${graph.stats.totalFiles} files · ${graph.stats.totalFunctions} functions · ${graph.stats.totalClasses} classes`);
    console.log(`   ${importCount} imports · ${callCount} calls\n`);
    await Promise.all([(0, server_1.startMcpServer)(graph, mcpPort), (0, server_2.startWebServer)(mcpPort, webPort)]);
    console.log(`  Web UI    → http://localhost:${webPort}`);
    console.log(`\nPress Ctrl+C to stop.\n`);
});
// ── setup ─────────────────────────────────────────────────────────────────────
commander_1.program
    .command('setup <path>')
    .description('Write .mcp.json + Claude Code hooks to a project')
    .option('--mcp-port <port>', 'MCP port to use in config', '8667')
    .action((projectPath, options) => {
    const abs = path_1.default.resolve(projectPath);
    console.log(`\n⚙️  Setting up Claude Code integration for: ${abs}\n`);
    (0, setup_1.setupProject)(abs, parseInt(options.mcpPort, 10));
});
// ── list ──────────────────────────────────────────────────────────────────────
commander_1.program
    .command('list')
    .description('List all indexed projects')
    .action(() => {
    const projects = (0, registry_1.listProjects)();
    if (!projects.length) {
        console.log('\nNo projects indexed yet. Run "cgraph analyze <path>".\n');
        return;
    }
    console.log(`\n📦 Indexed projects (${projects.length}):\n`);
    for (const p of projects) {
        const ageMin = Math.round((Date.now() - new Date(p.analyzedAt).getTime()) / 60000);
        const age = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
        console.log(`  ${p.name}`);
        console.log(`    Path:  ${p.projectPath}`);
        console.log(`    Index: ${p.stats.totalFiles} files · ${p.stats.totalFunctions} fn · ${p.stats.totalClasses} cls  (${age})\n`);
    }
});
// ── status ────────────────────────────────────────────────────────────────────
commander_1.program
    .command('status <path>')
    .description('Show graph status for a project')
    .action((projectPath) => {
    const abs = path_1.default.resolve(projectPath);
    const graph = (0, storage_1.loadGraph)(abs);
    if (!graph) {
        console.log(`No graph found. Run "cgraph analyze ${projectPath}" first.`);
        return;
    }
    const importCount = graph.edges.filter((e) => e.type === 'imports').length;
    const callCount = graph.edges.filter((e) => e.type === 'calls').length;
    const heritageCount = graph.edges.filter((e) => e.type === 'extends' || e.type === 'implements').length;
    console.log(`Project:   ${graph.projectName}`);
    console.log(`Analyzed:  ${graph.analyzedAt}`);
    console.log(`Files:     ${graph.stats.totalFiles}`);
    console.log(`Functions: ${graph.stats.totalFunctions}`);
    console.log(`Classes:   ${graph.stats.totalClasses}`);
    console.log(`Edges:     ${importCount} imports · ${callCount} calls · ${heritageCount} heritage`);
    console.log(`Languages: ${Object.entries(graph.stats.languages).map(([l, c]) => `${l}(${c})`).join(', ')}`);
});
// ── clean ─────────────────────────────────────────────────────────────────────
commander_1.program
    .command('clean <path>')
    .description('Delete graph index for a project')
    .action((projectPath) => {
    const abs = path_1.default.resolve(projectPath);
    const { rmSync, existsSync } = require('fs');
    const graphDir = require('path').join(abs, '.cgraph');
    if (existsSync(graphDir)) {
        rmSync(graphDir, { recursive: true, force: true });
        console.log(`Deleted ${graphDir}`);
    }
    (0, registry_1.unregisterProject)(abs);
    console.log(`Removed from registry.`);
});
commander_1.program.parse();
