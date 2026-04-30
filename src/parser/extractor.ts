import Parser from 'web-tree-sitter';
import path from 'path';
import { GraphNode, GraphEdge, Language } from '../types/graph';
import { LanguageConfig } from './languages';

let counter = 0;
const newEdgeId = () => `e_${++counter}`;

export interface RawImport {
  sourceId: string;
  importPath: string;
  sourceFilePath: string;
}

export interface RawCall {
  sourceFileId: string;
  calleeName: string;
}

export interface RawHeritage {
  sourceClassId: string;
  targetName: string;
  type: 'extends' | 'implements';
  sourceFilePath: string;
}

export interface ExtractResult {
  nodes: GraphNode[];
  containsEdges: GraphEdge[];
  rawImports: RawImport[];
  rawCalls: RawCall[];
  rawHeritage: RawHeritage[];
}

function getText(node: Parser.SyntaxNode): string {
  return node.text ?? '';
}

function getNameFromNode(node: Parser.SyntaxNode, config: LanguageConfig): string {
  const nameNode = node.childForFieldName(config.nodeTypes.nameField);
  return nameNode ? getText(nameNode) : '<anonymous>';
}

function walkNodes(node: Parser.SyntaxNode, cb: (n: Parser.SyntaxNode) => void) {
  cb(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkNodes(child, cb);
  }
}

function isInsideClass(node: Parser.SyntaxNode): boolean {
  let p = node.parent;
  while (p) {
    if (['class_declaration', 'class_body', 'class_definition'].includes(p.type)) return true;
    p = p.parent;
  }
  return false;
}

function extractCalleeName(callNode: Parser.SyntaxNode, language: Language): string | null {
  const calleeNode = callNode.childForFieldName('function');
  if (!calleeNode) return null;

  if (calleeNode.type === 'identifier' || calleeNode.type === 'property_identifier') {
    return getText(calleeNode);
  }
  if (calleeNode.type === 'member_expression') {
    const prop = calleeNode.childForFieldName('property');
    return prop ? getText(prop) : null;
  }
  if (calleeNode.type === 'attribute') {
    const attr = calleeNode.childForFieldName('attribute');
    return attr ? getText(attr) : null;
  }
  if (calleeNode.type === 'selector_expression') {
    const field = calleeNode.childForFieldName('field');
    return field ? getText(field) : null;
  }
  if (language === 'java') {
    const nameNode = callNode.childForFieldName('name');
    return nameNode ? getText(nameNode) : null;
  }
  return null;
}

function extractImportPath(importNode: Parser.SyntaxNode, language: Language): string | null {
  if (language === 'typescript' || language === 'javascript') {
    const source = importNode.childForFieldName('source');
    if (source) return getText(source).replace(/['"]/g, '');
  }
  if (language === 'python') {
    if (importNode.type === 'import_from_statement') {
      const mod = importNode.childForFieldName('module_name');
      if (mod) return getText(mod).replace(/\./g, '/');
    }
    return null;
  }
  if (language === 'java') {
    const text = getText(importNode).replace(/^import\s+/, '').replace(/;$/, '').trim();
    return text || null;
  }
  if (language === 'go') {
    let found: string | null = null;
    walkNodes(importNode, (child) => {
      if (child.type === 'interpreted_string_literal' || child.type === 'raw_string_literal') {
        found = getText(child).replace(/['"]/g, '');
      }
    });
    return found;
  }
  return null;
}

// Extract parent class/interface names from class heritage
function extractHeritage(classNode: Parser.SyntaxNode, classId: string, filePath: string, language: Language): RawHeritage[] {
  const result: RawHeritage[] = [];

  if (language === 'typescript' || language === 'javascript') {
    walkNodes(classNode, (n) => {
      if (n.type === 'extends_clause') {
        for (let i = 0; i < n.childCount; i++) {
          const child = n.child(i);
          if (!child) continue;
          if (child.type === 'identifier' || child.type === 'type_identifier') {
            result.push({ sourceClassId: classId, targetName: getText(child), type: 'extends', sourceFilePath: filePath });
          }
        }
      }
      if (n.type === 'implements_clause') {
        walkNodes(n, (impl) => {
          if (impl.type === 'type_identifier' || impl.type === 'identifier') {
            result.push({ sourceClassId: classId, targetName: getText(impl), type: 'implements', sourceFilePath: filePath });
          }
        });
      }
    });
  }

  if (language === 'python') {
    // class Foo(Bar, Baz): — superclasses in argument_list
    const argList = classNode.childForFieldName('superclasses');
    if (argList) {
      walkNodes(argList, (n) => {
        if (n.type === 'identifier') {
          result.push({ sourceClassId: classId, targetName: getText(n), type: 'extends', sourceFilePath: filePath });
        }
      });
    }
  }

  if (language === 'java') {
    const superclass = classNode.childForFieldName('superclass');
    if (superclass) {
      result.push({ sourceClassId: classId, targetName: getText(superclass).replace(/^extends\s+/, '').trim(), type: 'extends', sourceFilePath: filePath });
    }
    const interfaces = classNode.childForFieldName('interfaces');
    if (interfaces) {
      walkNodes(interfaces, (n) => {
        if (n.type === 'type_identifier') {
          result.push({ sourceClassId: classId, targetName: getText(n), type: 'implements', sourceFilePath: filePath });
        }
      });
    }
  }

  return result;
}

export function extractFromSource(
  source: string,
  filePath: string,
  language: Language,
  config: LanguageConfig,
  parser: Parser
): ExtractResult {
  const nodes: GraphNode[] = [];
  const containsEdges: GraphEdge[] = [];
  const rawImports: RawImport[] = [];
  const rawCalls: RawCall[] = [];
  const rawHeritage: RawHeritage[] = [];

  let tree: Parser.Tree;
  try {
    tree = parser.parse(source);
  } catch {
    return { nodes, containsEdges, rawImports, rawCalls, rawHeritage };
  }

  const fileNodeId = `file::${filePath}`;
  nodes.push({
    id: fileNodeId,
    type: 'file',
    name: path.basename(filePath),
    filePath,
    language,
    startLine: 1,
    endLine: source.split('\n').length,
  });

  const { function: funcTypes, class: classTypes, method: methodTypes, import: importTypes, call: callTypes } = config.nodeTypes;

  walkNodes(tree.rootNode, (node) => {
    if (classTypes.includes(node.type)) {
      const name = getNameFromNode(node, config);
      const id = `class::${filePath}::${name}::${node.startPosition.row}`;
      nodes.push({ id, type: 'class', name, filePath, language, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
      containsEdges.push({ id: newEdgeId(), source: fileNodeId, target: id, type: 'contains' });
      rawHeritage.push(...extractHeritage(node, id, filePath, language));

    } else if (methodTypes.includes(node.type) && isInsideClass(node)) {
      const name = getNameFromNode(node, config);
      const id = `method::${filePath}::${name}::${node.startPosition.row}`;
      nodes.push({ id, type: 'method', name, filePath, language, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
      containsEdges.push({ id: newEdgeId(), source: fileNodeId, target: id, type: 'contains' });

    } else if (funcTypes.includes(node.type) && !isInsideClass(node)) {
      const name = getNameFromNode(node, config);
      const id = `func::${filePath}::${name}::${node.startPosition.row}`;
      nodes.push({ id, type: 'function', name, filePath, language, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
      containsEdges.push({ id: newEdgeId(), source: fileNodeId, target: id, type: 'contains' });

    } else if (importTypes.includes(node.type)) {
      const importPath = extractImportPath(node, language);
      if (importPath) rawImports.push({ sourceId: fileNodeId, importPath, sourceFilePath: filePath });

    } else if (callTypes.includes(node.type)) {
      const calleeName = extractCalleeName(node, language);
      if (calleeName && calleeName !== '<anonymous>') {
        rawCalls.push({ sourceFileId: fileNodeId, calleeName });
      }
    }
  });

  return { nodes, containsEdges, rawImports, rawCalls, rawHeritage };
}
