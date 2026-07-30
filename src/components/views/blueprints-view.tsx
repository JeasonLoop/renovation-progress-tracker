"use client";

import {
  Blueprint as BlueprintIcon,
  Buildings,
  Camera,
  Compass,
  HouseLine,
  ImageSquare,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { Attachment, Blueprint, RenovationData } from "@/lib/types";
import { deleteStoredAttachments, ImageAttachments } from "../image-attachments";
import { PreviewableImageList } from "../image-lightbox";
import { useOperationDialog } from "../operation-dialog";
import { EmptyState, Modal, StatusTag } from "../ui";

const categoryOptions = [
  { value: "floorplan" as const, label: "户型图", icon: HouseLine, description: "原始户型、拆改方案、平面布局" },
  { value: "design" as const, label: "设计图", icon: Compass, description: "效果图、施工图、节点大样" },
  { value: "render" as const, label: "效果图", icon: ImageSquare, description: "3D渲染、软装搭配参考" },
  { value: "other" as const, label: "其他资料", icon: Buildings, description: "合同、报价单、产品手册" },
];

const categoryMeta = Object.fromEntries(categoryOptions.map((opt) => [opt.value, opt])) as Record<
  Blueprint["category"],
  (typeof categoryOptions)[number]
>;

export function BlueprintsView({
  data,
  updateData,
}: {
  data: RenovationData;
  updateData: (updater: (data: RenovationData) => RenovationData) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<Blueprint["category"] | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<Blueprint | null>(null);
  const { confirm } = useOperationDialog();

  const visibleBlueprints =
    activeCategory === "all"
      ? data.blueprints
      : data.blueprints.filter((bp) => bp.category === activeCategory);

  const categoryCounts = categoryOptions.reduce(
    (acc, opt) => {
      acc[opt.value] = data.blueprints.filter((bp) => bp.category === opt.value).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const saveBlueprint = (blueprint: Blueprint) => {
    updateData((current) => {
      const exists = current.blueprints.some((bp) => bp.id === blueprint.id);
      return {
        ...current,
        blueprints: exists
          ? current.blueprints.map((bp) => (bp.id === blueprint.id ? blueprint : bp))
          : [blueprint, ...current.blueprints],
      };
    });
    setShowModal(false);
    setEditingBlueprint(null);
  };

  const removeBlueprint = async (blueprint: Blueprint) => {
    const shouldDelete = await confirm({
      title: "删除图纸资料？",
      description: <>「{blueprint.title}」及其图片将被删除。此操作无法撤销。</>,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (!shouldDelete) return;
    try {
      await deleteStoredAttachments(blueprint.attachments);
      updateData((current) => ({
        ...current,
        blueprints: current.blueprints.filter((bp) => bp.id !== blueprint.id),
      }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片清理失败，图纸未删除");
    }
  };

  return (
    <div className="content-stack blueprints-workspace">
      <section className="blueprint-category-strip">
        <div className="blueprint-category-tabs" role="tablist" aria-label="按图纸类型筛选">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "all"}
            className={activeCategory === "all" ? "active" : ""}
            onClick={() => setActiveCategory("all")}
          >
            <span>全部图纸</span>
            <small>{data.blueprints.length}</small>
          </button>
          {categoryOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={activeCategory === opt.value}
                className={activeCategory === opt.value ? "active" : ""}
                onClick={() => setActiveCategory(opt.value)}
              >
                <Icon size={18} />
                <span>{opt.label}</span>
                <small>{categoryCounts[opt.value] ?? 0}</small>
              </button>
            );
          })}
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setEditingBlueprint(null);
            setShowModal(true);
          }}
        >
          <Plus size={17} weight="bold" /> 上传图纸
        </button>
      </section>

      {visibleBlueprints.length > 0 ? (
        <section className="blueprint-grid">
          {visibleBlueprints.map((blueprint) => {
            const meta = categoryMeta[blueprint.category];
            const CatIcon = meta.icon;
            return (
              <article className="blueprint-card" key={blueprint.id}>
                {blueprint.attachments.length > 0 ? (
                  <div className="blueprint-preview">
                    <PreviewableImageList
                      className="blueprint-thumbnails"
                      images={blueprint.attachments.map((att) => ({
                        src: att.url,
                        alt: att.name || blueprint.title,
                      }))}
                    />
                  </div>
                ) : (
                  <div className="blueprint-preview blueprint-preview-empty">
                    <Camera size={32} />
                    <span>暂无预览图</span>
                  </div>
                )}
                <div className="blueprint-body">
                  <header>
                    <span className={`blueprint-category-tag category-${blueprint.category}`}>
                      <CatIcon size={14} />
                      {meta.label}
                    </span>
                    <h3>{blueprint.title}</h3>
                  </header>
                  {blueprint.description ? <p>{blueprint.description}</p> : null}
                  <div className="blueprint-meta">
                    <small>{blueprint.attachments.length} 张图片</small>
                    <small>上传于 {new Date(blueprint.uploadedAt).toLocaleDateString("zh-CN")}</small>
                  </div>
                  <div className="blueprint-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setEditingBlueprint(blueprint);
                        setShowModal(true);
                      }}
                    >
                      <PencilSimple size={16} /> 编辑
                    </button>
                    <button
                      className="inline-delete-button"
                      type="button"
                      onClick={() => void removeBlueprint(blueprint)}
                      aria-label={`删除${blueprint.title}`}
                      title="删除"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="blueprint-empty">
          <EmptyState
            icon={BlueprintIcon}
            title={activeCategory === "all" ? "还没有图纸资料" : `还没有${categoryMeta[activeCategory]?.label ?? ""}`}
            description="上传户型图、设计图、效果图等，集中管理所有装修相关的图纸文件。"
            action={
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setEditingBlueprint(null);
                  setShowModal(true);
                }}
              >
                <Plus size={17} /> 上传第一份图纸
              </button>
            }
          />
        </section>
      )}

      {showModal ? (
        <BlueprintModal
          blueprint={editingBlueprint}
          onClose={() => {
            setShowModal(false);
            setEditingBlueprint(null);
          }}
          onSave={saveBlueprint}
        />
      ) : null}
    </div>
  );
}

function BlueprintModal({
  blueprint,
  onClose,
  onSave,
}: {
  blueprint: Blueprint | null;
  onClose: () => void;
  onSave: (blueprint: Blueprint) => void;
}) {
  const isEdit = !!blueprint;
  const [title, setTitle] = useState(blueprint?.title ?? "");
  const [category, setCategory] = useState<Blueprint["category"]>(blueprint?.category ?? "floorplan");
  const [description, setDescription] = useState(blueprint?.description ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(blueprint?.attachments ?? []);

  return (
    <Modal title={isEdit ? "编辑图纸资料" : "上传图纸资料"} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onSave({
            id: blueprint?.id ?? crypto.randomUUID(),
            title: title.trim(),
            category,
            description: description.trim(),
            attachments,
            uploadedAt: blueprint?.uploadedAt ?? new Date().toISOString(),
          });
        }}
      >
        <label className="field field-full">
          <span>图纸名称</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：原始户型图、客厅效果图"
            required
          />
        </label>
        <fieldset className="field field-full blueprint-category-choice">
          <legend>图纸类型</legend>
          <div className="stage-choice-grid">
            {categoryOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={category === opt.value}
                  className={category === opt.value ? "active" : ""}
                  onClick={() => setCategory(opt.value)}
                  title={opt.description}
                >
                  <Icon size={17} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="field field-full">
          <span>说明（可选）</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="记录图纸版本、设计师、关键尺寸或其他备注信息"
          />
        </label>
        <div className="field-full">
          <ImageAttachments
            value={attachments}
            onChange={setAttachments}
            label="图纸图片"
            max={10}
          />
        </div>
        <div className="blueprint-form-hint field-full">
          <Camera size={16} />
          <span>支持户型图、设计图、效果图等图片格式，可上传多张。</span>
        </div>
        <div className="form-actions field-full">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            {isEdit ? "更新图纸" : "保存图纸"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
