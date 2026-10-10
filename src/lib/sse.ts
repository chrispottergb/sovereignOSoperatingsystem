/** Incremental SSE parser shared by upstream adapters and the browser. */
export async function* readSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", event = "message", data: string[] = [];
  function line(value: string) {
    if (!value) {
      const result = data.length ? { event, data: data.join("\n") } : undefined;
      event = "message"; data = []; return result;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? "" : value.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = content;
    if (field === "data") data.push(content);
  }
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 2_000_000) throw new Error("Stream frame too large.");
      let pos: number;
      while ((pos = buffer.indexOf("\n")) >= 0) {
        const result = line(buffer.slice(0, pos).replace(/\r$/, ""));
        buffer = buffer.slice(pos + 1);
        if (result) yield result;
      }
      if (done) {
        if (buffer) line(buffer.replace(/\r$/, ""));
        const result = line(""); if (result) yield result;
        break;
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
