import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type { DownloadingItem } from '@server/lib/downloadtracker';
import downloadTracker from '@server/lib/downloadtracker';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import { getHostname } from '@server/utils/getHostname';
import {
  AfterLoad,
  Column,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import Issue from './Issue';
import { MediaRequest } from './MediaRequest';
import Season from './Season';

@Entity()
@Index(['tmdbId', 'mediaType'])
@Index('UQ_media_tpdb_type', ['tpdbId', 'mediaType'], {
  unique: true,
  where: '"tpdbId" IS NOT NULL',
})
class Media {
  public static async getRelatedMedia(
    user: User | undefined,
    items: { tmdbId: number; mediaType: string }[],
    { includeActiveRequest = false }: { includeActiveRequest?: boolean } = {}
  ): Promise<Media[]> {
    const mediaRepository = getRepository(Media);

    try {
      if (items.length === 0) {
        return [];
      }

      const finalIds = [...new Set(items.map((i) => i.tmdbId))];

      const media = await mediaRepository
        .createQueryBuilder('media')
        .leftJoinAndSelect(
          'media.watchlists',
          'watchlist',
          'media.id= watchlist.media and watchlist.requestedBy = :userId',
          { userId: user?.id }
        )
        .where(' media.tmdbId in (:...finalIds)', { finalIds })
        .getMany();

      const relatedMedia = media.filter((m) =>
        items.some((i) => i.tmdbId === m.tmdbId && i.mediaType === m.mediaType)
      );

      if (
        includeActiveRequest &&
        getSettings().main.hideRequested &&
        relatedMedia.length > 0
      ) {
        const activeRequestMediaIds = await mediaRepository
          .createQueryBuilder('media')
          .select('media.id', 'id')
          .distinct(true)
          .innerJoin('media.requests', 'request')
          .where('media.id IN (:...mediaIds)', {
            mediaIds: relatedMedia.map((m) => m.id),
          })
          .andWhere('request.status IN (:...statuses)', {
            statuses: [MediaRequestStatus.PENDING, MediaRequestStatus.APPROVED],
          })
          .getRawMany<{ id: number }>();

        const activeIds = new Set(activeRequestMediaIds.map((row) => row.id));

        relatedMedia.forEach((m) => {
          m.hasActiveRequest = activeIds.has(m.id);
        });
      }

      return relatedMedia;
    } catch (e) {
      logger.error(e.message);
      return [];
    }
  }

  // tpdbId twin of getRelatedMedia for scene/site rows.
  public static async getRelatedTpdbMedia(
    user: User | undefined,
    items: { tpdbId: string; mediaType: MediaType }[]
  ): Promise<Media[]> {
    if (items.length === 0) {
      return [];
    }
    try {
      const media = await getRepository(Media)
        .createQueryBuilder('media')
        .leftJoinAndSelect('media.seasons', 'season')
        .where('media.tpdbId IN (:...ids)', {
          ids: [...new Set(items.map((i) => i.tpdbId))],
        })
        .getMany();
      return media.filter((m) =>
        items.some((i) => i.tpdbId === m.tpdbId && i.mediaType === m.mediaType)
      );
    } catch (e) {
      logger.error(e.message);
      return [];
    }
  }

  public static async getMedia(
    id: number,
    mediaType: MediaType
  ): Promise<Media | undefined> {
    const mediaRepository = getRepository(Media);

    try {
      const media = await mediaRepository.findOne({
        where: { tmdbId: id, mediaType: mediaType },
        relations: { requests: true, issues: true },
      });

      return media ?? undefined;
    } catch (e) {
      logger.error(e.message);
      return undefined;
    }
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column()
  @Index()
  public tmdbId: number;

  @Column({ unique: true, nullable: true })
  @Index()
  public tvdbId?: number;

  @Column({ nullable: true })
  @Index()
  public imdbId?: string;

  // TPDB (ThePornDB) key for scene/site media types. Varchar deliberately:
  // TPDB site ids are numeric but scene ids are uuid-shaped strings, so one
  // opaque text key covers both.
  @Column({ nullable: true, type: 'varchar' })
  public tpdbId?: string | null;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  @Index()
  public status: MediaStatus;

  @OneToMany(() => MediaRequest, (request) => request.media, {
    cascade: ['insert', 'remove'],
  })
  public requests: MediaRequest[];

  @OneToMany(() => Watchlist, (watchlist) => watchlist.media)
  public watchlists: null | Watchlist[];

  @OneToMany(() => Season, (season) => season.media, {
    cascade: true,
    eager: true,
  })
  public seasons: Season[];

  @OneToMany(() => Issue, (issue) => issue.media, { cascade: true })
  public issues: Issue[];

  @OneToOne(() => Blocklist, (blocklist) => blocklist.media)
  public blocklist: Promise<Blocklist>;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  /**
   * The `lastSeasonChange` column stores the date and time when the media was added to the library.
   * It needs to be database-aware because SQLite supports `datetime` while PostgreSQL supports `timestamp with timezone (timestampz)`.
   */
  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public lastSeasonChange: Date;

  /**
   * The `mediaAddedAt` column stores the date and time when the media was added to the library.
   * It needs to be database-aware because SQLite supports `datetime` while PostgreSQL supports `timestamp with timezone (timestampz)`.
   * This column is nullable because it can be null when the media is not yet synced to the library.
   */
  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: true,
  })
  public mediaAddedAt: Date;

  @Column({ nullable: true, type: 'int' })
  public serviceId?: number | null;

  @Column({ nullable: true, type: 'int' })
  public externalServiceId?: number | null;

  @Column({ nullable: true, type: 'varchar' })
  public externalServiceSlug?: string | null;

  @Column({ nullable: true, type: 'varchar' })
  public jellyfinMediaId?: string | null;

  public hasActiveRequest?: boolean;
  public downloadStatus?: DownloadingItem[] = [];

  public mediaUrl?: string;

  constructor(init?: Partial<Media>) {
    Object.assign(this, init);
  }

  public resetServiceData(): void {
    this.serviceId = null;
    this.externalServiceId = null;
    this.externalServiceSlug = null;
    this.jellyfinMediaId = null;
  }

  @AfterLoad()
  public setMediaUrl(): void {
    const { serverId, externalHostname } = getSettings().jellyfin;
    const jellyfinHost =
      externalHostname && externalHostname.length > 0
        ? externalHostname
        : getHostname();

    if (this.jellyfinMediaId) {
      this.mediaUrl = `${jellyfinHost}/web/index.html#!/details?id=${this.jellyfinMediaId}&context=home&serverId=${serverId}`;
    }
  }

  @AfterLoad()
  public getDownloadingItem(): void {
    if (this.externalServiceId == null) {
      return;
    }
    if (this.mediaType === MediaType.SITE) {
      this.downloadStatus = downloadTracker.getWhisparrProgress({
        siteExternalId: this.externalServiceId,
      });
    }
    // Scene rows keep the Whisparr episode id; its site id is not stored,
    // so match on the episode alone.
    if (this.mediaType === MediaType.SCENE) {
      this.downloadStatus = downloadTracker.getWhisparrProgress({
        episodeId: this.externalServiceId,
      });
    }
  }
}

export default Media;
