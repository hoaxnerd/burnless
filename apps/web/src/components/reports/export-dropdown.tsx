"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileText, Table, ChevronDown } from "lucide-react";

interface ExportDropdownProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  label?: string;
}

export function ExportDropdown({ onExportCSV, onExportPDF, label = "Export" }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg bg-surface-0 border border-surface-200 shadow-lg z-50 py-1">
          <button
            onClick={() => {
              onExportPDF();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-red-500" />
            Export PDF
          </button>
          <button
            onClick={() => {
              onExportCSV();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <Table className="w-3.5 h-3.5 text-green-500" />
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
}
