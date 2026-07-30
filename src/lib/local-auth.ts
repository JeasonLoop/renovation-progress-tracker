/**
 * 本地开发模式的用户认证模块
 * 使用 localStorage 模拟注册/登录，不影响生产环境
 */

const LOCAL_USERS_KEY = "zhuji-local-users-v1";
const LOCAL_SESSION_KEY = "zhuji-local-session-v1";
const PASSWORD_MIN = 6;

export interface LocalUser {
  username: string;
  passwordHash: string;
  createdAt: string;
}

interface LocalSession {
  username: string;
  createdAt: string;
}

function getUsers(): LocalUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? (JSON.parse(raw) as LocalUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: LocalUser[]): void {
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

/** 简单哈希（仅用于本地开发，不用于生产） */
async function localHash(password: string): Promise<string> {
  const data = new TextEncoder().encode(`zhuji-local:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function localRegister(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `密码至少需要 ${PASSWORD_MIN} 位` };
  }
  const users = getUsers();
  if (users.some((u) => u.username === username)) {
    return { ok: false, error: "该用户名已被注册" };
  }
  const passwordHash = await localHash(password);
  users.push({ username, passwordHash, createdAt: new Date().toISOString() });
  saveUsers(users);
  setLocalSession(username);
  return { ok: true };
}

export async function localLogin(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const users = getUsers();
  const user = users.find((u) => u.username === username);
  if (!user) {
    return { ok: false, error: "用户名或密码错误" };
  }
  const hash = await localHash(password);
  if (hash !== user.passwordHash) {
    return { ok: false, error: "用户名或密码错误" };
  }
  setLocalSession(username);
  return { ok: true };
}

export function getLocalUsers(): LocalUser[] {
  return getUsers();
}

export function setLocalSession(username: string): void {
  const session: LocalSession = { username, createdAt: new Date().toISOString() };
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

export function getLocalSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

export function clearLocalSession(): void {
  window.localStorage.removeItem(LOCAL_SESSION_KEY);
}

/** 根据当前登录用户获取数据存储 key，实现本地多用户数据隔离 */
export function getLocalStorageKey(): string {
  const session = getLocalSession();
  const suffix = session ? `-${session.username}` : "";
  return `renovation-progress-data-v4${suffix}`;
}
