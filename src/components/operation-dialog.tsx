"use client";

import { CheckCircle, Info, Question, Warning, X } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type OperationTone = "neutral" | "danger" | "success";

type OperationOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: OperationTone;
};

type ActiveOperation = OperationOptions & { mode: "confirm" | "notice" };

type OperationDialogApi = {
  confirm: (options: OperationOptions) => Promise<boolean>;
  notify: (options: Omit<OperationOptions, "cancelLabel">) => Promise<void>;
};

const OperationDialogContext = createContext<OperationDialogApi | null>(null);

export function OperationDialogProvider({ children }: { children: ReactNode }) {
  const [operation, setOperation] = useState<ActiveOperation | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const open = useCallback((options: OperationOptions, mode: ActiveOperation["mode"]) => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setOperation({ ...options, mode });
  }), []);

  const finish = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOperation(null);
    resolve?.(result);
  }, []);

  const api = useMemo<OperationDialogApi>(() => ({
    confirm: (options) => open(options, "confirm"),
    notify: async (options) => { await open(options, "notice"); },
  }), [open]);

  useEffect(() => () => resolverRef.current?.(false), []);

  return (
    <OperationDialogContext.Provider value={api}>
      {children}
      {operation ? <OperationDialog operation={operation} onFinish={finish} /> : null}
    </OperationDialogContext.Provider>
  );
}

export function useOperationDialog() {
  const context = useContext(OperationDialogContext);
  if (!context) throw new Error("useOperationDialog 必须在 OperationDialogProvider 中使用");
  return context;
}

function OperationDialog({ operation, onFinish }: { operation: ActiveOperation; onFinish: (result: boolean) => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const tone = operation.tone ?? "neutral";
  const Icon = tone === "danger" ? Warning : tone === "success" ? CheckCircle : operation.mode === "confirm" ? Question : Info;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (operation.mode === "confirm" ? cancelRef.current : confirmRef.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onFinish, operation.mode]);

  return createPortal(
    <div className="operation-dialog-backdrop" onMouseDown={() => onFinish(false)}>
      <section className={`operation-dialog tone-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onMouseDown={(event) => event.stopPropagation()}>
        <div className={`operation-dialog-icon tone-${tone}`} aria-hidden="true"><Icon size={22} weight="fill" /></div>
        <div className="operation-dialog-copy">
          <h2 id={titleId}>{operation.title}</h2>
          <div id={descriptionId}>{operation.description}</div>
        </div>
        {operation.mode === "notice" ? <button className="operation-dialog-close" type="button" onClick={() => onFinish(true)} aria-label="关闭提示" title="关闭"><X size={19} /></button> : null}
        <footer>
          {operation.mode === "confirm" ? <button ref={cancelRef} className="secondary-button" type="button" onClick={() => onFinish(false)}>{operation.cancelLabel ?? "取消"}</button> : null}
          <button ref={confirmRef} className={`operation-dialog-confirm tone-${tone}`} type="button" onClick={() => onFinish(true)}>{operation.confirmLabel ?? (operation.mode === "notice" ? "知道了" : "确认")}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
