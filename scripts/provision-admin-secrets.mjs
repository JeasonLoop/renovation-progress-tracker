import { pbkdf2Sync, randomBytes, webcrypto } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Load ignored local deployment values before reading ADMIN_PASSWORD. This
// keeps real credentials out of git while preserving one-command local deploys.
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

const base64Url = (value) => Buffer.from(value).toString("base64url");
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 6) throw new Error("Set ADMIN_PASSWORD to a password with at least 6 characters before provisioning secrets.");
// Keep this aligned with the Cloudflare Workers PBKDF2 runtime limit.
const passwordIterations = 100000;
const passwordSalt = base64Url(randomBytes(16));
const passwordHash = `pbkdf2_sha256$${passwordIterations}$${passwordSalt}$${base64Url(pbkdf2Sync(password, passwordSalt, passwordIterations, 32, "sha256"))}`;
const sessionSecret = base64Url(randomBytes(48));
const productionOrigin = process.env.PRODUCTION_ORIGIN?.replace(/\/$/, "");

async function verifyGeneratedPasswordHash() {
  const [algorithm, iterations, salt, expectedRaw, extra] = passwordHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || iterations !== String(passwordIterations) || !salt || !expectedRaw || extra) return false;
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const expected = Buffer.from(expectedRaw, "base64url");
  const derived = Buffer.from(await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: passwordIterations }, key, 256));
  return derived.equals(expected);
}

function putSecrets(secrets) {
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const configArg = process.env.WRANGLER_CONFIG ? ` --config ${process.env.WRANGLER_CONFIG}` : "";
  // Wrangler receives the generated hash and session secret through stdin, so
  // the plaintext admin password never becomes a Cloudflare secret value.
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `npx wrangler${configArg} secret bulk`] : ["wrangler", ...(process.env.WRANGLER_CONFIG ? ["--config", process.env.WRANGLER_CONFIG] : []), "secret", "bulk"];
  const input = `${JSON.stringify(secrets)}\n`;
  let result;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    result = spawnSync(executable, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (result.status === 0) return;
    if (attempt < 4) {
      process.stderr.write(`Cloudflare Secret bulk write failed; retrying (${attempt}/4).\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1500);
    }
  }
  process.stderr.write("Unable to set Cloudflare Secrets.\n");
  process.stderr.write(result?.error?.message || result?.stderr || result?.stdout || "Unknown Wrangler error.\n");
  process.exit(result?.status || 1);
}

async function fetchWithRetry(url, init) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function verifyProductionAuth() {
  if (!productionOrigin) {
    return "skipped";
  }

  // Optional smoke test: only runs when PRODUCTION_ORIGIN is configured in the
  // ignored local env file or the shell environment.
  const loginResponse = await fetchWithRetry(`${productionOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: productionOrigin,
    },
    body: JSON.stringify({ username: "admin", password }),
    redirect: "manual",
  });
  const loginBody = await loginResponse.text();
  const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!loginResponse.ok || !cookie) {
    throw new Error(`Production login failed (${loginResponse.status}): ${loginBody.slice(0, 300)}`);
  }

  const sessionResponse = await fetchWithRetry(`${productionOrigin}/api/auth/session`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const sessionBody = await sessionResponse.text();
  let session;
  try {
    session = JSON.parse(sessionBody);
  } catch {
    session = null;
  }
  if (!sessionResponse.ok || session?.authenticated !== true || session?.username !== "admin") {
    throw new Error(`Production session verification failed (${sessionResponse.status}): ${sessionBody.slice(0, 300)}`);
  }
}

if (!(await verifyGeneratedPasswordHash())) throw new Error("Generated password hash failed local Web Crypto verification.");
putSecrets({ ADMIN_PASSWORD_HASH: passwordHash, SESSION_SECRET: sessionSecret });
let verificationStatus = "skipped";
try {
  verificationStatus = await verifyProductionAuth() ?? "verified";
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Production login failed") || message.startsWith("Production session verification failed")) throw error;
  verificationStatus = "unavailable";
  process.stderr.write(`Production credentials were provisioned, but remote verification is unavailable: ${message}\n`);
}
process.stdout.write(`PROVISION_STATUS=success\nVERIFICATION_STATUS=${verificationStatus}\nADMIN_USERNAME=admin\n`);
