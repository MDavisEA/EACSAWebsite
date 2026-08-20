import React from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { wrapSelection, applyLinePrefix } from "@/lib/markdownEditing";

// A handful of formatting buttons for a plain-text markdown field - the
// rubric is stored and exported as literal markdown (see ProjectForm), which
// is what makes it clean to hand to an AI review pass, so this can't become a
// rich-text/HTML editor like the description fields. Without SOME way to
// apply formatting, though, "bold" and "bullets" meant knowing to type
// **like this** and "- like this" by hand. Also wired to Cmd/Ctrl+B and
// Cmd/Ctrl+I (see useMarkdownShortcuts below) so formatting works while
// actually typing, not only by reaching for a button after the fact.
//
// Operates directly on the textarea DOM node via `textareaRef` rather than
// tracking selection in React state - selection only exists as a live
// browser concept (selectionStart/selectionEnd), and re-deriving it from
// state on every keystroke would be strictly more code for the same result.
export default function MarkdownToolbar({ textareaRef, value, onChange }) {
  const focusAndSelect = (start, end) => {
    // Right after onChange, the textarea's DOM value hasn't caught up to the
    // new React state yet - setSelectionRange now would clamp against the
    // OLD (shorter) value and land in the wrong place. A macrotask is enough
    // for the re-render to land first - setTimeout rather than
    // requestAnimationFrame because rAF does not reliably fire for a
    // backgrounded/inactive tab, and there is no reason this needs a paint.
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    }, 0);
  };

  const runWrap = (prefix, suffix, placeholder) => {
    const el = textareaRef.current;
    if (!el) return;
    const { text, selStart, selEnd } = wrapSelection(value, el.selectionStart, el.selectionEnd, prefix, suffix, placeholder);
    onChange(text);
    focusAndSelect(selStart, selEnd);
  };

  const runLinePrefix = (prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    const { text, selStart, selEnd } = applyLinePrefix(value, el.selectionStart, el.selectionEnd, prefix);
    onChange(text);
    focusAndSelect(selStart, selEnd);
  };

  const buttons = [
    { icon: Bold, label: "Bold (Cmd/Ctrl+B)", onClick: () => runWrap("**", "**", "bold text") },
    { icon: Italic, label: "Italic (Cmd/Ctrl+I)", onClick: () => runWrap("_", "_", "italic text") },
    { icon: List, label: "Bullet list", onClick: () => runLinePrefix("- ") },
    // Every line gets "1. " on purpose, not incrementing numbers - Markdown
    // renders an <ol> in order regardless of the digits in the source, so
    // this looks right without tracking a running count.
    { icon: ListOrdered, label: "Numbered list", onClick: () => runLinePrefix("1. ") },
  ];

  return (
    <div className="flex items-center gap-1 border border-b-0 rounded-t-md bg-slate-50 px-1.5 py-1">
      {buttons.map(({ icon: Icon, label, onClick }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onClick}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </Button>
      ))}
    </div>
  );
}

// Cmd/Ctrl+B and Cmd/Ctrl+I while the cursor is in the field - the point
// raised was "if I'm typing something I should be able to format it", not
// just after selecting text and reaching for a toolbar. Returns an onKeyDown
// handler; a plain <textarea> has no native rich-text shortcuts to conflict
// with, so hijacking these two is safe.
export function useMarkdownShortcuts(textareaRef, value, onChange) {
  return (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || (e.key !== "b" && e.key !== "i")) return;
    e.preventDefault();
    const el = textareaRef.current;
    if (!el) return;
    const mark = e.key === "b" ? "**" : "_";
    const placeholder = e.key === "b" ? "bold text" : "italic text";
    const { text, selStart, selEnd } = wrapSelection(value, el.selectionStart, el.selectionEnd, mark, mark, placeholder);
    onChange(text);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    }, 0);
  };
}
