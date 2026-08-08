/** HTML → PDF boundary; Gotenberg in production, a fake in tests. */
export interface PdfRenderer {
  render(html: string): Promise<Uint8Array>;
}

/**
 * Gotenberg's Chromium route gives faithful HTML→PDF for report packs
 * (stack choice in architecture §3.4). The container is a shared
 * service (compose.yaml locally, Coolify in production).
 */
export class GotenbergRenderer implements PdfRenderer {
  constructor(
    private readonly baseUrl: string = process.env.GOTENBERG_URL ??
      "http://localhost:3100",
  ) {}

  async render(html: string): Promise<Uint8Array> {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    const res = await fetch(`${this.baseUrl}/forms/chromium/convert/html`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(
        `Gotenberg render failed (${res.status}): ${(await res.text()).slice(0, 500)}`,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
