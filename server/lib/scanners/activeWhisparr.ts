import { whisparrScanner } from '@server/lib/scanners/whisparr';
import { whisparrV3Scanner } from '@server/lib/scanners/whisparrV3';
import { getSettings } from '@server/lib/settings';

// Single entry point for the one "whisparr-scan" job/route: which concrete
// scanner runs depends on the currently configured API version.
export const activeWhisparrScanner = () =>
  getSettings().whisparr.apiVersion === 'v3'
    ? whisparrV3Scanner
    : whisparrScanner;
