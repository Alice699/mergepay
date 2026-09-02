const DEFAULT_RIALO_DEVNET_RPC = "https://devnet.rialo.io";
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_DEVNET_AIRDROP_KELVIN = 1_000_000_000;
const UPSTREAM_TIMEOUT_MS = 20_000;

const allowedMethods = new Set([
  "getAccountInfo",
  "getBalance",
  "getHealth",
  "getRecentValidatorConfigHash",
  "getSignatureStatuses",
  "getTransaction",
  "requestAirdrop",
  "sendTransaction",
]);

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status: number,
) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string";
}

function isAllowedAirdrop(params: unknown): boolean {
  if (!Array.isArray(params) || params.length !== 1) return false;
  const request = params[0];
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    return false;
  }

  const { kelvins, pubkey } = request as Record<string, unknown>;
  return (
    typeof pubkey === "string" &&
    pubkey.length >= 32 &&
    pubkey.length <= 64 &&
    typeof kelvins === "number" &&
    Number.isSafeInteger(kelvins) &&
    kelvins > 0 &&
    kelvins <= MAX_DEVNET_AIRDROP_KELVIN
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return jsonRpcError(null, -32600, "RPC request is too large.", 413);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    return jsonRpcError(null, -32600, "RPC request is too large.", 413);
  }

  let rpcRequest: unknown;
  try {
    rpcRequest = JSON.parse(body);
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON-RPC payload.", 400);
  }

  if (!isJsonRpcRequest(rpcRequest)) {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request.", 400);
  }
  if (!allowedMethods.has(rpcRequest.method)) {
    return jsonRpcError(
      rpcRequest.id,
      -32601,
      "This RPC method is not available through MergePay.",
      403,
    );
  }
  if (
    rpcRequest.method === "requestAirdrop" &&
    !isAllowedAirdrop(rpcRequest.params)
  ) {
    return jsonRpcError(
      rpcRequest.id,
      -32602,
      "DevNet faucet requests are limited to 1 RLO.",
      400,
    );
  }

  const upstreamUrl =
    process.env.RIALO_RPC_UPSTREAM_URL?.trim() || DEFAULT_RIALO_DEVNET_RPC;
  if (!upstreamUrl.startsWith("https://")) {
    return jsonRpcError(
      rpcRequest.id,
      -32098,
      "The Rialo RPC relay is not configured safely.",
      500,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return jsonRpcError(
        rpcRequest.id,
        -32098,
        "The Rialo RPC relay refused an upstream redirect.",
        502,
      );
    }
    const responseBody = await upstream.text();

    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return jsonRpcError(
      rpcRequest.id,
      -32098,
      "MergePay could not reach the Rialo DevNet RPC.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
