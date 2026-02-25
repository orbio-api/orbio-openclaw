import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_TEMPLATE_PATH = path.join(ROOT, ".env.smoke.example");
const INDEX_PATH = path.join(ROOT, "src/index.ts");
const LIVE_SMOKE_PATH = path.join(ROOT, "scripts/live-smoke.mjs");

function readEnvKeys(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const keys = new Set();
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    keys.add(line.slice(0, eqIndex).trim());
  }
  return keys;
}

function extractMatches(content, pattern, groupIndex = 1) {
  const keys = new Set();
  for (const match of content.matchAll(pattern)) {
    const key = match[groupIndex];
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function main() {
  if (!fs.existsSync(ENV_TEMPLATE_PATH)) {
    throw new Error(`Missing env template: ${ENV_TEMPLATE_PATH}`);
  }
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Missing plugin source: ${INDEX_PATH}`);
  }
  if (!fs.existsSync(LIVE_SMOKE_PATH)) {
    throw new Error(`Missing smoke script: ${LIVE_SMOKE_PATH}`);
  }

  const envKeys = readEnvKeys(ENV_TEMPLATE_PATH);
  const indexContent = fs.readFileSync(INDEX_PATH, "utf-8");
  const smokeContent = fs.readFileSync(LIVE_SMOKE_PATH, "utf-8");

  const pluginEnvRefs = extractMatches(indexContent, /env\.([A-Z0-9_]+)/gu);
  const smokeEnvRefs = extractMatches(
    smokeContent,
    /(requiredEnv|optionalEnv)\("([A-Z0-9_]+)"/gu,
    2,
  );

  const expectedKeys = new Set([...pluginEnvRefs, ...smokeEnvRefs]);
  const missing = difference(expectedKeys, envKeys);
  const unused = difference(envKeys, expectedKeys);

  const issues = [];
  if (missing.length > 0) {
    issues.push(`missing keys in .env.smoke.example: ${missing.join(", ")}`);
  }
  if (unused.length > 0) {
    issues.push(`unused keys in .env.smoke.example: ${unused.join(", ")}`);
  }

  if (issues.length > 0) {
    console.error("env contract audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("env contract audit passed");
  console.log(`expected_keys=${expectedKeys.size}`);
}

main();
