import { Blocklist } from '@server/entity/Blocklist';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import OverrideRule from '@server/entity/OverrideRule';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { Session } from '@server/entity/Session';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { UserSettings } from '@server/entity/UserSettings';
import { Watchlist } from '@server/entity/Watchlist';
import { IssueCommentSubscriber } from '@server/subscriber/IssueCommentSubscriber';
import { IssueSubscriber } from '@server/subscriber/IssueSubscriber';
import { MediaRequestSubscriber } from '@server/subscriber/MediaRequestSubscriber';
import { MediaSubscriber } from '@server/subscriber/MediaSubscriber';
import type { DataSourceOptions, EntityTarget, Repository } from 'typeorm';
import { DataSource } from 'typeorm';

const entities = [
  Blocklist,
  DiscoverSlider,
  Issue,
  IssueComment,
  Media,
  MediaRequest,
  OverrideRule,
  Season,
  SeasonRequest,
  Session,
  User,
  UserPushSubscription,
  UserSettings,
  Watchlist,
];

const subscribers = [
  IssueCommentSubscriber,
  IssueSubscriber,
  MediaRequestSubscriber,
  MediaSubscriber,
];

function boolFromEnv(envVar: string, defaultVal = false) {
  if (process.env[envVar]) {
    return process.env[envVar]?.toLowerCase() === 'true';
  }
  return defaultVal;
}

const testConfig: DataSourceOptions = {
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities,
  migrations: ['server/migration/sqlite/**/*.ts'],
  subscribers,
};

const devConfig: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.CONFIG_DIRECTORY
    ? `${process.env.CONFIG_DIRECTORY}/db/db.sqlite3`
    : 'config/db/db.sqlite3',
  synchronize: true,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities,
  migrations: ['server/migration/sqlite/**/*.ts'],
  subscribers,
};

const prodConfig: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.CONFIG_DIRECTORY
    ? `${process.env.CONFIG_DIRECTORY}/db/db.sqlite3`
    : 'config/db/db.sqlite3',
  synchronize: false,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities,
  migrations: ['dist/migration/sqlite/**/*.js'],
  subscribers,
};

function getDataSource(): DataSourceOptions {
  if (process.env.NODE_ENV === 'test') {
    return testConfig;
  } else if (process.env.NODE_ENV === 'production') {
    return prodConfig;
  } else {
    return devConfig;
  }
}

const dataSource = new DataSource(getDataSource());

export const getRepository = <Entity extends object>(
  target: EntityTarget<Entity>
): Repository<Entity> => {
  return dataSource.getRepository(target);
};

export default dataSource;
