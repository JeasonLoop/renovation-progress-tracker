"use client";

import Image from "next/image";
import { ArrowRight, CheckCircle, Clock, CurrencyCny, Plus, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { RenovationData, ViewId } from "@/lib/types";
import { deriveProjectProgress } from "@/lib/progress";
import { StatusTag } from "../ui";

const DEFAULT_HERO_IMAGE = "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=82";

function findLatestJournalPhoto(data: RenovationData): string | null {
  const sorted = [...data.journals].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of sorted) {
    if (entry.attachments?.length) return entry.attachments[0].url;
  }
  return null;
}

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

export function OverviewView({ data, completion, onNavigate, onAddTask }: { data: RenovationData; completion: number; onNavigate: (view: ViewId) => void; onAddTask: () => void }) {
  const [daysUntilTarget, setDaysUntilTarget] = useState<number | null>(null);
  const { sortedStages, currentStage, projectStatus, stageStatus } = deriveProjectProgress(data.stages, data.tasks, data.inspections);
  const pendingTasks = data.tasks.filter((task) => task.status !== "done").slice(0, 4);
  const openIssues = data.issues.filter((issue) => issue.status !== "closed");
  const failedChecks = data.inspections.filter((item) => item.status === "failed");
  const uncoveredFailedChecks = failedChecks.filter((check) => !openIssues.some((issue) => issue.inspectionId === check.id || issue.title.includes(check.title)));
  const paid = data.budgetItems.reduce((sum, item) => sum + item.paid, 0);
  const heroImage = useMemo(() => findLatestJournalPhoto(data) ?? DEFAULT_HERO_IMAGE, [data.journals]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${data.project.targetDate}T00:00:00`);
    setDaysUntilTarget(Number.isNaN(target.getTime()) ? null : Math.ceil((target.getTime() - today.getTime()) / 86400000));
  }, [data.project.targetDate]);

  return (
    <div className="overview-layout">
      <section className="project-brief">
        <div className="project-brief-content">
          <div>
            <p className="section-label">当前施工阶段</p>
            <h2>{projectStatus === "completed" ? "施工任务已全部完成" : currentStage?.name ?? "尚未开始"}</h2>
            <p>{projectStatus === "completed" ? "所有施工任务均已完成，可以进行最终验收和归档。" : pendingTasks.length ? `还有 ${data.tasks.filter((task) => task.status !== "done").length} 项施工任务待推进。` : "当前没有待处理的施工任务。"}</p>
          </div>
          <div className="project-brief-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("inspection")}>开始验收 <ArrowRight size={17} weight="bold" /></button>
            <button className="secondary-button" type="button" onClick={onAddTask}><Plus size={17} weight="bold" /> 添加任务</button>
          </div>
        </div>
        <div className="project-photo">
          <Image src={heroImage} alt="施工现场照片" fill sizes="(max-width: 768px) 100vw, 460px" priority />
        </div>
      </section>

      <section className="metrics-strip" aria-label="项目关键数据">
        <div className="metric-primary">
          <div className="progress-dial" style={{ "--progress": `${completion * 3.6}deg` } as CSSProperties}><strong>{completion}%</strong><span>整体进度</span></div>
        </div>
        <div className="metric"><span><Clock size={18} />{daysUntilTarget !== null && daysUntilTarget < 0 ? "已超过计划" : "距计划完工"}</span><strong>{daysUntilTarget === null ? "--" : Math.abs(daysUntilTarget)}<small> 天</small></strong><p>目标 {data.project.targetDate}</p></div>
        <button className="metric metric-button" type="button" onClick={() => onNavigate("budget")}><span><CurrencyCny size={18} />已支付</span><strong>{currency.format(paid)}</strong><p>预算使用 {data.project.budget ? Math.round(paid / data.project.budget * 100) : 0}% · 查看清单</p></button>
        <div className="metric"><span><Warning size={18} />待处理风险</span><strong>{openIssues.length + uncoveredFailedChecks.length}<small> 项</small></strong><p>{failedChecks.length} 项验收未通过</p></div>
      </section>

      <div className="dashboard-columns">
        <section className="work-section">
          <header className="section-heading"><div><h2>接下来要做</h2><p>按时间和风险排好顺序</p></div><button className="text-button" type="button" onClick={() => onNavigate("progress")}>查看全部 <ArrowRight size={15} /></button></header>
          <div className="task-list">
            {pendingTasks.map((task) => (
              <div className="task-row" key={task.id}>
                <span className={`task-state state-${task.status}`}>{task.status === "review" ? <CheckCircle size={18} /> : <Clock size={18} />}</span>
                <div><strong>{task.title}</strong><span>{task.space} · {data.stages.find((stage) => stage.id === task.stageId)?.name}</span></div>
                <time dateTime={task.dueDate}>{task.dueDate.slice(5).replace("-", "/")}</time>
              </div>
            ))}
          </div>
        </section>

        <aside className="risk-panel">
          <header><Warning size={21} weight="fill" /><div><h2>需要盯紧</h2><p>今天建议优先确认</p></div></header>
          {openIssues.slice(0, 2).map((issue) => <button key={issue.id} type="button" onClick={() => onNavigate(issue.inspectionId ? "inspection" : "records")}><span><strong>{issue.title}</strong><small>{issue.space} · 截止 {issue.dueDate.slice(5).replace("-", "/")}</small></span><ArrowRight size={16} /></button>)}
          {uncoveredFailedChecks.slice(0, Math.max(2 - openIssues.length, 0)).map((check) => <button key={check.id} type="button" onClick={() => onNavigate("inspection")}><span><strong>{check.title}</strong><small>{check.space} · 验收未通过</small></span><ArrowRight size={16} /></button>)}
          {!openIssues.length && !uncoveredFailedChecks.length ? <div className="risk-empty">当前没有待处理风险</div> : null}
        </aside>
      </div>

      <section className="stage-rail">
        <header className="section-heading"><div><h2>装修阶段</h2><p>{projectStatus === "completed" ? "全部施工任务已完成" : currentStage ? `当前处于第 ${currentStage.order} 个阶段` : "项目尚未开始"}</p></div><StatusTag tone={projectStatus === "completed" ? "success" : "accent"}>{projectStatus === "completed" ? "已完成" : currentStage ? `${currentStage.name}进行中` : "待开始"}</StatusTag></header>
        <div className="stage-track">
          {sortedStages.map((stage) => { const status = stageStatus(stage.id); return <div key={stage.id} className={`stage-node ${status}`}><i>{status === "completed" ? <CheckCircle size={18} weight="fill" /> : stage.order}</i><strong>{stage.name}</strong></div>; })}
        </div>
      </section>
    </div>
  );
}
