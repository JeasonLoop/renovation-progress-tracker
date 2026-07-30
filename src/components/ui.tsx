"use client";

import type { Icon } from "@phosphor-icons/react";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function IconButton({
  label,
  icon: IconComponent,
  onClick,
  type = "button",
  disabled = false,
}: {
  label: string;
  icon: Icon;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button className="icon-button" type={type} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <IconComponent size={20} weight="regular" />
    </button>
  );
}

export function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "danger" }) {
  return <span className={`status-tag status-${tone}`}>{children}</span>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <IconButton label="关闭" icon={X} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}

export function EmptyState({ icon: IconComponent, title, description, action }: { icon: Icon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <IconComponent size={30} weight="regular" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
