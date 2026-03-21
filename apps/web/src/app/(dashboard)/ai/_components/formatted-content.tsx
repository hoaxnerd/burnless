import React from "react";

/** Format inline markdown: **bold**, *italic*, `code`. */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index! } : null,
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index! } : null,
      italicMatch && (!boldMatch || italicMatch.index! < boldMatch.index!)
        ? { type: "italic", match: italicMatch, index: italicMatch.index! }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a!.index - b!.index);

    const earliest = matches[0];

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    // Text before match
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold">
          {earliest.match![1]}
        </strong>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    } else if (earliest.type === "code") {
      parts.push(
        <code
          key={key++}
          className="rounded bg-surface-100 px-1.5 py-0.5 text-xs font-mono"
        >
          {earliest.match![1]}
        </code>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    } else if (earliest.type === "italic") {
      parts.push(
        <em key={key++}>{earliest.match![1]}</em>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/** Simple markdown-to-JSX renderer for chat messages. */
export function FormattedContent({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="font-semibold text-sm mt-3 mb-1">
          {formatInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="font-semibold text-base mt-3 mb-1">
          {formatInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-surface-400">•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i}>{formatInline(line)}</p>
      );
    }
  }

  return <>{elements}</>;
}
