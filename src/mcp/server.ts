import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';
import { z } from 'zod';
import { CodeGraph, GraphNode } from '../types/graph';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeLabel(n: GraphNode): string {
  return `[${n.type}] ${n.name}  (${n.filePath}:${n.startLine})`;
}

function impactBFS(graph: CodeGraph, startIds: string[], maxDepth: number): Map<string, { node: GraphNode; depth: number }> {
  const reverseAdj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type === 'contains') continue;
    const list = reverseAdj.get(e.target) ?? [];
    list.push(e.source);
    reverseAdj.set(e.target, list);
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Map<string, { node: GraphNode; depth: number }>();
  let frontier = new Set(startIds);

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const srcId of reverseAdj.get(id) ?? []) {
        if (visited.has(srcId) || startIds.includes(srcId)) continue;
        const node = nodeById.get(srcId);
        if (!node) continue;
        visited.set(srcId, { node, depth });
        next.add(srcId);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return visited;
}

function formatFileContext(graph: CodeGraph, fileId: string): string {
  const fileNode = graph.nodes.find((n) => n.id === fileId);
  if (!fileNode) return '';

  const symbols = graph.nodes.filter((n) => n.type !== 'file' && n.filePath === fileNode.filePath);
  const outImports = graph.edges.filter((e) => e.source === fileId && e.type === 'imports');
  const inImports = graph.edges.filter((e) => e.target === fileId && e.type === 'imports');
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const lines = [
    `## cgraph context: ${fileNode.filePath}`,
    '',
    `**Symbols defined (${symbols.length}):**`,
    ...symbols.map((s) => `  - [${s.type}] ${s.name}  line ${s.startLine}–${s.endLine}`),
  ];

  if (outImports.length) {
    lines.push('', `**Imports (${outImports.length}):**`);
    outImports.forEach((e) => {
      const t = nodeById.get(e.target);
      lines.push(`  - ${t ? t.filePath : e.target}`);
    });
  }

  if (inImports.length) {
    lines.push('', `**Imported by (${inImports.length}):**`);
    inImports.slice(0, 10).forEach((e) => {
      const s = nodeById.get(e.source);
      lines.push(`  - ${s ? s.filePath : e.source}`);
    });
  }

  const callers = graph.edges.filter((e) => e.target === fileId && e.type === 'calls');
  if (callers.length) {
    lines.push('', `**Called from (${callers.length}):**`);
    callers.slice(0, 10).forEach((e) => {
      const s = nodeById.get(e.source);
      lines.push(`  - ${s ? s.name : e.source}`);
    });
  }

  return lines.join('\n');
}

// ── MCP Server ────────────────────────────────────────────────────────────────

function buildMcpServer(graph: CodeGraph): McpServer {
  const server = new McpServer({ name: 'cgraph', version: '1.0.0' });
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // get_overview
  server.tool('get_overview', 'High-level project architecture summary', {}, async () => {
    const { projectName, stats } = graph;
    const importCount = graph.edges.filter((e) => e.type === 'imports').length;
    const callCount = graph.edges.filter((e) => e.type === 'calls').length;
    const extendsCount = graph.edges.filter((e) => e.type === 'extends' || e.type === 'implements').length;

    const topClasses = graph.nodes.filter((n) => n.type === 'class').slice(0, 10).map((n) => `  - ${nodeLabel(n)}`);
    const topFunctions = graph.nodes.filter((n) => n.type === 'function').slice(0, 15).map((n) => `  - ${nodeLabel(n)}`);

    return {
      content: [{
        type: 'text', text: [
          `# ${projectName} — Architecture Overview`,
          `Files: ${stats.totalFiles}  Functions: ${stats.totalFunctions}  Classes: ${stats.totalClasses}`,
          `Languages: ${Object.entries(stats.languages).map(([l, c]) => `${l}(${c})`).join(', ')}`,
          `Edges: ${importCount} imports · ${callCount} calls · ${extendsCount} heritage`,
          '',
          '## Classes', topClasses.join('\n') || '  (none)',
          '',
          '## Functions', topFunctions.join('\n') || '  (none)',
        ].join('\n'),
      }],
    };
  });

  // find_symbol
  // @ts-ignore — MCP SDK generic depth exceeds TS inference limit
  server.tool('find_symbol', 'Find functions, classes, or methods by name', { name: z.string() }, async ({ name }) => {
    const lower = name.toLowerCase();
    const matches = graph.nodes.filter((n) => n.type !== 'file' && n.name.toLowerCase().includes(lower)).slice(0, 20);
    if (!matches.length) return { content: [{ type: 'text', text: `No symbol matching "${name}"` }] };
    return { content: [{ type: 'text', text: matches.map(nodeLabel).join('\n') }] };
  });

  // get_file_dependencies
  server.tool('get_file_dependencies', 'What a file imports', { filePath: z.string() }, async ({ filePath }) => {
    const lower = filePath.toLowerCase();
    const fileNode = graph.nodes.find((n) => n.type === 'file' && n.filePath.toLowerCase().includes(lower));
    if (!fileNode) return { content: [{ type: 'text', text: `File not found: ${filePath}` }] };

    const imports = graph.edges.filter((e) => e.source === fileNode.id && e.type === 'imports')
      .map((e) => nodeById.get(e.target)?.filePath ?? e.target);

    return { content: [{ type: 'text', text: imports.length ? `${fileNode.filePath} imports:\n` + imports.map((i) => `  - ${i}`).join('\n') : `${fileNode.filePath} has no detected imports` }] };
  });

  // get_callers
  server.tool('get_callers', 'What files/functions call a given function', { name: z.string() }, async ({ name }) => {
    const lower = name.toLowerCase();
    const targets = graph.nodes.filter((n) => ['function', 'method'].includes(n.type) && n.name.toLowerCase() === lower);
    if (!targets.length) return { content: [{ type: 'text', text: `No function named "${name}"` }] };

    const callers = graph.edges
      .filter((e) => e.type === 'calls' && targets.some((t) => t.id === e.target))
      .map((e) => { const s = nodeById.get(e.source); return s ? `  - ${s.name}  (${s.filePath}:${s.startLine})` : `  - ${e.source}`; });

    return { content: [{ type: 'text', text: callers.length ? `Callers of "${name}":\n` + callers.join('\n') : `No callers found for "${name}"` }] };
  });

  // get_file_structure
  server.tool('get_file_structure', 'All symbols defined in a file', { filePath: z.string() }, async ({ filePath }) => {
    const lower = filePath.toLowerCase();
    const symbols = graph.nodes.filter((n) => n.type !== 'file' && n.filePath.toLowerCase().includes(lower))
      .sort((a, b) => a.startLine - b.startLine);
    if (!symbols.length) return { content: [{ type: 'text', text: `No symbols found in "${filePath}"` }] };
    return { content: [{ type: 'text', text: `Symbols in ${filePath}:\n` + symbols.map((n) => `  [${n.type}] ${n.name}  line ${n.startLine}–${n.endLine}`).join('\n') }] };
  });

  // search_nodes
  server.tool('search_nodes', 'Search by keyword and type', {
    keyword: z.string(),
    type: z.enum(['file', 'function', 'class', 'method', 'any']).optional().default('any'),
  }, async ({ keyword, type }) => {
    const lower = keyword.toLowerCase();
    const matches = graph.nodes.filter((n) => {
      const typeMatch = type === 'any' || n.type === type;
      return typeMatch && (n.name.toLowerCase().includes(lower) || n.filePath.toLowerCase().includes(lower));
    }).slice(0, 25);
    if (!matches.length) return { content: [{ type: 'text', text: `No matches for "${keyword}"` }] };
    return { content: [{ type: 'text', text: matches.map((n) => `[${n.type}] ${n.name} — ${n.filePath}:${n.startLine}`).join('\n') }] };
  });

  // context — 360° view of a symbol
  server.tool('context', 'Full 360° context of a symbol: definition, callers, callees, heritage', {
    name: z.string().describe('Symbol or file name'),
  }, async ({ name }) => {
    const lower = name.toLowerCase();
    const targets = graph.nodes.filter((n) => n.name.toLowerCase().includes(lower)).slice(0, 3);
    if (!targets.length) return { content: [{ type: 'text', text: `Symbol "${name}" not found` }] };

    const lines: string[] = [];
    for (const target of targets) {
      lines.push(`## ${target.name}  [${target.type}]`, `File: ${target.filePath}:${target.startLine}–${target.endLine}`, '');

      const outEdges = graph.edges.filter((e) => e.source === target.id && e.type !== 'contains');
      const inEdges = graph.edges.filter((e) => e.target === target.id && e.type !== 'contains');

      if (outEdges.length) {
        lines.push('**Outgoing:**');
        outEdges.slice(0, 10).forEach((e) => {
          const t = nodeById.get(e.target);
          lines.push(`  [${e.type}] → ${t ? `${t.name} (${t.filePath}:${t.startLine})` : e.target}`);
        });
      }
      if (inEdges.length) {
        lines.push('**Incoming:**');
        inEdges.slice(0, 10).forEach((e) => {
          const s = nodeById.get(e.source);
          lines.push(`  [${e.type}] ← ${s ? `${s.name} (${s.filePath}:${s.startLine})` : e.source}`);
        });
      }

      // Siblings in same file
      const siblings = graph.nodes.filter((n) => n.filePath === target.filePath && n.id !== target.id && n.type !== 'file');
      if (siblings.length) {
        lines.push(`**In same file (${siblings.length} symbols):**`);
        siblings.slice(0, 8).forEach((s) => lines.push(`  [${s.type}] ${s.name}  line ${s.startLine}`));
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  // impact — blast radius analysis
  // @ts-ignore — MCP SDK generic depth exceeds TS inference limit
  server.tool('impact', 'Blast radius: what is affected if this symbol changes', {
    name: z.string().describe('Symbol or file name to analyze'),
    maxDepth: z.number().optional().default(3),
  }, async ({ name, maxDepth }) => {
    const lower = name.toLowerCase();
    const targets = graph.nodes.filter((n) => n.name.toLowerCase().includes(lower) && n.type !== 'file');

    if (!targets.length) {
      // Try as file
      const fileTarget = graph.nodes.find((n) => n.type === 'file' && n.filePath.toLowerCase().includes(lower));
      if (!fileTarget) return { content: [{ type: 'text', text: `Symbol "${name}" not found` }] };
      targets.push(fileTarget);
    }

    const affected = impactBFS(graph, targets.map((t) => t.id), maxDepth);
    if (!affected.size) {
      return { content: [{ type: 'text', text: `No dependents found for "${name}" — nothing will break if this changes` }] };
    }

    const byDepth = new Map<number, GraphNode[]>();
    for (const { node, depth } of affected.values()) {
      const list = byDepth.get(depth) ?? [];
      list.push(node);
      byDepth.set(depth, list);
    }

    const lines = [
      `# Impact analysis: "${name}"`,
      `Changing this will affect **${affected.size} nodes** across ${new Set([...affected.values()].map((v) => v.node.filePath)).size} files.`,
      '',
    ];

    for (const depth of [...byDepth.keys()].sort()) {
      const nodes = byDepth.get(depth)!;
      lines.push(`## Depth ${depth} (${nodes.length} affected)`);
      nodes.forEach((n) => lines.push(`  - ${nodeLabel(n)}`));
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  return server;
}

// ── Express App ───────────────────────────────────────────────────────────────

export async function startMcpServer(graph: CodeGraph, port: number): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
    next();
  });

  const transports: Record<string, { transport: SSEServerTransport; server: McpServer }> = {};

  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const perClientServer = buildMcpServer(graph);
    transports[transport.sessionId] = { transport, server: perClientServer };
    await perClientServer.connect(transport);
    transport.onclose = () => { delete transports[transport.sessionId]; };
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const session = transports[sessionId];
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    await session.transport.handlePostMessage(req, res);
  });

  // Graph JSON for web UI
  app.get('/api/graph', (_req, res) => res.json(graph));

  // File context for Claude Code hooks
  app.get('/api/file-context', (req, res) => {
    const filePath = (req.query.path as string) ?? '';
    const lower = filePath.toLowerCase().replace(/\\/g, '/');
    const fileNode = graph.nodes.find((n) => n.type === 'file' && n.filePath.toLowerCase().replace(/\\/g, '/').endsWith(lower));
    if (!fileNode) { res.status(404).send(`File not found: ${filePath}`); return; }
    res.type('text').send(formatFileContext(graph, fileNode.id));
  });

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`  MCP SSE   → http://localhost:${port}/sse`);
      console.log(`  Graph API → http://localhost:${port}/api/graph`);
      resolve();
    });
  });
}
