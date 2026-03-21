"use client";

import { useState, useCallback, useEffect } from "react";

export interface PinnedInsight {
  id: string;
  content: string;
  pinnedAt: string;
  page: string;
}

const STORAGE_KEY = "burnless:pinned-insights";
const MAX_PINS = 8;

function loadPins(): PinnedInsight[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePins(pins: PinnedInsight[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function usePinnedInsights() {
  const [pins, setPins] = useState<PinnedInsight[]>([]);

  useEffect(() => {
    setPins(loadPins()); // eslint-disable-line react-hooks/set-state-in-effect -- hydrate from localStorage on mount
  }, []);

  const pin = useCallback((content: string, page: string) => {
    setPins((prev) => {
      const id = crypto.randomUUID();
      const next = [
        { id, content, pinnedAt: new Date().toISOString(), page },
        ...prev,
      ].slice(0, MAX_PINS);
      savePins(next);
      return next;
    });
  }, []);

  const unpin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePins(next);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (content: string) => pins.some((p) => p.content === content),
    [pins],
  );

  return { pins, pin, unpin, isPinned };
}
