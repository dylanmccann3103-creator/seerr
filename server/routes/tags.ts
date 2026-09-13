import Tpdb from '@server/api/tpdb';
import logger from '@server/logger';
import { Router } from 'express';

const tagsRoutes = Router();

// TPDB tags double as the "categories" browse list; alphabetical, searchable.
tagsRoutes.get('/', async (req, res, next) => {
  try {
    // Substring match over the cached full list; TPDB's own search only
    // matches whole words. Paged the way the TPDB list was (30 per page).
    const query =
      typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const page = Number(req.query.page) || 1;
    const perPage = 30;
    const all = await new Tpdb().getAllTags();
    const needle = query.toLowerCase();
    const matches = needle
      ? all.filter((tag) => tag.name.toLowerCase().includes(needle))
      : all;
    const slice = matches.slice((page - 1) * perPage, page * perPage);
    return res.status(200).json({
      page,
      totalPages: Math.max(1, Math.ceil(matches.length / perPage)),
      totalResults: matches.length,
      results: slice.map((tag) => ({
        id: tag.id,
        name: tag.name,
        mediaType: 'tag' as const,
      })),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving tags', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve tags.' });
  }
});

export default tagsRoutes;
