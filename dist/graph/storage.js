"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraphPath = getGraphPath;
exports.saveGraph = saveGraph;
exports.loadGraph = loadGraph;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GRAPH_DIR = '.cgraph';
const GRAPH_FILE = 'graph.json';
function getGraphPath(projectPath) {
    return path_1.default.join(path_1.default.resolve(projectPath), GRAPH_DIR, GRAPH_FILE);
}
function saveGraph(graph) {
    const dir = path_1.default.join(graph.projectPath, GRAPH_DIR);
    fs_1.default.mkdirSync(dir, { recursive: true });
    const gitignorePath = path_1.default.join(dir, '.gitignore');
    if (!fs_1.default.existsSync(gitignorePath)) {
        fs_1.default.writeFileSync(gitignorePath, '*\n');
    }
    fs_1.default.writeFileSync(path_1.default.join(dir, GRAPH_FILE), JSON.stringify(graph, null, 2), 'utf-8');
}
function loadGraph(projectPath) {
    const graphPath = getGraphPath(projectPath);
    if (!fs_1.default.existsSync(graphPath))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(graphPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
