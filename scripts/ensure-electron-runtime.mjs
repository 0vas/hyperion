import { constants, accessSync } from 'node:fs';
import electronPath from 'electron';

// The Electron package downloads its platform binary lazily when first
// required. Resolve it before the parallel Desktop tests begin, so a test
// never races that one-time download with the app launch it is meant to test.
accessSync(electronPath, constants.X_OK);
console.log(`Electron runtime ready: ${electronPath}`);
