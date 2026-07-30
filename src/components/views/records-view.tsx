"use client";

import { Camera, ClipboardText, NotePencil, Plus, Trash, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import type { Attachment, JournalEntry, RenovationData } from "@/lib/types";
import { deleteStoredAttachments, ImageAttachments } from "../image-attachments";
import { PreviewableImageList } from "../image-lightbox";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

export function RecordsView({ data, updateData }: { data: RenovationData; updateData: (updater: (data: RenovationData) => RenovationData) => void }) {
  const [tab, setTab] = useState<"journal" | "issues">("journal");
  const [showModal, setShowModal] = useState(false);
  const [editingJournal, setEditingJournal] = useState<JournalEntry | undefined>(undefined);
  const { confirm } = useOperationDialog();
  const closeIssue = (id: string) => updateData((current) => ({ ...current, issues: current.issues.map((issue) => issue.id === id ? { ...issue, status: issue.status === "closed" ? "open" : "closed" } : issue) }));
  const setIssueStatus = (id: string, status: import("@/lib/types").Issue["status"]) => updateData((current) => ({ ...current, issues: current.issues.map((issue) => issue.id === id ? { ...issue, status } : issue) }));
  const saveJournal = (entry: JournalEntry) => {
    updateData((current) => {
      const exists = current.journals.some((item) => item.id === entry.id);
      return { ...current, journals: exists ? current.journals.map((item) => item.id === entry.id ? entry : item) : [entry, ...current.journals] };
    });
    setShowModal(false);
    setEditingJournal(undefined);
  };
  const openEditJournal = (entry: JournalEntry) => { setEditingJournal(entry); setShowModal(true); };
  const setIssueAttachments = (id: string, attachments: Attachment[]) => updateData((current) => ({ ...current, issues: current.issues.map((issue) => issue.id === id ? { ...issue, attachments } : issue) }));
  const removeJournal = async (entry: JournalEntry) => {
    const shouldDelete = await confirm({ title: "删除施工日志？", description: <>“{entry.title}”及其现场照片将被删除。此操作无法撤销。</>, confirmLabel: "确认删除", tone: "danger" });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(entry.attachments);
      updateData((current) => ({ ...current, journals: current.journals.filter((item) => item.id !== entry.id) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，施工日志未删除");
    }
  };
  const removeIssue = async (issueId: string, title: string) => {
    const shouldDelete = await confirm({ title: "删除整改问题？", description: <>“{title}”及其处理状态和照片将被删除。此操作无法撤销。</>, confirmLabel: "确认删除", tone: "danger" });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(data.issues.find((item) => item.id === issueId)?.attachments);
      updateData((current) => ({ ...current, issues: current.issues.filter((item) => item.id !== issueId) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，整改问题未删除");
    }
  };

  return (
    <div className="content-stack">
      <div className="records-toolbar">
        <div className="segmented-control"><button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>施工日志</button><button className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}>整改问题 <span>{data.issues.filter((item) => item.status !== "closed").length}</span></button></div>
        {tab === "journal" ? <button className="primary-button" type="button" onClick={() => { setEditingJournal(undefined); setShowModal(true); }}><Plus size={17} weight="bold" /> 写日志</button> : null}
      </div>
      {tab === "journal" ? (data.journals.length ? <section className="journal-timeline">{data.journals.map((entry) => <article key={entry.id}><time>{entry.date}</time><div className="timeline-line"><i /></div><div className="journal-body"><header><div><h2>{entry.title}</h2><span>{data.stages.find((stage) => stage.id === entry.stageId)?.name ?? "装修阶段"}</span></div><div className="record-header-actions"><span><Camera size={16} /> {entry.attachments?.length ?? 0}</span><button className="inline-delete-button" type="button" onClick={() => openEditJournal(entry)} aria-label={`编辑日志${entry.title}`} title="编辑日志"><NotePencil size={16} /></button><button className="inline-delete-button" type="button" onClick={() => void removeJournal(entry)} aria-label={`删除日志${entry.title}`} title="删除日志"><Trash size={16} /></button></div></header><p>{entry.summary}</p>{entry.attachments?.length ? <PreviewableImageList className="record-photo-strip" images={entry.attachments.map((attachment) => ({ src: attachment.url, alt: attachment.name || entry.title }))} /> : null}</div></article>)}</section> : <section className="records-empty"><EmptyState icon={ClipboardText} title="还没有施工日志" description="记录每天的施工进展、现场情况和照片。" action={<button className="primary-button" type="button" onClick={() => { setEditingJournal(undefined); setShowModal(true); }}><Plus size={17} />写第一篇日志</button>} /></section>) : (data.issues.length ? <section className="issue-list">{data.issues.map((issue) => <article key={issue.id}><span className={issue.severity === "important" ? "issue-icon important" : "issue-icon"}><Warning size={19} weight={issue.severity === "important" ? "fill" : "regular"} /></span><div><header><h2>{issue.title}</h2><StatusTag tone={issue.status === "closed" ? "success" : issue.severity === "important" ? "danger" : "neutral"}>{issue.status === "fixing" ? "整改中" : issue.status === "recheck" ? "待复验" : issue.status === "closed" ? "已关闭" : "待处理"}</StatusTag></header><p>{issue.space} · 要求在 {issue.dueDate} 前处理</p></div><div className="issue-actions"><select value={issue.status} onChange={(event) => setIssueStatus(issue.id, event.target.value as import("@/lib/types").Issue["status"])} aria-label={`${issue.title}状态`}><option value="open">待处理</option><option value="fixing">整改中</option><option value="recheck">待复验</option><option value="closed">已关闭</option></select><button className="inline-delete-button" type="button" onClick={() => void removeIssue(issue.id, issue.title)} aria-label={`删除整改问题${issue.title}`} title="删除整改问题"><Trash size={16} /></button></div><div className="issue-attachment-editor"><ImageAttachments compact value={issue.attachments ?? []} onChange={(attachments) => setIssueAttachments(issue.id, attachments)} label="整改前后照片" max={6} /></div></article>)}</section> : <section className="records-empty"><EmptyState icon={Warning} title="还没有整改问题" description="验收中发现的不合格项会集中显示在这里。" /></section>)}
      {showModal ? <JournalModal data={data} entry={editingJournal} onClose={() => { setShowModal(false); setEditingJournal(undefined); }} onAdd={saveJournal} /> : null}
    </div>
  );
}

function JournalModal({ data, onClose, onAdd, entry }: { data: RenovationData; onClose: () => void; onAdd: (entry: JournalEntry) => void; entry?: JournalEntry }) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [summary, setSummary] = useState(entry?.summary ?? "");
  const [stageId, setStageId] = useState(entry?.stageId ?? data.stages[0]?.id ?? "");
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [attachments, setAttachments] = useState<Attachment[]>(entry?.attachments ?? []);
  const isEdit = !!entry;
  return <Modal title={isEdit ? "编辑施工日志" : "记录今天的现场情况"} onClose={onClose}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !summary.trim() || !stageId || !date) return; onAdd({ id: entry?.id ?? crypto.randomUUID(), date, title: title.trim(), summary: summary.trim(), stageId, photoCount: attachments.length, attachments }); }}><label className="field"><span>日期</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>所属阶段</span><select required value={stageId} onChange={(event) => setStageId(event.target.value)}>{data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label className="field field-full"><span>日志标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：水电打压验收" required /></label><label className="field field-full"><span>现场记录</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="今天完成了什么，发现了什么，下一步要做什么" rows={6} required /></label><div className="field-full"><ImageAttachments value={attachments} onChange={setAttachments} label="现场照片" max={9} /></div><div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!data.stages.length}><ClipboardText size={17} /> {isEdit ? "更新日志" : "保存日志"}</button></div></form></Modal>;
}
