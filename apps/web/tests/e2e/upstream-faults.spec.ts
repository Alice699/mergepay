import { expect, test } from "@playwright/test";
import { POST as relayRialoRpc } from "../../app/api/rialo/route";
import {
  GitHubPublicPullError,
  fetchPublicGitHubPull,
} from "../../lib/github-public-pull";
import { runSingleFlight } from "../../lib/single-flight";

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
      },
      {
        fetch: async () => new Response(null, { status: 429 }),
        message: "GitHub returned HTTP 429.",
        status: 502,
      },
      {
        fetch: async () => {
          throw new DOMException("request aborted", "AbortError");
        },
        message: "GitHub did not respond in time.",
        status: 502,
      },
    ] as const;

    for (const scenario of scenarios) {
      globalThis.fetch = scenario.fetch as typeof fetch;
      const error = await fetchPublicGitHubPull("Alice699", "mergepay-demo", 7)
        .then(() => null)
        .catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(GitHubPublicPullError);
      expect(error).toMatchObject({
        message: scenario.message,
        status: scenario.status,
      });
    }
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
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const response = await relayRialoRpc(rpcRequest(41));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
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
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 42,
      error: {
        code: -32098,
        message: "MergePay could not reach the Rialo DevNet RPC.",
      },
    });
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

function rpcRequest(id: number): Request {
  return new Request("https://mergepay.invalid/api/rialo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "getHealth",
      params: [],
    }),
  });
}
