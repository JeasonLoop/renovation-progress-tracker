"use client";

import { Check, Package, Plus, ShoppingCartSimple, SquaresFour, Trash } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import type { Attachment, Material, MaterialCategory, RenovationData } from "@/lib/types";
import { deleteStoredAttachments, ImageAttachments } from "../image-attachments";
import { PreviewableImageList } from "../image-lightbox";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });

/** 材料品类 → 预算分类 的默认映射 */
function getBudgetCategoryForMaterial(materialCategoryId: string): string {
  const mapping: Record<string, string> = {
    tiles: "main-material",
    flooring: "main-material",
    paint: "auxiliary-material",
    doors: "main-material",
    cabinetry: "furniture",
    bathroom: "main-material",
    lighting: "soft-decoration",
    electrical: "auxiliary-material",
    appliances: "appliance",
  };
  return mapping[materialCategoryId] ?? "other-budget";
}

export function ResearchView({ data, updateData }: { data: RenovationData; updateData: (updater: (data: RenovationData) => RenovationData) => void }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => data.materialCategories[0]?.id ?? "");
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const { confirm } = useOperationDialog();
  const selectedCategory = data.materialCategories.find((category) => category.id === selectedCategoryId) ?? data.materialCategories[0];
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data.materials.forEach((material) => counts.set(material.categoryId, (counts.get(material.categoryId) ?? 0) + 1));
    return counts;
  }, [data.materials]);
  const visibleMaterials = useMemo(
    () => data.materials.filter((material) => material.categoryId === selectedCategory?.id),
    [data.materials, selectedCategory?.id],
  );

  const selectMaterial = async (id: string) => {
    const material = data.materials.find((item) => item.id === id);
    updateData((current) => {
      const targetCategoryId = current.materials.find((item) => item.id === id)?.categoryId;
      return {
        ...current,
        materials: current.materials.map((item) => ({
          ...item,
          status: item.id === id
            ? "selected"
            : item.categoryId === targetCategoryId && item.status === "selected"
              ? "researching"
              : item.status,
        })),
      };
    });
    // 选定后提示同步到预算
    if (material && material.price > 0) {
      const budgetCategoryId = getBudgetCategoryForMaterial(material.categoryId);
      const existingItems = data.budgetItems.filter((item) => item.categoryId === budgetCategoryId);
      const materialCategory = data.materialCategories.find((cat) => cat.id === material.categoryId);
      const shouldSync = await confirm({
        title: "同步到预算清单？",
        description: <>将「{material.brand} {material.model}」的单价 {currency.format(material.price)} 添加到「{materialCategory?.name ?? "材料"}」的预算清单中，方便后续跟踪签约和付款。</>,
        confirmLabel: "添加到预算",
        tone: "neutral",
      });
      if (shouldSync) {
        updateData((current) => ({
          ...current,
          budgetItems: [{
            id: crypto.randomUUID(),
            categoryId: budgetCategoryId,
            name: `${material.brand} ${material.model}`,
            budgeted: material.price,
            committed: 0,
            paid: 0,
            adjustment: 0,
            dueDate: "",
            vendor: material.brand,
            note: `来自材料调研 · ${materialCategory?.name ?? ""} · ${material.usage}`,
            attachments: [],
          }, ...current.budgetItems],
        }));
      }
    }
  };

  const removeMaterial = async (material: Material) => {
    const shouldDelete = await confirm({
      title: "删除候选方案？",
      description: <>“{material.brand} {material.model}”及其报价、备注和图片将被删除。此操作无法撤销。</>,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(material.attachments);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，候选方案未删除");
      return;
    }
    updateData((current) => ({ ...current, materials: current.materials.filter((item) => item.id !== material.id) }));
  };

  const addCategory = (category: MaterialCategory) => {
    updateData((current) => ({ ...current, materialCategories: [...current.materialCategories, category] }));
    setSelectedCategoryId(category.id);
    setShowCategoryModal(false);
  };

  return (
    <div className="content-stack research-workspace">
      <section className="material-category-strip" aria-label="材料品类">
        <div className="material-category-tabs" role="tablist" aria-label="选择材料品类">
          {data.materialCategories.map((category) => {
            const count = categoryCounts.get(category.id) ?? 0;
            return (
              <button key={category.id} type="button" role="tab" aria-selected={selectedCategory?.id === category.id} className={selectedCategory?.id === category.id ? "active" : ""} onClick={() => setSelectedCategoryId(category.id)}>
                <span>{category.name}</span><small>{count}</small>
              </button>
            );
          })}
        </div>
        <button className="secondary-button add-category-button" type="button" onClick={() => setShowCategoryModal(true)}><Plus size={17} /> 新增品类</button>
      </section>

      {selectedCategory ? (
        <>
          <section className="research-intro">
            <div><h2>{selectedCategory.name}候选对比</h2><p>{selectedCategory.guidance}</p></div>
            <button className="primary-button" type="button" onClick={() => setShowMaterialModal(true)}><Plus size={17} weight="bold" /> 添加候选</button>
          </section>

          {visibleMaterials.length > 0 ? (
            <section className="compare-grid">
              {visibleMaterials.map((material) => (
                <article className={material.status === "selected" ? "material-option selected" : "material-option"} key={material.id}>
                  <header><div><span>{material.brand}</span><h3>{material.model}</h3></div>{material.status === "selected" ? <StatusTag tone="success">已选定</StatusTag> : null}</header>
                  {material.attachments?.length ? <PreviewableImageList className="material-photo-strip" images={material.attachments.map((attachment) => ({ src: attachment.url, alt: attachment.name || `${material.brand} ${material.model}` }))} /> : null}
                  <strong className="material-price">{currency.format(material.price)}<small> / {selectedCategory.unit}</small></strong>
                  <dl>
                    <div><dt>使用位置</dt><dd>{material.usage}</dd></div>
                    <div><dt>交期</dt><dd>{material.leadTime}</dd></div>
                    <div><dt>售后</dt><dd>{material.warranty}</dd></div>
                    <div><dt>个人记录</dt><dd>{material.note}</dd></div>
                  </dl>
                  <div className="material-option-actions"><button className={material.status === "selected" ? "selected-button" : "secondary-button"} type="button" onClick={() => selectMaterial(material.id)}>{material.status === "selected" ? <><Check size={17} weight="bold" /> 当前选择</> : "选定这个方案"}</button><button className="inline-delete-button" type="button" onClick={() => void removeMaterial(material)} aria-label={`删除候选${material.brand} ${material.model}`} title="删除候选"><Trash size={17} /></button></div>
                </article>
              ))}
            </section>
          ) : (
            <section className="material-empty-panel">
              <EmptyState icon={Package} title={`还没有${selectedCategory.name}候选`} description="把正在看的品牌、型号和报价记下来，后面可以放在一起比较。" action={<button className="primary-button" type="button" onClick={() => setShowMaterialModal(true)}><Plus size={17} /> 添加第一个候选</button>} />
            </section>
          )}

          <section className="purchase-rail"><ShoppingCartSimple size={24} /><div><strong>{selectedCategory.name}采购提醒</strong><p>{selectedCategory.guidance}</p></div></section>
        </>
      ) : (
        <section className="material-empty-panel"><EmptyState icon={SquaresFour} title="先创建一个材料品类" description="例如瓷砖、地板、卫浴或你想单独管理的其他物品。" action={<button className="primary-button" type="button" onClick={() => setShowCategoryModal(true)}><Plus size={17} /> 新增品类</button>} /></section>
      )}

      {showMaterialModal && selectedCategory ? <MaterialModal category={selectedCategory} onClose={() => setShowMaterialModal(false)} onAdd={(material) => { updateData((current) => ({ ...current, materials: [...current.materials, material] })); setShowMaterialModal(false); }} /> : null}
      {showCategoryModal ? <CategoryModal onClose={() => setShowCategoryModal(false)} onAdd={addCategory} /> : null}
    </div>
  );
}

function MaterialModal({ category, onClose, onAdd }: { category: MaterialCategory; onClose: () => void; onAdd: (material: Material) => void }) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState("");
  const [price, setPrice] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [warranty, setWarranty] = useState("");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!brand.trim() || !model.trim() || !price) return;
    onAdd({
      id: crypto.randomUUID(),
      categoryId: category.id,
      usage: usage.trim() || "待确认",
      brand: brand.trim(),
      model: model.trim(),
      price: Number(price),
      warranty: warranty.trim() || "待确认",
      leadTime: leadTime.trim() || "待确认",
      status: "researching",
      note: note.trim() || "暂无记录",
      attachments,
    });
  };

  return (
    <Modal title={`添加${category.name}候选`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="material-modal-category field-full"><Package size={18} /><span>{category.name}</span><small>计价单位：{category.unit}</small></div>
        <label className="field"><span>品牌</span><input autoFocus value={brand} onChange={(event) => setBrand(event.target.value)} required /></label>
        <label className="field"><span>型号与规格</span><input value={model} onChange={(event) => setModel(event.target.value)} required /></label>
        <label className="field"><span>使用位置</span><input value={usage} onChange={(event) => setUsage(event.target.value)} placeholder="例如：主卫、全屋" /></label>
        <label className="field"><span>单价（元/{category.unit}）</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <label className="field"><span>预计交期</span><input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} placeholder="例如：7 天" /></label>
        <label className="field"><span>售后与质保</span><input value={warranty} onChange={(event) => setWarranty(event.target.value)} placeholder="例如：质保 5 年" /></label>
        <label className="field field-full"><span>个人记录</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="颜色、质感、环保参数、售后或需要再次确认的事项" /></label>
        <div className="field-full"><ImageAttachments value={attachments} onChange={setAttachments} label="样品、报价或现场照片" max={6} /></div>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存候选</button></div>
      </form>
    </Modal>
  );
}

function CategoryModal({ onClose, onAdd }: { onClose: () => void; onAdd: (category: MaterialCategory) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("件");
  const [guidance, setGuidance] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !unit.trim()) return;
    onAdd({ id: crypto.randomUUID(), name: name.trim(), unit: unit.trim(), guidance: guidance.trim() || "记录规格、使用位置、数量、交期和选择理由。" });
  };

  return (
    <Modal title="新增材料品类" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field"><span>品类名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：窗帘" required /></label>
        <label className="field"><span>计价单位</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="例如：米、套、件" required /></label>
        <label className="field field-full"><span>选购提醒</span><textarea rows={4} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="这个品类购买时要重点比较什么" /></label>
        <div className="form-actions field-full"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存品类</button></div>
      </form>
    </Modal>
  );
}
