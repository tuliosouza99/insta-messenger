const { mkdtemp, cp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packager } = require('@electron/packager');
const manifest = require('../package.json');

async function main() {
  const staging = await mkdtemp(path.join(tmpdir(), 'instagram-messenger-package-'));
  try {
    await cp(path.resolve('src'), path.join(staging, 'src'), { recursive: true });
    await cp(path.resolve('build'), path.join(staging, 'build'), { recursive: true });
    await cp(path.resolve('LICENSE'), path.join(staging, 'LICENSE'));
    const { name, productName, version, description, author, license, main } = manifest;
    await writeFile(path.join(staging, 'package.json'), JSON.stringify({ name, productName, version, description, author, license, main }, null, 2));
    const destinations = await packager({
      dir: staging, out: path.resolve('dist'), overwrite: true,
      name: productName, executableName: 'Instagram Messenger',
      platform: process.platform, arch: process.arch,
      electronVersion: manifest.devDependencies.electron,
      appBundleId: 'com.tuliosouza.instagram-messenger',
      appCategoryType: 'public.app-category.social-networking',
      darwinDarkModeSupport: true, asar: true,
      appCopyright: 'Independent personal-use app. Not affiliated with Instagram or Meta.',
    });
    for (const destination of destinations) {
      await cp(path.resolve('LICENSE'), path.join(destination, 'LICENSE.insta-messenger'));
      if (process.platform === 'darwin') {
        const bundle = path.join(destination, `${productName}.app`);
        execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
        execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
        console.log('Local ad-hoc signature verified (not Developer ID notarization).');
      }
      console.log(`Packaged: ${destination}`);
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
