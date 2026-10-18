import type { WhisparrV3Movie } from '@server/api/servarr/whisparr-v3';
import WhisparrV3API from '@server/api/servarr/whisparr-v3';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import type { PathLookup } from '@server/lib/scanners/library';
import { jellyfinLookup, stashLookup } from '@server/lib/scanners/library';
import { getSettings } from '@server/lib/settings';

// Whisparr v3 has no site/season concept (whisparr-v3.ts) — a scene is a
// standalone "movie" item, so this scanner only ever updates rows that were
// already created by a v3 request (matched by externalServiceId, the v3
// movie id). Unlike the v2 scanner it does not discover untracked scenes
// (that would need a StashDB-id -> TPDB-id reverse lookup, which doesn't
// exist) and does not run orphan cleanup (a v2->v3 switch would otherwise
// wrongly orphan scenes the v2 scanner is still tracking, since both share
// the same SCENE mediaType and an externalServiceId numbering that isn't
// namespaced per Whisparr app).

type SyncStatus = StatusBase & { libraries: string[] };

class WhisparrV3Scanner
  extends BaseScanner<WhisparrV3Movie>
  implements RunnableScanner<SyncStatus>
{
  private api: WhisparrV3API;
  private lookups: PathLookup[] = [];

  constructor() {
    super('Whisparr v3 Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      libraries: this.lookups.map((l) => l.name),
    };
  }

  public async run(): Promise<void> {
    const { whisparr } = getSettings();
    if (!whisparr.enabled || !whisparr.apiKey || !whisparr.hostname) {
      this.log('Whisparr is not configured. Skipping scan.', 'info');
      return;
    }

    const sessionId = this.startRun();

    try {
      this.api = new WhisparrV3API({
        apiKey: whisparr.apiKey,
        url: WhisparrV3API.buildUrl(whisparr, '/api/v3'),
      });
      this.lookups = (
        await Promise.all([stashLookup(), jellyfinLookup()])
      ).filter((l): l is PathLookup => l !== null);
      this.log(
        `Libraries used for availability: ${
          this.lookups.map((l) => l.name).join(', ') || 'none'
        }`,
        'info'
      );

      this.items = (await this.api.getScenes()).filter((movie) => !!movie.id);
      await this.loop(this.processScene.bind(this), { sessionId });
      this.log('Whisparr v3 scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async inLibrary(path: string): Promise<boolean> {
    for (const lookup of this.lookups) {
      if (await lookup.has(path)) {
        return true;
      }
    }
    return false;
  }

  private async processScene(movie: WhisparrV3Movie): Promise<void> {
    try {
      const mediaRepository = getRepository(Media);
      const existing = await mediaRepository.findOne({
        where: { mediaType: MediaType.SCENE, externalServiceId: movie.id },
      });

      if (!existing) {
        // Not requested through Seerr (or not yet rescanned after a v2->v3
        // migration) — nothing to reconcile it against.
        return;
      }

      const path = movie.hasFile ? movie.movieFile?.path : undefined;
      const available = path ? await this.inLibrary(path) : false;

      const status = available
        ? MediaStatus.AVAILABLE
        : movie.hasFile || movie.monitored
          ? MediaStatus.PROCESSING
          : existing.status === MediaStatus.DELETED
            ? MediaStatus.DELETED
            : MediaStatus.UNKNOWN;

      if (existing.status === status) {
        return;
      }

      existing.status = status;
      await mediaRepository.save(existing);
      this.log(`Updated scene ${movie.title} (movie ${movie.id}) -> ${status}`);
    } catch (e) {
      this.log('Failed to process Whisparr v3 scene', 'error', {
        errorMessage: e.message,
        title: movie.title,
      });
    }
  }
}

export const whisparrV3Scanner = new WhisparrV3Scanner();
