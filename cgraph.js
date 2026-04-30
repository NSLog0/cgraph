#!/usr/bin/env node
'use strict';

// Node.js v22 requires exact file extensions in package exports wildcards.
// MCP SDK v1.12.0 exports "./*" without .js extensions, breaking require().
// This hook intercepts failed SDK requires and redirects to the direct CJS path.
const path = require('path');
const fs = require('fs');
const Module = require('module');

(function patchMcpSdkResolution() {
  const PREFIX = '@modelcontextprotocol/sdk/';
  let sdkCjsDir = null;

  function findSdkCjsDir() {
    const searchPaths = require.resolve.paths('@modelcontextprotocol/sdk') || [];
    for (const dir of searchPaths) {
      const candidate = path.join(dir, '@modelcontextprotocol', 'sdk', 'package.json');
      if (fs.existsSync(candidate)) {
        return path.join(path.dirname(candidate), 'dist', 'cjs');
      }
    }
    const local = path.join(__dirname, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs');
    return fs.existsSync(local) ? local : null;
  }

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (!request.startsWith(PREFIX)) {
      return origResolve.call(this, request, parent, isMain, options);
    }
    try {
      return origResolve.call(this, request, parent, isMain, options);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
      if (!sdkCjsDir) sdkCjsDir = findSdkCjsDir();
      if (!sdkCjsDir) throw e;
      const subpath = request.slice(PREFIX.length);
      const direct = path.join(sdkCjsDir, subpath + '.js');
      if (!fs.existsSync(direct)) throw e;
      return direct;
    }
  };
})();

require('./dist/cli/index.js');
