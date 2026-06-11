import { useState, useCallback } from "react";

export function useWizard<T extends readonly string[]>(steps: T) {
  const [index, setIndex] = useState(0);
  const clamp = (i: number) => Math.max(0, Math.min(steps.length - 1, i));
  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [steps.length]);
  const back = useCallback(() => setIndex((i) => clamp(i - 1)), []);
  const skip = next;
  const goTo = useCallback((id: T[number]) => {
    const i = steps.indexOf(id);
    if (i >= 0) setIndex(i);
  }, [steps]);
  return {
    index,
    current: steps[index] as T[number],
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    next, back, skip, goTo,
  };
}
