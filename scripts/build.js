'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'frontend/main.jsx');
function extractFrontend(source) {
  const entries = [...source.matchAll(/<script\s+type="module"\s+src="\.\/frontend\/main\.jsx"\s*><\/script>/g)];
  if (entries.length !== 1) throw new Error('Expected exactly one frontend module entry.');
  return { html: source.replace(entries[0][0], '<!-- compiled-app -->') };
}
async function validateFrontend(source) {
  const extracted = extractFrontend(source);
  const bundle = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, metafile: true, format: 'iife', target: ['es2020'], logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } });
  return { ...extracted, inputs: Object.keys(bundle.metafile.inputs) };
}
async function build({ outDir = path.join(root, 'dist') } = {}) {
  const source = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const extracted = extractFrontend(source);
  const hash = content => crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  await fs.mkdir(outDir, { recursive: true });
  const staging = await fs.mkdtemp(path.join(outDir, '.build-'));
  try {
    const assets = path.join(staging, 'assets');
    await fs.mkdir(assets, { recursive: true });
    const bundle = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, minify: true, sourcemap: false, legalComments: 'external', outfile: 'app.js', format: 'iife', target: ['es2020'], define: { 'process.env.NODE_ENV': '"production"' }, metafile: true });
    const js = bundle.outputFiles.find(file => file.path.endsWith('app.js')).contents;
    const appName = `app-${hash(js)}.js`;
    await fs.writeFile(path.join(assets, appName), js);
    for (const file of bundle.outputFiles.filter(file => !file.path.endsWith('app.js'))) await fs.writeFile(path.join(assets, path.basename(file.path)), file.contents);
    const diagnostics = await esbuild.build({ entryPoints: [path.join(root, 'frontend/services/diagnostics.cjs')], bundle: true, write: false, format: 'iife', globalName: 'SafeDiagnostics', minify: true, footer: { js: 'SafeDiagnostics.installDiagnostics(window);' } });
    const diagnosticsName = `diagnostics-${hash(diagnostics.outputFiles[0].contents)}.js`;
    await fs.writeFile(path.join(assets, diagnosticsName), diagnostics.outputFiles[0].contents);
    const policy = await esbuild.transform(await fs.readFile(path.join(root, 'frontend/voice-policy.js'), 'utf8'), { minify: true, target: 'es2020' });
    const policyName = `policy-${hash(policy.code)}.js`;
    await fs.writeFile(path.join(assets, policyName), policy.code);
    const styles = await fs.readFile(path.join(root, 'frontend/styles.css'), 'utf8');
    const css = await postcss([tailwindcss({
      content: [path.join(root, 'index.html'), path.join(root, 'frontend/**/*.{js,jsx,cjs}')],
      future: { hoverOnlyWhenSupported: true },
      theme: { extend: { fontFamily: { cairo: ['Cairo', 'sans-serif'] }, boxShadow: { xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }, backdropBlur: { xs: '4px' }, animation: { 'bounce-slow': 'bounce 2s infinite', 'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite' } } },
      safelist: [{ pattern: /^(bg|text|border|ring|from|to)-(indigo|blue|green|emerald|red|rose|amber|yellow|purple|slate)-(50|100|200|300|400|500|600|700|800|900)$/, variants: ['hover', 'focus'] }]
    })]).process(`@tailwind base;\n@tailwind components;\n@tailwind utilities;\n${styles}`, { from: undefined });
    const minifiedCss = await esbuild.transform(css.css, { loader: 'css', minify: true, legalComments: 'none' });
    const cssName = `app-${hash(minifiedCss.code)}.css`;
    await fs.writeFile(path.join(assets, cssName), minifiedCss.code);
    const faRoot = path.dirname(require.resolve('@fortawesome/fontawesome-free/package.json'));
    await fs.cp(path.join(faRoot, 'css/all.min.css'), path.join(assets, 'vendor/fontawesome/css/all.min.css'), { recursive: true });
    await fs.cp(path.join(faRoot, 'webfonts'), path.join(assets, 'vendor/fontawesome/webfonts'), { recursive: true });
    await fs.copyFile(path.join(faRoot, 'LICENSE.txt'), path.join(assets, 'vendor/fontawesome/LICENSE.txt'));
    let html = extracted.html.replace('<!-- compiled-app -->', `<script defer src="./assets/${appName}"></script>`);
    html = html.replace('</head>', `<script src="./assets/${diagnosticsName}"></script>\n<script src="./assets/${policyName}"></script>\n<link rel="stylesheet" href="./assets/vendor/fontawesome/css/all.min.css">\n<link rel="stylesheet" href="./assets/${cssName}">\n</head>`);
    assertProductionHtml(html);
    await fs.writeFile(path.join(staging, 'index.html'), html);
    await fs.cp(assets, path.join(outDir, 'assets'), { recursive: true });
    await fs.rename(path.join(staging, 'index.html'), path.join(outDir, 'index.html'));
    console.log(`Built dist/index.html and local assets (${appName}).`);
    return { html, outDir, inputs: Object.keys(bundle.metafile.inputs) };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
function assertProductionHtml(html) {
  if (/text\/babel|unpkg\.com|cdn\.tailwindcss\.com|babel(?:\.min)?\.js|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|frontend\/main\.jsx/i.test(html)) throw new Error('Runtime development/CDN dependency remains in production HTML.');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) if (!/\bsrc\s*=/.test(match[1]) && !/\btype=["']application\/(?:ld\+json|json)["']/.test(match[1])) throw new Error('Executable inline script remains.');
}
if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { extractFrontend, validateFrontend, assertProductionHtml, build };
