#!/usr/bin/env node
/**
 * Read-only source inventory and optional PostgreSQL schema comparison.
 * Usage: node scripts/audit-postgres-schema.mjs [--check-db]
 * Requires only Node.js; --check-db invokes local psql with peer/local auth.
 * Does not write database data or expose connection credentials.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist"].includes(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path);
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(path))) files.push(path);
  }
}
walk(join(root, "src"));
walk(join(root, "scripts"));
walk(join(root, "../marketmind-ai/dashboard"));
walk(join(root, "../marketmind-ai/app"));
walk(join(root, "../marketmind-ai/lib"));

const tableRefs = new Map();
const rpcRefs = new Map();
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const rel = relative(root, file);
  for (const [regex, map] of [
    [/\.from\s*\(\s*["']([A-Za-z_][A-Za-z_0-9]*)["']\s*\)/g, tableRefs],
    [/\.rpc\s*\(\s*["']([A-Za-z_][A-Za-z_0-9]*)["']/g, rpcRefs],
  ]) {
    for (const match of content.matchAll(regex)) {
      if (!map.has(match[1])) map.set(match[1], new Set());
      map.get(match[1]).add(rel);
    }
  }
}
function list(map) {
  return [...map].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, paths]) => ({ name, references: [...paths].sort() }));
}
const report = { sourceFilesScanned: files.length, tables: list(tableRefs), rpcFunctions: list(rpcRefs) };
if (process.argv.includes("--check-db")) {
  const db = process.env.PGDATABASE || "marketmind";
  function query(sql) {
    return execFileSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
  }
  const actualTables = new Set(query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"));
  const actualRpc = new Set(query("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION'"));
  report.database = db;
  report.missingTables = report.tables.map(x => x.name).filter(x => !actualTables.has(x));
  report.missingRpcFunctions = report.rpcFunctions.map(x => x.name).filter(x => !actualRpc.has(x));
  report.note = "Presence checks only: columns, constraints, RLS, and PostgREST behavior require further verification.";
}
console.log(JSON.stringify(report, null, 2));
if (report.missingTables?.length || report.missingRpcFunctions?.length) process.exitCode = 2;
