const { build } = require('esbuild');

build({
  entryPoints: ['src/preload.js'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome140',
  external: ['electron'],
  outfile: 'build/preload.cjs',
  logLevel: 'warning',
}).catch(() => { process.exitCode = 1; });
