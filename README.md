# cgraph

A code intelligence tool that parses any project into a knowledge graph and exposes it to AI agents via MCP (Model Context Protocol). Works with TypeScript, JavaScript, Python, Java, and Go.

**What it does:**
- Scans your project and builds a graph of files, functions, classes, and their relationships
- Starts an MCP server so Claude Code can query the graph during coding sessions
- Generates/updates `CLAUDE.md` with an architectural summary of your project
- Provides a 3D interactive web UI to visually explore the graph (rotate, zoom, click nodes)

---

## Requirements

- Node.js 18 or higher

Check with:
```bash
node --version
```

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/NSLog0/cgraph/master/install.sh | bash
```

Verify it works:
```bash
cgraph --version
```

To update to the latest version:
```bash
git -C ~/.cgraph pull
```

---

## Usage

### Step 1 — Analyze a project

Point it at any project folder:

```bash
cgraph analyze /path/to/your-project
```

This will:
- Parse all source files (TS, JS, Python, Java, Go)
- Save the graph to `.cgraph/graph.json` inside your project
- Create or update `CLAUDE.md` with an architecture summary

### Step 2 — Start the server

```bash
cgraph serve /path/to/your-project
```

This starts two servers:
- **MCP server** at `http://localhost:8667/sse` — for Claude Code
- **Web UI** at `http://localhost:8668` — open in your browser to explore the graph

### Step 3 — Connect Claude Code

Create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "cgraph": {
      "type": "sse",
      "url": "http://localhost:8667/sse"
    }
  }
}
```

Restart Claude Code. It will now have access to your project's code graph.

---

## MCP Tools Available to Claude

| Tool | Description |
|---|---|
| `get_overview` | High-level summary of the project architecture |
| `find_symbol` | Find a function or class by name |
| `get_file_dependencies` | What a file imports |
| `get_callers` | What calls a specific function |
| `get_file_structure` | All symbols defined in a file |
| `search_nodes` | Search by keyword and type |
| `context` | 360° view: definition, callers, callees, heritage |
| `impact` | Blast radius — what breaks if this symbol changes |

---

## Other Commands

```bash
# Check graph status without starting the server
cgraph status /path/to/project

# Re-analyze after code changes
cgraph analyze /path/to/project --force

# Custom ports (defaults: 8667 for MCP, 8668 for Web UI)
cgraph serve /path/to/project --mcp-port 8667 --web-port 8668

# List all indexed projects
cgraph list

# Remove a project from the index
cgraph clean /path/to/project
```

---

## Supported Languages

| Language | Extensions |
|---|---|
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py` |
| Java | `.java` |
| Go | `.go` |

---

## How It Works

```
cgraph analyze <path>
  └─ Scan files
  └─ Parse each file with Tree-sitter
  └─ Extract functions, classes, imports, call chains
  └─ Save graph to .cgraph/graph.json
  └─ Write CLAUDE.md

cgraph serve <path>
  └─ Load graph.json
  └─ MCP server :8667  ← Claude Code queries this
  └─ Web UI     :8668  ← You browse this
```

---

## Troubleshooting

### Install fails or takes too long

cgraph ships pre-compiled JS and uses **WebAssembly (WASM)** for parsing — no native compilation or build step required. Install should complete in under a minute.

If `npm install` hangs or throws errors during install, set the shell explicitly first:

```bash
npm config set script-shell /bin/bash
```

Then re-run the install script.

### `Cannot find module` on first run

Make sure you're on Node.js 18 or higher:

```bash
node --version
```

### Web UI shows no edges

If the graph shows only dots with no connecting lines, the parser may not have extracted relationships for that language. This is most common with Java and Go projects. Try switching to **Files only** view in the toolbar — file-level import edges are more reliably detected.

---

## Uninstall

```bash
npm unlink -g cgraph && rm -rf ~/.cgraph
```

---

## Web UI

Open `http://localhost:8668` after running `cgraph serve`.

- **Rotate** — left-click drag
- **Zoom** — scroll wheel
- **Pan** — right-click drag
- **Inspect node** — click any node to open the detail panel (top-right)
- **Filter** — use the toolbar to search by name, filter by type or language
- **fit view** — re-center the camera
- **reheat** — restart the force simulation if nodes drift apart
