import Tpdb from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import logger from '@server/logger';
import { mapPerformerResult } from '@server/models/Performer';
import { mapSceneResult } from '@server/models/Scene';
import { mapSiteResult } from '@server/models/Site';
import { Router } from 'express';

const searchRoutes = Router();

// TPDB has no multi-search: sites and performers ride along on page 1,
// scenes paginate. Prefix providers (tmdb:/imdb:/tvdb:) are TMDB-only and gone.
searchRoutes.get('/', async (req, res, next) => {
  const query = String(req.query.query ?? '');
  const page = Number(req.query.page) || 1;
  const tpdb = new Tpdb();

  try {
    const [scenes, sites, performers] = await Promise.all([
      tpdb.searchScenes({ query, page }),
      page === 1 ? tpdb.searchSites({ query }) : null,
      page === 1 ? tpdb.searchPerformers({ query }) : null,
    ]);

    const media = await Media.getRelatedTpdbMedia(req.user, [
      ...scenes.data.map((scene) => ({
        tpdbId: String(scene._id),
        mediaType: MediaType.SCENE,
      })),
      ...(sites?.data ?? []).map((site) => ({
        tpdbId: String(site.id),
        mediaType: MediaType.SITE,
      })),
    ]);
    const find = (tpdbId: string, mediaType: MediaType) =>
      media.find((m) => m.tpdbId === tpdbId && m.mediaType === mediaType);

    return res.status(200).json({
      page: scenes.meta.current_page,
      totalPages: scenes.meta.last_page,
      totalResults:
        scenes.meta.total +
        (sites?.meta.total ?? 0) +
        (performers?.meta.total ?? 0),
      results: [
        ...(sites?.data ?? []).map((site) =>
          mapSiteResult(site, find(String(site.id), MediaType.SITE))
        ),
        ...(performers?.data ?? []).map(mapPerformerResult),
        ...scenes.data.map((scene) =>
          mapSceneResult(scene, find(String(scene._id), MediaType.SCENE))
        ),
      ],
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve search results.',
    });
  }
});

export default searchRoutes;
