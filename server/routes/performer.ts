import Tpdb from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { stashPerformerImage } from '@server/lib/stashImages';
import logger from '@server/logger';
import { mapPerformerDetails } from '@server/models/Performer';
import { mapSceneResult } from '@server/models/Scene';
import { Router } from 'express';

const performerRoutes = Router();

performerRoutes.get('/:id', async (req, res, next) => {
  try {
    const performer = await new Tpdb().getPerformer({
      performerId: req.params.id,
    });
    const details = mapPerformerDetails(performer);
    if (!details.posterPath) {
      details.posterPath = await stashPerformerImage(performer);
    }
    return res.status(200).json(details);
  } catch (e) {
    logger.debug('Something went wrong retrieving performer', {
      label: 'API',
      errorMessage: e.message,
      performerId: req.params.id,
    });
    return next({ status: 500, message: 'Unable to retrieve performer.' });
  }
});

performerRoutes.get('/:id/scenes', async (req, res, next) => {
  try {
    const results = await new Tpdb().getPerformerScenes({
      performerId: Number(req.params.id),
      page: Number(req.query.page) || 1,
    });
    const media = await Media.getRelatedTpdbMedia(
      req.user,
      results.data.map((scene) => ({
        tpdbId: String(scene._id),
        mediaType: MediaType.SCENE,
      }))
    );
    return res.status(200).json({
      page: results.meta.current_page,
      totalPages: results.meta.last_page,
      totalResults: results.meta.total,
      results: results.data.map((scene) =>
        mapSceneResult(
          scene,
          media.find((m) => m.tpdbId === String(scene._id))
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving performer scenes', {
      label: 'API',
      errorMessage: e.message,
      performerId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve performer scenes.',
    });
  }
});

export default performerRoutes;
