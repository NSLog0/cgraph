"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWebServer = startWebServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
async function startWebServer(mcpPort, webPort) {
    const app = (0, express_1.default)();
    app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
    app.get('/config.js', (_req, res) => {
        res.type('js').send(`window.CODENEXUS_API = "http://localhost:${mcpPort}";`);
    });
    await new Promise((resolve) => {
        app.listen(webPort, () => {
            console.log(`  Web UI   → http://localhost:${webPort}`);
            resolve();
        });
    });
}
