import type { Page, Route } from "@playwright/test";
import {
  BincodeWriter,
  MERGEPAY_PROGRAM_ID,
  PublicKey,
  buildFundInstruction,
  deriveWorkflowPda,
} from "@mergepay/rialo-client";

export const MOCK_WALLET_ADDRESS =
  "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
export const MOCK_WALLET_NAME = "MergePay E2E Wallet";

const BENEFICIARY_ADDRESS =
  "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PAGE_TRANSITION_DELAY_MS = 350;

type RpcScenario = "empty" | "activity" | "settlements";

interface JsonRpcRequest {
  id?: string | number | null;
  method: string;
  params?: Array<Record<string, unknown>>;
}

interface SignatureRecord {
  signature: string;
  blockHeight: string;
  blockTime: string;
  err: null;
}

interface SettlementRecord {
  account: Record<string, unknown>;
  signature: SignatureRecord;
  transaction: Record<string, unknown>;
  workflowAddress: string;
}

export interface RpcMockController {
  failNextSignatureRead: () => void;
}

export async function installMockWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ address, walletName }) => {
      const account = Object.freeze({
        address,
        publicKey: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
        chains: ["rialo:devnet"] as const,
        features: ["rialo:signTransaction"] as const,
        label: "E2E DevNet account",
      });
      let accounts: readonly (typeof account)[] = [account];
      const changeListeners = new Set<
        (change: { accounts: readonly (typeof account)[] }) => void
      >();

      const wallet = {
        version: "1.0.0" as const,
        name: walletName,
        icon:
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" as const,
        chains: ["rialo:devnet"] as const,
        get accounts() {
          return accounts;
        },
        features: {
          "standard:connect": {
            version: "1.0.0" as const,
            connect: async () => ({ accounts }),
          },
          "standard:disconnect": {
            version: "1.0.0" as const,
            disconnect: async () => {
              accounts = [];
              for (const listener of changeListeners) listener({ accounts });
            },
          },
          "standard:events": {
            version: "1.0.0" as const,
            on: (
              _event: string,
              listener: (change: {
                accounts: readonly (typeof account)[];
              }) => void,
            ) => {
              changeListeners.add(listener);
              return () => changeListeners.delete(listener);
            },
          },
          "rialo:signTransaction": {
            version: "1.0.0" as const,
            signTransaction: async (
              ...inputs: Array<{ transaction: Uint8Array }>
            ) =>
              inputs.map((input) => ({
                signedTransaction: input.transaction,
              })),
          },
        },
      };

      window.addEventListener("wallet-standard:app-ready", (event) => {
        const readyEvent = event as Event & {
          detail: { register: (candidate: typeof wallet) => unknown };
        };
        readyEvent.detail.register(wallet);
      });

      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: (api: { register: (candidate: typeof wallet) => unknown }) =>
            api.register(wallet),
        }),
      );
    },
    { address: MOCK_WALLET_ADDRESS, walletName: MOCK_WALLET_NAME },
  );
}

export async function connectMockWallet(page: Page): Promise<void> {
  const walletButton = page.locator(".wallet-button");
  await walletButton.waitFor({ state: "visible" });
  await walletButton.click();

  const walletOption = page
    .locator(".wallet-option")
    .filter({ hasText: MOCK_WALLET_NAME });
  await walletOption.waitFor({ state: "visible" });
  await walletOption.click();

  await page
    .getByRole("button", { name: /^Active wallet / })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close wallet" }).click();
}

export async function installRialoRpcMock(
  page: Page,
  scenario: RpcScenario,
): Promise<RpcMockController> {
  const activityFirstPage = Array.from({ length: 9 }, (_, index) =>
    createSignatureRecord(index + 1, 900 - index),
  );
  const activitySecondPage = Array.from({ length: 2 }, (_, index) =>
    createSignatureRecord(index + 30, 800 - index),
  );
  const settlementRecords = createSettlementRecords();
  const transactionsBySignature = new Map(
    settlementRecords.map((record) => [
      record.signature.signature,
      record.transaction,
    ]),
  );
  const accountsByAddress = new Map(
    settlementRecords.map((record) => [record.workflowAddress, record.account]),
  );
  let failNextSignatureRead = false;

  await page.route("**/api/rialo", async (route) => {
    const request = route.request().postDataJSON() as JsonRpcRequest;
    const firstParam = request.params?.[0] ?? {};

    if (request.method === "getHealth") {
      await fulfillResult(route, request, "ok");
      return;
    }

    if (request.method === "getBalance") {
      await fulfillResult(route, request, { value: "7837706240" });
      return;
    }

    if (request.method === "getSignaturesForAddress") {
      if (failNextSignatureRead) {
        failNextSignatureRead = false;
        await route.fulfill({
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: {
              code: -32098,
              message: "The deterministic E2E RPC interrupted this refresh.",
            },
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      const config = asRecord(firstParam.config);
      const before = typeof config.before === "string" ? config.before : null;
      let signatures: SignatureRecord[] = [];

      if (scenario === "activity") {
        signatures = before ? activitySecondPage : activityFirstPage;
      } else if (scenario === "settlements") {
        signatures = before
          ? settlementRecords.slice(6).map((record) => record.signature)
          : settlementRecords.map((record) => record.signature);
      }

      if (before) await delay(PAGE_TRANSITION_DELAY_MS);
      await fulfillResult(route, request, {
        context: { slot: "1200" },
        value: signatures,
      });
      return;
    }

    if (request.method === "getTransaction") {
      const signature =
        typeof firstParam.signature === "string" ? firstParam.signature : "";
      await fulfillResult(
        route,
        request,
        scenario === "settlements"
          ? transactionsBySignature.get(signature) ?? null
          : null,
      );
      return;
    }

    if (request.method === "getAccountInfo") {
      const address =
        typeof firstParam.address === "string" ? firstParam.address : "";
      await fulfillResult(route, request, {
        value: accountsByAddress.get(address) ?? null,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32601, message: `Unexpected E2E RPC method: ${request.method}` },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  return {
    failNextSignatureRead: () => {
      failNextSignatureRead = true;
    },
  };
}

function createSettlementRecords(): SettlementRecord[] {
  return Array.from({ length: 7 }, (_, index) => {
    const slug = (index + 1).toString(16).padStart(64, "0");
    const workflowAddress = deriveWorkflowPda(
      MERGEPAY_PROGRAM_ID,
      MOCK_WALLET_ADDRESS,
      slug,
    ).address;
    const signature = createSignatureRecord(index + 50, 700 - index);
    const instruction = buildFundInstruction({
      payer: MOCK_WALLET_ADDRESS,
      programId: MERGEPAY_PROGRAM_ID,
      workflowSlug: slug,
    });
    const writer = new BincodeWriter();
    writer
      .writeU64(1n)
      .writeFixedArray(PublicKey.fromString(MOCK_WALLET_ADDRESS).toBytes(), 32)
      .writeFixedArray(PublicKey.fromString(BENEFICIARY_ADDRESS).toBytes(), 32)
      .writeString("Alice699")
      .writeString(`mergepay-e2e-${index + 1}`)
      .writeU64(BigInt(101 + index))
      .writeU64(BigInt(1_000_000_000 + index * 100_000_000))
      .writeU64(1_900_000_000_000n)
      .writeBool(true)
      .writeBool(true)
      .writeBool(true)
      .writeBool(false)
      .writeU64(2n)
      .writeBool(false)
      .writeFixedArray(new Uint8Array(32), 32)
      .writeString("")
      .writeU64(0n);
    const accountBytes = writer.toBytes();

    return {
      workflowAddress,
      signature,
      account: {
        kelvin: "2500000",
        owner: MERGEPAY_PROGRAM_ID,
        data: [Buffer.from(accountBytes).toString("base64"), "base64"],
        executable: false,
        rentEpoch: "0",
        space: String(accountBytes.length),
      },
      transaction: {
        blockHeight: signature.blockHeight,
        blockTime: signature.blockTime,
        transaction: {
          signatures: [signature.signature],
          validFrom: "1787941000000",
          message: {
            accountKeys: [
              MOCK_WALLET_ADDRESS,
              workflowAddress,
              MERGEPAY_PROGRAM_ID,
            ],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: Buffer.from(instruction.data).toString("base64"),
              },
            ],
          },
        },
        meta: { err: null, fee: "100" },
      },
    };
  });
}

function createSignatureRecord(seed: number, height: number): SignatureRecord {
  const first = BASE58_ALPHABET[seed % BASE58_ALPHABET.length] ?? "A";
  const fill = BASE58_ALPHABET[(seed + 17) % BASE58_ALPHABET.length] ?? "B";
  return {
    signature: `E2E${first}`.padEnd(88, fill),
    blockHeight: String(height),
    blockTime: String(1_787_941_100 - seed),
    err: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

async function fulfillResult(
  route: Route,
  request: JsonRpcRequest,
  result: unknown,
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result,
    }),
    contentType: "application/json",
    status: 200,
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
