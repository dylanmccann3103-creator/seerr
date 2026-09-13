import Tpdb from '@server/api/tpdb';
import logger from '@server/logger';
import { Router } from 'express';

const tagsRoutes = Router();

// TPDB tags double as the "categories" browse list; alphabetical, searchable.
tagsRoutes.get('/', async (req, res, next) => {
  try {
    const results = await new Tpdb().getTags({
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      page: Number(req.query.page) || 1,
    });
    return res.status(200).json({
      page: results.meta.current_page,
      totalPages: results.meta.last_page,
      totalResults: results.meta.total,
      results: results.data.map((tag) => ({
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
