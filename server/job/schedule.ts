import downloadTracker from '@server/lib/downloadtracker';
import ImageProxy from '@server/lib/imageproxy';
import { activeWhisparrScanner } from '@server/lib/scanners/activeWhisparr';
import type { JobId } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import schedule from 'node-schedule';
interface ScheduledJob {
  id: JobId;
  job: schedule.Job;
  name: string;
  type: 'process' | 'command';
  interval: 'seconds' | 'minutes' | 'hours' | 'days' | 'fixed';
  cronSchedule: string;
  running?: () => boolean;
  cancelFn?: () => void;
}

export const scheduledJobs: ScheduledJob[] = [];

export const startJobs = (): void => {
  const jobs = getSettings().jobs;

  // Whisparr sites/scenes + library (Stash/Jellyfin) availability, daily
  scheduledJobs.push({
    id: 'whisparr-scan',
    name: 'Whisparr Scan',
    type: 'process',
    interval: 'hours',
    cronSchedule: jobs['whisparr-scan'].schedule,
    job: schedule.scheduleJob(jobs['whisparr-scan'].schedule, () => {
      logger.info('Starting scheduled job: Whisparr Scan', { label: 'Jobs' });
      activeWhisparrScanner().run();
    }),
    running: () => activeWhisparrScanner().status().running,
    cancelFn: () => activeWhisparrScanner().cancel(),
  });

  // Run download sync every minute
  scheduledJobs.push({
    id: 'download-sync',
    name: 'Download Sync',
    type: 'command',
    interval: 'seconds',
    cronSchedule: jobs['download-sync'].schedule,
    job: schedule.scheduleJob(jobs['download-sync'].schedule, () => {
      logger.debug('Starting scheduled job: Download Sync', {
        label: 'Jobs',
      });
      downloadTracker.updateDownloads();
    }),
  });

  // Reset download sync everyday at 01:00 am
  scheduledJobs.push({
    id: 'download-sync-reset',
    name: 'Download Sync Reset',
    type: 'command',
    interval: 'hours',
    cronSchedule: jobs['download-sync-reset'].schedule,
    job: schedule.scheduleJob(jobs['download-sync-reset'].schedule, () => {
      logger.info('Starting scheduled job: Download Sync Reset', {
        label: 'Jobs',
      });
      downloadTracker.resetDownloadTracker();
    }),
  });

  // Run image cache cleanup every 24 hours
  scheduledJobs.push({
    id: 'image-cache-cleanup',
    name: 'Image Cache Cleanup',
    type: 'process',
    interval: 'hours',
    cronSchedule: jobs['image-cache-cleanup'].schedule,
    job: schedule.scheduleJob(jobs['image-cache-cleanup'].schedule, () => {
      logger.info('Starting scheduled job: Image Cache Cleanup', {
        label: 'Jobs',
      });
      ImageProxy.clearCache('tpdb');
      ImageProxy.clearCache('stash');

      // Clean users avatar image cache
      ImageProxy.clearCache('avatar');
    }),
  });

  logger.info('Scheduled jobs loaded', { label: 'Jobs' });
};
