"use client";

import {
  Blueprint,
  BookOpenText,
  CalendarCheck,
  ClipboardText,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  DownloadSimple,
  FolderOpen,
  HouseLine,
  ListChecks,
  Moon,
  Plus,
  PencilSimple,
  Sun,
  Wallet,
  SignOut,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExportView } from "./views/export-view";
import { BlueprintsView } from "./views/blueprints-view";
import { BudgetView } from "./views/budget-view";
import { InspectionView } from "./views/inspection-view";
import { OverviewView } from "./views/overview-view";
import { ProgressView } from "./views/progress-view";
import { RecordsView } from "./views/records-view";
import { ResearchView } from "./views/research-view";
import { IconButton, Modal } from "./ui";
import { CloudConflictError, loadCloudSnapshot, saveCloudSnapshot, type CloudSnapshot } from "@/lib/cloud-sync";
import { loadData, saveData, saveRecoveryData } from "@/lib/storage";
import { deriveProjectProgress } from "@/lib/progress";
import { clearLocalSession } from "@/lib/local-auth";
import type { Project, RenovationData, Task, ViewId } from "@/lib/types";

const navItems = [
  { id: "overview" as const, label: "总览", icon: HouseLine },
  { id: "progress" as const, label: "进度", icon: CalendarCheck },
  { id: "inspection" as const, label: "验收", icon: ListChecks },
  { id: "budget" as const, label: "预算", icon: Wallet },
  { id: "research" as const, label: "调研", icon: BookOpenText },
  { id: "records" as const, label: "记录", icon: ClipboardText },
  { id: "blueprints" as const, label: "图纸", icon: Blueprint },
  { id: "export" as const, label: "备份导出", icon: FolderOpen },
];

const pageTitles: Record<ViewId, { title: string; subtitle: string }> = {
  overview: { title: "项目总览", subtitle: "先处理眼前最重要的事" },
  progress: { title: "施工进度", subtitle: "按阶段安排任务，计划和现场保持一致" },
  inspection: { title: "节点验收", subtitle: "逐项检查，重要结论留下证据" },
  budget: { title: "总体预算", subtitle: "从计划到付款，每一笔都有去处" },
  research: { title: "材料调研", subtitle: "把价格、参数和选择理由放在一起比较" },
  records: { title: "现场记录", subtitle: "施工日志和问题整改都能追溯" },
  blueprints: { title: "图纸资料", subtitle: "户型图、设计图和效果图集中管理" },
  export: { title: "备份与导出", subtitle: "数据属于你，随时可以带走" },
};

type SyncStatus = "loading" | "saving" | "synced" | "offline" | "conflict";

const syncPresentation = {
  loading: { label: "正在连接云端", icon: SpinnerGap },
  saving: { label: "正在同步", icon: SpinnerGap },
  synced: { label: "已同步到云端", icon: CloudCheck },
  offline: { label: "离线保存", icon: CloudSlash },
  conflict: { label: "存在同步冲突", icon: WarningCircle },
} satisfies Record<SyncStatus, { label: string; icon: typeof CloudCheck }>;

export function RenovationApp() {
  const [data, setData] = useState<RenovationData>(() => loadData());
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [manualSavePending, setManualSavePending] = useState(false);
  const [conflict, setConflict] = useState<{ cloud: CloudSnapshot; local: RenovationData } | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const cloudRevisionRef = useRef(0);
  const syncReadyRef = useRef(false);
  const conflictRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const localData = loadData();
    let cancelled = false;
    setData(localData);
    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsHydrated(true);

    void (async () => {
      try {
        const cloud = await loadCloudSnapshot();
        if (cancelled) return;
        if (cloud.data) {
          if (Date.parse(localData.updatedAt) > Date.parse(cloud.data.updatedAt)) {
            const uploaded = await saveCloudSnapshot(localData, cloud.revision);
            if (cancelled) return;
            cloudRevisionRef.current = uploaded.revision;
          } else {
            cloudRevisionRef.current = cloud.revision;
            skipNextSyncRef.current = true;
            saveData(cloud.data);
            setData(cloud.data);
          }
        } else {
          const migrated = await saveCloudSnapshot(localData, 0);
          if (cancelled) return;
          cloudRevisionRef.current = migrated.revision;
        }
        syncReadyRef.current = true;
        setSyncStatus("synced");
      } catch (error) {
        if (cancelled) return;
        syncReadyRef.current = true;
        if (error instanceof CloudConflictError) {
          conflictRef.current = true;
          setConflict({ cloud: error.snapshot, local: localData });
          setShowConflictModal(true);
          setSyncStatus("conflict");
        } else {
          setSyncStatus("offline");
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if ((data as { version: number }).version !== 4) setData(loadData());
  }, [data]);

  useEffect(() => {
    if (!isHydrated) return;
    saveData(data);
    if (!syncReadyRef.current) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (conflictRef.current) return;
    setSyncStatus("saving");
    const timer = window.setTimeout(() => {
      pendingSyncTimerRef.current = null;
      syncQueueRef.current = syncQueueRef.current.then(() => syncDocument(data));
    }, 900);
    pendingSyncTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (pendingSyncTimerRef.current === timer) pendingSyncTimerRef.current = null;
    };
  }, [data, isHydrated]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  const updateData = (updater: (current: RenovationData) => RenovationData) => {
    setData((current) => updater({ ...current, updatedAt: new Date().toISOString() }));
  };

  async function syncDocument(nextData: RenovationData, force = false) {
    if (conflictRef.current && !force) return;
    try {
      const saved = await saveCloudSnapshot(nextData, cloudRevisionRef.current, force);
      cloudRevisionRef.current = saved.revision;
      conflictRef.current = false;
      setConflict(null);
      setShowConflictModal(false);
      setSyncStatus("synced");
    } catch (error) {
      if (error instanceof CloudConflictError) {
        conflictRef.current = true;
        setConflict({ cloud: error.snapshot, local: nextData });
        setShowConflictModal(true);
        setSyncStatus("conflict");
      } else {
        setSyncStatus("offline");
      }
    }
  }

  const useCloudCopy = () => {
    if (!conflict?.cloud.data) return;
    saveRecoveryData(data, "使用云端版本前的本机数据");
    cloudRevisionRef.current = conflict.cloud.revision;
    conflictRef.current = false;
    skipNextSyncRef.current = true;
    saveData(conflict.cloud.data);
    setData(conflict.cloud.data);
    setConflict(null);
    setShowConflictModal(false);
    setSyncStatus("synced");
  };

  const overwriteCloudCopy = () => {
    if (!conflict) return;
    if (conflict.cloud.data) saveRecoveryData(conflict.cloud.data, "本机版本覆盖前的云端数据");
    cloudRevisionRef.current = conflict.cloud.revision;
    conflictRef.current = false;
    setSyncStatus("saving");
    syncQueueRef.current = syncQueueRef.current.then(() => syncDocument(data, true));
  };

  const handleSyncStatusClick = () => {
    if (syncStatus === "conflict") {
      setShowConflictModal(true);
      return;
    }
    if (syncStatus === "offline") {
      setSyncStatus("saving");
      syncQueueRef.current = syncQueueRef.current.then(() => syncDocument(data));
    }
  };

  const saveToCloudNow = () => {
    if (!syncReadyRef.current || manualSavePending) return;
    if (syncStatus === "conflict") {
      setShowConflictModal(true);
      return;
    }
    if (pendingSyncTimerRef.current !== null) {
      window.clearTimeout(pendingSyncTimerRef.current);
      pendingSyncTimerRef.current = null;
    }
    setManualSavePending(true);
    setSyncStatus("saving");
    syncQueueRef.current = syncQueueRef.current
      .then(() => syncDocument(data))
      .finally(() => setManualSavePending(false));
  };

  const completion = useMemo(() => {
    if (data.tasks.length === 0) return 0;
    return Math.round((data.tasks.filter((task) => task.status === "done").length / data.tasks.length) * 100);
  }, [data.tasks]);
  const projectProgress = useMemo(() => deriveProjectProgress(data.stages, data.tasks), [data.stages, data.tasks]);

  const page = pageTitles[activeView];
  const SyncIcon = syncPresentation[syncStatus].icon;
  const currentStageName = projectProgress.projectStatus === "completed" ? "全部完成" : projectProgress.currentStage?.name ?? "尚未开始";
  const logout = async () => {
    clearLocalSession();
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch { /* 本地无 Worker */ }
    window.location.replace("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><HouseLine size={21} weight="fill" /></span>
          <div><strong>筑记</strong><span>装修现场助手</span></div>
        </div>

        <button className="project-switcher" type="button" onClick={() => setShowProjectModal(true)} aria-label="编辑房屋信息">
          <span className="project-avatar">{data.project.name.trim().slice(0, 1) || "家"}</span>
          <span><strong>{data.project.name}</strong><small>{data.project.area} m² · {data.project.homeType}</small></span>
          <PencilSimple size={16} />
        </button>

        <nav className="primary-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={activeView === item.id ? "nav-item active" : "nav-item"} onClick={() => setActiveView(item.id)}>
                <Icon size={20} weight={activeView === item.id ? "fill" : "regular"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-progress">
          <div><span>整体进度</span><strong>{completion}%</strong></div>
          <div className="thin-progress" aria-label={`整体进度 ${completion}%`}><i style={{ width: `${completion}%` }} /></div>
          <small>当前阶段：{currentStageName}</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
            <button className="mobile-project-edit" type="button" onClick={() => setShowProjectModal(true)} aria-label="编辑房屋信息" title="编辑房屋信息"><HouseLine size={18} /></button>
          </div>
          <div className="topbar-actions">
            <button className={`save-state sync-state sync-${syncStatus}`} type="button" onClick={handleSyncStatusClick} disabled={syncStatus !== "offline" && syncStatus !== "conflict"} title={syncPresentation[syncStatus].label}>
              <SyncIcon size={16} weight="fill" /><span>{syncPresentation[syncStatus].label}</span>
            </button>
            <IconButton label="立即保存到云端" icon={CloudArrowUp} onClick={saveToCloudNow} disabled={syncStatus === "loading" || manualSavePending} />
            <IconButton label={isDark ? "切换浅色模式" : "切换深色模式"} icon={isDark ? Sun : Moon} onClick={() => setIsDark((value) => !value)} />
            <IconButton label="打开备份导出" icon={DownloadSimple} onClick={() => setActiveView("export")} />
            <IconButton label="退出登录" icon={SignOut} onClick={() => void logout()} />
            {activeView === "overview" || activeView === "progress" ? <button className="primary-button desktop-action" type="button" onClick={() => { setEditingTask(null); setShowTaskModal(true); }}><Plus size={18} weight="bold" /> 新建任务</button> : null}
          </div>
        </header>

        <div className="view-container">
          {activeView === "overview" ? <OverviewView data={data} completion={completion} onNavigate={setActiveView} onAddTask={() => { setEditingTask(null); setShowTaskModal(true); }} /> : null}
          {activeView === "progress" ? <ProgressView data={data} updateData={updateData} onAddTask={() => { setEditingTask(null); setShowTaskModal(true); }} onEditTask={(task) => { setEditingTask(task); setShowTaskModal(true); }} /> : null}
          {activeView === "inspection" ? <InspectionView data={data} updateData={updateData} /> : null}
          {activeView === "budget" ? <BudgetView data={data} updateData={updateData} /> : null}
          {activeView === "research" ? <ResearchView data={data} updateData={updateData} /> : null}
          {activeView === "records" ? <RecordsView data={data} updateData={updateData} /> : null}
          {activeView === "blueprints" ? <BlueprintsView data={data} updateData={updateData} /> : null}
          {activeView === "export" ? <ExportView data={data} replaceData={setData} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
              <Icon size={21} weight={activeView === item.id ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {showTaskModal ? <TaskModal data={data} task={editingTask} onClose={() => { setShowTaskModal(false); setEditingTask(null); }} onSave={(task) => { updateData((current) => ({ ...current, tasks: editingTask ? current.tasks.map((t) => t.id === task.id ? task : t) : [task, ...current.tasks] })); setShowTaskModal(false); setEditingTask(null); }} /> : null}
      {showProjectModal ? <ProjectModal project={data.project} onClose={() => setShowProjectModal(false)} onSave={(project) => { updateData((current) => ({ ...current, project })); setShowProjectModal(false); }} /> : null}
      {conflict && showConflictModal ? <Modal title="发现其他设备的更新" onClose={() => setShowConflictModal(false)}>
        <div className="conflict-dialog">
          <p>云端版本与这台设备上的修改不一致。请选择要保留的版本，系统不会自动覆盖。</p>
          <div className="conflict-comparison">
            <div><span>云端版本</span><strong>{conflict.cloud.data?.project.name ?? "云端项目"}</strong><small>{conflict.cloud.updatedAt ? new Date(conflict.cloud.updatedAt).toLocaleString("zh-CN") : "更新时间未知"}</small></div>
            <div><span>本机版本</span><strong>{data.project.name}</strong><small>{new Date(data.updatedAt).toLocaleString("zh-CN")}</small></div>
          </div>
          <div className="form-actions"><button className="secondary-button" type="button" onClick={useCloudCopy}>使用云端版本</button><button className="primary-button" type="button" onClick={overwriteCloudCopy}>用本机版本覆盖</button></div>
        </div>
      </Modal> : null}
    </div>
  );
}

function ProjectModal({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (project: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [homeType, setHomeType] = useState(project.homeType);
  const [area, setArea] = useState(String(project.area));
  const [startDate, setStartDate] = useState(project.startDate.slice(0, 10));
  const [targetDate, setTargetDate] = useState(project.targetDate.slice(0, 10));

  return (
    <Modal title="编辑房屋信息" onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault();
        const cleanName = name.trim();
        const cleanHomeType = homeType.trim();
        const numericArea = Number(area);
        if (!cleanName || !cleanHomeType || !Number.isFinite(numericArea) || numericArea <= 0 || numericArea > 10000) return;
        if (!startDate || !targetDate) return;
        onSave({ ...project, name: cleanName, homeType: cleanHomeType, area: numericArea, startDate, targetDate });
      }}>
        <label className="field field-full"><span>房屋 / 项目名称</span><input autoFocus required minLength={1} maxLength={30} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：云栖小家" /></label>
        <label className="field"><span>建筑面积（m²）</span><input required type="number" min="1" max="10000" step="0.1" value={area} onChange={(event) => setArea(event.target.value)} /></label>
        <label className="field"><span>户型</span><input required minLength={1} maxLength={30} value={homeType} onChange={(event) => setHomeType(event.target.value)} placeholder="例如：三室两厅" /></label>
        <label className="field"><span>开工日期</span><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="field"><span>计划完工日期</span><input type="date" required value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
        <p className="project-form-note field-full">修改后会同步显示在侧栏，并自动写入当前浏览器和完整备份。</p>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存房屋信息</button></div>
      </form>
    </Modal>
  );
}

function TaskModal({ data, task, onClose, onSave }: { data: RenovationData; task?: Task | null; onClose: () => void; onSave: (task: Task) => void }) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [stageId, setStageId] = useState(task?.stageId ?? data.stages.find((stage) => stage.status === "active")?.id ?? data.stages[0]?.id ?? "");
  const [space, setSpace] = useState(task?.space ?? "全屋");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? (() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)));
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "normal");

  return (
    <Modal title={isEdit ? "编辑施工任务" : "新建装修任务"} onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: task?.id ?? crypto.randomUUID(), title: title.trim(), stageId, space, dueDate, status: task?.status ?? "todo", priority }); }}>
        <label className="field field-full"><span>任务名称</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：拍摄封槽前管线照片" required /></label>
        <fieldset className="field field-full stage-choice-field"><legend>所属阶段</legend><div className="stage-choice-grid">{data.stages.toSorted((a, b) => a.order - b.order).map((stage) => <button key={stage.id} type="button" aria-pressed={stageId === stage.id} className={stageId === stage.id ? "active" : ""} onClick={() => setStageId(stage.id)}>{stage.name}</button>)}</div></fieldset>
        <label className="field"><span>空间</span><input value={space} onChange={(event) => setSpace(event.target.value)} /></label>
        <label className="field"><span>计划完成日期</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        <label className="field field-full"><span>优先级</span><div className="stage-choice-grid"><button type="button" aria-pressed={priority === "normal"} className={priority === "normal" ? "active" : ""} onClick={() => setPriority("normal")}>普通</button><button type="button" aria-pressed={priority === "important"} className={priority === "important" ? "active" : ""} onClick={() => setPriority("important")}>重要</button></div></label>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">{isEdit ? "更新任务" : "保存任务"}</button></div>
      </form>
    </Modal>
  );
}
