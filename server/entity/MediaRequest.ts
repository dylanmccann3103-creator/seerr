import WhisparrAPI from '@server/api/servarr/whisparr';
import Tpdb from '@server/api/tpdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  isWhisparrType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type { MediaRequestBody } from '@server/interfaces/api/requestInterfaces';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapSceneDetails } from '@server/models/Scene';
import { mapSiteDetails } from '@server/models/Site';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import requestLock from '@server/utils/requestLock';
import { truncate } from 'lodash';
import {
  AfterInsert,
  AfterLoad,
  AfterUpdate,
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationCount,
  UpdateDateColumn,
} from 'typeorm';
import Media from './Media';
import SeasonRequest from './SeasonRequest';
import { User } from './User';

export class RequestPermissionError extends Error {}
export class QuotaRestrictedError extends Error {}
export class DuplicateMediaRequestError extends Error {}
export class NoSeasonsAvailableError extends Error {}
export class BlocklistedMediaError extends Error {}

type MediaRequestOptions = {
  isAutoRequest?: boolean;
};

@Entity()
export class MediaRequest {
  public static async request(
    requestBody: MediaRequestBody,
    user: User,
    options: MediaRequestOptions = {}
  ): Promise<MediaRequest> {
    return requestLock.dispatch(requestBody.userId || user.id, () =>
      MediaRequest.createRequest(requestBody, user, options)
    );
  }

  private static async createRequest(
    requestBody: MediaRequestBody,
    user: User,
    options: MediaRequestOptions
  ): Promise<MediaRequest> {
    const userRepository = getRepository(User);

    let requestUser = user;

    if (
      requestBody.userId &&
      !requestUser.hasPermission([
        Permission.MANAGE_USERS,
        Permission.MANAGE_REQUESTS,
      ])
    ) {
      throw new RequestPermissionError(
        'You do not have permission to modify the request user.'
      );
    } else if (requestBody.userId) {
      requestUser = await userRepository.findOneOrFail({
        where: { id: requestBody.userId },
      });
    }

    if (!requestUser) {
      throw new Error('User missing from request context.');
    }

    if (!isWhisparrType(requestBody.mediaType)) {
      throw new RequestPermissionError(
        `Unsupported media type: ${requestBody.mediaType}`
      );
    }

    return MediaRequest.createWhisparrRequest(
      requestBody,
      user,
      requestUser,
      options
    );
  }

  // Scene = one item (movie-shaped), site = year seasons (series-shaped);
  // see PLAN.md D2. Validated against TPDB, keyed on Media.tpdbId.
  private static async createWhisparrRequest(
    requestBody: MediaRequestBody,
    user: User,
    requestUser: User,
    options: MediaRequestOptions
  ): Promise<MediaRequest> {
    const mediaRepository = getRepository(Media);
    const requestRepository = getRepository(MediaRequest);
    const type = requestBody.mediaType;
    const label = type === MediaType.SCENE ? 'Scene' : 'Site';
    const tpdbId = String(requestBody.mediaId);

    if (!requestUser.hasPermission(Permission.REQUEST)) {
      throw new RequestPermissionError(
        `You do not have permission to make ${label.toLowerCase()} requests.`
      );
    }

    // ponytail: scenes draw on the movie quota, site years on the tv quota.
    // Separate scene/site quota columns only if the UI ever needs to differ.
    const quotas = await requestUser.getQuota();
    const quota = type === MediaType.SCENE ? quotas.movie : quotas.tv;
    const canBypassQuota = user.hasPermission(Permission.MANAGE_REQUESTS);
    const ignoreQuota =
      requestBody.ignoreQuota === true &&
      canBypassQuota &&
      (quota.limit ?? 0) > 0;

    if (!ignoreQuota) {
      if (requestBody.ignoreQuota && !canBypassQuota) {
        throw new RequestPermissionError(
          'You do not have permission to bypass user quota limits.'
        );
      } else if (quota.restricted) {
        throw new QuotaRestrictedError(`${label} Quota exceeded.`);
      }
    }

    // Unknown id -> TPDB 404 -> plain error (500 on the route), same as TMDB.
    const tpdb = new Tpdb();
    if (type === MediaType.SCENE) {
      await tpdb.getScene({ sceneId: tpdbId });
    } else {
      await tpdb.getSite({ siteId: requestBody.mediaId });
    }

    let media = await mediaRepository.findOne({
      where: { tpdbId, mediaType: type },
      relations: ['requests'],
    });

    if (!media) {
      media = new Media({
        tmdbId: 0,
        tpdbId,
        mediaType: type,
        status: MediaStatus.PENDING,
      });
    } else {
      if (media.status === MediaStatus.BLOCKLISTED) {
        throw new BlocklistedMediaError('This media is blocklisted.');
      }
      if (
        media.status === MediaStatus.UNKNOWN ||
        media.status === MediaStatus.DELETED
      ) {
        media.status = MediaStatus.PENDING;
      }
    }

    const activeRequests = (media.requests ?? []).filter(
      (r) =>
        r.status !== MediaRequestStatus.DECLINED &&
        r.status !== MediaRequestStatus.COMPLETED
    );
    const autoApprove = user.hasPermission(
      [Permission.AUTO_APPROVE, Permission.MANAGE_REQUESTS],
      { type: 'or' }
    );
    const status = autoApprove
      ? MediaRequestStatus.APPROVED
      : MediaRequestStatus.PENDING;
    const base: Partial<MediaRequest> = {
      type,
      status,
      media,
      requestedBy: requestUser,
      modifiedBy: autoApprove ? user : undefined,
      profileId: requestBody.profileId,
      rootFolder: requestBody.rootFolder,
      tags: requestBody.tags,
      isAutoRequest: options.isAutoRequest ?? false,
      ignoreQuota,
    };

    if (type === MediaType.SCENE) {
      if (activeRequests.length > 0) {
        throw new DuplicateMediaRequestError(
          'Request for this media already exists.'
        );
      }
      await mediaRepository.save(media);
      const request = new MediaRequest(base);
      await requestRepository.save(request);
      return request;
    }

    const requestedYears =
      requestBody.seasons === 'all'
        ? await MediaRequest.whisparrYears(requestBody.mediaId)
        : (requestBody.seasons ?? []);
    const takenYears = new Set([
      ...activeRequests.flatMap((r) => r.seasons.map((s) => s.seasonNumber)),
      ...(media.seasons ?? [])
        .filter(
          (s) =>
            s.status !== MediaStatus.UNKNOWN && s.status !== MediaStatus.DELETED
        )
        .map((s) => s.seasonNumber),
    ]);
    const finalYears = requestedYears.filter((y) => !takenYears.has(y));

    if (finalYears.length === 0) {
      throw new NoSeasonsAvailableError('No years available to request');
    } else if (
      !ignoreQuota &&
      quota.limit &&
      finalYears.length > (quota.remaining ?? 0)
    ) {
      throw new QuotaRestrictedError('Site Quota exceeded.');
    }

    await mediaRepository.save(media);
    const request = new MediaRequest({
      ...base,
      seasons: finalYears.map(
        (seasonNumber) => new SeasonRequest({ seasonNumber, status })
      ),
    });
    await requestRepository.save(request);
    return request;
  }

  // "All years" of a site = the calendar-year seasons Whisparr's lookup lists.
  public static async whisparrYears(siteId: number): Promise<number[]> {
    const { whisparr } = getSettings();
    if (!whisparr.enabled || !whisparr.apiKey || !whisparr.hostname) {
      throw new NoSeasonsAvailableError(
        'Whisparr is not configured; request specific years instead'
      );
    }
    const api = new WhisparrAPI({
      apiKey: whisparr.apiKey,
      url: WhisparrAPI.buildUrl(whisparr, '/api/v3'),
    });
    const site = await api.getSiteByTpdbId(siteId);
    return site.seasons.map((s) => s.seasonNumber).filter((year) => year > 0);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  @Index()
  public status: MediaRequestStatus;

  @ManyToOne(() => Media, (media) => media.requests, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @ManyToOne(() => User, (user) => user.requests, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public requestedBy: User;

  @ManyToOne(() => User, {
    nullable: true,
    eager: true,
    onDelete: 'SET NULL',
  })
  @Index()
  public modifiedBy?: User;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  @Column({ type: 'varchar' })
  public type: MediaType;

  @RelationCount((request: MediaRequest) => request.seasons)
  public seasonCount: number;

  @OneToMany(() => SeasonRequest, (season) => season.request, {
    eager: true,
    cascade: true,
  })
  public seasons: SeasonRequest[];

  @Column({ nullable: true })
  public serverId: number;

  @Column({ nullable: true })
  public profileId: number;

  @Column({ nullable: true })
  public rootFolder: string;

  @Column({ nullable: true })
  public languageProfileId: number;

  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from: (value: string | null): number[] | null => {
        if (value) {
          if (value === 'none') {
            return [];
          }
          return value.split(',').map((v) => Number(v));
        }
        return null;
      },
      to: (value: number[] | null): string | null => {
        if (value) {
          const finalValue = value.join(',');

          // We want to keep the actual state of an "empty array" so we use
          // the keyword "none" to track this.
          if (!finalValue) {
            return 'none';
          }

          return finalValue;
        }
        return null;
      },
    },
  })
  public tags?: number[];

  @Column({ default: false })
  public isAutoRequest: boolean;

  @Column({ default: false })
  public ignoreQuota: boolean;

  @Column({ nullable: true, type: 'varchar' })
  public failureReason?: string | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public sentToServiceAt?: Date | null;

  constructor(init?: Partial<MediaRequest>) {
    Object.assign(this, init);
  }

  @AfterInsert()
  public async notifyNewRequest(): Promise<void> {
    if (this.status === MediaRequestStatus.PENDING) {
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.findOne({
        where: { id: this.media.id },
      });
      if (!media) {
        logger.error('Media data not found', {
          label: 'Media Request',
          requestId: this.id,
          mediaId: this.media.id,
        });
        return;
      }

      MediaRequest.sendNotification(this, media, Notification.MEDIA_PENDING);

      if (this.isAutoRequest) {
        MediaRequest.sendNotification(
          this,
          media,
          Notification.MEDIA_AUTO_REQUESTED
        );
      }
    }
  }

  /**
   * Notification for approval
   *
   * We only check on AfterUpdate as to not trigger this for
   * auto approved content
   */
  @AfterUpdate()
  public async notifyApprovedOrDeclined(autoApproved = false): Promise<void> {
    if (
      this.status === MediaRequestStatus.APPROVED ||
      this.status === MediaRequestStatus.DECLINED
    ) {
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.findOne({
        where: { id: this.media.id },
      });
      if (!media) {
        logger.error('Media data not found', {
          label: 'Media Request',
          requestId: this.id,
          mediaId: this.media.id,
        });
        return;
      }

      if (
        this.status === MediaRequestStatus.APPROVED &&
        media.status === MediaStatus.AVAILABLE
      ) {
        logger.info(
          'Media is already available. Sending availability notification instead of approval.',
          { label: 'Media Request', requestId: this.id, mediaId: this.media.id }
        );
        MediaRequest.sendNotification(
          this,
          media,
          Notification.MEDIA_AVAILABLE
        );
        return;
      }

      MediaRequest.sendNotification(
        this,
        media,
        this.status === MediaRequestStatus.APPROVED
          ? autoApproved
            ? Notification.MEDIA_AUTO_APPROVED
            : Notification.MEDIA_APPROVED
          : Notification.MEDIA_DECLINED
      );

      if (
        this.status === MediaRequestStatus.APPROVED &&
        autoApproved &&
        this.isAutoRequest
      ) {
        MediaRequest.sendNotification(
          this,
          media,
          Notification.MEDIA_AUTO_REQUESTED
        );
      }
    }
  }

  @AfterInsert()
  public async autoapprovalNotification(): Promise<void> {
    if (this.status === MediaRequestStatus.APPROVED) {
      this.notifyApprovedOrDeclined(true);
    }
  }

  @AfterLoad()
  private sortSeasons() {
    if (Array.isArray(this.seasons)) {
      this.seasons.sort((a, b) => a.id - b.id);
    }
  }

  static async sendNotification(
    entity: MediaRequest,
    media: Media,
    type: Notification
  ) {
    try {
      const mediaType =
        entity.type === MediaType.MOVIE
          ? 'Movie'
          : entity.type === MediaType.SCENE
            ? 'Scene'
            : entity.type === MediaType.SITE
              ? 'Site'
              : 'Series';
      let event: string | undefined;
      let notifyAdmin = true;
      let notifySystem = true;

      switch (type) {
        case Notification.MEDIA_AVAILABLE:
          event = `${mediaType} Now Available`;
          notifyAdmin = false;
          break;
        case Notification.MEDIA_APPROVED:
          event = `${mediaType} Request Approved`;
          notifyAdmin = false;
          break;
        case Notification.MEDIA_DECLINED:
          event = `${mediaType} Request Declined`;
          notifyAdmin = false;
          break;
        case Notification.MEDIA_PENDING:
          event = `New ${mediaType} Request`;
          break;
        case Notification.MEDIA_AUTO_REQUESTED:
          event = `${mediaType} Request Automatically Submitted`;
          notifyAdmin = false;
          notifySystem = false;
          break;
        case Notification.MEDIA_AUTO_APPROVED:
          event = `${mediaType} Request Automatically Approved`;
          break;
        case Notification.MEDIA_FAILED:
          event = `${mediaType} Request Failed`;
          break;
      }

      if (isWhisparrType(entity.type) && media.tpdbId) {
        const tpdb = new Tpdb();
        const details =
          entity.type === MediaType.SCENE
            ? mapSceneDetails(await tpdb.getScene({ sceneId: media.tpdbId }))
            : mapSiteDetails(
                await tpdb.getSite({ siteId: Number(media.tpdbId) })
              );
        const [subject, overview] =
          'title' in details
            ? [details.title, details.overview]
            : [details.name, details.description];
        notificationManager.sendNotification(type, {
          media,
          request: entity,
          notifyAdmin,
          notifySystem,
          notifyUser: notifyAdmin ? undefined : entity.requestedBy,
          event,
          subject,
          message: truncate(overview ?? '', {
            length: 500,
            separator: /\s/,
            omission: '…',
          }),
          image: details.posterPath,
          extra:
            entity.type === MediaType.SITE
              ? [
                  {
                    name: 'Requested Years',
                    value: entity.seasons
                      .map((season) => season.seasonNumber)
                      .join(', '),
                  },
                ]
              : undefined,
        });
      }
    } catch (e) {
      logger.error('Something went wrong sending media notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        requestId: entity.id,
        mediaId: entity.media.id,
      });
    }
  }
}

export default MediaRequest;
