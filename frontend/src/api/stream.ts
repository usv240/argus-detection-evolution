// SSE-over-POST: /api/arena is POST + Server-Sent-Events, so we stream the response body and parse
// SSE frames manually (EventSource only supports GET). Each frame's `data:` line is a JSON event
// emitted live by the backend - never a fixture.
export async function startArena(
  body: unknown,
  onEvent: (e: Record<string, any>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch("/api/arena", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`/api/arena ${resp.status}: ${text.slice(0, 200)}`);
  }
  if (!resp.body) throw new Error("No response body from /api/arena");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n"); // normalize CRLF → LF (sse_starlette sends \r\n)
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()));
      } catch {
        // malformed frame - skip
      }
    }
  }
}
