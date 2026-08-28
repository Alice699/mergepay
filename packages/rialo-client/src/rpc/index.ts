import {
  AccountInfo as SdkAccountInfo,
  HttpTransport,
  type HttpTransportConfig,
  type RialoClient,
  Signature,
  createRialoClient,
  getDefaultRialoClientConfig,
} from "@rialo/ts-cdk";
import { decodeBase64, toPublicKey } from "../encoding.js";
import type { RialoNetwork, MergePayAccountInfo } from "../types.js";

export interface MergePaySignatureStatus {
  slot: bigint;
  executed: boolean;
  err?: string;
}

export interface MergePayTransactionInstruction {
  programIdIndex: number;
  accounts: number[];
  data: string;
}

export interface MergePayTransactionResponse {
  contextSlot?: bigint;
  blockHeight: bigint;
  blockTime?: bigint;
  transaction: {
    signatures: string[];
    validFrom: bigint;
    message: {
      accountKeys: string[];
      instructions: MergePayTransactionInstruction[];
    };
  };
  meta: {
    fee: bigint;
    err?: string;
    logMessages?: string[];
    computeUnitsConsumed?: bigint;
  };
}

export interface MergePayConfirmation {
  signature: string;
  executed: boolean;
  err?: string;
}

interface JsonRpcResponse {
  result?: unknown;
}

export class MergePayRpcClient {
  readonly client: RialoClient;
  private readonly rawTransport: HttpTransport;
  private requestId = 1;

  constructor(options: {
    network: RialoNetwork;
    rpcUrl?: string;
    transport?: HttpTransportConfig;
  }) {
    const baseConfig = getDefaultRialoClientConfig(options.network);
    const chain = options.rpcUrl
      ? { ...baseConfig.chain, rpcUrl: options.rpcUrl }
      : baseConfig.chain;
    this.client = options.transport
      ? createRialoClient({ chain, transport: options.transport })
      : createRialoClient({ chain });
    this.rawTransport = new HttpTransport(chain.rpcUrl, options.transport);
  }

  getUrl(): string {
    return this.client.getUrl();
  }

  async getAccountInfo(address: string): Promise<MergePayAccountInfo | null> {
    const info = (await this.client.getAccountInfo(
      toPublicKey(address, "account address"),
    )) as SdkAccountInfo | null;
    if (!info) return null;

    const encodedData = info.data[0];
    if (encodedData === undefined) {
      throw new Error(`account ${address} returned no data payload`);
    }
    const encoding = info.data[1];
    if (encoding !== undefined && encoding !== "base64") {
      throw new Error(`unsupported account encoding: ${encoding}`);
    }

    return {
      address,
      kelvin: info.kelvin,
      owner: info.owner.toString(),
      data: decodeBase64(encodedData),
      executable: info.executable,
      rentEpoch: info.rentEpoch,
      space: info.space,
    };
  }

  getBalance(address: string): Promise<bigint> {
    return this.client.getBalance(toPublicKey(address, "account address"));
  }

  getConfigHashPrefix(): Promise<bigint> {
    return this.client.getConfigHashPrefix();
  }

  getHealth(): Promise<string> {
    return this.client.getHealth();
  }

  async getSignatureStatuses(
    signatures: readonly string[],
  ): Promise<(MergePaySignatureStatus | null)[]> {
    const bytes = signatures.map((signature) =>
      Signature.fromString(signature).toBytes(),
    );
    const statuses = await this.client.getSignatureStatuses(bytes);
    return statuses.map((status) => {
      if (!status) return null;
      const normalized: MergePaySignatureStatus = {
        slot: status.slot,
        executed: status.executed,
      };
      if (status.err) normalized.err = status.err;
      return normalized;
    });
  }

  async getTransaction(
    signature: string,
  ): Promise<MergePayTransactionResponse | null> {
    const raw = await this.rawCall<unknown>("getTransaction", [
      { signature },
    ]);
    if (raw === null) return null;
    return parseTransactionResponse(raw);
  }

  async sendTransaction(
    transaction: Uint8Array,
    options?: Parameters<RialoClient["sendTransaction"]>[1],
  ): Promise<string> {
    const result = await this.client.sendTransaction(transaction, options);
    return normalizeSignature(result);
  }

  async confirmTransaction(
    signature: string,
    options?: Parameters<RialoClient["confirmTransaction"]>[1],
  ): Promise<MergePayConfirmation> {
    const result = await this.client.confirmTransaction(signature, options);
    return normalizeConfirmation(result, signature);
  }

  async sendAndConfirmTransaction(
    transaction: Uint8Array,
    options?: Parameters<RialoClient["sendAndConfirmTransaction"]>[1],
  ): Promise<MergePayConfirmation> {
    const result = await this.client.sendAndConfirmTransaction(transaction, options);
    return normalizeConfirmation(result);
  }

  private async rawCall<T>(method: string, params: unknown[]): Promise<T> {
    const response = (await this.rawTransport.request(
      JSON.stringify({
        jsonrpc: "2.0",
        id: this.requestId++,
        method,
        params,
      }),
    )) as JsonRpcResponse;
    return response.result as T;
  }
}

function normalizeSignature(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Signature.fromBytes(value).toString();
  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }
  throw new Error("Rialo RPC returned an invalid transaction signature");
}

function normalizeConfirmation(
  value: unknown,
  fallbackSignature?: string,
): MergePayConfirmation {
  const result = value as {
    signature?: unknown;
    executed?: unknown;
    err?: unknown;
  };
  const signature =
    typeof result.signature === "string"
      ? result.signature
      : fallbackSignature;
  if (!signature) throw new Error("Rialo confirmation returned no signature");
  const normalized: MergePayConfirmation = {
    signature,
    executed: result.executed === true,
  };
  if (typeof result.err === "string" && result.err.length > 0) {
    normalized.err = result.err;
  }
  return normalized;
}

function parseTransactionResponse(value: unknown): MergePayTransactionResponse {
  if (!isRecord(value)) throw new Error("Rialo returned an invalid transaction");
  const context = isRecord(value.context) ? value.context : undefined;
  const transaction = requireRecord(value.transaction, "transaction");
  const message = requireRecord(transaction.message, "transaction.message");
  const rawInstructions = readArray(
    message.instructions ?? message.instructions,
    "transaction.message.instructions",
  );
  const rawAccountKeys = readArray(
    message.accountKeys ?? message.account_keys,
    "transaction.message.accountKeys",
  );
  const signatures = readArray(transaction.signatures, "transaction.signatures").map(
    (signature) => requireString(signature, "transaction signature"),
  );

  const instructions = rawInstructions.map((rawInstruction) => {
    const instruction = requireRecord(rawInstruction, "compiled instruction");
    return {
      programIdIndex: requireNumber(
        instruction.programIdIndex ?? instruction.program_id_index,
        "programIdIndex",
      ),
      accounts: readArray(
        instruction.accounts ?? instruction.accountKeyIndexes ?? instruction.account_key_indexes,
        "instruction accounts",
      ).map((index) => requireNumber(index, "instruction account index")),
      data: requireString(instruction.data, "instruction data"),
    };
  });

  const meta = requireRecord(value.meta, "transaction meta");
  const normalizedMeta: MergePayTransactionResponse["meta"] = {
    fee: toBigInt(meta.fee, "transaction fee"),
  };
  if (meta.err !== null && meta.err !== undefined) {
    normalizedMeta.err =
      typeof meta.err === "string" ? meta.err : JSON.stringify(meta.err);
  }
  if (Array.isArray(meta.logMessages)) {
    normalizedMeta.logMessages = meta.logMessages.map((entry) =>
      requireString(entry, "transaction log message"),
    );
  }
  if (meta.computeUnitsConsumed !== undefined && meta.computeUnitsConsumed !== null) {
    normalizedMeta.computeUnitsConsumed = toBigInt(
      meta.computeUnitsConsumed,
      "compute units consumed",
    );
  }

  const normalized: MergePayTransactionResponse = {
    blockHeight: toBigInt(value.blockHeight ?? value.block_height, "block height"),
    transaction: {
      signatures,
      validFrom: toBigInt(
        transaction.validFrom ?? transaction.valid_from,
        "transaction validFrom",
      ),
      message: {
        accountKeys: rawAccountKeys.map((key) =>
          requireString(key, "transaction account key"),
        ),
        instructions,
      },
    },
    meta: normalizedMeta,
  };
  if (context?.slot !== undefined) normalized.contextSlot = toBigInt(context.slot, "context slot");
  const blockTime = value.blockTime ?? value.block_time;
  if (blockTime !== null && blockTime !== undefined) {
    normalized.blockTime = toBigInt(blockTime, "block time");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (!isRecord(value)) throw new Error(`Rialo response missing ${label}`);
  return value;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Rialo response missing ${label}`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Rialo response has invalid ${label}`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Rialo response has invalid ${label}`);
  }
  return value;
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(`Rialo response has invalid ${label}`);
}
