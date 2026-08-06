"use client";

import { ArrowDown, ArrowUp, Check, Circle, Clock, NotePencil, Plus, SealCheck, SlidersHorizontal, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import type { RenovationData, Stage, TaskStatus } from "@/lib/types";
import { deriveProjectProgress } from "@/lib/progress";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

const statusLabels: Record<TaskStatus, string> = { todo: "待开始", doing: "进行中", review: "待验收", done: "已完成" };
const nextStatus: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "review", review: "done", done: "todo" };

export function ProgressView({ data, updateData, onAddTask, onEditTask }: { data: RenovationData; updateData: (updater: (data: RenovationData) => RenovationData) => void; onAddTask: () => void; onEditTask: (task: import("@/lib/types").Task) => void }) {
  const [stageFilter, setStageFilter] = useState("all");
  const [showStageManager, setShowStageManager] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { confirm } = useOperationDialog();
  const tasks = stageFilter === "all" ? data.tasks : data.tasks.filter((task) => task.stageId === stageFilter);
  const { completedStageCount } = deriveProjectProgress(data.stages, data.tasks, data.inspections);
  const taskIds = tasks.map((task) => task.id);
  const allTasksSelected = taskIds.length > 0 && taskIds.every((id) => selectedIds.includes(id));

  const changeStageFilter = (stageId: string) => {
    setStageFilter(stageId);
    setSelectedIds([]);
  };

  const toggleSelected = (taskId: string) => setSelectedIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  const toggleAllTasks = () => setSelectedIds(allTasksSelected ? [] : taskIds);

  const removeSelected = async () => {
    if (!selectedIds.length) return;
    const shouldDelete = await confirm({
      title: `删除 ${selectedIds.length} 个施工任务？`,
      description: <>所选任务的当前状态和计划日期也会一并删除。此操作无法撤销。</>,
      confirmLabel: "确认批量删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    const ids = new Set(selectedIds);
    updateData((current) => ({ ...current, tasks: current.tasks.filter((task) => !ids.has(task.id)) }));
    setSelectedIds([]);
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => updateData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status } : task) }));
  const removeTask = async (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const stage = data.stages.find((item) => item.id === task.stageId);
    const shouldDelete = await confirm({
      title: "删除施工任务？",
      description: <>“{task.title}”将从{stage ? `“${stage.name}”` : "施工计划"}中移除，当前状态和计划日期也会一并删除。此操作无法撤销。</>,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    updateData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== taskId) }));
    setSelectedIds((current) => current.filter((id) => id !== taskId));
  };

  return (
    <div className="content-stack">
      <section className="stage-summary">
        <div><span>已完成阶段</span><strong>{completedStageCount}<small> / {data.stages.length}</small></strong></div>
        <div><span>进行中任务</span><strong>{data.tasks.filter((task) => task.status === "doing").length}</strong></div>
        <div><span>等待验收</span><strong>{data.tasks.filter((task) => task.status === "review").length}</strong></div>
        <button className="primary-button" type="button" onClick={onAddTask}><Plus size={17} weight="bold" /> 新建任务</button>
      </section>

      <div className="filter-toolbar">
        <div className="filter-rail" role="tablist" aria-label="按阶段筛选">
          <button role="tab" aria-selected={stageFilter === "all"} className={stageFilter === "all" ? "active" : ""} onClick={() => changeStageFilter("all")}>全部任务</button>
          {data.stages.toSorted((a, b) => a.order - b.order).map((stage) => <button key={stage.id} role="tab" aria-selected={stageFilter === stage.id} className={stageFilter === stage.id ? "active" : ""} onClick={() => changeStageFilter(stage.id)}>{stage.name}</button>)}
        </div>
        <button className="secondary-button manage-stage-button" type="button" onClick={() => setShowStageManager(true)}><SlidersHorizontal size={17} /> 管理阶段</button>
      </div>

      <section className="task-board">
        <header className="section-heading"><div><h2>{stageFilter === "all" ? "全部施工任务" : data.stages.find((stage) => stage.id === stageFilter)?.name}</h2><p>点击左侧状态按钮推进任务</p></div><div className="task-board-actions"><span className="item-count">{tasks.length} 项</span>{selectedIds.length ? <button className="secondary-button danger-action" type="button" onClick={() => void removeSelected()}><Trash size={16} />删除已选（{selectedIds.length}）</button> : null}<button className="secondary-button" type="button" onClick={onAddTask}><Plus size={16} weight="bold" />新增任务</button></div></header>
        {tasks.length === 0 ? <EmptyState icon={SealCheck} title="这个阶段还没有任务" description="添加任务后，计划日期和完成状态会显示在这里。" action={<button className="secondary-button" onClick={onAddTask}>添加第一项任务</button>} /> : (
          <div className="task-table">
            <label className="task-select-all"><input type="checkbox" checked={allTasksSelected} onChange={toggleAllTasks} />全选当前任务</label>
            {tasks.map((task) => {
              const stage = data.stages.find((item) => item.id === task.stageId);
              return (
                <article className="task-table-row" key={task.id}>
                  <button className={`task-check status-${task.status}`} type="button" onClick={() => updateTaskStatus(task.id, nextStatus[task.status])} aria-label={`将任务更新为${statusLabels[nextStatus[task.status]]}`}>
                    {task.status === "done" ? <Check size={16} weight="bold" /> : task.status === "review" ? <SealCheck size={17} /> : task.status === "doing" ? <Clock size={17} /> : <Circle size={17} />}
                  </button>
                  <div className="task-main selectable-item"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`选择任务${task.title}`} /><div><strong>{task.title}</strong><span>{stage?.name} · {task.space}</span></div></div>
                  {task.priority === "important" ? <StatusTag tone="accent">重要</StatusTag> : <span />}
                  <time>{task.dueDate}</time>
                  <div className="task-row-actions">
                    <select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskStatus)} aria-label={`${task.title}状态`}>
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button type="button" onClick={() => onEditTask(task)} aria-label={`编辑任务${task.title}`} title="编辑任务"><NotePencil size={16} /></button>
                    <button type="button" onClick={() => void removeTask(task.id)} aria-label={`删除任务${task.title}`} title="删除任务"><Trash size={16} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {showStageManager ? <StageManagerModal data={data} onClose={() => setShowStageManager(false)} onSave={(stages) => { updateData((current) => ({ ...current, stages })); if (stageFilter !== "all" && !stages.some((stage) => stage.id === stageFilter)) setStageFilter("all"); setShowStageManager(false); }} /> : null}
    </div>
  );
}

function StageManagerModal({ data, onClose, onSave }: { data: RenovationData; onClose: () => void; onSave: (stages: Stage[]) => void }) {
  const [stages, setStages] = useState(() => data.stages.toSorted((a, b) => a.order - b.order));
  const [newStageName, setNewStageName] = useState("");

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addStage = () => {
    const name = newStageName.trim();
    if (!name) return;
    setStages((current) => [...current, { id: crypto.randomUUID(), name, order: current.length + 1, status: "upcoming" }]);
    setNewStageName("");
  };

  const save = () => {
    const pendingName = newStageName.trim();
    const nextStages = pendingName
      ? [...stages, { id: crypto.randomUUID(), name: pendingName, order: stages.length + 1, status: "upcoming" as const }]
      : stages;
    onSave(nextStages.map((stage, index) => ({ ...stage, name: stage.name.trim() || `未命名阶段 ${index + 1}`, order: index + 1 })));
  };

  return (
    <Modal title="管理装修阶段" onClose={onClose}>
      <div className="stage-manager">
        <p>可以重命名、添加和调整顺序。已经关联任务或验收项的阶段不能删除。</p>
        <div className="stage-editor-list">
          {stages.map((stage, index) => {
            const hasRelations = data.tasks.some((task) => task.stageId === stage.id) || data.inspections.some((item) => item.stageId === stage.id) || data.journals.some((entry) => entry.stageId === stage.id);
            return (
              <div className="stage-editor-row" key={stage.id}>
                <span className="stage-order">{index + 1}</span>
                <input aria-label={`阶段 ${index + 1} 名称`} value={stage.name} onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, name: event.target.value } : item))} />
                <button type="button" aria-label={`上移${stage.name}`} title="上移" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={17} /></button>
                <button type="button" aria-label={`下移${stage.name}`} title="下移" disabled={index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17} /></button>
                <button type="button" className="delete-stage" aria-label={`删除${stage.name}`} title={hasRelations ? "已有记录，不能删除" : "删除"} disabled={hasRelations} onClick={() => setStages((current) => current.filter((item) => item.id !== stage.id))}><Trash size={17} /></button>
              </div>
            );
          })}
        </div>
        <div className="add-stage-row"><input aria-label="新阶段名称" value={newStageName} onChange={(event) => setNewStageName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addStage(); } }} placeholder="例如：全屋定制复尺" /><button className="secondary-button" type="button" onClick={addStage} disabled={!newStageName.trim()}><Plus size={17} /> 添加阶段</button></div>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={save}>保存调整</button></div>
      </div>
    </Modal>
  );
}
