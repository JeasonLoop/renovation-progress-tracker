"use client";

import { ArrowCounterClockwise, ArrowClockwise, ListBullets, ListNumbers, Quotes, TextB, TextItalic } from "@phosphor-icons/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

const extensions = [StarterKit];

export function hasRichTextContent(value: string): boolean {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

export function RichTextEditor({ value, onChange, placeholder = "请输入内容" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": placeholder, "data-placeholder": placeholder } },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="rich-text-editor-loading">正在加载编辑器…</div>;

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="现场记录格式工具">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="加粗" title="加粗"><TextB size={17} /></button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体" title="斜体"><TextItalic size={17} /></button>
        <button type="button" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="项目符号列表" title="项目符号列表"><ListBullets size={17} /></button>
        <button type="button" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="编号列表" title="编号列表"><ListNumbers size={17} /></button>
        <button type="button" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用" title="引用"><Quotes size={17} /></button>
        <span className="rich-text-toolbar-divider" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} aria-label="撤销" title="撤销"><ArrowCounterClockwise size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} aria-label="重做" title="重做"><ArrowClockwise size={17} /></button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextViewer({ content }: { content: string }) {
  const editor = useEditor({ extensions, content, editable: false, immediatelyRender: false });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  if (!editor) return <p className="rich-text-viewer-fallback">{content}</p>;
  return <div className="rich-text-viewer"><EditorContent editor={editor} /></div>;
}
