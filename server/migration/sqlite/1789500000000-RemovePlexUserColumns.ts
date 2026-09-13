import type { MigrationInterface, QueryRunner } from 'typeorm';

// Plex login is gone: drop the Plex identity columns on "user" and flip the
// userType default from PLEX (1) to LOCAL (2). SQLite can't change a column
// default in place, so "user" is rebuilt; the two user_settings watchlist
// sync flags (Plex-watchlist only) go with a plain DROP COLUMN.
export class RemovePlexUserColumns1789500000000 implements MigrationInterface {
  name = 'RemovePlexUserColumns1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar, "permissions" integer NOT NULL DEFAULT (0), "avatar" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "password" varchar, "userType" integer NOT NULL DEFAULT (2), "resetPasswordGuid" varchar, "recoveryLinkExpirationDate" datetime, "movieQuotaLimit" integer, "movieQuotaDays" integer, "tvQuotaLimit" integer, "tvQuotaDays" integer, "jellyfinUsername" varchar, "jellyfinAuthToken" varchar, "jellyfinUserId" varchar, "jellyfinDeviceId" varchar, "avatarETag" varchar, "avatarVersion" varchar, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "email", "username", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion") SELECT "id", "email", "username", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion" FROM "user"`
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "watchlistSyncMovies"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "watchlistSyncTv"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "watchlistSyncTv" boolean`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "watchlistSyncMovies" boolean`
    );
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "plexId" integer`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "plexToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "plexUsername" varchar`
    );
  }
}
