/**
 * Embedded Postgres for local development: no Docker, no Homebrew.
 *
 *   npm run db:local          # starts Postgres on 127.0.0.1:5433 (data in .local-db/)
 *
 * Then in .env:
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true"
 *   DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true"
 *
 * Prisma keeps one pooled connection per process (connection_limit=1) and
 * pgbouncer=true makes it avoid named prepared statements, which PGlite's wire
 * server doesn't reset between sessions. Several processes can connect at once
 * (multiplexed). Fine for dev; use real Postgres (Supabase) in prod.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const dataDir = process.env.LOCAL_DB_DIR ?? ".local-db";

const db = await PGlite.create({ dataDir });
// PGlite is single-threaded; the socket server multiplexes several clients over
// it so `npm run dev`, `npm run worker` and a seed/migration can run together.
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
await server.start();
console.log(`[local-db] Postgres (PGlite) listening on 127.0.0.1:${port}, data in ${dataDir}/`);
console.log(`[local-db] DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&pgbouncer=true`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
