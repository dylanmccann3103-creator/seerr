import Tpdb from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import logger from '@server/logger';
import { mapSceneResult } from '@server/models/Scene';
import { mapSiteDetails } from '@server/models/Site';
import { Router } from 'express';

const siteRoutes = Router();

siteRoutes.get('/:id', async (req, res, next) => {
  const siteId = Number(req.params.id);
  try {
    const [site, media, years] = await Promise.all([
      new Tpdb().getSite({ siteId }),
      getRepository(Media).findOne({
        where: { tpdbId: req.params.id, mediaType: MediaType.SITE },
        relations: { requests: true, issues: true },
      }),
      // Whisparr not configured / unreachable -> no year picker, page still loads.
      MediaRequest.whisparrYears(siteId).catch(() => [] as number[]),
    ]);
    const details = mapSiteDetails(site, media ?? undefined);
    details.seasons = years.map((seasonNumber) => ({ seasonNumber }));
    return res.status(200).json(details);
  } catch (e) {
    logger.debug('Something went wrong retrieving site', {
      label: 'API',
      errorMessage: e.message,
      siteId: req.params.id,
    });
    return next({ status: 500, message: 'Unable to retrieve site.' });
  }
});

siteRoutes.get('/:id/scenes', async (req, res, next) => {
  try {
    const results = await new Tpdb().getSiteScenes({
      siteId: Number(req.params.id),
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
    logger.debug('Something went wrong retrieving site scenes', {
      label: 'API',
      errorMessage: e.message,
      siteId: req.params.id,
    });
    return next({ status: 500, message: 'Unable to retrieve site scenes.' });
  }
});

export default siteRoutes;
