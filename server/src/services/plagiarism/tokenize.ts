import type { LanguageKey } from '../../types/schema.js';

const C_LIKE_KEYWORDS = [
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
  'int', 'long', 'short', 'char', 'float', 'double', 'void', 'bool', 'unsigned', 'signed', 'const',
  'static', 'struct', 'sizeof', 'true', 'false', 'null', 'new', 'delete', 'class', 'public', 'private',
  'protected', 'try', 'catch', 'throw', 'goto', 'enum', 'typedef', 'auto',
];

const KEYWORDS: Record<LanguageKey, Set<string>> = {
  python: new Set([
    'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'def', 'return', 'lambda',
    'class', 'try', 'except', 'finally', 'raise', 'with', 'as', 'import', 'from', 'pass', 'break',
    'continue', 'yield', 'None', 'True', 'False', 'global', 'nonlocal', 'del', 'assert',
  ]),
  javascript: new Set([
    ...C_LIKE_KEYWORDS, 'let', 'var', 'function', 'of', 'in', 'undefined', 'typeof', 'instanceof',
    'async', 'await', 'yield', 'this', 'extends', 'super', 'import', 'export', 'finally',
  ]),
  cpp: new Set([...C_LIKE_KEYWORDS, 'template', 'typename', 'namespace', 'using', 'std', 'vector', 'string', 'nullptr', 'this', 'virtual', 'override']),
  java: new Set([...C_LIKE_KEYWORDS, 'boolean', 'byte', 'final', 'extends', 'implements', 'interface', 'import', 'package', 'this', 'super', 'String', 'finally', 'var']),
  c: new Set(C_LIKE_KEYWORDS),
};

// Alternation order matters: comments and strings are consumed before anything inside them can match.
const C_LIKE_SCANNER = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|([A-Za-z_]\w*)|(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|(==|!=|<=|>=|&&|\|\||\+\+|--|->|<<|>>|::|[^\s\w])/g;
const PY_SCANNER = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|([A-Za-z_]\w*)|(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|(==|!=|<=|>=|\*\*|\/\/|->|[^\s\w])/g;

/**
 * Normalizes source into a token stream that is robust to cosmetic changes:
 *  - comments & whitespace removed
 *  - every identifier → "V" (defeats variable renaming), keywords kept
 *  - string literals → "S", numbers → "N"
 */
export function tokenize(code: string, language: LanguageKey): string[] {
  const scanner = new RegExp(language === 'python' ? PY_SCANNER : C_LIKE_SCANNER);
  const keywords = KEYWORDS[language];
  const out: string[] = [];
  for (const m of code.matchAll(scanner)) {
    const [, comment, str, ident, num, op] = m;
    if (comment) continue;
    if (str) out.push('S');
    else if (ident) out.push(keywords.has(ident) ? ident : 'V');
    else if (num) out.push('N');
    else if (op) out.push(op);
  }
  return out;
}
