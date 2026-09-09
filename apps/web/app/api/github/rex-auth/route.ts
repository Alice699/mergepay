import {
  PublicKey,
  encryptForRex,
  getDefaultRialoClientConfig,
  toBase64,
  type RialoClient,
} from "@rialo/ts-cdk";
import { MergePayClient } from "@mergepay/rialo-client";
import { webConfig } from "@/lib/config";

const MAX_REQUEST_BYTES = 2_000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const WORKFLOW_SLUG = /^[0-9a-fA-F]{64}$/u;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isValidSponsor(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 64) {
    return false;
  }

  try {
    PublicKey.fromString(value);
    return true;
  } catch {
    return false;
  }
}

function packGithubRexEnvelope(
  urlCiphertext: Uint8Array,
  authCiphertext: Uint8Array,
): Uint8Array {
  const output = new Uint8Array(
    1 + 4 + urlCiphertext.length + 4 + authCiphertext.length,
  );
  const view = new DataView(output.buffer);
  output[0] = 2;
  view.setUint32(1, urlCiphertext.length, true);
  output.set(urlCiphertext, 5);
  const authLengthOffset = 5 + urlCiphertext.length;
  view.setUint32(authLengthOffset, authCiphertext.length, true);
  output.set(authCiphertext, authLengthOffset + 4);
  return output;
}

async function getSecretSharingPubkeyWithTimeout(
  rpc: RialoClient,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      rpc.getSecretSharingPubkey(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Rialo secret-sharing key request timed out")),
          UPSTREAM_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Create the encrypted GitHub REX envelope attached to the funding transaction.
 * The envelope contains DKG ciphertext for both the merge endpoint URL and the
 * Authorization header. The installation token never crosses this response
 * boundary; only ciphertext bound to the sponsor is returned.
 */
export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "The authorization request is too large." }, 413);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "The authorization request is too large." }, 413);
    }
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Invalid authorization request." }, 400);
  }

  const sponsor =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).sponsor
      : undefined;
  const workflowSlug =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).workflowSlug
      : undefined;
  if (!isValidSponsor(sponsor)) {
    return json({ error: "A valid sponsor wallet is required." }, 400);
  }
  if (typeof workflowSlug !== "string" || !WORKFLOW_SLUG.test(workflowSlug)) {
    return json({ error: "A valid workflow slug is required." }, 400);
  }

  const installationToken = process.env.GITHUB_APP_INSTALLATION_TOKEN?.trim();
  if (!installationToken || /\s/u.test(installationToken)) {
    return json(
      { error: "The GitHub App installation token is not configured." },
      503,
    );
  }

  const upstreamUrl =
    process.env.RIALO_RPC_UPSTREAM_URL?.trim() ||
    getDefaultRialoClientConfig(webConfig.network).chain.rpcUrl;
  if (!upstreamUrl.startsWith("https://")) {
    return json({ error: "The Rialo encryption service is not configured safely." }, 503);
  }

  try {
    const mergePayClient = new MergePayClient({
      network: webConfig.network,
      rpcUrl: upstreamUrl,
      ...(webConfig.programId ? { programId: webConfig.programId } : {}),
    });
    const workflow = await mergePayClient.getWorkflow(sponsor, workflowSlug);
    if (
      !workflow ||
      workflow.state.sponsor !== sponsor ||
      workflow.state.beneficiary === "11111111111111111111111111111111" ||
      workflow.state.funded ||
      workflow.state.paid ||
      workflow.state.refunded ||
      workflow.state.deadlineUnixMs <= BigInt(Date.now())
    ) {
      return json(
        { error: "This workflow is not eligible for authenticated funding." },
        409,
      );
    }

    const secretSharingPubkey = await getSecretSharingPubkeyWithTimeout(
      mergePayClient.rpc.client,
    );
    const plaintext = new TextEncoder().encode(`Bearer ${installationToken}`);
    const authCiphertext = encryptForRex(
      plaintext,
      PublicKey.fromString(sponsor).toBytes(),
      secretSharingPubkey,
    ).asBytes();
    const githubUrl =
      `https://api.github.com/repos/${workflow.state.githubOwner}/` +
      `${workflow.state.githubRepo}/pulls/${workflow.state.pullNumber}/merge`;
    const urlCiphertext = encryptForRex(
      new TextEncoder().encode(githubUrl),
      PublicKey.fromString(sponsor).toBytes(),
      secretSharingPubkey,
    ).asBytes();
    const ciphertext = packGithubRexEnvelope(urlCiphertext, authCiphertext);

    return json({ ciphertext: toBase64(ciphertext) });
  } catch {
    return json(
      { error: "Rialo could not prepare the encrypted GitHub App authorization." },
      502,
    );
  }
}
