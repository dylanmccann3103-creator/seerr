import type { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation columns for the scene/site media types (TPDB-backed). Hand-written:
// these are plain nullable column adds + a partial unique index, all of which
// SQLite's ADD/DROP COLUMN and partial CREATE INDEX support natively, so the
// full temporary-table rebuild that `migration:generate` produces isn't needed.
export class AddSceneSiteFoundation1789161912799 implements MigrationInterface {
  name = 'AddSceneSiteFoundation1789161912799';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "tpdbId" varchar`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_media_tpdb_type" ON "media" ("tpdbId", "mediaType") WHERE "tpdbId" IS NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "failureReason" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "sentToServiceAt" datetime`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "sentToServiceAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "failureReason"`
    );
    await queryRunner.query(`DROP INDEX "UQ_media_tpdb_type"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "tpdbId"`);
  }
}
