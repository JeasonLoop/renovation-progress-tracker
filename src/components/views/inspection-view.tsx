"use client";

import { ArrowRight, CalendarCheck, Camera, Check, Circle, ListChecks, Plus, Question, Trash, Warning, Wrench } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { Attachment, CheckStatus, InspectionItem, RenovationData } from "@/lib/types";
import { deleteStoredAttachments, deleteStoredUrls, ImageAttachments } from "../image-attachments";
import { PreviewableImageList } from "../image-lightbox";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

const checks: { value: CheckStatus; label: string; icon: typeof Circle }[] = [
  { value: "unchecked", label: "未检查", icon: Circle },
  { value: "passed", label: "合格", icon: Check },
  { value: "failed", label: "不合格", icon: Warning },
  { value: "pending", label: "待确认", icon: Question },
];

export function InspectionView({ data, updateData }: { data: RenovationData; updateData: (updater: (data: RenovationData) => RenovationData) => void }) {
  const [selectedId, setSelectedId] = useState(data.inspections[0]?.id ?? "");
  const [showAddModal, setShowAddModal] = useState(false);
  const { confirm } = useOperationDialog();
  const selected = data.inspections.find((item) => item.id === selectedId);
  const inspectionStageIds = new Set(data.inspections.map((item) => item.stageId));
  const inspectionStage = inspectionStageIds.size === 1 ? data.stages.find((stage) => inspectionStageIds.has(stage.id)) : undefined;
  const passedCount = data.inspections.filter((item) => item.status === "passed").length;
  const summary = data.inspections.length === 0
    ? { label: "暂无验收项", tone: "neutral" as const }
    : data.inspections.some((item) => item.status === "failed")
    ? { label: "有不合格项", tone: "danger" as const }
    : data.inspections.length > 0 && passedCount === data.inspections.length
      ? { label: "验收完成", tone: "success" as const }
      : data.inspections.some((item) => item.status === "pending")
        ? { label: "待确认", tone: "neutral" as const }
        : { label: "待验收", tone: "accent" as const };

  useEffect(() => {
    if (!data.inspections.some((item) => item.id === selectedId)) setSelectedId(data.inspections[0]?.id ?? "");
  }, [data.inspections, selectedId]);
  const evidenceCount = (item: RenovationData["inspections"][number]) => (item.evidence?.length ?? 0) + (item.attachments?.length ?? 0);
  const setStatus = (status: CheckStatus) => updateData((current) => {
    const updated = { ...current, inspections: current.inspections.map((item) => item.id === selectedId ? { ...item, status } : item) };
    // 验收通过时自动将关联任务标记为已完成
    if (status === "passed" && selected?.taskId) {
      updated.tasks = updated.tasks.map((task) => task.id === selected.taskId ? { ...task, status: "done" as const } : task);
    }
    return updated;
  });
  const linkedTask = useMemo(() => selected?.taskId ? data.tasks.find((task) => task.id === selected.taskId) : undefined, [selected?.taskId, data.tasks]);
  const issueExists = data.issues.some((issue) => (issue.inspectionId === selected?.id || issue.title.includes(selected?.title ?? "__missing__")) && issue.status !== "closed");
  const setAttachments = (attachments: Attachment[]) => updateData((current) => ({ ...current, inspections: current.inspections.map((item) => {
    if (item.id !== selectedId) return item;
    return { ...item, attachments, evidenceCount: (item.evidence?.length ?? 0) + attachments.length };
  }) }));
  const createIssue = () => {
    if (!selected || issueExists) return;
    updateData((current) => ({ ...current, issues: [{ id: crypto.randomUUID(), inspectionId: selected.id, title: `验收不合格：${selected.title}`, space: selected.space, severity: "important", status: "open", dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }, ...current.issues] }));
  };
  const removeInspection = async () => {
    if (!selected) return;
    const shouldDelete = await confirm({ title: "删除验收项？", description: <>“{selected.title}”及其检查结果和照片将被删除。此操作无法撤销。</>, confirmLabel: "确认删除", tone: "danger" });
    if (!shouldDelete) return;
    try {
      await Promise.all([deleteStoredAttachments(selected.attachments), deleteStoredUrls(selected.evidence ?? [])]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，验收项未删除");
      return;
    }
    const nextSelectedId = data.inspections.find((item) => item.id !== selected.id)?.id ?? "";
    updateData((current) => ({ ...current, inspections: current.inspections.filter((item) => item.id !== selected.id) }));
    setSelectedId(nextSelectedId);
  };

  return (
    <div className="inspection-layout">
      <section className="inspection-list-panel">
        <header><div><h2>{inspectionStage ? `${inspectionStage.name}验收清单` : "阶段验收清单"}</h2><p>{passedCount} 项合格，共 {data.inspections.length} 项</p></div><StatusTag tone={summary.tone}>{summary.label}</StatusTag></header>
        <div className="inspection-list">
          {data.inspections.map((item) => {
            const Icon = checks.find((check) => check.value === item.status)?.icon ?? Circle;
            return <button key={item.id} type="button" className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><span className={`check-icon check-${item.status}`}><Icon size={17} weight={item.status === "passed" ? "bold" : "regular"} /></span><span><strong>{item.title}</strong><small>{item.space} · {evidenceCount(item)} 张照片</small></span></button>;
          })}
        </div>
        <button className="secondary-button inspection-add-button" type="button" onClick={() => setShowAddModal(true)}><Plus size={16} />新增验收项</button>
      </section>

      {selected ? <section className="inspection-detail">
        <header><div><span>{selected.space}</span><h2>{selected.title}</h2></div><div className="inspection-detail-actions"><StatusTag tone={selected.status === "failed" ? "danger" : selected.status === "passed" ? "success" : "neutral"}>{checks.find((check) => check.value === selected.status)?.label}</StatusTag><button className="inline-delete-button" type="button" onClick={() => void removeInspection()} aria-label={`删除验收项${selected.title}`} title="删除验收项"><Trash size={16} /></button></div></header>
        {linkedTask ? <div className="inspection-linked-task"><CalendarCheck size={20} /><span><strong>关联施工任务</strong><span className={`task-state-badge state-${linkedTask.status}`}>{linkedTask.title}</span></span><small>{linkedTask.status === "review" ? "验收通过后将自动标记任务为已完成" : linkedTask.status === "done" ? "任务已完成" : "任务尚未进入待验收状态"}</small></div> : null}
        <div className="inspection-guide">
          <div><Wrench size={20} /><span><strong>怎么检查</strong><p>{selected.method}</p></span></div>
          <div><Check size={20} /><span><strong>判断参考</strong><p>{selected.reference}</p></span></div>
        </div>
        <div className="evidence-area"><div><Camera size={24} /><strong>{evidenceCount(selected) > 0 ? `已保存 ${evidenceCount(selected)} 张现场照片` : "还没有现场照片"}</strong><p>建议包含整体位置、关键细节和测量读数。</p>{selected.evidence?.length ? <PreviewableImageList className="evidence-thumbnails" images={selected.evidence.map((src, index) => ({ src, alt: `旧版验收照片 ${index + 1}` }))} /> : null}</div><ImageAttachments value={selected.attachments ?? []} onChange={setAttachments} label="验收证据" max={8} /></div>
        <footer className="inspection-result"><span>检查结果</span><div>{checks.map((check) => { const Icon = check.icon; return <button key={check.value} type="button" className={selected.status === check.value ? `active result-${check.value}` : ""} onClick={() => setStatus(check.value)}><Icon size={17} />{check.label}</button>; })}</div></footer>
        {selected.status === "failed" ? <button className={issueExists ? "selected-button danger-action" : "danger-action"} type="button" onClick={createIssue} disabled={issueExists}><Warning size={18} /> {issueExists ? "已创建整改问题" : "创建整改问题"}</button> : null}
      </section> : <section className="inspection-detail inspection-empty"><EmptyState icon={ListChecks} title="还没有验收项" description="添加需要现场核对的项目，并记录检查结果和照片。" action={<button className="primary-button" type="button" onClick={() => setShowAddModal(true)}><Plus size={17} />添加验收项</button>} /></section>}
      {showAddModal ? <InspectionModal data={data} onClose={() => setShowAddModal(false)} onAdd={(item) => { updateData((current) => ({ ...current, inspections: [...current.inspections, item] })); setSelectedId(item.id); setShowAddModal(false); }} /> : null}
    </div>
  );
}

function InspectionModal({ data, onClose, onAdd }: { data: RenovationData; onClose: () => void; onAdd: (item: InspectionItem) => void }) {
  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState(data.stages[0]?.id ?? "");
  const [space, setSpace] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [taskId, setTaskId] = useState("");

  const reviewTasks = useMemo(() => data.tasks.filter((task) => task.stageId === stageId && task.status === "review"), [data.tasks, stageId]);

  return <Modal title="新增验收项" onClose={onClose}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !stageId || !space.trim()) return; onAdd({ id: crypto.randomUUID(), title: title.trim(), stageId, space: space.trim(), status: "unchecked", method: method.trim() || "按施工方案和现场情况逐项核对。", reference: reference.trim() || "符合合同、图纸和产品说明要求。", evidenceCount: 0, attachments: [], taskId: taskId || undefined }); }}><label className="field field-full"><span>验收项目</span><input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：防水闭水试验" /></label><label className="field"><span>所属阶段</span><select required value={stageId} onChange={(event) => { setStageId(event.target.value); setTaskId(""); }}>{data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label className="field"><span>检查位置</span><input required value={space} onChange={(event) => setSpace(event.target.value)} placeholder="例如：主卫" /></label>{reviewTasks.length > 0 ? <label className="field field-full"><span>关联施工任务（可选）</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">不关联</option>{reviewTasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.space}</option>)}</select><small>选择待验收的任务后，验收通过将自动标记任务为已完成。</small></label> : null}<label className="field field-full"><span>检查方法</span><textarea rows={3} value={method} onChange={(event) => setMethod(event.target.value)} /></label><label className="field field-full"><span>判断参考</span><textarea rows={3} value={reference} onChange={(event) => setReference(event.target.value)} /></label><div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!data.stages.length}>保存验收项</button></div></form></Modal>;
}
