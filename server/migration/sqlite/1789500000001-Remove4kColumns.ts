import type { MigrationInterface, QueryRunner } from 'typeorm';

// 4K is gone (single Whisparr quality, no Plex): drop the parallel *4k columns,
// the Plex rating keys and the request flag. Plain DROP COLUMN suffices; the
// only index involved (media.status4k) is dropped first.
export class Remove4kColumns1789500000001 implements MigrationInterface {
  name = 'Remove4kColumns1789500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_5d6218de4f547909391a5c1347"`);
    for (const column of [
      'status4k',
      'serviceId4k',
      'externalServiceId4k',
      'externalServiceSlug4k',
      'ratingKey',
      'ratingKey4k',
      'jellyfinMediaId4k',
    ]) {
      await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(`ALTER TABLE "season" DROP COLUMN "status4k"`);
    await queryRunner.query(`ALTER TABLE "media_request" DROP COLUMN "is4k"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "is4k" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "season" ADD COLUMN "status4k" integer NOT NULL DEFAULT (1)`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "jellyfinMediaId4k" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "ratingKey4k" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "ratingKey" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "externalServiceSlug4k" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "externalServiceId4k" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "serviceId4k" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "status4k" integer NOT NULL DEFAULT (1)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d6218de4f547909391a5c1347" ON "media" ("status4k")`
    );
  }
}
