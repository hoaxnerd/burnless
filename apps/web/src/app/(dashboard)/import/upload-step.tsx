"use client";

import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui";

interface UploadStepProps {
  dragActive: boolean;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFile: (file: File) => void;
}

export function UploadStep({
  dragActive,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  fileInputRef,
  handleFile,
}: UploadStepProps) {
  return (
    <div className="max-w-2xl animate-slide-up">
      <div
        className={`rounded-xl border-2 border-dashed p-12 text-center transition-all ${
          dragActive
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950 scale-[1.01]"
            : "border-surface-300 dark:border-surface-600 hover:border-brand-400"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center mb-4">
          <Upload className="h-7 w-7 text-brand-600" />
        </div>
        <p className="text-lg font-semibold text-surface-900 dark:text-surface-50">
          Drop your file here
        </p>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          CSV, TSV, or TXT from any bank or spreadsheet
        </p>
        <Button variant="primary" size="md" className="mt-4" icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
          Select File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <div className="mt-6 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-3">
          Supported formats
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm text-surface-600 dark:text-surface-400">
          {[
            "Chase bank statements",
            "Mercury exports",
            "SVB / First Republic",
            "Brex card exports",
            "Stripe payouts",
            "QuickBooks exports",
            "Xero CSV export",
            "Any CSV with date & amount",
          ].map((fmt) => (
            <div key={fmt} className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-surface-400 flex-shrink-0" />
              {fmt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
