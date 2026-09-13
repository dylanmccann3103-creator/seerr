import GithubAPI from '@server/api/github';
import PushoverAPI from '@server/api/pushover';
import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import type { StatusResponse } from '@server/interfaces/api/settingsInterfaces';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import settingsRoutes from '@server/routes/settings';
import {
  appDataPath,
  appDataPermissions,
  appDataStatus,
} from '@server/utils/appDataVolume';
import { getAppVersion, getCommitTag } from '@server/utils/appVersion';
import restartFlag from '@server/utils/restartFlag';
import { Router } from 'express';
import authRoutes from './auth';
import discoverRoutes from './discover';
import issueRoutes from './issue';
import issueCommentRoutes from './issueComment';
import mediaRoutes from './media';
import performerRoutes from './performer';
import requestRoutes from './request';
import sceneRoutes from './scene';
import searchRoutes from './search';
import siteRoutes from './site';
import user from './user';

const router = Router();

router.use(checkUser);

router.get<unknown, StatusResponse>('/status', async (req, res) => {
  const settings = getSettings();
  const currentVersion = getAppVersion();
  const commitTag = getCommitTag();
  const checkUpdate =
    req.query.checkUpdateAvailable !== undefined
      ? req.query.checkUpdateAvailable
      : settings.fullPublicSettings.versionCheck;
  let updateAvailable = false;
  let commitsBehind = 0;

  if (checkUpdate) {
    const githubApi = new GithubAPI();

    if (currentVersion.startsWith('develop-') && commitTag !== 'local') {
      const commits = await githubApi.getSeerrCommits();

      if (commits.length) {
        const filteredCommits = commits.filter(
          (commit) => !commit.commit.message.includes('[skip ci]')
        );
        if (filteredCommits[0].sha !== commitTag) {
          updateAvailable = true;
        }

        const commitIndex = filteredCommits.findIndex(
          (commit) => commit.sha === commitTag
        );

        if (updateAvailable) {
          commitsBehind = commitIndex;
        }
      }
    } else if (commitTag !== 'local') {
      const releases = await githubApi.getSeerrReleases();

      if (releases.length) {
        const latestVersion = releases[0];

        if (!latestVersion.name.includes(currentVersion)) {
          updateAvailable = true;
        }
      }
    }
  }

  return res.status(200).json({
    version: getAppVersion(),
    commitTag: getCommitTag(),
    ...(checkUpdate && { updateAvailable, commitsBehind }),
    restartRequired: restartFlag.isSet(),
  });
});

router.get('/status/appdata', (_req, res) => {
  return res.status(200).json({
    appData: appDataStatus(),
    appDataPath: appDataPath(),
    appDataPermissions: appDataPermissions(),
  });
});

router.use('/user', isAuthenticated(), user);
router.get('/settings/public', async (req, res) => {
  const settings = getSettings();

  if (!(req.user?.settings?.notificationTypes.webpush ?? true)) {
    return res
      .status(200)
      .json({ ...settings.fullPublicSettings, enablePushRegistration: false });
  } else {
    return res.status(200).json(settings.fullPublicSettings);
  }
});
router.get('/settings/discover', isAuthenticated(), async (_req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const sliders = await sliderRepository.find({ order: { order: 'ASC' } });

  return res.json(sliders);
});
router.get(
  '/settings/notifications/pushover/sounds',
  isAuthenticated(),
  async (req, res, next) => {
    const pushoverApi = new PushoverAPI();

    try {
      if (!req.query.token) {
        throw new Error('Pushover application token missing from request');
      }

      const sounds = await pushoverApi.getSounds(req.query.token as string);
      res.status(200).json(sounds);
    } catch (e) {
      logger.debug('Something went wrong retrieving Pushover sounds', {
        label: 'API',
        errorMessage: e.message,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve Pushover sounds.',
      });
    }
  }
);
router.use('/settings', isAuthenticated(Permission.ADMIN), settingsRoutes);
router.use('/search', isAuthenticated(), searchRoutes);
router.use('/discover', isAuthenticated(), discoverRoutes);
router.use('/request', isAuthenticated(), requestRoutes);
router.use('/media', isAuthenticated(), mediaRoutes);
router.use('/scene', isAuthenticated(), sceneRoutes);
router.use('/site', isAuthenticated(), siteRoutes);
router.use('/performer', isAuthenticated(), performerRoutes);
router.use('/issue', isAuthenticated(), issueRoutes);
router.use('/issueComment', isAuthenticated(), issueCommentRoutes);
router.use('/auth', authRoutes);
router.get('/', (_req, res) => {
  return res.status(200).json({
    api: 'Seerr API',
    version: '1.0',
  });
});

export default router;
