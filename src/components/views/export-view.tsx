"use client";

import { ArrowCounterClockwise, Database, FileCode, FileCsv, Printer, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { clearRecoveryData, loadRecoveryData, parseImportData, saveRecoveryData } from "@/lib/storage";
import type { Attachment, RenovationData } from "@/lib/types";
import { useOperationDialog } from "../operation-dialog";
import { StatusTag } from "../ui";

function downloadFile(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function portableUrl(value: string): string {
  return value.startsWith("/api/uploads/") ? new URL(value, window.location.origin).toString() : value;
}

function portableAttachments(attachments: Attachment[] | undefined): Attachment[] | undefined {
  return attachments?.map((attachment) => ({ ...attachment, url: portableUrl(attachment.url) }));
}

function createPortableBackup(data: RenovationData): RenovationData {
  return {
    ...data,
    inspections: data.inspections.map((item) => ({ ...item, attachments: portableAttachments(item.attachments), evidence: item.evidence?.map(portableUrl) })),
    materials: data.materials.map((item) => ({ ...item, attachments: portableAttachments(item.attachments) })),
    budgetItems: data.budgetItems.map((item) => ({ ...item, attachments: portableAttachments(item.attachments) })),
    issues: data.issues.map((item) => ({ ...item, attachments: portableAttachments(item.attachments) })),
    journals: data.journals.map((item) => ({ ...item, attachments: portableAttachments(item.attachments) })),
    blueprints: data.blueprints.map((item) => ({ ...item, attachments: portableAttachments(item.attachments) ?? [] })),
  };
}

export function ExportView({ data, replaceData }: { data: RenovationData; replaceData: (data: RenovationData) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(() => loadRecoveryData());
  const { confirm } = useOperationDialog();
  const stamp = new Date().toISOString().slice(0, 10);

  useEffect(() => setRecovery(loadRecoveryData()), []);

  const exportJson = () => {
    downloadFile(`装修项目备份-${stamp}.json`, "application/json", JSON.stringify(createPortableBackup(data), null, 2));
    setMessage("完整备份已生成，请查看浏览器下载记录。");
  };
  const exportCsv = () => {
    const header = ["任务", "阶段", "空间", "计划日期", "状态"];
    const rows = data.tasks.map((task) => [task.title, data.stages.find((stage) => stage.id === task.stageId)?.name ?? "", task.space, task.dueDate, task.status]);
    downloadFile(`装修任务-${stamp}.csv`, "text/csv;charset=utf-8", `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`);
    setMessage("任务表格已生成，请查看浏览器下载记录。");
  };
  const exportBudgetCsv = () => {
    const header = ["分类", "项目", "原预算", "预算调整", "调整后预算", "合同/订单", "已支付", "待支付", "付款日期", "供应商", "备注"];
    const rows = data.budgetItems.map((item) => [
      data.budgetCategories.find((category) => category.id === item.categoryId)?.name ?? "未分类",
      item.name,
      item.budgeted,
      item.adjustment,
      item.budgeted + item.adjustment,
      item.committed,
      item.paid,
      Math.max(item.committed - item.paid, 0),
      item.dueDate,
      item.vendor,
      item.note,
    ]);
    const adjustedBudget = data.budgetItems.reduce((sum, item) => sum + item.budgeted + item.adjustment, 0);
    const committed = data.budgetItems.reduce((sum, item) => sum + item.committed, 0);
    const paid = data.budgetItems.reduce((sum, item) => sum + item.paid, 0);
    const summaryRows = [["项目总预算", data.project.budget], ["清单调整后预算", adjustedBudget], ["已签约", committed], ["已支付", paid]];
    const content = [...summaryRows.map((row) => row.map(csvCell).join(",")), "", ...[header, ...rows].map((row) => row.map(csvCell).join(","))].join("\n");
    downloadFile(`装修预算-${stamp}.csv`, "text/csv;charset=utf-8", `\uFEFF${content}`);
    setMessage("预算清单已生成，请查看浏览器下载记录。");
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const importedData = parseImportData(parsed);
      if (!importedData) throw new Error("invalid");
      const shouldImport = await confirm({ title: "导入并替换当前项目？", description: <>导入“{importedData.project.name}”后，当前浏览器中的项目内容会被替换，并重新同步到云端。系统会先保留一个恢复点。</>, confirmLabel: "确认导入", tone: "danger" });
      if (!shouldImport) return;
      saveRecoveryData(data, "导入备份前的项目数据");
      replaceData(importedData);
      setRecovery(loadRecoveryData());
      setMessage("备份已导入，当前项目数据已更新。");
    } catch {
      setMessage("无法导入这个文件，请选择由筑记导出的 JSON 备份。");
    }
  };

  return (
    <div className="export-layout">
      <section className="backup-summary">
        <Database size={31} weight="duotone" />
        <div><StatusTag tone="success">云端同步已启用</StatusTag><h2>{data.project.name} 的完整档案</h2><p>包含 {data.tasks.length} 项任务、{data.inspections.length} 项验收、{data.materials.length} 个材料候选、{data.budgetItems.length} 项预算、{data.journals.length} 篇日志和 {data.issues.length} 个问题。</p></div>
      </section>
      <section className="export-options">
        {recovery ? <article><ArrowCounterClockwise size={25} /><div><h3>恢复冲突前版本</h3><p>{recovery.label} · {new Date(recovery.createdAt).toLocaleString("zh-CN")}</p></div><button className="secondary-button" type="button" onClick={() => { replaceData(recovery.data); clearRecoveryData(); setRecovery(null); setMessage("已恢复冲突处理前保留的版本，并将重新同步到云端。"); }}>恢复版本</button></article> : null}
        <article><FileCode size={25} /><div><h3>跨账户迁移 JSON</h3><p>导出当前项目的完整数据；登录新账户后可在本页导入并同步。</p></div><button className="primary-button" type="button" onClick={exportJson}>下载项目 JSON</button></article>
        <article><FileCsv size={25} /><div><h3>任务表格</h3><p>导出为 CSV，可在 Excel 或其他表格软件中打开。</p></div><button className="secondary-button" type="button" onClick={exportCsv}>导出表格</button></article>
        <article><FileCsv size={25} /><div><h3>总体预算清单</h3><p>导出预算、合同、付款和供应商信息，方便对账。</p></div><button className="secondary-button" type="button" onClick={exportBudgetCsv}>导出预算</button></article>
        <article><Printer size={25} /><div><h3>打印项目摘要</h3><p>使用浏览器打印功能保存为 PDF，适合现场沟通。</p></div><button className="secondary-button" type="button" onClick={() => window.print()}>打印摘要</button></article>
      </section>
      {message ? <p className="export-feedback" role="status">{message}</p> : null}
      <section className="import-zone"><UploadSimple size={25} /><div><h3>导入项目 JSON</h3><p>登录新账户后，选择此前下载的项目 JSON；导入会替换当前项目并同步到该账户。</p></div><input ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} hidden /><button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>选择项目 JSON</button></section>
      <p className="privacy-note">项目数据会同步到登录账户的 Cloudflare 云端，并在这台设备保留离线缓存。重要节点仍建议下载完整备份。</p>
    </div>
  );
}
