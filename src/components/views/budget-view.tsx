"use client";

import {
  ArrowCounterClockwise,
  CalendarBlank,
  CurrencyCny,
  NotePencil,
  Plus,
  Receipt,
  Storefront,
  Trash,
  TrendUp,
  Wallet,
  Warning,
  Camera,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { BudgetCategory, BudgetItem, RenovationData } from "@/lib/types";
import { deleteStoredAttachments, ImageAttachments } from "../image-attachments";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

function amount(value: number) {
  return currency.format(Number.isFinite(value) ? value : 0);
}

function total(items: BudgetItem[], key: "budgeted" | "committed" | "paid" | "adjustment") {
  return items.reduce((sum, item) => sum + item[key], 0);
}

export function BudgetView({ data, updateData }: { data: RenovationData; updateData: (updater: (current: RenovationData) => RenovationData) => void }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [editingItem, setEditingItem] = useState<BudgetItem | null | undefined>(undefined);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { confirm } = useOperationDialog();
  const summary = useMemo(() => {
    const paid = total(data.budgetItems, "paid");
    const committed = total(data.budgetItems, "committed");
    const listedBudget = total(data.budgetItems, "budgeted");
    const adjustedBudget = listedBudget + total(data.budgetItems, "adjustment");
    return {
      paid,
      committed,
      listedBudget,
      adjustedBudget,
      pending: data.budgetItems.reduce((sum, item) => sum + Math.max(item.committed - item.paid, 0), 0),
      remaining: data.project.budget - paid,
      remainingAfterCommitments: data.project.budget - committed,
    }; 
  }, [data.budgetItems, data.project.budget]);
  const visibleItems = activeCategory === "all" ? data.budgetItems : data.budgetItems.filter((item) => item.categoryId === activeCategory);
  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const changeCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    setSelectedIds([]);
  };

  const toggleSelected = (itemId: string) => setSelectedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  const toggleAllVisible = () => setSelectedIds(allVisibleSelected ? [] : visibleIds);

  const removeSelected = async () => {
    if (!selectedIds.length) return;
    const shouldDelete = await confirm({
      title: `删除 ${selectedIds.length} 个预算项？`,
      description: <>所选预算项及其金额、付款和票据记录将从预算清单中移除。此操作无法撤销。</>,
      confirmLabel: "确认批量删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(data.budgetItems.filter((item) => selectedIds.includes(item.id)).flatMap((item) => item.attachments ?? []));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，预算项未删除");
      return;
    }
    const ids = new Set(selectedIds);
    updateData((current) => ({ ...current, budgetItems: current.budgetItems.filter((item) => !ids.has(item.id)) }));
    setSelectedIds([]);
  };

  const saveItem = (item: BudgetItem) => {
    updateData((current) => ({
      ...current,
      budgetItems: current.budgetItems.some((existing) => existing.id === item.id)
        ? current.budgetItems.map((existing) => existing.id === item.id ? item : existing)
        : [item, ...current.budgetItems],
    }));
    setEditingItem(undefined);
  };

  const removeItem = async (item: BudgetItem) => {
    const shouldDelete = await confirm({
      title: "删除预算项？",
      description: <>“{item.name}”及其金额、付款和票据记录将从预算清单中移除。此操作无法撤销。</>,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(item.attachments);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，预算项未删除");
      return;
    }
    updateData((current) => ({ ...current, budgetItems: current.budgetItems.filter((existing) => existing.id !== item.id) }));
    setSelectedIds((current) => current.filter((id) => id !== item.id));
  };

  return (
    <div className="budget-layout">
      <section className="budget-hero">
        <div>
          <div className="budget-total-heading"><span>项目总预算</span><button type="button" onClick={() => setShowBudgetModal(true)} aria-label="调整项目总预算" title="调整项目总预算"><NotePencil size={16} /></button></div>
          <strong>{amount(data.project.budget)}</strong>
          <p>清单预算 {amount(summary.listedBudget)}，调整后 {amount(summary.adjustedBudget)}</p>
        </div>
        <div className="budget-hero-actions">
          <button className="secondary-button" type="button" onClick={() => setShowCategoryModal(true)}><Plus size={16} weight="bold" />预算分类</button>
          <button className="primary-button" type="button" onClick={() => setEditingItem(null)}><Plus size={17} weight="bold" />添加预算项</button>
        </div>
      </section>

      <section className="budget-metrics" aria-label="预算关键数据">
        <div><span><Receipt size={18} />已签约</span><strong>{amount(summary.committed)}</strong><small>已确定的合同或订单</small></div>
        <div><span><Wallet size={18} />已支付</span><strong>{amount(summary.paid)}</strong><small>占总预算 {data.project.budget ? Math.round(summary.paid / data.project.budget * 100) : 0}%</small></div>
        <div><span><CalendarBlank size={18} />待支付</span><strong>{amount(summary.pending)}</strong><small>已签约但尚未支付</small></div>
        <div className={summary.remainingAfterCommitments < 0 ? "over-budget" : ""}><span><TrendUp size={18} />剩余预算</span><strong>{amount(summary.remainingAfterCommitments)}</strong><small>{summary.remainingAfterCommitments < 0 ? "签约已超出总预算" : `签约后可用 · 现金余额 ${amount(summary.remaining)}`}</small></div>
      </section>

      <section className="budget-category-section">
        <header className="section-heading"><div><h2>按分类查看</h2><p>先看钱花在哪，再核对每一笔</p></div></header>
        <div className="budget-category-rail">
          <button type="button" className={activeCategory === "all" ? "active" : ""} onClick={() => changeCategory("all")}><span>全部</span><strong>{amount(summary.adjustedBudget)}</strong><small>{data.budgetItems.length} 项</small></button>
          {data.budgetCategories.map((category) => {
            const items = data.budgetItems.filter((item) => item.categoryId === category.id);
            return <button key={category.id} type="button" className={activeCategory === category.id ? "active" : ""} onClick={() => changeCategory(category.id)}><span>{category.name}</span><strong>{amount(total(items, "budgeted") + total(items, "adjustment"))}</strong><small>已付 {amount(total(items, "paid"))}</small></button>;
          })}
        </div>
      </section>

      <section className="budget-list-section">
        <header className="section-heading">
          <div><h2>{activeCategory === "all" ? "总体预算清单" : data.budgetCategories.find((category) => category.id === activeCategory)?.name}</h2><p>{visibleItems.length} 项，金额会自动汇总</p></div>
          <div className="list-bulk-actions">
            {selectedIds.length ? <button className="secondary-button danger-action" type="button" onClick={() => void removeSelected()}><Trash size={16} />删除已选（{selectedIds.length}）</button> : null}
            {summary.adjustedBudget > data.project.budget ? <StatusTag tone="danger"><Warning size={13} /> 清单超出总预算</StatusTag> : <StatusTag tone="success">预算范围内</StatusTag>}
          </div>
        </header>
        {visibleItems.length ? (
          <div className="budget-table">
            <div className="budget-table-head"><span className="selectable-heading"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="全选当前预算项" />项目 / 分类</span><span>预算</span><span>签约</span><span>已付</span><span>待付</span><span>操作</span></div>
            {visibleItems.map((item) => {
              const category = data.budgetCategories.find((candidate) => candidate.id === item.categoryId);
              const adjusted = item.budgeted + item.adjustment;
              const pending = Math.max(item.committed - item.paid, 0);
              const isOver = item.committed > adjusted;
              return (
                <article className="budget-row" key={item.id}>
                  <div className="budget-item-main selectable-item"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`选择预算项${item.name}`} /><div><strong>{item.name}</strong><span>{category?.name ?? "未分类"}{item.vendor ? ` · ${item.vendor}` : ""}</span>{item.note ? <small>{item.note}</small> : null}{item.attachments?.length ? <small><Camera size={12} /> {item.attachments.length} 张票据或报价</small> : null}</div></div>
                  <div data-label="预算"><strong>{amount(adjusted)}</strong>{item.adjustment ? <small><ArrowCounterClockwise size={12} /> 调整 {item.adjustment > 0 ? "+" : ""}{amount(item.adjustment)}</small> : null}</div>
                  <div data-label="签约" className={isOver ? "amount-warning" : ""}><strong>{amount(item.committed)}</strong>{isOver ? <small><Warning size={12} /> 超预算</small> : null}</div>
                  <div data-label="已付"><strong>{amount(item.paid)}</strong></div>
                  <div data-label="待付"><strong>{amount(pending)}</strong>{item.dueDate ? <small>{item.dueDate}</small> : null}</div>
                  <div className="budget-row-actions"><button type="button" title="编辑预算项" aria-label={`编辑${item.name}`} onClick={() => setEditingItem(item)}><NotePencil size={17} /></button><button type="button" title="删除预算项" aria-label={`删除${item.name}`} onClick={() => void removeItem(item)}><Trash size={17} /></button></div>
                </article>
              );
            })}
          </div>
        ) : <div className="budget-empty"><EmptyState icon={CurrencyCny} title="这个分类还没有预算项" description="添加计划金额、合同金额和已付款，之后会自动汇总。" action={<button className="primary-button" type="button" onClick={() => setEditingItem(null)}>添加预算项</button>} /></div>}
      </section>

      {editingItem !== undefined ? <BudgetItemModal categories={data.budgetCategories} item={editingItem} defaultCategoryId={activeCategory === "all" ? data.budgetCategories[0]?.id : activeCategory} onClose={() => setEditingItem(undefined)} onSave={saveItem} /> : null}
      {showBudgetModal ? <ProjectBudgetModal budget={data.project.budget} adjustedBudget={summary.adjustedBudget} onClose={() => setShowBudgetModal(false)} onSave={(budget) => { updateData((current) => ({ ...current, project: { ...current.project, budget } })); setShowBudgetModal(false); }} /> : null}
      {showCategoryModal ? <BudgetCategoryModal categories={data.budgetCategories} onClose={() => setShowCategoryModal(false)} onAdd={(category) => { updateData((current) => ({ ...current, budgetCategories: [...current.budgetCategories, category] })); setActiveCategory(category.id); setShowCategoryModal(false); }} /> : null}
    </div>
  );
}

function ProjectBudgetModal({ budget, adjustedBudget, onClose, onSave }: { budget: number; adjustedBudget: number; onClose: () => void; onSave: (budget: number) => void }) {
  const [value, setValue] = useState(String(budget));
  const nextBudget = Number(value);
  const isValid = Number.isFinite(nextBudget) && nextBudget > 0 && nextBudget <= 1000000000;
  const balance = isValid ? nextBudget - adjustedBudget : 0;

  return (
    <Modal title="调整项目总预算" onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (isValid) onSave(nextBudget); }}>
        <label className="field field-full"><span>新的总预算（元）</span><input autoFocus required type="number" min="1" max="1000000000" step="1" inputMode="decimal" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(event.target.value)} /></label>
        <div className="budget-adjustment-preview field-full">
          <div><span>当前总预算</span><strong>{amount(budget)}</strong></div>
          <div><span>清单调整后</span><strong>{amount(adjustedBudget)}</strong></div>
          <div className={balance < 0 ? "over-budget" : ""}><span>{balance < 0 ? "超出总预算" : "尚未分配"}</span><strong>{amount(Math.abs(balance))}</strong></div>
        </div>
        <p className="project-form-note field-full">修改只影响项目总预算，清单项目、合同金额和付款记录不会改变。</p>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!isValid || nextBudget === budget}>保存总预算</button></div>
      </form>
    </Modal>
  );
}

function BudgetItemModal({ categories, item, defaultCategoryId, onClose, onSave }: { categories: BudgetCategory[]; item: BudgetItem | null; defaultCategoryId?: string; onClose: () => void; onSave: (item: BudgetItem) => void }) {
  const [form, setForm] = useState<BudgetItem>(item ?? { id: crypto.randomUUID(), categoryId: defaultCategoryId ?? categories[0]?.id ?? "", name: "", budgeted: 0, committed: 0, paid: 0, adjustment: 0, dueDate: "", vendor: "", note: "", attachments: [] });
  const set = <K extends keyof BudgetItem,>(key: K, value: BudgetItem[K]) => setForm((current) => ({ ...current, [key]: value }));
  const numberValue = (value: string) => Math.max(0, Number(value) || 0);

  return (
    <Modal title={item ? "编辑预算项" : "添加预算项"} onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!form.name.trim() || !form.categoryId) return; onSave({ ...form, name: form.name.trim(), vendor: form.vendor.trim(), note: form.note.trim() }); }}>
        <label className="field field-full"><span>项目名称</span><input autoFocus required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="例如：客厅与卧室地板" /></label>
        <label className="field"><span>预算分类</span><select required value={form.categoryId} onChange={(event) => set("categoryId", event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>供应商 / 施工方</span><input value={form.vendor} onChange={(event) => set("vendor", event.target.value)} placeholder="可稍后填写" /></label>
        <label className="field"><span>原预算（元）</span><input type="number" min="0" step="1" value={form.budgeted} onChange={(event) => set("budgeted", numberValue(event.target.value))} /></label>
        <label className="field"><span>预算调整（元）</span><input type="number" step="1" value={form.adjustment} onChange={(event) => set("adjustment", Number(event.target.value) || 0)} /></label>
        <label className="field"><span>合同 / 订单金额（元）</span><input type="number" min="0" step="1" value={form.committed} onChange={(event) => set("committed", numberValue(event.target.value))} /></label>
        <label className="field"><span>已支付（元）</span><input type="number" min="0" step="1" value={form.paid} onChange={(event) => set("paid", numberValue(event.target.value))} /></label>
        <label className="field field-full"><span>下次付款日期</span><input type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></label>
        <label className="field field-full"><span>备注</span><textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} placeholder="记录报价范围、付款节点、增减项或票据位置" /></label>
        <div className="field-full"><ImageAttachments value={form.attachments ?? []} onChange={(attachments) => set("attachments", attachments)} label="合同、报价与付款票据" max={6} /></div>
        <div className="budget-form-hint field-full"><Storefront size={16} /><span>待支付按“合同金额 - 已支付”自动计算；预算调整可填写负数。</span></div>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存预算项</button></div>
      </form>
    </Modal>
  );
}

function BudgetCategoryModal({ categories, onClose, onAdd }: { categories: BudgetCategory[]; onClose: () => void; onAdd: (category: BudgetCategory) => void }) {
  const [name, setName] = useState("");
  return <Modal title="添加预算分类" onClose={onClose}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const cleanName = name.trim(); if (!cleanName || categories.some((category) => category.name === cleanName)) return; onAdd({ id: `budget-${crypto.randomUUID()}`, name: cleanName }); }}><label className="field field-full"><span>分类名称</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：智能家居" /></label><div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">添加分类</button></div></form></Modal>;
}
