import type { CampusSnapshot } from '@evacuai/routing';

/** The real demo campus, exactly as the API serves it. */
export const loadDemoSnapshot = (): CampusSnapshot =>
  JSON.parse(JSON.stringify(require('../../../campus-data/demo.snapshot.json')));
