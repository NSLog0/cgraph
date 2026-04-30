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

### Option 1 — install.sh (recommended, works everywhere)

Works on macOS, Linux, and WSL2.

```bash
curl -fsSL https://raw.githubusercontent.com/NSLog0/cgraph/master/install.sh | bash
```

Installs to `~/.cgraph` and links the `cgraph` command globally.

**Update:**
```bash
git -C ~/.cgraph pull
```

**Uninstall:**
```bash
npm unlink -g cgraph && rm -rf ~/.cgraph
```

---

### Option 2 — npm install from GitHub (macOS / Linux only)

> ⚠️ Do not use this on WSL2 — npm has a TAR extraction bug with `.wasm` files on WSL2 that will break the install.

```bash
npm install -g github:NSLog0/cgraph
```

**Update:**
```bash
npm install -g github:NSLog0/cgraph
```

**Uninstall:**
```bash
npm uninstall -g cgraph
```

---

### Option 3 — local development

Use this if you've cloned the repo and want to work on cgraph itself.

```bash
git clone https://github.com/NSLog0/cgraph.git
cd cgraph
npm install
npm install -g .
```

After making changes to `src/`, rebuild before testing:

```bash
npm run build
```

**Unlink:**
```bash
npm uninstall -g cgraph
```

---

Verify any installation with:
```bash
cgraph --version
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

If the graph shows only dots with no connecting lines, the parser may not have extracted relationships for that language. This is most common with Java and Go projects. File-level import edges are more reliably detected than function-level call edges for these languages.

---

## Web UI

Open `http://localhost:8668` after running `cgraph serve`.

### Navigation

| Action | How |
|--------|-----|
| Rotate | Left-click drag |
| Zoom | Scroll wheel |
| Pan | Right-click drag |
| Inspect node | Click any node → detail panel opens on the right |
| Deselect | Click the same node again, or click the background |

### Node colors

| Color | Meaning |
|-------|---------|
| 🔵 Blue | File |
| 🟡 Gold (larger) | Entry point — a file nothing else imports, e.g. `page.tsx`, `route.ts` |
| 🟢 Green | Function / arrow function |
| 🟣 Purple | Class |
| 🟠 Orange | Method |

Entry points are a good place to start when exploring an unfamiliar codebase — they sit at the top of the dependency chain.

### Toolbar

- **Search** — filter nodes by name or file path, press Enter to apply
- **All languages / language name** — filter to a single language
- **Filter** — apply current search + language selection
- **fit view** — re-center the camera
- **reheat** — restart the force simulation

### Focus Mode

Zoom into one node's dependency neighborhood without the rest of the graph getting in the way.

1. Click any node to select it
2. Press **F** or click **focus [F]** in the toolbar
3. The graph shrinks to show only nodes within 2 hops of that node
4. Press **Esc** or click the yellow badge at the top to exit

### Hotspots tab

The right panel has two tabs: **Details** (selected node info) and **Hotspots**.

Hotspots shows:
- **Most Imported Files** — files imported by the most other files; usually shared utilities or config
- **Most Called Functions** — functions called from the most places; critical shared logic

Click any item in Hotspots to jump to that node's detail view.

### Edge direction

All edges have arrowheads. The arrow points **toward the dependency**:

```
route.ts ──imports──> prisma.ts
```
means `route.ts` depends on `prisma.ts`, not the other way around.

Animated particles on green edges indicate `calls` relationships.
