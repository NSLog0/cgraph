# cgraph

Code intelligence graph tool for AI agents. Parses any project (TS/JS/Python/Java/Go) via Tree-sitter, builds a knowledge graph, exposes it as MCP server + Web UI.

## Usage

```bash
cgraph analyze /path/to/project     # parse + build graph
cgraph serve /path/to/project       # start MCP (8667) + Web UI (8668)
cgraph setup /path/to/project       # write .mcp.json + Claude Code hooks
cgraph list                         # list all indexed projects
cgraph status /path/to/project      # show graph stats
cgraph clean /path/to/project       # delete graph index
```

## Architecture

```
cgraph.js                 — entry point: patches MCP SDK module resolution, loads dist/cli/index.js
src/
  cli/index.ts            — commander CLI (analyze, serve, setup, list, status, clean)
  parser/
    index.ts              — glob files, run tree-sitter, aggregate ParseResult
    extractor.ts          — extract nodes/edges per file (symbols, imports, calls, heritage)
    languages.ts          — language detection + grammar config
  graph/
    builder.ts            — resolve raw imports/calls/heritage → GraphEdge[]
                            alias resolution (tsconfig.json paths), file index, symbol index
    storage.ts            — save/load graph as .cgraph/graph.json in project folder
    registry.ts           — global registry at ~/.cgraph/registry.json
  mcp/server.ts           — Express + MCP SSE server, 8 tools, /api/graph, /api/file-context
  web/server.ts           — serves static Web UI on port 8668, proxies config.js
  web/public/index.html   — 3d-force-graph (WebGL 3D) visualization, floating glass panel
  claude-md/generator.ts  — generate/update CLAUDE.md section in target project
  setup/index.ts          — write .mcp.json + .claude/settings.json with PreToolUse hook
  types/graph.ts          — TypeScript types (GraphNode, GraphEdge, CodeGraph)
dist/                     — pre-compiled JS (committed, no build step on install)
```

## Key Design Decisions

- **Two-pass parsing**: extract raw import strings first → resolve against full file index after all files parsed (needed because imports reference files not yet seen)
- **Alias resolution**: reads `tsconfig.json compilerOptions.paths`, aliased paths treated as project-root-relative (NOT joined with source file dirname)
- **Call graph**: best-effort name matching cross-file only, deduped — avoids noise from same-file calls
- **3D graph filter**: calls `graph3d.graphData(filtered)` — simulation restarts on filter change; highlight via closure re-eval pattern (`graph3d.nodeColor(graph3d.nodeColor())`); `contains` edges always hidden (too noisy)
- **MCP per-connection server**: each SSE connection gets its own `McpServer` instance — shared instance crashes on second connect
- **WASM parser**: uses `web-tree-sitter@0.22.6` + `tree-sitter-wasms` — no native compilation, WASM files loaded from `tree-sitter-wasms/out/*.wasm` via `Parser.Language.load()`
- **TSX grammar**: `.tsx` → `tree-sitter-tsx.wasm`, `.ts` → `tree-sitter-typescript.wasm` — separate WASM files
- **MCP transport**: SSE (`/sse` + `/messages`) — persistent, works with Claude Code's MCP client
- **Global install**: `dist/` is pre-committed; `cgraph.js` loads `./dist/cli/index.js` directly — no build step on install; `tsx`/`typescript` are devDependencies only
- **MCP SDK resolution**: Node.js v22 requires exact `.js` extensions in exports wildcards; `cgraph.js` patches `Module._resolveFilename` at startup to redirect failing SDK requires to `dist/cjs/*.js`
- **install.sh**: `git clone --depth 1` to `~/.cgraph` + `npm install --omit=dev` + `npm link` — used instead of `npm install -g github:` to avoid WSL2 TAR extraction issues

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_overview` | High-level architecture summary |
| `find_symbol` | Find functions/classes by name |
| `get_file_dependencies` | What a file imports |
| `get_callers` | What calls a given function |
| `get_file_structure` | All symbols in a file |
| `search_nodes` | Search by keyword + type |
| `context` | 360° view: definition, callers, callees, siblings |
| `impact` | Blast radius BFS — what breaks if this changes |

## Graph Node Types

`file`, `function`, `arrow_function`, `class`, `method`

## Graph Edge Types

`contains`, `imports`, `calls`, `extends`, `implements`

## Storage

- Per-project graph: `<project>/.cgraph/graph.json`
- Global registry: `~/.cgraph/registry.json`
- Claude Code hooks: `<project>/.cgraph/hooks/pre_edit.py`

## Ports

- MCP server: `8667` (SSE at `/sse`, graph at `/api/graph`, file context at `/api/file-context`)
- Web UI: `8668`

## Web UI

- `3d-force-graph` (Three.js WebGL) — 3D force-directed, mouse rotate/zoom/pan
- Particle animation on `calls` edges (3 particles, speed 0.005)
- Click node → highlight neighbors, show floating glass detail panel (DOM-built, no innerHTML with data)
- Filter rebuilds graph data: 1000 nodes max, 2000 semantic edges (`contains` always excluded)
- `onEngineStop` → auto `zoomToFit(600)` after simulation stabilizes
- Panel + legend use `position: absolute` floating over graph (not flex siblings) — avoids canvas overlap issue
- `#overlay` is a sibling of `#graph-container` inside `#main`, NOT a child — ForceGraph3D clears its container on init

## Known Limitations

- Call graph is best-effort (name matching, not type-aware) — some false positives/negatives
- Python/Java/Go support is simpler than TS/JS

## Install

```bash
# production (recommended — avoids WSL2/npm TAR issues)
curl -fsSL https://raw.githubusercontent.com/NSLog0/cgraph/master/install.sh | bash

# update
git -C ~/.cgraph pull

# uninstall
npm unlink -g cgraph && rm -rf ~/.cgraph

# development
cd /home/nslog0/development/cgraph && npm link
```

<!-- cgraph:start -->
## Code Intelligence (cgraph)

**Project:** cgraph
**Last analyzed:** 2026-04-27T03:52:50.539Z
**Stats:** 14 files · 39 functions · 0 classes
**Languages:** javascript (2 files), typescript (12 files)

### Key Files
- cgraph.js
- server.ts
- graph.ts
- index.ts
- languages.ts
- index.ts
- extractor.ts
- server.ts
- storage.ts
- registry.ts
- builder.ts
- index.ts
- generator.ts

### Classes & Interfaces
N/A

### Top-level Functions
- `patchMcpSdkResolution` in `bin/cgraph.js` (line 11)
- `findSdkCjsDir` in `bin/cgraph.js` (line 15)
- `<anonymous>` in `bin/cgraph.js` (line 28)
- `startWebServer` in `src/web/server.ts` (line 4)
- `buildHookScript` in `src/setup/index.ts` (line 4)
- `setupProject` in `src/setup/index.ts` (line 19)
- `detectLanguage` in `src/parser/languages.ts` (line 98)
- `initParser` in `src/parser/index.ts` (line 13)
- `loadLanguage` in `src/parser/index.ts` (line 24)
- `parseProject` in `src/parser/index.ts` (line 40)
- `getText` in `src/parser/extractor.ts` (line 35)
- `getNameFromNode` in `src/parser/extractor.ts` (line 39)
- `walkNodes` in `src/parser/extractor.ts` (line 44)
- `isInsideClass` in `src/parser/extractor.ts` (line 52)
- `extractCalleeName` in `src/parser/extractor.ts` (line 61)
- `extractImportPath` in `src/parser/extractor.ts` (line 87)
- `extractHeritage` in `src/parser/extractor.ts` (line 116)
- `extractFromSource` in `src/parser/extractor.ts` (line 170)
- `nodeLabel` in `src/mcp/server.ts` (line 9)
- `impactBFS` in `src/mcp/server.ts` (line 13)

> This section is auto-generated by [cgraph](https://github.com/NSLog0/cgraph). Run `cgraph analyze <path>` to update.
<!-- cgraph:end -->
