// apps/web/src/app/(dashboard)/ai/_components/sse.ts
/** Read a `data: {json}\n\n` SSE stream and invoke `onEvent` per parsed event. */
export async function readSseStream(
  res: Response,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* ignore malformed */
      }
    }
  }
}
