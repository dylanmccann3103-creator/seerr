import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaType } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

interface EpisodeNumberResult {
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber: number;
  id: number;
}
export interface DownloadingItem {
  mediaType: MediaType;
  externalId: number;
  size: number;
  sizeLeft: number;
  status: string;
  timeLeft: string;
  estimatedCompletionTime: Date;
  title: string;
  downloadId: string;
  episode?: EpisodeNumberResult;
}

class DownloadTracker {
  private whisparrQueue: DownloadingItem[] = [];

  // Site: everything queued for the series id. Scene: only its episode.
  public getWhisparrProgress({
    siteExternalId,
    episodeId,
  }: {
    siteExternalId?: number;
    episodeId?: number;
  }): DownloadingItem[] {
    return this.whisparrQueue.filter(
      (item) =>
        (siteExternalId === undefined || item.externalId === siteExternalId) &&
        (episodeId === undefined || item.episode?.id === episodeId)
    );
  }

  public async resetDownloadTracker() {
    this.whisparrQueue = [];
  }

  public updateDownloads() {
    this.updateWhisparrDownloads();
  }

  private async updateWhisparrDownloads() {
    const { whisparr } = getSettings();
    if (!whisparr.enabled || !whisparr.apiKey || !whisparr.hostname) {
      return;
    }
    const api = new WhisparrAPI({
      apiKey: whisparr.apiKey,
      url: WhisparrAPI.buildUrl(whisparr, '/api/v3'),
    });
    try {
      await api.refreshMonitoredDownloads();
      const queueItems = await api.getQueue();
      this.whisparrQueue = queueItems.map((item) => ({
        externalId: item.seriesId,
        estimatedCompletionTime: new Date(item.estimatedCompletionTime),
        mediaType: MediaType.SITE,
        size: item.size,
        sizeLeft: item.sizeleft,
        status: item.status,
        timeLeft: item.timeleft,
        title: item.title,
        episode: item.episode,
        downloadId: item.downloadId,
      }));
    } catch {
      logger.error('Unable to get queue from Whisparr', {
        label: 'Download Tracker',
      });
    }
  }
}

const downloadTracker = new DownloadTracker();

export default downloadTracker;
