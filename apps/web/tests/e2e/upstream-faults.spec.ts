import { expect, test } from "@playwright/test";
import { POST as relayRialoRpc } from "../../app/api/rialo/route";
import {
  GitHubPublicPullError,
  fetchPublicGitHubPull,
} from "../../lib/github-public-pull";
import { runSingleFlight } from "../../lib/single-flight";
import {
  BoundedRetryError,
  runWithBoundedRetry,
} from "../../lib/upstream-reliability";

test.describe("upstream fault boundaries", () => {
  test.describe.configure({ mode: "serial" });

  const originalFetch = globalThis.fetch;
  const originalRpcUrl = process.env.RIALO_RPC_UPSTREAM_URL;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalRpcUrl === undefined) {
      delete process.env.RIALO_RPC_UPSTREAM_URL;
    } else {
      process.env.RIALO_RPC_UPSTREAM_URL = originalRpcUrl;
    }
  });

  test("keeps GitHub 404, rate limit, and timeout fail-closed", async () => {
    const scenarios = [
      {
        fetch: async () => new Response(null, { status: 404 }),
        message: "GitHub could not find this public pull request.",
        status: 404,
        code: "GITHUB_PULL_NOT_FOUND",
      },
      {
        fetch: async () => new Response(null, { status: 429 }),
        message:
          "GitHub rate limiting temporarily prevented verification. Approval remains locked; retry after the limit resets.",
        status: 429,
        code: "GITHUB_RATE_LIMITED",
      },
      {
        fetch: async () => {
          throw new DOMException("request aborted", "AbortError");
        },
        message:
          "GitHub did not respond before the verification timeout. Approval remains locked; try again shortly.",
        status: 504,
        code: "GITHUB_TIMEOUT",
      },
    ] as const;

    for (const scenario of scenarios) {
      globalThis.fetch = scenario.fetch as typeof fetch;
      const error = await fetchPublicGitHubPull("Alice699", "mergepay-demo", 7, {
        sleep: async () => undefined,
      })
        .then(() => null)
        .catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(GitHubPublicPullError);
      expect(error).toMatchObject({
        message: scenario.message,
        status: scenario.status,
        code: scenario.code,
      });
    }
  });

  test("retries one transient GitHub read and returns verified data", async () => {
    let attempts = 0;
    const pull = await fetchPublicGitHubPull("Alice699", "mergepay-demo", 7, {
      sleep: async () => undefined,
      fetch: (async () => {
        attempts += 1;
        if (attempts === 1) {
          return new Response(null, {
            status: 503,
            headers: { "Retry-After": "0" },
          });
        }
        return new Response(
          JSON.stringify({
            number: 7,
            title: "Retry-safe proof",
            state: "open",
            html_url: "https://github.com/Alice699/mergepay-demo/pull/7",
            merged_at: null,
            merge_commit_sha: null,
            head: { sha: "a".repeat(40) },
            base: { ref: "main" },
            user: {
              id: 136351960,
              login: "biawaklahat",
              avatar_url: null,
            },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    expect(attempts).toBe(2);
    expect(pull.upstream.attempts).toBe(2);
    expect(pull.author.login).toBe("biawaklahat");
    expect(pull.headSha).toBe("a".repeat(40));
    expect(pull.baseRef).toBe("main");
  });

  test("passes an upstream RPC rate limit through without fabricating data", async () => {
    process.env.RIALO_RPC_UPSTREAM_URL = "https://rialo.invalid";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 41,
          error: { code: -32005, message: "Rate limit exceeded" },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "0",
          },
        },
      )) as typeof fetch;

    const response = await relayRialoRpc(rpcRequest(41));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-mergepay-rpc-attempts")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 41,
      error: { code: -32005, message: "Rate limit exceeded" },
    });
  });

  test("returns an explicit RPC error when the upstream request aborts", async () => {
    process.env.RIALO_RPC_UPSTREAM_URL = "https://rialo.invalid";
    globalThis.fetch = (async () => {
      throw new DOMException("request aborted", "AbortError");
    }) as typeof fetch;

    const response = await relayRialoRpc(rpcRequest(42));
    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-mergepay-rpc-attempts")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 42,
      error: {
        code: -32098,
        message: "The Rialo DevNet RPC did not respond before the bounded timeout.",
      },
    });
  });

  test("retries read-only RPC calls but never repeats sendTransaction", async () => {
    process.env.RIALO_RPC_UPSTREAM_URL = "https://rialo.invalid";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 43,
              error: { code: -32001, message: "temporary outage" },
            }),
            { status: 503, headers: { "Retry-After": "0" } },
          )
        : new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 43, result: "ok" }),
            { status: 200 },
          );
    }) as typeof fetch;

    const readResponse = await relayRialoRpc(rpcRequest(43));
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get("x-mergepay-rpc-attempts")).toBe("2");
    await expect(readResponse.json()).resolves.toMatchObject({ result: "ok" });

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 44,
          error: { code: -32001, message: "write unavailable" },
        }),
        { status: 503 },
      );
    }) as typeof fetch;

    const writeResponse = await relayRialoRpc(
      rpcRequest(44, "sendTransaction", ["signed-transaction"]),
    );
    expect(writeResponse.status).toBe(503);
    expect(writeResponse.headers.get("x-mergepay-rpc-attempts")).toBe("1");
    expect(calls).toBe(1);
  });

  test("enforces attempt timeouts even when a read ignores abort signals", async () => {
    const error = await runWithBoundedRetry({
      operation: async () => new Promise<never>(() => undefined),
      maxAttempts: 2,
      timeoutMs: 5,
      sleep: async () => undefined,
    }).then(() => null, (cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoundedRetryError);
    expect(error).toMatchObject({ attempts: 2, timedOut: true });
  });

  test("coalesces rapid duplicate transaction attempts and unlocks after settlement", async () => {
    const active: { current: Promise<string> | null } = { current: null };
    let executions = 0;
    let release: (value: string) => void = () => {
      throw new Error("The test operation was not initialized.");
    };
    const operation = () => {
      executions += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };

    const first = runSingleFlight(active, operation);
    const duplicate = runSingleFlight(active, operation);
    expect(duplicate).toBe(first);
    expect(executions).toBe(0);

    await Promise.resolve();
    expect(executions).toBe(1);
    release("confirmed");
    await expect(first).resolves.toBe("confirmed");
    await Promise.resolve();
    expect(active.current).toBeNull();

    const retry = runSingleFlight(active, async () => {
      executions += 1;
      return "retried";
    });
    await expect(retry).resolves.toBe("retried");
    expect(executions).toBe(2);
  });
});

function rpcRequest(
  id: number,
  method = "getHealth",
  params: unknown[] = [],
): Request {
  return new Request("https://mergepay.invalid/api/rialo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
}
