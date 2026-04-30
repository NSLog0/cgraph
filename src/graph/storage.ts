import fs from 'fs';
import path from 'path';
import { CodeGraph } from '../types/graph';

const GRAPH_DIR = '.cgraph';
const GRAPH_FILE = 'graph.json';

export function getGraphPath(projectPath: string): string {
  return path.join(path.resolve(projectPath), GRAPH_DIR, GRAPH_FILE);
}

export function saveGraph(graph: CodeGraph): void {
  const dir = path.join(graph.projectPath, GRAPH_DIR);
  fs.mkdirSync(dir, { recursive: true });

  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n');
  }

  fs.writeFileSync(path.join(dir, GRAPH_FILE), JSON.stringify(graph, null, 2), 'utf-8');
}

export function loadGraph(projectPath: string): CodeGraph | null {
  const graphPath = getGraphPath(projectPath);
  if (!fs.existsSync(graphPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as CodeGraph;
  } catch {
    return null;
  }
}
