"use client";

import React, { memo, createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// ── List context to distinguish ul vs ol children ───────────────────────────

const ListTypeContext = createContext<"ul" | "ol">("ul");

// ── Custom components for premium markdown rendering ────────────────────────

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-surface-900 mt-4 mb-2 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-surface-900 mt-3 mb-1.5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-surface-800 mt-2.5 mb-1 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-medium text-surface-700 mt-2 mb-1 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-surface-700 mb-2 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-surface-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-surface-600">{children}</em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-brand-600 hover:text-brand-700 underline decoration-brand-300 underline-offset-2 transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ListTypeContext.Provider value="ul">
      <ul className="space-y-1 my-2">{children}</ul>
    </ListTypeContext.Provider>
  ),
  ol: ({ children }) => (
    <ListTypeContext.Provider value="ol">
      <ol className="space-y-1 my-2 list-decimal pl-5 marker:text-surface-400 marker:font-medium">
        {children}
      </ol>
    </ListTypeContext.Provider>
  ),
  li: function Li({ children }) {
    const listType = useContext(ListTypeContext);
    if (listType === "ol") {
      return (
        <li className="text-sm leading-relaxed text-surface-700 pl-1">
          {children}
        </li>
      );
    }
    return (
      <li className="flex gap-2 text-sm leading-relaxed text-surface-700">
        <span className="text-surface-400 mt-0.5 shrink-0">•</span>
        <span className="flex-1">{children}</span>
      </li>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-brand-300 pl-3 my-2 text-surface-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className="text-xs font-mono">{children}</code>
      );
    }
    return (
      <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs font-mono text-surface-800">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="rounded-lg bg-surface-900 text-surface-100 p-3 my-2 overflow-x-auto text-xs leading-relaxed font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-surface-200">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface-50 border-b border-surface-200">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-surface-100">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-surface-50/50 transition-colors">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-surface-700">{children}</td>
  ),
  hr: () => <hr className="my-3 border-surface-200" />,
};

// ── Compact variant for insight cards (shorter spacing) ─────────────────────

const compactComponents: Components = {
  ...components,
  p: ({ children }) => (
    <p className="text-xs leading-relaxed text-surface-600 mb-1 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-surface-800">{children}</strong>
  ),
  ul: ({ children }) => (
    <ListTypeContext.Provider value="ul">
      <ul className="space-y-0.5 my-1">{children}</ul>
    </ListTypeContext.Provider>
  ),
  li: function CompactLi({ children }) {
    const listType = useContext(ListTypeContext);
    if (listType === "ol") {
      return (
        <li className="text-xs leading-relaxed text-surface-600 pl-0.5">
          {children}
        </li>
      );
    }
    return (
      <li className="flex gap-1.5 text-xs leading-relaxed text-surface-600">
        <span className="text-surface-400 mt-0.5 shrink-0">•</span>
        <span className="flex-1">{children}</span>
      </li>
    );
  },
};

// ── Exported component ──────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string;
  /** Use "compact" for insight cards, "default" for chat messages */
  variant?: "default" | "compact";
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  variant = "default",
  className,
}: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={variant === "compact" ? compactComponents : components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
