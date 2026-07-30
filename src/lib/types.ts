export type ViewId =
  | "overview"
  | "progress"
  | "inspection"
  | "budget"
  | "research"
  | "records"
  | "blueprints"
  | "export";

export type TaskStatus = "todo" | "doing" | "review" | "done";
export type CheckStatus = "unchecked" | "passed" | "failed" | "pending";

export interface Project {
  name: string;
  homeType: string;
  area: number;
  budget: number;
  spent: number;
  startDate: string;
  targetDate: string;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  status: "upcoming" | "active" | "completed";
}

export interface Task {
  id: string;
  title: string;
  stageId: string;
  space: string;
  dueDate: string;
  status: TaskStatus;
  priority: "normal" | "important";
}

export interface InspectionItem {
  id: string;
  title: string;
  stageId: string;
  space: string;
  status: CheckStatus;
  method: string;
  reference: string;
  evidenceCount: number;
  evidence?: string[];
  attachments?: Attachment[];
  /** 关联的施工任务 ID，验收通过后会自动将该任务标记为已完成 */
  taskId?: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  unit: string;
  guidance: string;
}

export interface Material {
  id: string;
  categoryId: string;
  usage: string;
  brand: string;
  model: string;
  price: number;
  warranty: string;
  leadTime: string;
  status: "researching" | "selected" | "ordered";
  note: string;
  attachments?: Attachment[];
}

export interface BudgetCategory {
  id: string;
  name: string;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  name: string;
  budgeted: number;
  committed: number;
  paid: number;
  adjustment: number;
  dueDate: string;
  vendor: string;
  note: string;
  attachments?: Attachment[];
}

export interface Issue {
  id: string;
  title: string;
  space: string;
  severity: "normal" | "important";
  status: "open" | "fixing" | "recheck" | "closed";
  dueDate: string;
  inspectionId?: string;
  attachments?: Attachment[];
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  stageId: string;
  photoCount: number;
  attachments?: Attachment[];
}

export interface Blueprint {
  id: string;
  title: string;
  category: "floorplan" | "design" | "render" | "other";
  description: string;
  attachments: Attachment[];
  uploadedAt: string;
}

export interface RenovationData {
  version: 4;
  project: Project;
  stages: Stage[];
  tasks: Task[];
  inspections: InspectionItem[];
  materialCategories: MaterialCategory[];
  materials: Material[];
  budgetCategories: BudgetCategory[];
  budgetItems: BudgetItem[];
  issues: Issue[];
  journals: JournalEntry[];
  blueprints: Blueprint[];
  updatedAt: string;
}
