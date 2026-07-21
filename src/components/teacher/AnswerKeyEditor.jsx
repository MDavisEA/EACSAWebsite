import React, { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, KeyRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

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

export default function AnswerKeyEditor({ keyHtml, keyImageUrl, onChangeHtml, onChangeImageUrl }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onChangeImageUrl(file_url);
    setUploading(false);
  };

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onChangeImageUrl(file_url);
    setUploading(false);
  };

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-amber-600" />
        <Label className="text-amber-700 font-semibold text-sm">Answer Key (teacher only)</Label>
      </div>

      <div className="min-h-[120px]">
        <ReactQuill
          value={keyHtml || ""}
          onChange={onChangeHtml}
          modules={QUILL_MODULES}
          formats={QUILL_FORMATS}
          placeholder="Enter the answer key or rubric points..."
          className="bg-white"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-500">Answer key image (optional)</Label>
        {keyImageUrl ? (
          <div className="relative inline-block">
            <img src={keyImageUrl} alt="Answer key" className="h-32 w-auto rounded border object-cover" />
            <button
              onClick={() => onChangeImageUrl("")}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : uploading ? (
          <div className="h-10 w-56 flex items-center gap-2 text-amber-600 text-xs">
            <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin flex-shrink-0" />
            Uploading...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 rounded text-xs text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload file
            </button>
            <div
              onPaste={handlePaste}
              tabIndex={0}
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-dashed border-amber-300 rounded text-xs text-amber-600 hover:border-amber-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 cursor-text select-none"
            >
              📋 Click here, then Ctrl/Cmd+V to paste
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}