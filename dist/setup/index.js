"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupProject = setupProject;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function buildHookScript(port) {
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
function setupProject(projectPath, mcpPort = 8667) {
    const abs = path_1.default.resolve(projectPath);
    // ── .mcp.json ──
    const mcpJson = {
        mcpServers: {
            cgraph: {
                type: 'sse',
                url: `http://localhost:${mcpPort}/sse`,
            },
        },
    };
    fs_1.default.writeFileSync(path_1.default.join(abs, '.mcp.json'), JSON.stringify(mcpJson, null, 2) + '\n', 'utf-8');
    console.log('  .mcp.json written ✓');
    // ── .cgraph/hooks/pre_edit.py ──
    const hooksDir = path_1.default.join(abs, '.cgraph', 'hooks');
    fs_1.default.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path_1.default.join(hooksDir, 'pre_edit.py');
    fs_1.default.writeFileSync(hookPath, buildHookScript(mcpPort), 'utf-8');
    fs_1.default.chmodSync(hookPath, 0o755);
    // ── .claude/settings.json ──
    const claudeDir = path_1.default.join(abs, '.claude');
    fs_1.default.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path_1.default.join(claudeDir, 'settings.json');
    let settings = {};
    if (fs_1.default.existsSync(settingsPath)) {
        try {
            settings = JSON.parse(fs_1.default.readFileSync(settingsPath, 'utf-8'));
        }
        catch { }
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
    fs_1.default.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    console.log('  .claude/settings.json written ✓');
    console.log(`\n  Hook: Before every Edit/Write, Claude will automatically query cgraph`);
    console.log(`        for file context (callers, imports, related symbols).`);
    console.log(`\n  Make sure "cgraph serve <path>" is running when using Claude Code.\n`);
}
