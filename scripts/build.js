const { build } = require('esbuild');

build({
  entryPoints: ['src/preload.js', 'src/attachment-preload.js'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome140',
  external: ['electron'],
  outdir: 'build',
  outExtension: { '.js': '.cjs' },
  logLevel: 'warning',
}).catch(() => { process.exitCode = 1; });
