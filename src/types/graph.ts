export type NodeType = 'file' | 'function' | 'class' | 'method' | 'arrow_function';
export type EdgeType = 'imports' | 'calls' | 'extends' | 'implements' | 'contains';
export type Language = 'typescript' | 'tsx' | 'javascript' | 'python' | 'java' | 'go' | 'unknown';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string;
  language: Language;
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
}

export interface CodeGraph {
  projectPath: string;
  projectName: string;
  analyzedAt: string;
  stats: {
    totalFiles: number;
    totalFunctions: number;
    totalClasses: number;
    languages: Record<string, number>;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}
