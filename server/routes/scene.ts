import Tpdb from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { withStashPerformerImages } from '@server/lib/stashImages';
import logger from '@server/logger';
import { mapSceneDetails } from '@server/models/Scene';
import { Router } from 'express';

const sceneRoutes = Router();

sceneRoutes.get('/:id', async (req, res, next) => {
  try {
    const scene = await new Tpdb().getScene({ sceneId: req.params.id });
    const media = await getRepository(Media).findOne({
      where: { tpdbId: req.params.id, mediaType: MediaType.SCENE },
      relations: { requests: true, issues: true },
    });
    const details = mapSceneDetails(scene, media ?? undefined);
    // Scene payloads embed site-performers; the parent is the global performer.
    details.performers = await withStashPerformerImages(
      (scene.performers ?? []).map((p) => p.parent ?? p),
      details.performers
    );
    return res.status(200).json(details);
  } catch (e) {
    logger.debug('Something went wrong retrieving scene', {
      label: 'API',
      errorMessage: e.message,
      sceneId: req.params.id,
    });
    return next({ status: 500, message: 'Unable to retrieve scene.' });
  }
});

export default sceneRoutes;
