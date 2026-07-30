import { parseImportData } from "./storage";
import type { RenovationData } from "./types";

export interface CloudSnapshot {
  data: RenovationData | null;
  revision: number;
  updatedAt: string | null;
}

export class CloudConflictError extends Error {
  constructor(public readonly snapshot: CloudSnapshot) {
    super("云端数据已在其他设备更新");
  }
}

// Server responses are validated again on the client before they can replace
// local data. This keeps older tabs or partial deploys from corrupting storage.
function parseSnapshot(value: unknown): CloudSnapshot {
  if (!value || typeof value !== "object") throw new Error("云端返回了无法识别的数据");
  const candidate = value as { data?: unknown; revision?: unknown; updatedAt?: unknown };
  const revision = Number(candidate.revision);
  const data = candidate.data === null ? null : parseImportData(candidate.data);
  if (!Number.isInteger(revision) || revision < 0 || (candidate.data !== null && !data)) throw new Error("云端返回了无法识别的数据");
  return { data, revision, updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null };
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("云端服务返回异常");
  return response.json();
}

export async function loadCloudSnapshot(): Promise<CloudSnapshot> {
  const response = await fetch("/api/data", { credentials: "same-origin", cache: "no-store" });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error((payload as { error?: string })?.error || "无法读取云端数据");
  return parseSnapshot(payload);
}

export async function saveCloudSnapshot(data: RenovationData, expectedRevision: number, force = false): Promise<CloudSnapshot> {
  const response = await fetch("/api/data", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, expectedRevision, force }),
  });
  const payload = await responseJson(response);
  // A 409 includes the current cloud snapshot so the UI can let the user choose
  // between keeping the cloud copy or intentionally overwriting it.
  if (response.status === 409) throw new CloudConflictError(parseSnapshot(payload));
  if (!response.ok) throw new Error((payload as { error?: string })?.error || "无法保存到云端");
  return parseSnapshot(payload);
}
