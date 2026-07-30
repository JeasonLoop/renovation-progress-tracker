import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Keep personal deployment values out of the public config. The ignored
// .env.local file can provide PRODUCTION_URL, PRODUCTION_ORIGIN, and
// WRANGLER_CONFIG for day-to-day private deployments.
function loadLocalEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const passwordMin = 6;
const productionUrl = process.env.PRODUCTION_URL?.replace(/\/$/, "");
const originUrl = process.env.PRODUCTION_ORIGIN?.replace(/\/$/, "");
const isWindows = process.platform === "win32";

if (!productionUrl) {
  throw new Error("Set PRODUCTION_URL before running deploy:prod.");
}

function run(label, command, args, attempts = 1) {
  process.stdout.write(`\n[deploy] ${label}\n`);
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: isWindows,
    });
    if (!result.error && result.status === 0) return;
    if (attempt < attempts) {
      process.stderr.write(`[deploy] ${label} failed; retrying (${attempt}/${attempts})...\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 2_000);
    }
  }
  if (result?.error) throw result.error;
  process.exit(result?.status ?? 1);
}

async function readHealth(baseUrl) {
  const response = await fetchWithRetry(`${baseUrl}/api/health?deploy=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  const body = await response.text();
  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`${baseUrl} returned non-JSON health response (${response.status}).`);
  }
  if (!response.ok || result?.ok !== true || result?.passwordMin !== passwordMin) {
    throw new Error(`${baseUrl} health check failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }

  const curl = spawnSync(isWindows ? "curl.exe" : "curl", [
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    "20",
    "--header",
    "Cache-Control: no-cache",
    url,
  ], { encoding: "utf8" });
  if (!curl.error && curl.status === 0) {
    return {
      ok: true,
      status: 200,
      text: async () => curl.stdout,
    };
  }
  throw lastError;
}

async function verifyProduction() {
  process.stdout.write("\n[deploy] Verifying production\n");
  // The origin Worker URL is optional because some setups only expose the
  // final custom domain. When it is present, check it first to separate Worker
  // deploy problems from CDN/proxy routing problems.
  if (originUrl) {
    try {
      await readHealth(originUrl);
      process.stdout.write(`[deploy] Origin OK: ${originUrl}\n`);
    } catch (error) {
      process.stderr.write(`[deploy] Origin check unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  await readHealth(productionUrl);
  const registerResponse = await fetchWithRetry(`${productionUrl}/register/?deploy=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  if (!registerResponse.ok) {
    throw new Error(`${productionUrl}/register/ is unavailable (${registerResponse.status}).`);
  }
  process.stdout.write(`[deploy] Production OK: ${productionUrl} (password minimum: ${passwordMin})\n`);
}

run("Checking Cloudflare login", "npx", ["wrangler", "whoami"], 2);
run("Building Next.js", "npm", ["run", "build"]);
// Use a private Wrangler config when WRANGLER_CONFIG is set. The checked-in
// wrangler.jsonc intentionally contains placeholder resource IDs for open source.
const wranglerConfigArgs = process.env.WRANGLER_CONFIG ? ["--config", process.env.WRANGLER_CONFIG] : [];
run("Applying D1 migrations", "npx", ["wrangler", ...wranglerConfigArgs, "d1", "migrations", "apply", "RENOVATION_DB", "--remote"], 3);
run("Deploying Worker", "npx", ["wrangler", ...wranglerConfigArgs, "deploy"], 3);

try {
  await verifyProduction();
  process.stdout.write("\n[deploy] Production deployment completed successfully.\n");
} catch (error) {
  process.stderr.write(`\n[deploy] Deployment finished, but verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
