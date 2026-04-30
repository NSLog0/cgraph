"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProject = registerProject;
exports.listProjects = listProjects;
exports.unregisterProject = unregisterProject;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const REGISTRY_DIR = path_1.default.join(os_1.default.homedir(), '.cgraph');
const REGISTRY_FILE = path_1.default.join(REGISTRY_DIR, 'registry.json');
function readRegistry() {
    if (!fs_1.default.existsSync(REGISTRY_FILE))
        return [];
    try {
        return JSON.parse(fs_1.default.readFileSync(REGISTRY_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function writeRegistry(entries) {
    fs_1.default.mkdirSync(REGISTRY_DIR, { recursive: true });
    fs_1.default.writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}
function registerProject(entry) {
    const entries = readRegistry().filter((e) => e.projectPath !== entry.projectPath);
    entries.unshift(entry);
    writeRegistry(entries);
}
function listProjects() {
    return readRegistry();
}
function unregisterProject(projectPath) {
    writeRegistry(readRegistry().filter((e) => e.projectPath !== projectPath));
}
