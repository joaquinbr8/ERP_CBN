import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import dotenv from "dotenv";
import path from "node:path";
export const ROOT = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });
@Injectable()
export class Db implements OnModuleDestroy {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || "postgres://cbn_demo@127.0.0.1:55432/cbn_erp",
    max: 10,
  });
  async rows(sql: string, args: any[] = []) {
    return (await this.pool.query(sql, args)).rows;
  }
  async tx<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
@Global()
@Module({ providers: [Db], exports: [Db] })
export class DatabaseModule {}
