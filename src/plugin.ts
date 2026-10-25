import { readFileSync } from 'node:fs';

// Both src/ and the installed lib/ sit directly beneath this plugin's package root.
export const plugin = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };
