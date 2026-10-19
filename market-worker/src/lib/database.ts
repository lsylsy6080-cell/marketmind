import "dotenv/config";
import { createPostgresClient } from "@marketmind/database/postgres";
export const database = createPostgresClient();
