import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
}

// Parse syntax so multiline imports, re-exports, dynamic imports and require
// calls are checked without matching comments or ordinary strings.
export function checkImportBoundaries(root) {
  root = realpathSync(root);
  const errors = [];
  function check(file, source) {
    if (source?.type !== 'Literal' || typeof source.value !== 'string') {
      errors.push(`${relative(root, file)}: import must use a literal specifier to verify its boundary`);
      return;
    }
    const specifier = source.value;
    if (isBuiltin(specifier)) return;
    try {
      const resolved = specifier.startsWith('file:')
        ? fileURLToPath(new URL(specifier))
        : createRequire(file).resolve(specifier);
      if (!inside(root, resolved) || !inside(root, realpathSync(resolved))) {
        errors.push(`${relative(root, file)}: ${specifier} resolves outside telephony/`);
      }
    } catch (error) {
      errors.push(`${relative(root, file)}: cannot resolve ${specifier}: ${error.message}`);
    }
  }
  function visit(node, file) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
      check(file, node.source);
    } else if (node.type === 'ImportExpression') {
      check(file, node.source);
    } else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      check(file, node.arguments[0]);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, file));
      else if (value && typeof value === 'object') visit(value, file);
    }
  }
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.[cm]?js$/.test(entry.name)) {
        try {
          visit(parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }), file);
        } catch (error) {
          errors.push(`${relative(root, file)}: ${error.message}`);
        }
      }
    }
  }
  scan(join(root, 'src'));
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = checkImportBoundaries(dirname(dirname(fileURLToPath(import.meta.url))));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('All telephony/src imports resolve within telephony/ or to Node builtins.');
  }
}
