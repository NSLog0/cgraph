import fs from 'fs';
import path from 'path';
import os from 'os';

const REGISTRY_DIR = path.join(os.homedir(), '.cgraph');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'registry.json');

export interface RegistryEntry {
  name: string;
  projectPath: string;
  analyzedAt: string;
  stats: { totalFiles: number; totalFunctions: number; totalClasses: number };
}

function readRegistry(): RegistryEntry[] {
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeRegistry(entries: RegistryEntry[]): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

export function registerProject(entry: RegistryEntry): void {
  const entries = readRegistry().filter((e) => e.projectPath !== entry.projectPath);
  entries.unshift(entry);
  writeRegistry(entries);
}

export function listProjects(): RegistryEntry[] {
  return readRegistry();
}

export function unregisterProject(projectPath: string): void {
  writeRegistry(readRegistry().filter((e) => e.projectPath !== projectPath));
}
