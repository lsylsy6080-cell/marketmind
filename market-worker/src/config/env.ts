import "dotenv/config";
// PostgreSQL environment validation happens lazily in the shared database factory.
export const env = { databaseUrl: process.env.DATABASE_URL };
