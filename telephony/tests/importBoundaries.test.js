import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkImportBoundaries } from '../scripts/check-import-boundaries.js';

test('import boundary check rejects external imports and symlink escapes', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'telephony-imports-'));
  try {
    const root = join(fixture, 'telephony');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(fixture, 'outside.js'), 'export const value = 1;');
    writeFileSync(join(root, 'src/local.js'), 'export const value = 1;');
    const entry = join(root, 'src/entry.js');
    writeFileSync(entry, "import { value } from './local.js'; import 'node:fs'; // import '../../outside.js'\n");
    assert.deepEqual(checkImportBoundaries(root), []);
    for (const code of [
      "import { value }\nfrom '../../outside.js';",
      "export { value } from '../../outside.js';",
      "await import('../../outside.js');",
      "require('../../outside.js');",
      `import ${JSON.stringify(join(fixture, 'outside.js'))};`,
    ]) {
      writeFileSync(entry, code);
      assert.match(checkImportBoundaries(root).join('\n'), /outside telephony\//);
    }
    symlinkSync(join(fixture, 'outside.js'), join(root, 'src/linked.js'));
    writeFileSync(entry, "import './linked.js';");
    assert.match(checkImportBoundaries(root).join('\n'), /outside telephony\//);
    writeFileSync(entry, 'import(somePath);');
    assert.match(checkImportBoundaries(root).join('\n'), /literal specifier/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
