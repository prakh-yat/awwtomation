/**
 * Bounded request-body reader for unauthenticated endpoints (webhooks).
 *
 * `req.text()` buffers whatever the client sends; a hostile peer could push
 * hundreds of megabytes before signature verification ever runs. This reads
 * the stream chunk by chunk and aborts as soon as the cap is crossed, after
 * first rejecting on a declared `Content-Length` so the common case costs
 * nothing.
 */

export class PayloadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export const ONE_MEGABYTE = 1024 * 1024;

export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError(maxBytes);

  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new PayloadTooLargeError(maxBytes);
      chunks.push(value);
    }
  } finally {
    // Release the stream whether we finished or bailed; cancel is a no-op after done.
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
