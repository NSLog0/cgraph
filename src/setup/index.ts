import fs from 'fs';
import path from 'path';

function buildHookScript(port: number): string {
  return `#!/usr/bin/env python3
import sys, json, urllib.request, urllib.parse
try:
    d = json.load(sys.stdin)
    fp = d.get('file_path', '')
    if fp:
        url = 'http://localhost:${port}/api/file-context?path=' + urllib.parse.quote(fp, safe='')
        resp = urllib.request.urlopen(url, timeout=2)
        print(resp.read().decode('utf-8'))
except:
    pass
`;
}

export function setupProject(projectPath: string, mcpPort = 8667): void {
  const abs = path.resolve(projectPath);

  // ── .mcp.json ──
  const mcpJson = {
    mcpServers: {
      cgraph: {
        type: 'sse',
        url: `http://localhost:${mcpPort}/sse`,
      },
    },
  };
  fs.writeFileSync(path.join(abs, '.mcp.json'), JSON.stringify(mcpJson, null, 2) + '\n', 'utf-8');
  console.log('  .mcp.json written ✓');

  // ── .cgraph/hooks/pre_edit.py ──
  const hooksDir = path.join(abs, '.cgraph', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'pre_edit.py');
  fs.writeFileSync(hookPath, buildHookScript(mcpPort), 'utf-8');
  fs.chmodSync(hookPath, 0o755);

  // ── .claude/settings.json ──
  const claudeDir = path.join(abs, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, 'settings.json');

  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
  }

  settings.hooks = {
    PreToolUse: [
      {
        matcher: 'Edit|Write|MultiEdit',
        hooks: [
          {
            type: 'command',
            command: `python3 ${hookPath}`,
          },
        ],
      },
    ],
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log('  .claude/settings.json written ✓');
  console.log(`\n  Hook: Before every Edit/Write, Claude will automatically query cgraph`);
  console.log(`        for file context (callers, imports, related symbols).`);
  console.log(`\n  Make sure "cgraph serve <path>" is running when using Claude Code.\n`);
}
