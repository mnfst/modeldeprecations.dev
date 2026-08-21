import { describe, expect, it, vi } from "vitest";
import { fetchSource, SourceFetchError } from "../src/sources/fetch-source.js";
import type { SourceEntry } from "../src/sources/registry.js";

const source: SourceEntry = {
  provider: "openai",
  slug: "deprecations",
  catalog_provider: "openai",
  url: "https://example.com/deprecations.md",
  min_bytes: 5,
  max_bytes: 1000,
  required_markers: ["# Marker"],
};

function markdown(body = "# Marker\nBody\n", headers: HeadersInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8", ...headers },
  });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("fetchSource", () => {
  it("accepts markdown parameters and normalizes whitespace", async () => {
    const fetched = await fetchSource(source, undefined, {
      fetch: vi.fn(async () => markdown("# Marker  \r\nBody\t\r\n\r\n")),
    });
    expect(fetched.body.toString()).toBe("# Marker\nBody\n");
    expect(fetched.attempts).toBe(1);
  });

  it("rejects HTML and redirects", async () => {
    await expectCode(
      fetchSource(source, undefined, {
        fetch: vi.fn(
          async () => new Response("# Marker", { headers: { "content-type": "text/html" } }),
        ),
      }),
      "content_type",
    );
    await expectCode(
      fetchSource(source, undefined, {
        fetch: vi.fn(
          async () => new Response(null, { status: 302, headers: { location: "/moved" } }),
        ),
      }),
      "redirect",
    );
  });

  it("retries retryable statuses and stops after three attempts", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    await expectCode(fetchSource(source, undefined, { fetch, sleep }), "http_status");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("honors a bounded Retry-After value", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 429, headers: { "retry-after": "90" } })
        : markdown();
    });
    await fetchSource(source, undefined, { fetch, sleep });
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("does not retry a normal 4xx", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    await expectCode(fetchSource(source, undefined, { fetch }), "http_status");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries timeouts", async () => {
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    await expectCode(
      fetchSource(source, undefined, { fetch, timeoutMs: 1, sleep: async () => undefined }),
      "timeout",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects stated and streamed oversized bodies", async () => {
    await expectCode(
      fetchSource(source, undefined, {
        fetch: vi.fn(async () => markdown("# Marker", { "content-length": "1001" })),
      }),
      "too_large",
    );
    await expectCode(
      fetchSource(source, undefined, {
        fetch: vi.fn(async () => markdown(`# Marker\n${"x".repeat(1000)}`)),
      }),
      "too_large",
    );
  });

  it("rejects invalid UTF-8", async () => {
    const response = new Response(new Uint8Array([0xff, 0xfe]), {
      headers: { "content-type": "text/markdown" },
    });
    await expectCode(
      fetchSource(source, undefined, { fetch: vi.fn(async () => response) }),
      "invalid_utf8",
    );
  });

  it("rejects missing markers, short bodies, and large shrinkage", async () => {
    await expectCode(
      fetchSource(source, undefined, { fetch: vi.fn(async () => markdown("missing")) }),
      "missing_marker",
    );
    await expectCode(
      fetchSource({ ...source, min_bytes: 100 }, undefined, {
        fetch: vi.fn(async () => markdown()),
      }),
      "too_small",
    );
    await expectCode(
      fetchSource(source, Buffer.alloc(100), { fetch: vi.fn(async () => markdown()) }),
      "shrink",
    );
  });

  it("keeps sanitized internal errors", async () => {
    try {
      await fetchSource(source, undefined, {
        fetch: vi.fn(async () => Promise.reject(new Error("secret"))),
        sleep: async () => undefined,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SourceFetchError);
      expect((error as Error).message).toBe("source request failed");
      expect((error as Error).message).not.toContain("secret");
    }
  });
});
