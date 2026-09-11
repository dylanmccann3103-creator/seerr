import StashAPI from '@server/api/stash';
import type { StashSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const stashRoutes = Router();

stashRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(settings.stash);
});

stashRoutes.put('/', async (req, res) => {
  const settings = getSettings();

  settings.stash = req.body as StashSettings;
  await settings.save();

  return res.status(200).json(settings.stash);
});

stashRoutes.post('/test', async (req, res, next) => {
  try {
    const stash = new StashAPI({
      apiKey: req.body.apiKey,
      url: req.body.url,
    });

    const status = await stash.getSystemStatus();
    const sceneCount = await stash.getSceneCount();

    return res.status(200).json({
      status,
      sceneCount,
    });
  } catch (e) {
    logger.error('Failed to test Stash', {
      label: 'Stash',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Stash' });
  }
});

export default stashRoutes;
