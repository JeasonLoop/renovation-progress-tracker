import { defaultBudgetCategories, defaultMaterialCategories, emptyInitialData } from "./seed";
import type { BudgetItem, Material, MaterialCategory, RenovationData } from "./types";
import { getLocalSession } from "./local-auth";

const STORAGE_KEY = "renovation-progress-data-v4";
const RECOVERY_STORAGE_KEY = "renovation-progress-conflict-recovery-v1";
const LEGACY_STORAGE_KEYS = ["renovation-progress-data-v3", "renovation-progress-data-v2", "renovation-progress-data-v1"];

// Local cache is scoped by username once a session exists. That prevents data
// from leaking between accounts in the same browser profile.
function getStorageKey(): string {
  const session = getLocalSession();
  return session ? `${STORAGE_KEY}-${session.username}` : STORAGE_KEY;
}

function getRecoveryStorageKey(): string {
  const session = getLocalSession();
  return session ? `${RECOVERY_STORAGE_KEY}-${session.username}` : RECOVERY_STORAGE_KEY;
}

type LegacyMaterial = Omit<Material, "categoryId" | "usage"> & { category?: string };

function hasBaseShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Boolean(candidate.project) &&
    Array.isArray(candidate.stages) &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.inspections) &&
    Array.isArray(candidate.materials) &&
    Array.isArray(candidate.issues) &&
    Array.isArray(candidate.journals)
  );
}

function defaultCategoryId(name: string): string | undefined {
  if (/瓷|砖/.test(name)) return "tiles";
  if (/地板/.test(name)) return "flooring";
  if (/漆|涂料/.test(name)) return "paint";
  if (/门|窗/.test(name)) return "doors";
  if (/柜|定制/.test(name)) return "cabinetry";
  if (/卫浴|洁具/.test(name)) return "bathroom";
  if (/灯|照明/.test(name)) return "lighting";
  if (/开关|插座|电工/.test(name)) return "electrical";
  if (/家电|电器/.test(name)) return "appliances";
  return undefined;
}

function migrateMaterialData(candidate: Record<string, unknown>): Record<string, unknown> {
  const legacyMaterials = candidate.materials as LegacyMaterial[];
  const customCategories: MaterialCategory[] = [];
  const customCategoryByName = new Map<string, string>();

  const materials = legacyMaterials.map((material) => {
    const oldCategory = material.category?.trim() || "其他材料";
    let categoryId = defaultCategoryId(oldCategory);
    if (!categoryId) {
      categoryId = customCategoryByName.get(oldCategory);
      if (!categoryId) {
        categoryId = `custom-${crypto.randomUUID()}`;
        customCategoryByName.set(oldCategory, categoryId);
        customCategories.push({ id: categoryId, name: oldCategory, unit: "件", guidance: "记录规格、使用位置、数量、交期和选择理由。" });
      }
    }
    const { category: _category, ...rest } = material;
    return { ...rest, categoryId: categoryId ?? "other", usage: oldCategory };
  });

  return {
    ...candidate,
    materialCategories: [...defaultMaterialCategories, ...customCategories],
    materials,
  };
}

function migrateToVersion3(candidate: Record<string, unknown>): Record<string, unknown> {
  const withMaterials = candidate.version === 1 ? migrateMaterialData(candidate) : candidate;
  const project = withMaterials.project as RenovationData["project"];
  const legacyPaid = Number(project?.spent) || 0;
  const budgetItems: BudgetItem[] = legacyPaid > 0 ? [{
    id: `legacy-${crypto.randomUUID()}`,
    categoryId: "other-budget",
    name: "历史支出汇总",
    budgeted: 0,
    committed: legacyPaid,
    paid: legacyPaid,
    adjustment: 0,
    dueDate: "",
    vendor: "",
    note: "由旧版本的已花费金额自动迁移，可编辑或拆分为详细预算项。",
  }] : [];

  return {
    ...withMaterials,
    version: 3,
    budgetCategories: defaultBudgetCategories.map((category) => ({ ...category })),
    budgetItems,
  };
}

function migrateToVersion4(candidate: Record<string, unknown>): RenovationData {
  return { ...(candidate as unknown as Omit<RenovationData, "version">), version: 4 };
}

/** 将旧版 evidence (string[]) 迁移为 attachments (Attachment[]) */
function migrateEvidenceToAttachments(data: RenovationData): RenovationData {
  let changed = false;
  const inspections = data.inspections.map((item) => {
    if (!item.evidence?.length) return item;
    changed = true;
    const migrated = (item.evidence ?? []).map((url, i) => ({
      id: `migrated-${item.id}-${i}`,
      name: `旧版验收照片 ${i + 1}`,
      url,
      type: "image/jpeg",
      size: 0,
      uploadedAt: data.updatedAt,
    }));
    const { evidence: _evidence, ...rest } = item;
    return { ...rest, attachments: [...(item.attachments ?? []), ...migrated], evidenceCount: (item.evidenceCount ?? 0) + migrated.length };
  });
  return changed ? { ...data, inspections } : data;
}

export function parseImportData(value: unknown): RenovationData | null {
  if (!hasBaseShape(value)) return null;
  if (value.version === 4 && Array.isArray(value.materialCategories) && Array.isArray(value.budgetCategories) && Array.isArray(value.budgetItems)) return value as unknown as RenovationData;
  if (value.version === 3 && Array.isArray(value.materialCategories) && Array.isArray(value.budgetCategories) && Array.isArray(value.budgetItems)) return migrateToVersion4(value);
  if (value.version === 2 && Array.isArray(value.materialCategories)) return migrateToVersion4(migrateToVersion3(value));
  if (value.version === 1) return migrateToVersion4(migrateToVersion3(value));
  return null;
}

export function loadData(): RenovationData {
  if (typeof window === "undefined") return emptyInitialData;

  try {
    const session = getLocalSession();
    // Only anonymous/local mode reads legacy global keys. Logged-in accounts
    // should never inherit another user's pre-auth browser cache.
    const raw = window.localStorage.getItem(getStorageKey())
      ?? (session ? null : LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean));
    if (!raw) return emptyInitialData;
    const parsed = parseImportData(JSON.parse(raw)) ?? emptyInitialData;
    const normalized = { ...parsed, blueprints: (parsed as unknown as Record<string, unknown>).blueprints ?? [] } as RenovationData;
    return migrateEvidenceToAttachments(normalized);
  } catch {
    return emptyInitialData;
  }
}

export function saveData(data: RenovationData): void {
  window.localStorage.setItem(getStorageKey(), JSON.stringify(data));
}

export interface RecoveryData {
  createdAt: string;
  label: string;
  data: RenovationData;
}

export function saveRecoveryData(data: RenovationData, label: string): void {
  window.localStorage.setItem(getRecoveryStorageKey(), JSON.stringify({ createdAt: new Date().toISOString(), label, data } satisfies RecoveryData));
}

export function loadRecoveryData(): RecoveryData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getRecoveryStorageKey());
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Partial<RecoveryData>;
    const data = parseImportData(candidate.data);
    if (!data || typeof candidate.createdAt !== "string" || typeof candidate.label !== "string") return null;
    return { createdAt: candidate.createdAt, label: candidate.label, data };
  } catch {
    return null;
  }
}

export function clearRecoveryData(): void {
  window.localStorage.removeItem(getRecoveryStorageKey());
}
