/**
 * Build the single self-contained deliverable.
 *
 *   node build.mjs
 *
 * Reads src/index.html, inlines every stylesheet and the whole ES-module graph
 * rooted at src/main.js, and writes heat-transfer-simulator.html.
 *
 * WHY A HAND-ROLLED BUNDLER
 * The deliverable must be one file that a student can double-click with no
 * install, no server and no network -- but a 10,000-line hand-maintained HTML
 * file would be miserable to edit. So the source stays modular and this script
 * does the flattening. It has no dependencies, so `node build.mjs` works on a
 * bare machine forever, with no npm install to rot.
 *
 * Rather than concatenating modules into one scope (where two files declaring
 * a helper with the same name would collide silently), each module is wrapped
 * in its own function with a tiny CommonJS-style registry. Scope isolation is
 * preserved exactly as with real ES modules.
 *
 * SUPPORTED SYNTAX (deliberately a strict subset -- all source here obeys it):
 *   import { a, b } from './x.js';       named imports, single or multi-line
 *   export function f() {}               named function export
 *   export const X = ...;                named const/let export
 *   export class C {}                    named class export
 * Not supported, and intentionally unused in this project: default exports,
 * `export *`, `export { a, b }` lists, namespace imports, dynamic import().
 * The build fails loudly if it meets any of them rather than emitting a broken
 * bundle.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const ENTRY = 'main.js';
const OUT = join(ROOT, 'heat-transfer-simulator.html');

/** Normalise a module path to a POSIX-style id relative to src/. */
function toId(absPath) {
  return relative(SRC, absPath).split('\\').join('/');
}

const UNSUPPORTED = [
  [/^\s*export\s+default\b/m, 'default export'],
  [/^\s*export\s*\*/m, 'export *'],
  [/^\s*export\s*\{/m, 'export { ... } list'],
  [/import\s+\*\s+as\b/, 'namespace import'],
  [/\bimport\s*\(/, 'dynamic import()'],
];

/**
 * Rewrite one module's source into a function body, and collect its
 * dependencies.
 */
function transform(id, source) {
  for (const [re, what] of UNSUPPORTED) {
    if (re.test(source)) {
      throw new Error(`${id}: unsupported syntax (${what}). See the note in build.mjs.`);
    }
  }

  const deps = [];
  let code = source;

  // import { a, b as c } from './x.js';  ->  const { a, b: c } = __req('x.js');
  code = code.replace(
    /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm,
    (_match, names, spec) => {
      const depId = toId(resolve(join(SRC, dirname(id)), spec));
      deps.push(depId);
      const bindings = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^(\S+)\s+as\s+(\S+)$/);
          return m ? `${m[1]}: ${m[2]}` : s;
        })
        .join(', ');
      return `const { ${bindings} } = __req(${JSON.stringify(depId)});`;
    },
  );

  // Collect exported names, then strip the `export ` keyword.
  const exported = [];
  const declRe = /^[ \t]*export\s+(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = declRe.exec(code)) !== null) exported.push(m[2]);
  code = code.replace(/^([ \t]*)export\s+/gm, '$1');

  const registration = exported.length
    ? `\n__exports.${exported.join(' = undefined;\n__exports.')} = undefined;\n` +
      `Object.assign(__exports, { ${exported.join(', ')} });\n`
    : '';

  // Hoisting note: exports are assigned at the END of the module body, so a
  // circular import that reads a binding during evaluation would see
  // undefined. This project's graph is acyclic; the build asserts that below.
  return { code: code + registration, deps: [...new Set(deps)], exported };
}

/** Walk the import graph from the entry, depth-first, detecting cycles. */
function collectModules() {
  const modules = new Map();
  const visiting = new Set();

  function visit(id, stack) {
    if (modules.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular import: ${[...stack, id].join(' -> ')}`);
    }
    visiting.add(id);

    const file = join(SRC, id);
    if (!existsSync(file)) {
      throw new Error(`Module not found: ${id} (imported from ${stack[stack.length - 1] ?? 'entry'})`);
    }
    const { code, deps, exported } = transform(id, readFileSync(file, 'utf8'));
    for (const dep of deps) visit(dep, [...stack, id]);

    visiting.delete(id);
    modules.set(id, { code, deps, exported });
  }

  visit(ENTRY, []);
  return modules;
}

function buildBundle(modules) {
  const parts = [];
  parts.push('(function () {');
  parts.push('"use strict";');
  parts.push('const __registry = Object.create(null);');
  parts.push('const __cache = Object.create(null);');
  parts.push('function __req(id) {');
  parts.push('  if (id in __cache) return __cache[id];');
  parts.push('  const factory = __registry[id];');
  parts.push('  if (!factory) throw new Error("Module not bundled: " + id);');
  parts.push('  const __exports = {};');
  parts.push('  __cache[id] = __exports;');
  parts.push('  factory(__exports, __req);');
  parts.push('  return __exports;');
  parts.push('}');

  for (const [id, mod] of modules) {
    parts.push(`__registry[${JSON.stringify(id)}] = function (__exports, __req) {`);
    parts.push(mod.code);
    parts.push('};');
  }

  parts.push(`__req(${JSON.stringify(ENTRY)});`);
  parts.push('})();');
  return parts.join('\n');
}

function main() {
  const htmlPath = join(SRC, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');

  // Inline stylesheets.
  html = html.replace(
    /[ \t]*<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>[ \t]*\r?\n?/g,
    (_m, href) => {
      const cssPath = join(SRC, href);
      if (!existsSync(cssPath)) throw new Error(`Stylesheet not found: ${href}`);
      return `<style>\n${readFileSync(cssPath, 'utf8').trim()}\n</style>\n`;
    },
  );

  const modules = collectModules();
  const bundle = buildBundle(modules);

  // Replace the module script tag with the flattened bundle.
  const scriptRe = /[ \t]*<script\s+type=["']module["']\s+src=["'][^"']+["']\s*><\/script>[ \t]*/;
  if (!scriptRe.test(html)) {
    throw new Error('src/index.html must contain <script type="module" src="main.js"></script>');
  }
  html = html.replace(scriptRe, `<script>\n${bundle}\n</script>`);

  if (/<link\s+rel=["']stylesheet/.test(html) || /<script[^>]+src=/.test(html)) {
    throw new Error('Build produced a file with external references; it would not work offline.');
  }

  writeFileSync(OUT, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Bundled ${modules.size} modules -> heat-transfer-simulator.html (${kb} kB)`);
  for (const id of modules.keys()) console.log(`  - ${id}`);
  console.log('\nSelf-contained: no external scripts, styles, fonts or network calls.');
}

main();
