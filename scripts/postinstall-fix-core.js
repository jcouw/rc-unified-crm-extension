// This script is added to solve a specifica issue where the @app-connect/core package is not resolved properly
// It seems like the symlink is not working, that is why we copy the package content using this script
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const coreSrc = path.join(root, 'packages', 'core');
const coreDest = path.join(root, 'node_modules', '@app-connect', 'core');

try {
  if (!fs.existsSync(coreSrc)) {
    console.log('[postinstall-fix-core] No packages/core found, skipping copy.');
  } else {
    // ensure destination dir
    fs.mkdirSync(path.dirname(coreDest), { recursive: true });
    // remove existing dest (symlink or folder)
    try { fs.rmSync(coreDest, { recursive: true, force: true }); } catch (e) {}
    // copy folder (simple recursive)
    const copyRecursive = (src, dest) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyRecursive(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
      }
    };
    copyRecursive(coreSrc, coreDest);
    console.log('[postinstall-fix-core] Copied packages/core into node_modules/@app-connect/core');
  }

  // attempt to run patch-package for installed patches if patch-package is available
  const patchesDir = path.join(root, 'patches');
  if (fs.existsSync(patchesDir)) {
    // check if patch-package is available (in node_modules or via npx)
    const npxAvailable = spawnSync('npx', ['--version'], { stdio: 'ignore' }).status === 0;
    if (npxAvailable) {
      console.log('[postinstall-fix-core] Running npx patch-package (if applicable)...');
      const r = spawnSync('npx', ['patch-package'], { stdio: 'inherit' });
      if (r.status !== 0) {
        console.warn('[postinstall-fix-core] patch-package returned non-zero status, continuing.');
      }
    } else {
      console.log('[postinstall-fix-core] npx not available, skipping patch-package step.');
    }
  } else {
    console.log('[postinstall-fix-core] No patches directory, skipping patch-package.');
  }
} catch (err) {
  console.error('[postinstall-fix-core] Error:', err);
  // Do not fail install hard — keep process exit 0 so Azure won't stop deployment due to this fix
}