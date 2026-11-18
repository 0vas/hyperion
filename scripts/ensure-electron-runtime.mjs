import { constants, accessSync } from 'node:fs';

// The Electron package downloads its platform binary lazily when first
// required. Resolve it before the parallel Desktop tests begin, so a test
// never races that one-time download with the app launch it is meant to test.
// The test runtime must be the package-managed Electron, never an inherited
// development override that can point at a retired cache directory.
delete process.env.ELECTRON_OVERRIDE_DIST_PATH;
const { default: electronPath } = await import('electron');
accessSync(electronPath, constants.X_OK);
console.log(`Electron runtime ready: ${electronPath}`);
