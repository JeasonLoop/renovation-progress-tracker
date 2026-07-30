import type { InspectionItem, Stage, Task } from "./types";

export function deriveProjectProgress(stages: Stage[], tasks: Task[], inspections: InspectionItem[] = []) {
  const sortedStages = stages.toSorted((a, b) => a.order - b.order);
  const completedStageIds = new Set(sortedStages.filter((stage) => {
    const stageTasks = tasks.filter((task) => task.stageId === stage.id);
    const stageInspections = inspections.filter((item) => item.stageId === stage.id);
    const tasksDone = stageTasks.length > 0 && stageTasks.every((task) => task.status === "done");
    const inspectionsPassed = stageInspections.length === 0 || stageInspections.every((item) => item.status === "passed");
    return tasksDone && inspectionsPassed;
  }).map((stage) => stage.id));
  const currentStage = sortedStages.find((stage) => tasks.some((task) => task.stageId === stage.id && task.status !== "done"));
  const projectStatus = tasks.length === 0 ? "not-started" : tasks.every((task) => task.status === "done") ? "completed" : "active";

  return {
    sortedStages,
    currentStage,
    projectStatus,
    completedStageCount: completedStageIds.size,
    stageStatus: (stageId: string) => completedStageIds.has(stageId) ? "completed" : currentStage?.id === stageId ? "active" : "upcoming",
  } as const;
}
