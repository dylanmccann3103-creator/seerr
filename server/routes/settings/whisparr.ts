import WhisparrAPI from '@server/api/servarr/whisparr';
import { Permission } from '@server/lib/permissions';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { migrateWhisparrRequestsToV3 } from '@server/lib/whisparrV3Migration';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const whisparrRoutes = Router();

whisparrRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(settings.whisparr);
});

whisparrRoutes.put('/', async (req, res) => {
  const settings = getSettings();

  settings.whisparr = req.body as WhisparrSettings;
  await settings.save();

  return res.status(200).json(settings.whisparr);
});

whisparrRoutes.post('/test', async (req, res, next) => {
  try {
    const whisparr = new WhisparrAPI({
      apiKey: req.body.apiKey,
      url: WhisparrAPI.buildUrl(req.body, '/api/v3'),
    });

    const systemStatus = await whisparr.getSystemStatus();
    const profiles = await whisparr.getProfiles();
    const rootFolders = await whisparr.getRootFolders();
    const tags = await whisparr.getTags();

    return res.status(200).json({
      version: systemStatus.version,
      profiles,
      rootFolders: rootFolders.map((folder) => ({
        id: folder.id,
        path: folder.path,
      })),
      tags,
      urlBase: systemStatus.urlBase,
    });
  } catch (e) {
    logger.error('Failed to test Whisparr', {
      label: 'Whisparr',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Whisparr' });
  }
});

whisparrRoutes.post(
  '/migrate-v3',
  isAuthenticated(Permission.ADMIN),
  async (_req, res, next) => {
    const { whisparr } = getSettings();

    if (whisparr.apiVersion !== 'v3') {
      return next({
        status: 409,
        message: 'Whisparr is not set to API version v3.',
      });
    }

    try {
      const summary = await migrateWhisparrRequestsToV3();
      return res.status(200).json(summary);
    } catch (e) {
      logger.error('Failed to migrate Whisparr requests to v3', {
        label: 'Whisparr',
        errorMessage: e.message,
      });
      next({ status: 500, message: 'Failed to migrate requests to v3' });
    }
  }
);

export default whisparrRoutes;
