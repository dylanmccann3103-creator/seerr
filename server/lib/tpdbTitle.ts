import Tpdb from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { mapSceneDetails } from '@server/models/Scene';
import { mapSiteDetails } from '@server/models/Site';

// One "what is this media row called and what does it look like" lookup for
// every notification path (requests, issues, comments).
export const tpdbTitle = async (
  media: Media
): Promise<{ subject: string; overview?: string; image?: string }> => {
  const tpdb = new Tpdb();
  if (!media.tpdbId) {
    throw new Error('Media has no TPDB id');
  }
  if (media.mediaType === MediaType.SCENE) {
    const scene = mapSceneDetails(
      await tpdb.getScene({ sceneId: media.tpdbId })
    );
    return {
      subject: `${scene.title}${
        scene.releaseDate ? ` (${scene.releaseDate.slice(0, 4)})` : ''
      }`,
      overview: scene.overview,
      image: scene.posterPath,
    };
  }
  const site = mapSiteDetails(
    await tpdb.getSite({ siteId: Number(media.tpdbId) })
  );
  return {
    subject: site.name,
    overview: site.description,
    image: site.posterPath,
  };
};
