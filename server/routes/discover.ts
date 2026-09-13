import Tpdb from '@server/api/tpdb';
import type { TpdbPaginationMeta } from '@server/api/tpdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import logger from '@server/logger';
import { mapPerformerResult } from '@server/models/Performer';
import { mapSceneResult } from '@server/models/Scene';
import { mapSiteResult } from '@server/models/Site';
import { Router } from 'express';

const discoverRoutes = Router();

const tpdbPage = (meta: TpdbPaginationMeta) => ({
  page: meta.current_page,
  totalPages: meta.last_page,
  totalResults: meta.total,
});

// Newest scenes (TPDB default order). No sort params exist on the public API.
discoverRoutes.get('/scenes', async (req, res, next) => {
  try {
    const results = await new Tpdb().getRecentScenes({
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
      ...tpdbPage(results.meta),
      results: results.data.map((scene) =>
        mapSceneResult(
          scene,
          media.find((m) => m.tpdbId === String(scene._id))
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving scenes', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve scenes.' });
  }
});

// Alphabetical site listing — see PROGRESS.md "DoD 2 deviation".
discoverRoutes.get('/sites', async (req, res, next) => {
  try {
    const results = await new Tpdb().getPopularSites({
      page: Number(req.query.page) || 1,
    });
    const media = await Media.getRelatedTpdbMedia(
      req.user,
      results.data.map((site) => ({
        tpdbId: String(site.id),
        mediaType: MediaType.SITE,
      }))
    );
    return res.status(200).json({
      ...tpdbPage(results.meta),
      results: results.data.map((site) =>
        mapSiteResult(
          site,
          media.find((m) => m.tpdbId === String(site.id))
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving sites', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve sites.' });
  }
});

discoverRoutes.get('/performers', async (req, res, next) => {
  try {
    const results = await new Tpdb().getPerformers({
      page: Number(req.query.page) || 1,
    });
    return res.status(200).json({
      ...tpdbPage(results.meta),
      results: results.data.map(mapPerformerResult),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving performers', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve performers.' });
  }
});

export default discoverRoutes;
