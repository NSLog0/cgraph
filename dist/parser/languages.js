"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_CONFIGS = void 0;
exports.detectLanguage = detectLanguage;
exports.LANGUAGE_CONFIGS = [
    {
        language: 'tsx',
        extensions: ['.tsx'],
        wasmFile: 'tree-sitter-tsx.wasm',
        nodeTypes: {
            function: ['function_declaration', 'function_expression'],
            class: ['class_declaration'],
            method: ['method_definition'],
            import: ['import_statement'],
            call: ['call_expression'],
            nameField: 'name',
        },
    },
    {
        language: 'typescript',
        extensions: ['.ts'],
        wasmFile: 'tree-sitter-typescript.wasm',
        nodeTypes: {
            function: ['function_declaration', 'function_expression'],
            class: ['class_declaration'],
            method: ['method_definition'],
            import: ['import_statement'],
            call: ['call_expression'],
            nameField: 'name',
        },
    },
    {
        language: 'javascript',
        extensions: ['.js', '.jsx', '.mjs', '.cjs'],
        wasmFile: 'tree-sitter-javascript.wasm',
        nodeTypes: {
            function: ['function_declaration', 'function_expression'],
            class: ['class_declaration'],
            method: ['method_definition'],
            import: ['import_statement'],
            call: ['call_expression'],
            nameField: 'name',
        },
    },
    {
        language: 'python',
        extensions: ['.py'],
        wasmFile: 'tree-sitter-python.wasm',
        nodeTypes: {
            function: ['function_definition'],
            class: ['class_definition'],
            method: ['function_definition'],
            import: ['import_statement', 'import_from_statement'],
            call: ['call'],
            nameField: 'name',
        },
    },
    {
        language: 'java',
        extensions: ['.java'],
        wasmFile: 'tree-sitter-java.wasm',
        nodeTypes: {
            function: ['method_declaration'],
            class: ['class_declaration', 'interface_declaration'],
            method: ['method_declaration'],
            import: ['import_declaration'],
            call: ['method_invocation'],
            nameField: 'name',
        },
    },
    {
        language: 'go',
        extensions: ['.go'],
        wasmFile: 'tree-sitter-go.wasm',
        nodeTypes: {
            function: ['function_declaration'],
            class: ['type_declaration'],
            method: ['method_declaration'],
            import: ['import_declaration'],
            call: ['call_expression'],
            nameField: 'name',
        },
    },
];
function detectLanguage(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return exports.LANGUAGE_CONFIGS.find((c) => c.extensions.includes(ext)) ?? null;
}
