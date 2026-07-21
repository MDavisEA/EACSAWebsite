import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, GripVertical, Upload, X, Image, FileText, Type, Check } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import PdfTextEditor from "@/components/teacher/PdfTextEditor";
import AnswerKeyEditor from "@/components/teacher/AnswerKeyEditor";

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [false, 3, 4] }],
    ["bold", "italic", "underline", "code"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["code-block"],
    ["clean"],
  ],
};

const QUILL_FORMATS = [
  "header", "bold", "italic", "underline", "code",
  "list", "bullet", "code-block"
];

function PdfPagePicker({ pdfUrl, onConfirm, onCancel }) {
  const [pageCount, setPageCount] = useState(null);
  const [loadingPages, setLoadingPages] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    // Use extractPdfText with no pages to get total_pages (mupdf is more robust)
    base44.functions.invoke("extractPdfText", { pdf_url: pdfUrl, pages: [] }).then((res) => {
      setPageCount(res.data.total_pages);
      setLoadingPages(false);
    }).catch(() => setLoadingPages(false));
  }, [pdfUrl]);

  const toggle = (page) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const handleConfirm = async () => {
    setExtracting(true);
    const pages = Array.from(selected).sort((a, b) => a - b);
    const res = await base44.functions.invoke("extractPdfText", { pdf_url: pdfUrl, pages });
    setExtracting(false);
    const urls = (res.data.file_urls || [res.data.file_url]).filter(Boolean);
    onConfirm(urls);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-500" />
            <h2 className="font-semibold text-slate-800">Select PDF Pages</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loadingPages ? (
            <div className="flex items-center justify-center h-40 gap-3 text-slate-500">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
              Detecting pages...
            </div>
          ) : !pageCount ? (
            <p className="text-sm text-red-500">Could not read this PDF. Please try re-uploading it.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Click pages to select. Only selected pages will be shown to students.</p>
                <button
                  onClick={() => {
                    const all = Array.from({ length: pageCount }, (_, i) => i + 1);
                    const allSelected = all.every((p) => selected.has(p));
                    setSelected(allSelected ? new Set() : new Set(all));
                  }}
                  className="text-xs font-medium text-primary border border-primary rounded px-3 py-1 hover:bg-primary/5 transition-colors"
                >
                  {Array.from({ length: pageCount }, (_, i) => i + 1).every((p) => selected.has(p)) ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
                  const isSelected = selected.has(page);
                  return (
                    <div
                      key={page}
                      onClick={() => toggle(page)}
                      className={`relative cursor-pointer rounded-lg border-2 overflow-hidden transition-all ${
                        isSelected ? "border-primary shadow-md" : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <iframe
                        src={`${pdfUrl}#page=${page}&toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-36 border-0"
                        style={{ pointerEvents: "none" }}
                        title={`Page ${page}`}
                      />
                      {/* transparent overlay so clicks reach the parent div, not the iframe */}
                      <div className="absolute inset-0" />
                      <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 text-xs font-medium ${
                        isSelected ? "bg-primary text-white" : "bg-black/40 text-white"
                      }`}>
                        <span>Page {page}</span>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {pageCount && !loadingPages && (
          <div className="border-t px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">{selected.size} page{selected.size !== 1 ? "s" : ""} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} disabled={extracting}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={selected.size === 0 || extracting}>
                {extracting ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />Extracting...</>
                ) : (
                  `Add ${selected.size > 0 ? `${selected.size} Page${selected.size !== 1 ? "s" : ""}` : "Pages"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImageUploader({ images = [], onAdd, onAddMany, onRemove, onUpdate }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [pdfPickerUrl, setPdfPickerUrl] = useState(null);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    const file = files[0];
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    if (file.type === "application/pdf") {
      setPdfPickerUrl(file_url);
    } else {
      onAdd(file_url);
    }
  };

  return (
    <div className="space-y-3">
      {pdfPickerUrl && (
        <PdfPagePicker
          pdfUrl={pdfPickerUrl}
          onConfirm={(pageUrls) => { onAddMany(pageUrls); setPdfPickerUrl(null); }}
          onCancel={() => setPdfPickerUrl(null)}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Upload images or a PDF — you'll pick which pages to include. Students see these in the question panel.
      </p>
      <div className="flex gap-2 flex-wrap">
        {images.map((url, i) => (
          <div key={i} className="relative group">
            {url.startsWith("__html__:") ? (
              <div className="w-full rounded border bg-yellow-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-100 border-b border-yellow-200">
                  <div className="flex items-center gap-1.5 text-yellow-700 text-xs font-medium">
                    <FileText className="w-3.5 h-3.5" />
                    Extracted PDF Text
                  </div>
                  <button
                    onClick={() => onRemove(i)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-2">
                  <PdfTextEditor
                    html={url.slice("__html__:".length)}
                    onChange={(newHtml) => {
                      const updated = [...images];
                      updated[i] = `__html__:${newHtml}`;
                      onUpdate(updated);
                    }}
                  />
                </div>
              </div>
            ) : url.toLowerCase().includes(".pdf") ? (
              <div className="h-32 w-24 rounded border bg-red-50 flex flex-col items-center justify-center gap-1 text-red-500 relative group">
                <FileText className="w-6 h-6" />
                <span className="text-xs font-medium">PDF p.{url.match(/page=(\d+)/)?.[1] || i+1}</span>
                <button
                  onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="relative group">
                <img src={url} alt={`Page ${i + 1}`} className="h-32 w-auto rounded border object-cover" />
                <button
                  onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => inputRef.current.click()}
          disabled={uploading}
          className="h-32 w-24 border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-primary hover:text-primary transition-colors"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span className="text-xs">Upload</span>
            </>
          )}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
    </div>
  );
}

export default function QuestionEditor({ question, questionIndex, onUpdate, onRemove, canRemove }) {
  const contentType = question.content_type || "rich_text";

  const setContentType = (type) => onUpdate("content_type", type);

  const addPart = () => {
    const labels = "abcdefghij";
    const nextLabel = labels[question.parts.length] || `${question.parts.length + 1}`;
    onUpdate("parts", [...question.parts, { id: generateId(), label: nextLabel, prompt: "", prompt_html: "" }]);
  };

  const removePart = (pIdx) => {
    onUpdate("parts", question.parts.filter((_, i) => i !== pIdx));
  };

  const updatePart = (pIdx, field, value) => {
    const parts = [...question.parts];
    parts[pIdx] = { ...parts[pIdx], [field]: value };
    onUpdate("parts", parts);
  };

  const addImage = (url) => {
    onUpdate("prompt_images", [...(question.prompt_images || []), url]);
  };

  const removeImage = (i) => {
    onUpdate("prompt_images", (question.prompt_images || []).filter((_, idx) => idx !== i));
  };

  return (
    <div className="border rounded-lg bg-slate-50/50">
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-slate-400" />
          <Input
            value={question.title}
            onChange={(e) => onUpdate("title", e.target.value)}
            className="w-48 h-8 text-sm font-medium"
            placeholder="Question title"
          />
          <div className="flex items-center gap-1.5 ml-2">
            <Label className="text-xs text-slate-500 whitespace-nowrap">Points:</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={question.max_score ?? 9}
              onChange={(e) => onUpdate("max_score", e.target.value === "" ? 9 : parseInt(e.target.value))}
              className="w-16 h-8 text-sm text-center"
            />
          </div>
        </div>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Content type selector */}
        <div>
          <Label className="mb-2 block text-xs text-slate-500">Question content format</Label>
          <div className="flex gap-2">
            {[
              { id: "rich_text", label: "Rich Text", icon: Type },
              { id: "images", label: "Images / PDF pages", icon: Image },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setContentType(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all ${
                  contentType === id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content editor */}
        {contentType === "rich_text" ? (
          <div className="min-h-[200px]">
            <ReactQuill
              value={question.prompt_html || ""}
              onChange={(val) => onUpdate("prompt_html", val)}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Enter the full question prompt. Use the toolbar for formatting and code blocks..."
              className="bg-white"
            />
          </div>
        ) : (
          <ImageUploader
            images={question.prompt_images || []}
            onAdd={addImage}
            onAddMany={(urls) => onUpdate("prompt_images", [...(question.prompt_images || []), ...urls])}
            onRemove={removeImage}
            onUpdate={(newImages) => onUpdate("prompt_images", newImages)}
          />
        )}

        {/* Answer Key for whole question (only if no parts) */}
        {question.parts.length === 0 && (
          <AnswerKeyEditor
            keyHtml={question.answer_key_html || ""}
            keyImageUrl={question.answer_key_image_url || ""}
            onChangeHtml={(v) => onUpdate("answer_key_html", v)}
            onChangeImageUrl={(v) => onUpdate("answer_key_image_url", v)}
          />
        )}

        {/* Parts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Parts (optional)</span>
            <Button variant="ghost" size="sm" onClick={addPart}>
              <Plus className="w-3 h-3 mr-1" /> Add Part
            </Button>
          </div>
          {question.parts.map((p, pi) => (
            <div key={p.id} className="mb-3 border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Part ({p.label})</span>
                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => removePart(pi)}>
                  <Trash2 className="w-3 h-3 text-slate-400" />
                </Button>
              </div>
              <ReactQuill
                value={p.prompt_html || ""}
                onChange={(val) => updatePart(pi, "prompt_html", val)}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder={`Prompt for part (${p.label})...`}
                className="bg-white text-sm"
              />
              <div className="mt-3">
                <AnswerKeyEditor
                  keyHtml={p.answer_key_html || ""}
                  keyImageUrl={p.answer_key_image_url || ""}
                  onChangeHtml={(v) => updatePart(pi, "answer_key_html", v)}
                  onChangeImageUrl={(v) => updatePart(pi, "answer_key_image_url", v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}