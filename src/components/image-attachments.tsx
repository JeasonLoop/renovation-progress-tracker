"use client";

import { Camera, ImageSquare, Trash, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { Attachment } from "@/lib/types";
import { ImageLightbox } from "./image-lightbox";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function localAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取这张图片"));
    reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, url: String(reader.result), type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
    reader.readAsDataURL(file);
  });
}

async function upload(file: File): Promise<Attachment> {
  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (isLocalDevelopment) return localAttachment(file);
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", credentials: "same-origin", body });
  const result = await response.json() as { attachment?: Attachment; error?: string };
  if (!response.ok || !result.attachment) throw new Error(result.error || "图片上传失败");
  return result.attachment;
}

export async function deleteStoredUrls(urls: string[]): Promise<void> {
  const stored = urls.filter((url) => url.startsWith("/api/uploads/"));
  await Promise.all(stored.map(async (url) => {
    const response = await fetch(url, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok && response.status !== 404) throw new Error("图片删除失败，请稍后重试");
  }));
}

export function deleteStoredAttachments(attachments: Attachment[] | undefined): Promise<void> {
  return deleteStoredUrls((attachments ?? []).map((attachment) => attachment.url));
}

export function ImageAttachments({ value, onChange, label = "现场照片", max = 6, compact = false }: { value: Attachment[]; onChange: (attachments: Attachment[]) => void; label?: string; max?: number; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || busy) return;
    setError("");
    const selected = Array.from(files).slice(0, Math.max(max - value.length, 0));
    const invalid = selected.find((file) => !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_BYTES);
    if (invalid) {
      setError("仅支持 8 MB 内的 JPG、PNG、WebP 或 GIF 图片");
      return;
    }
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of selected) uploaded.push(await upload(file));
      onChange([...value, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "图片上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (attachment: Attachment) => {
    onChange(value.filter((item) => item.id !== attachment.id));
    void deleteStoredAttachments([attachment]);
  };

  return (
    <div className={compact ? "attachment-field compact" : "attachment-field"}>
      <div className="attachment-field-heading"><span><ImageSquare size={16} />{label}</span><small>{value.length}/{max}</small></div>
      {value.length ? <div className="attachment-grid">{value.map((attachment, index) => <figure key={attachment.id}><button className="attachment-preview" type="button" onClick={() => setPreviewIndex(index)} aria-label={`查看大图：${attachment.name || label}`}><img src={attachment.url} alt={attachment.name || label} loading="lazy" /></button><button className="attachment-delete" type="button" onClick={(event) => { event.stopPropagation(); remove(attachment); }} aria-label={`删除图片 ${attachment.name}`} title="删除图片"><Trash size={15} /></button></figure>)}</div> : null}
      {value.length < max ? <><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple capture={compact ? undefined : "environment"} hidden onChange={(event) => void addFiles(event.target.files)} /><button className="attachment-add" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <><UploadSimple size={16} />正在上传…</> : <><Camera size={16} />添加图片</>}</button></> : null}
      {error ? <p className="attachment-error" role="alert">{error}</p> : null}
      {previewIndex !== null && value.length ? <ImageLightbox images={value.map((attachment) => ({ src: attachment.url, alt: attachment.name || label }))} activeIndex={Math.min(previewIndex, value.length - 1)} onIndexChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} /> : null}
    </div>
  );
}
