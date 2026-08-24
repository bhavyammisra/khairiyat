/**
 * Lets `node --test` load the app's own modules.
 *
 * The app is written with extensionless relative imports (`from './doses'`),
 * which is what Metro expects and what every file in lib/ and app/ already
 * uses. Node's ESM resolver requires the extension and gives up. Rather than
 * rewrite the app to suit the test runner — Metro is the thing that has to be
 * happy, not Node — this appends `.ts` on the way past.
 *
 * Test tooling only. Nothing in the shipped bundle goes near it.
 *
 * Used as: node --import ./scripts/node-test-resolver.mjs --test ...
 */

import { registerHooks } from 'node:module';

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !HAS_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a TypeScript file after all — let the default resolver report it.
      }
    }

    return nextResolve(specifier, context);
  },
});
