import ImageProxy from '@server/lib/imageproxy';
import logger from '@server/logger';
import { Router } from 'express';

const router = Router();

// Delay the initialization of ImageProxy instances until the proxy (if any) is properly configured.
// TPDB serves images from multiple hosts (its main CDN and its imgproxy
// thumbnail resizer). Only these two are ever proxied; the sub-host is the
// first path segment after '/tpdb/' (e.g. /imageproxy/tpdb/cdn/...).
const tpdbHosts = {
  cdn: 'https://cdn.theporndb.net',
  thumb: 'https://thumb.theporndb.net',
} as const;
const _tpdbImageProxies: Partial<Record<keyof typeof tpdbHosts, ImageProxy>> =
  {};
function initTpdbImageProxy(host: keyof typeof tpdbHosts) {
  if (!_tpdbImageProxies[host]) {
    _tpdbImageProxies[host] = new ImageProxy(`tpdb-${host}`, tpdbHosts[host], {
      rateLimitOptions: {
        maxRequests: 20,
        maxRPS: 50,
      },
    });
  }
  return _tpdbImageProxies[host] as ImageProxy;
}

router.get<{
  type: string;
  path: string[];
}>('/:type/*path', async (req, res) => {
  const imagePath = '/' + req.params.path.join('/');

  if (imagePath.startsWith('//') || imagePath.includes('://')) {
    logger.error('Invalid URL for image proxy', { imagePath });
    return res.status(403).send('Invalid URL for image proxy');
  }

  try {
    let imageData;
    if (req.params.type === 'tpdb') {
      const [tpdbHost, ...tpdbPath] = req.params.path;

      if (!(tpdbHost in tpdbHosts)) {
        logger.error('Unsupported TPDB image host', {
          imagePath,
          host: tpdbHost,
        });
        res.status(400).send('Unsupported TPDB image host');
        return;
      }

      imageData = await initTpdbImageProxy(
        tpdbHost as keyof typeof tpdbHosts
      ).getImage('/' + tpdbPath.join('/'));
    } else {
      logger.error('Unsupported image type', {
        imagePath,
        type: req.params.type,
      });
      res.status(400).send('Unsupported image type');
      return;
    }

    res.writeHead(200, {
      'Content-Type': `image/${imageData.meta.extension}`,
      'Content-Length': imageData.imageBuffer.length,
      'Cache-Control': `public, max-age=${imageData.meta.curRevalidate}`,
      'OS-Cache-Key': imageData.meta.cacheKey,
      'OS-Cache-Status': imageData.meta.cacheMiss ? 'MISS' : 'HIT',
    });

    res.end(imageData.imageBuffer);
  } catch (e) {
    logger.error('Failed to proxy image', {
      imagePath,
      errorMessage: e.message,
    });
    res.status(500).send();
  }
});

export default router;
