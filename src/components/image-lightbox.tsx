"use client";

import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

export type PreviewImage = {
  src: string;
  alt: string;
};

export function ImageLightbox({ images, activeIndex, onIndexChange, onClose }: { images: PreviewImage[]; activeIndex: number; onIndexChange: (index: number) => void; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pointerStartX = useRef<number | null>(null);
  const image = images[activeIndex];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && images.length > 1) onIndexChange((activeIndex - 1 + images.length) % images.length);
      if (event.key === "ArrowRight" && images.length > 1) onIndexChange((activeIndex + 1) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, images.length, onClose, onIndexChange]);

  if (!image) return null;

  const previous = () => onIndexChange((activeIndex - 1 + images.length) % images.length);
  const next = () => onIndexChange((activeIndex + 1) % images.length);
  const handlePointerDown = (event: PointerEvent) => {
    pointerStartX.current = event.clientX;
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (pointerStartX.current === null || images.length < 2) return;
    const distance = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(distance) < 48) return;
    distance > 0 ? previous() : next();
  };

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="图片大图预览" onClick={onClose}>
      <div className="image-lightbox-panel" onClick={(event) => event.stopPropagation()} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <header>
          <div><strong>{image.alt || "项目图片"}</strong><span>{activeIndex + 1} / {images.length}</span></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭大图预览" title="关闭"><X size={22} /></button>
        </header>
        <div className="image-lightbox-stage">
          {images.length > 1 ? <button className="image-lightbox-previous" type="button" onClick={previous} aria-label="上一张图片" title="上一张"><CaretLeft size={28} /></button> : null}
          <img src={image.src} alt={image.alt} draggable={false} />
          {images.length > 1 ? <button className="image-lightbox-next" type="button" onClick={next} aria-label="下一张图片" title="下一张"><CaretRight size={28} /></button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PreviewableImageList({ images, className }: { images: PreviewImage[]; className: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!images.length) return null;

  return (
    <>
      <div className={className}>
        {images.map((image, index) => (
          <button key={`${image.src}-${index}`} className="preview-thumbnail" type="button" onClick={() => setActiveIndex(index)} aria-label={`查看大图：${image.alt}`}>
            <img src={image.src} alt={image.alt} loading="lazy" />
          </button>
        ))}
      </div>
      {activeIndex !== null ? <ImageLightbox images={images} activeIndex={activeIndex} onIndexChange={setActiveIndex} onClose={() => setActiveIndex(null)} /> : null}
    </>
  );
}
