import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Creates the test database if needed and applies migrations to it. */
export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL!;
  const name = new URL(testUrl).pathname.slice(1);
  const admin = new PrismaClient({ datasourceUrl: process.env.BASE_DATABASE_URL });
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!rows.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "ignore" });
}
