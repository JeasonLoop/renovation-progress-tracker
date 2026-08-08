interface Env {
  ASSETS: Fetcher;
  ZHUJI_UPLOADS: KVNamespace;
  RENOVATION_DB: D1Database;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

interface SessionPayload {
  sub: string;       // username
  exp: number;
  nonce: string;
}

interface UploadMetadata {
  contentType: string;
  name: string;
  size: number;
  uploadedAt: string;
}

interface SnapshotRow {
  revision: number;
  data_json: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  password_hash: string;
}

const encoder = new TextEncoder();
const SESSION_COOKIE = "zhuji_session";
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_SECONDS = 60 * 15;
const LOGIN_MAX_FAILURES = 5;
const REGISTER_WINDOW_SECONDS = 60 * 60;
const REGISTER_MAX_ATTEMPTS = 3;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DATA_BYTES = 900 * 1024;
const USERNAME_MIN = 2;
const USERNAME_MAX = 30;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;
// Cloudflare Workers caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const INITIAL_ADMIN_USERNAME = "admin";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"]);
const ALLOWED_UPLOAD_TYPES = new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function randomSalt(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)));
}

async function derivePassword(password: string, salt: string, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations }, key, 256));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomSalt();
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${base64Url(await derivePassword(password, salt, PASSWORD_ITERATIONS))}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsRaw, salt, expectedRaw, extra] = storedHash.split("$");
  const iterations = Number(iterationsRaw);
  if (algorithm !== "pbkdf2_sha256" || !salt || !expectedRaw || extra || !Number.isInteger(iterations) || iterations < PASSWORD_ITERATIONS) return false;
  try {
    const expected = fromBase64Url(expectedRaw);
    const derived = await derivePassword(password, salt, iterations);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// The session token is a compact signed payload instead of a JWT dependency.
// It only carries identity and expiry; authorization is re-checked per request.
async function createSession(username: string, secret: string): Promise<string> {
  const payload: SessionPayload = { sub: username, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() };
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64Url(await hmac(body, secret))}`;
}

async function readSession(request: Request, env: Env): Promise<SessionPayload | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  try {
    const expected = await hmac(body, env.SESSION_SECRET);
    if (!timingSafeEqual(fromBase64Url(signature), expected)) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    // 验证会话是否过期，不再硬编码检查特定用户名
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9_\u4e00-\u9fff]{2,30}$/.test(value);
}

function requestOriginIsValid(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function isRenovationData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const project = data.project as Record<string, unknown> | undefined;
  const requiredArrays = ["stages", "tasks", "inspections", "materialCategories", "materials", "budgetCategories", "budgetItems", "issues", "journals"];
  return data.version === 4
    && typeof project?.name === "string"
    && typeof project?.homeType === "string"
    && typeof project?.area === "number"
    && Number.isFinite(project.area)
    && typeof data.updatedAt === "string"
    && Number.isFinite(Date.parse(data.updatedAt))
    && requiredArrays.every((key) => Array.isArray(data[key]));
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function sessionCookie(value: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}

async function rateKey(request: Request, prefix: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(ip)));
  return `${prefix}:${base64Url(digest)}`;
}

async function takeRateLimit(env: Env, key: string, windowSeconds: number, maximum: number): Promise<Response | null> {
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + windowSeconds;
  const state = await env.RENOVATION_DB.prepare(
    "INSERT INTO auth_rate_limits (id, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = CASE WHEN auth_rate_limits.reset_at <= ? THEN 1 ELSE auth_rate_limits.count + 1 END, reset_at = CASE WHEN auth_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE auth_rate_limits.reset_at END RETURNING count, reset_at"
  ).bind(key, resetAt, now, now).first<{ count: number; reset_at: number }>();
  if (!state || state.count <= maximum) return null;
  return json({ error: "尝试次数过多，请稍后再试" }, 429, { "Retry-After": String(Math.max(1, state.reset_at - now)) });
}

async function register(request: Request, env: Env): Promise<Response> {
  // Auth endpoints are same-origin only. This is intentionally stricter than
  // CORS because the app is deployed as one Worker-served site.
  if (!requestOriginIsValid(request)) return json({ error: "请求来源无效" }, 403);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 4096) return json({ error: "请求无效" }, 413);

  const key = await rateKey(request, "register");
  const limited = await takeRateLimit(env, key, REGISTER_WINDOW_SECONDS, REGISTER_MAX_ATTEMPTS);
  if (limited) return limited;

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式无效" }, 400);
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidUsername(username)) {
    return json({ error: `用户名需 ${USERNAME_MIN}-${USERNAME_MAX} 位，支持中英文、数字和下划线` }, 400);
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return json({ error: `密码需 ${PASSWORD_MIN}-${PASSWORD_MAX} 位` }, 400);
  }

  // The D1 primary key is the final uniqueness guard; this preflight exists so
  // the UI can return a friendly message before the insert path races.
  const existing = await env.RENOVATION_DB.prepare("SELECT id FROM users WHERE id = ?").bind(username).first<{ id: string }>();
  if (existing || username === INITIAL_ADMIN_USERNAME) {
    return json({ error: "该用户名已被注册" }, 409);
  }

  const passwordHash = await hashPassword(password);

  try {
    await env.RENOVATION_DB.prepare("INSERT INTO users (id, password_hash) VALUES (?, ?)")
      .bind(username, passwordHash)
      .run();
  } catch {
    const duplicate = await env.RENOVATION_DB.prepare("SELECT id FROM users WHERE id = ?").bind(username).first<{ id: string }>();
    if (duplicate) {
      return json({ error: "该用户名已被注册" }, 409);
    }
    return json({ error: "注册失败，请稍后重试" }, 503);
  }

  // 注册成功后自动登录
  const token = await createSession(username, env.SESSION_SECRET);
  return json({ ok: true, username }, 201, { "Set-Cookie": sessionCookie(token, request, SESSION_SECONDS) });
}

async function login(request: Request, env: Env): Promise<Response> {
  if (!requestOriginIsValid(request)) return json({ error: "请求来源无效" }, 403);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 4096) return json({ error: "请求无效" }, 413);
  const key = await rateKey(request, "login");
  const limited = await takeRateLimit(env, key, LOGIN_WINDOW_SECONDS, LOGIN_MAX_FAILURES);
  if (limited) return limited;

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "用户名或密码错误" }, 400);
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const validShape = username.length > 0 && username.length <= 64 && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

  // Normal users live in D1. The first successful admin login bootstraps the
  // admin row from Cloudflare Secret so a fresh database can come online safely.
  let user: UserRow | null = null;
  if (validShape) {
    user = await env.RENOVATION_DB.prepare("SELECT id, password_hash FROM users WHERE id = ?")
      .bind(username)
      .first<UserRow>();
  }

  const passwordValid = user ? await verifyPassword(password, user.password_hash) : false;
  let authenticated = passwordValid;
  if (!authenticated && !user && validShape && username === INITIAL_ADMIN_USERNAME) {
    authenticated = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
    if (authenticated) {
      try {
        await env.RENOVATION_DB.prepare("INSERT OR IGNORE INTO users (id, password_hash) VALUES (?, ?)")
          .bind(INITIAL_ADMIN_USERNAME, env.ADMIN_PASSWORD_HASH)
          .run();
      } catch {
        return json({ error: "管理员账号初始化失败，请稍后重试" }, 503);
      }
    }
  }
  if (!authenticated) {
    return json({ error: "用户名或密码错误" }, 401);
  }

  const token = await createSession(username, env.SESSION_SECRET);
  return json({ ok: true, username }, 200, { "Set-Cookie": sessionCookie(token, request, SESSION_SECONDS) });
}

function hasValidImageSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/gif") return new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" || new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a";
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function uploadImage(request: Request, env: Env): Promise<Response> {
  if (!requestOriginIsValid(request)) return json({ error: "请求来源无效" }, 403);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "文件不能超过 8 MB" }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "上传内容无效" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || !ALLOWED_UPLOAD_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return json({ error: "仅支持 8 MB 内的图片、PDF、Word、Excel、PowerPoint、TXT 或 CSV 文件" }, 400);
  // MIME headers are user-controlled, so verify image signatures before storing.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ALLOWED_IMAGE_TYPES.has(file.type) && !hasValidImageSignature(bytes, file.type)) return json({ error: "图片内容与文件类型不一致" }, 400);
  const id = crypto.randomUUID();
  const key = `upload:${id}`;
  const metadata: UploadMetadata = { contentType: file.type, name: file.name.slice(0, 180), size: file.size, uploadedAt: new Date().toISOString() };
  await env.ZHUJI_UPLOADS.put(key, bytes, { metadata });
  const url = new URL(`/api/uploads/${id}`, request.url).toString();
  return json({ attachment: { id, name: metadata.name, url, type: metadata.contentType, size: metadata.size, uploadedAt: metadata.uploadedAt } }, 201);
}

async function serveUpload(id: string, env: Env): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const object = await env.ZHUJI_UPLOADS.getWithMetadata<UploadMetadata>(`upload:${id}`, "arrayBuffer");
  if (!object.value || !object.metadata) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": object.metadata.contentType, "Content-Length": String(object.metadata.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!ALLOWED_IMAGE_TYPES.has(object.metadata.contentType)) headers["Content-Disposition"] = "attachment";
  return new Response(object.value, { headers });
}

async function deleteUpload(request: Request, id: string, env: Env): Promise<Response> {
  if (!requestOriginIsValid(request)) return json({ error: "请求来源无效" }, 403);
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "附件不存在" }, 404);
  await env.ZHUJI_UPLOADS.delete(`upload:${id}`);
  return new Response(null, { status: 204 });
}

async function readSnapshot(userId: string, env: Env): Promise<{ data: unknown; revision: number; updatedAt: string | null }> {
  const row = await env.RENOVATION_DB.prepare("SELECT revision, data_json, updated_at FROM project_snapshots WHERE user_id = ? AND id = ?")
    .bind(userId, "primary")
    .first<SnapshotRow>();
  if (!row) return { data: null, revision: 0, updatedAt: null };
  return { data: JSON.parse(row.data_json), revision: row.revision, updatedAt: row.updated_at };
}

async function getProjectData(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) return json({ error: "登录已失效" }, 401);
  try {
    return json(await readSnapshot(session.sub, env));
  } catch {
    return json({ error: "云端数据暂时不可用" }, 503);
  }
}

async function putProjectData(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) return json({ error: "登录已失效" }, 401);
  if (!requestOriginIsValid(request)) return json({ error: "请求来源无效" }, 403);
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) return json({ error: "请求格式无效" }, 415);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_DATA_BYTES) return json({ error: "项目数据不能超过 900 KB" }, 413);

  const userId = session.sub;
  let body: { data?: unknown; expectedRevision?: unknown; force?: unknown };
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > MAX_DATA_BYTES) return json({ error: "项目数据不能超过 900 KB" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "项目数据无效" }, 400);
  }

  const expectedRevision = Number(body.expectedRevision);
  const force = body.force === true;
  if (!isRenovationData(body.data) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ error: "项目数据无效" }, 400);
  const dataJson = JSON.stringify(body.data);
  const updatedAt = body.data.updatedAt as string;

  try {
    if (force) {
      // Force save is reserved for explicit conflict-resolution UI actions.
      const update = await env.RENOVATION_DB.prepare("UPDATE project_snapshots SET revision = revision + 1, data_json = ?, updated_at = ? WHERE user_id = ? AND id = ?")
        .bind(dataJson, updatedAt, userId, "primary")
        .run();
      if ((update.meta.changes ?? 0) === 0) {
        await env.RENOVATION_DB.prepare("INSERT INTO project_snapshots (id, user_id, revision, data_json, updated_at) VALUES (?, ?, 1, ?, ?)")
          .bind("primary", userId, dataJson, updatedAt)
          .run();
        return json({ data: body.data, revision: 1, updatedAt });
      }
      const current = await readSnapshot(userId, env);
      return json(current);
    }

    if (expectedRevision === 0) {
      const insert = await env.RENOVATION_DB.prepare("INSERT OR IGNORE INTO project_snapshots (id, user_id, revision, data_json, updated_at) VALUES (?, ?, 1, ?, ?)")
        .bind("primary", userId, dataJson, updatedAt)
        .run();
      if ((insert.meta.changes ?? 0) > 0) return json({ data: body.data, revision: 1, updatedAt }, 201);
    } else {
      const update = await env.RENOVATION_DB.prepare("UPDATE project_snapshots SET revision = revision + 1, data_json = ?, updated_at = ? WHERE user_id = ? AND id = ? AND revision = ?")
        .bind(dataJson, updatedAt, userId, "primary", expectedRevision)
        .run();
      if ((update.meta.changes ?? 0) > 0) return json({ data: body.data, revision: expectedRevision + 1, updatedAt });
    }

    return json({ error: "云端数据已在其他设备更新", ...(await readSnapshot(userId, env)) }, 409);
  } catch {
    return json({ error: "云端保存失败，请稍后重试" }, 503);
  }
}

function addSecurityHeaders(response: Response): Response {
  // The Worker owns both static assets and APIs, so response hardening lives in
  // one place instead of relying on platform defaults.
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://images.unsplash.com; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isLoginPage = url.pathname === "/login" || url.pathname === "/login/";
    const isRegisterPage = url.pathname === "/register" || url.pathname === "/register/";
    const isAuthPage = isLoginPage || isRegisterPage;
    const isPublicAsset = url.pathname.startsWith("/_next/") || url.pathname === "/favicon.ico";

    // 注册接口（无需登录）
    if (request.method === "POST" && url.pathname === "/api/auth/register") return addSecurityHeaders(await register(request, env));
    // 登录接口（无需登录）
    if (request.method === "POST" && url.pathname === "/api/auth/login") return addSecurityHeaders(await login(request, env));
    // session 状态检测（无需登录，前端用于判断 Worker 是否可用）
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const session = await readSession(request, env);
      return addSecurityHeaders(session ? json({ authenticated: true, username: session.sub }) : json({ authenticated: false }));
    }
    // 部署脚本使用的只读探针，同时确保前后端密码规则发布一致。
    if (url.pathname === "/api/health" && request.method === "GET") {
      return addSecurityHeaders(json({ ok: true, passwordMin: PASSWORD_MIN }));
    }

    const session = await readSession(request, env);
    if (!session && !isAuthPage && !isPublicAsset) {
      if (url.pathname.startsWith("/api/")) return addSecurityHeaders(json({ error: "登录已失效" }, 401));
      return addSecurityHeaders(Response.redirect(`${url.origin}/login`, 302));
    }
    if (session && isAuthPage) return addSecurityHeaders(Response.redirect(`${url.origin}/`, 302));

    if (session && url.pathname === "/api/auth/logout" && request.method === "POST") {
      if (!requestOriginIsValid(request)) return addSecurityHeaders(json({ error: "请求来源无效" }, 403));
      return addSecurityHeaders(json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", request, 0) }));
    }
    if (session && url.pathname === "/api/data" && request.method === "GET") return addSecurityHeaders(await getProjectData(request, env));
    if (session && url.pathname === "/api/data" && request.method === "PUT") return addSecurityHeaders(await putProjectData(request, env));
    if (session && url.pathname === "/api/uploads" && request.method === "POST") return addSecurityHeaders(await uploadImage(request, env));
    if (session && url.pathname.startsWith("/api/uploads/")) {
      const id = url.pathname.slice("/api/uploads/".length);
      if (request.method === "GET") return addSecurityHeaders(await serveUpload(id, env));
      if (request.method === "DELETE") return addSecurityHeaders(await deleteUpload(request, id, env));
    }
    if (url.pathname.startsWith("/api/")) return addSecurityHeaders(json({ error: "接口不存在" }, 404));

    return addSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
