"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFromSource = extractFromSource;
const path_1 = __importDefault(require("path"));
let counter = 0;
const newEdgeId = () => `e_${++counter}`;
function getText(node) {
    return node.text ?? '';
}
function getNameFromNode(node, config) {
    const nameNode = node.childForFieldName(config.nodeTypes.nameField);
    return nameNode ? getText(nameNode) : '<anonymous>';
}
function walkNodes(node, cb) {
    cb(node);
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child)
            walkNodes(child, cb);
    }
}
function isInsideClass(node) {
    let p = node.parent;
    while (p) {
        if (['class_declaration', 'class_body', 'class_definition'].includes(p.type))
            return true;
        p = p.parent;
    }
    return false;
}
function extractCalleeName(callNode, language) {
    const calleeNode = callNode.childForFieldName('function');
    if (!calleeNode)
        return null;
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
function extractImportPath(importNode, language) {
    if (language === 'typescript' || language === 'javascript') {
        const source = importNode.childForFieldName('source');
        if (source)
            return getText(source).replace(/['"]/g, '');
    }
    if (language === 'python') {
        if (importNode.type === 'import_from_statement') {
            const mod = importNode.childForFieldName('module_name');
            if (mod)
                return getText(mod).replace(/\./g, '/');
        }
        return null;
    }
    if (language === 'java') {
        const text = getText(importNode).replace(/^import\s+/, '').replace(/;$/, '').trim();
        return text || null;
    }
    if (language === 'go') {
        let found = null;
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
function extractHeritage(classNode, classId, filePath, language) {
    const result = [];
    if (language === 'typescript' || language === 'javascript') {
        walkNodes(classNode, (n) => {
            if (n.type === 'extends_clause') {
                for (let i = 0; i < n.childCount; i++) {
                    const child = n.child(i);
                    if (!child)
                        continue;
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
function extractFromSource(source, filePath, language, config, parser) {
    const nodes = [];
    const containsEdges = [];
    const rawImports = [];
    const rawCalls = [];
    const rawHeritage = [];
    let tree;
    try {
        tree = parser.parse(source);
    }
    catch {
        return { nodes, containsEdges, rawImports, rawCalls, rawHeritage };
    }
    const fileNodeId = `file::${filePath}`;
    nodes.push({
        id: fileNodeId,
        type: 'file',
        name: path_1.default.basename(filePath),
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
        }
        else if (methodTypes.includes(node.type) && isInsideClass(node)) {
            const name = getNameFromNode(node, config);
            const id = `method::${filePath}::${name}::${node.startPosition.row}`;
            nodes.push({ id, type: 'method', name, filePath, language, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
            containsEdges.push({ id: newEdgeId(), source: fileNodeId, target: id, type: 'contains' });
        }
        else if (funcTypes.includes(node.type) && !isInsideClass(node)) {
            const name = getNameFromNode(node, config);
            const id = `func::${filePath}::${name}::${node.startPosition.row}`;
            nodes.push({ id, type: 'function', name, filePath, language, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
            containsEdges.push({ id: newEdgeId(), source: fileNodeId, target: id, type: 'contains' });
        }
        else if (importTypes.includes(node.type)) {
            const importPath = extractImportPath(node, language);
            if (importPath)
                rawImports.push({ sourceId: fileNodeId, importPath, sourceFilePath: filePath });
        }
        else if (callTypes.includes(node.type)) {
            const calleeName = extractCalleeName(node, language);
            if (calleeName && calleeName !== '<anonymous>') {
                rawCalls.push({ sourceFileId: fileNodeId, calleeName });
            }
        }
    });
    return { nodes, containsEdges, rawImports, rawCalls, rawHeritage };
}
