import { Wrench } from "lucide-react";

function toolLabel(tool: string) {
  return tool
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ToolResultDisplayProps {
  toolCalls: string[];
}

export function ToolResultDisplay({ toolCalls }: ToolResultDisplayProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {toolCalls.map((tool, j) => (
        <span
          key={j}
          className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2.5 py-0.5 text-xs text-surface-600"
        >
          <Wrench className="h-3 w-3" />
          {toolLabel(tool)}
        </span>
      ))}
    </div>
  );
}
