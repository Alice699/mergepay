import { Keypair, PublicKey } from "@rialo/ts-cdk";

export const EMBEDDED_WALLET_NAME = "MergePay DevNet Wallet";
export const EMBEDDED_WALLET_AUTO_LOCK_MS = 15 * 60 * 1_000;
export const EMBEDDED_WALLET_PASSWORD_MIN_LENGTH = 10;
export const EMBEDDED_WALLET_BACKUP_MAX_BYTES = 16 * 1_024;

const DATABASE_NAME = "mergepay-secure-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "wallets";
const VAULT_KEY = "rialo-devnet-v1";
const VAULT_SCHEMA = "mergepay.rialo.devnet-wallet";
const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SECRET_KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface EncryptedWalletVault {
  schema: typeof VAULT_SCHEMA;
  version: typeof VAULT_VERSION;
  network: "devnet";
  address: string;
  createdAt: string;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: typeof PBKDF2_ITERATIONS;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    iv: string;
    ciphertext: string;
  };
}

export class EmbeddedWalletError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddedWalletError";
    this.code = code;
  }
}

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new EmbeddedWalletError(
      "This browser cannot protect a local wallet with Web Crypto.",
      "EMBEDDED_WALLET_UNAVAILABLE",
    );
  }
  return globalThis.crypto;
}

function requireIndexedDb(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new EmbeddedWalletError(
      "This browser does not provide encrypted wallet storage.",
      "EMBEDDED_WALLET_STORAGE_UNAVAILABLE",
    );
  }
  return globalThis.indexedDB;
}

function validatePassword(password: string): void {
  if (
    password.length < EMBEDDED_WALLET_PASSWORD_MIN_LENGTH ||
    password.length > 256
  ) {
    throw new EmbeddedWalletError(
      `Use a wallet password between ${EMBEDDED_WALLET_PASSWORD_MIN_LENGTH} and 256 characters.`,
      "EMBEDDED_WALLET_WEAK_PASSWORD",
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string, label: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new EmbeddedWalletError(
      `The wallet backup contains invalid ${label}.`,
      "EMBEDDED_WALLET_INVALID_BACKUP",
    );
  }

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (cause) {
    throw new EmbeddedWalletError(
      `The wallet backup contains invalid ${label}.`,
      "EMBEDDED_WALLET_INVALID_BACKUP",
      { cause },
    );
  }
}

function additionalData(address: string): Uint8Array {
  return new TextEncoder().encode(
    `${VAULT_SCHEMA}:${VAULT_VERSION}:devnet:${address}`,
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveEncryptionKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const cryptoApi = requireCrypto();
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: toArrayBuffer(salt),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWalletSecret(
  secretKey: Uint8Array,
  address: string,
  password: string,
): Promise<EncryptedWalletVault> {
  validatePassword(password);
  if (secretKey.length !== SECRET_KEY_LENGTH) {
    throw new EmbeddedWalletError(
      "Rialo wallet secret must be exactly 32 bytes.",
      "EMBEDDED_WALLET_INVALID_SECRET",
    );
  }
  PublicKey.fromString(address);

  const cryptoApi = requireCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(password, salt);
  const ciphertext = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(additionalData(address)),
    },
    key,
    toArrayBuffer(secretKey),
  );

  return {
    schema: VAULT_SCHEMA,
    version: VAULT_VERSION,
    network: "devnet",
    address,
    createdAt: new Date().toISOString(),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  };
}

export async function decryptWalletSecret(
  vault: EncryptedWalletVault,
  password: string,
): Promise<Uint8Array> {
  validatePassword(password);
  validateWalletVault(vault);

  const salt = base64ToBytes(vault.kdf.salt, "salt");
  const iv = base64ToBytes(vault.cipher.iv, "initialization vector");
  const ciphertext = base64ToBytes(vault.cipher.ciphertext, "ciphertext");
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) {
    throw new EmbeddedWalletError(
      "The wallet backup uses an invalid encryption envelope.",
      "EMBEDDED_WALLET_INVALID_BACKUP",
    );
  }

  try {
    const key = await deriveEncryptionKey(password, salt);
    const plaintext = await requireCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(additionalData(vault.address)),
      },
      key,
      toArrayBuffer(ciphertext),
    );
    const secretKey = new Uint8Array(plaintext);
    if (secretKey.length !== SECRET_KEY_LENGTH) {
      secretKey.fill(0);
      throw new Error("invalid secret length");
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    const addressMatches = keypair.publicKey.toString() === vault.address;
    keypair.dispose();
    if (!addressMatches) {
      secretKey.fill(0);
      throw new Error("address mismatch");
    }
    return secretKey;
  } catch (cause) {
    if (cause instanceof EmbeddedWalletError) throw cause;
    throw new EmbeddedWalletError(
      "The wallet password is incorrect or the backup is damaged.",
      "EMBEDDED_WALLET_UNLOCK_FAILED",
      { cause },
    );
  }
}

export function serializeWalletBackup(vault: EncryptedWalletVault): string {
  validateWalletVault(vault);
  return `${JSON.stringify(vault, null, 2)}\n`;
}

export function parseWalletBackup(value: string): EncryptedWalletVault {
  if (new TextEncoder().encode(value).byteLength > EMBEDDED_WALLET_BACKUP_MAX_BYTES) {
    throw new EmbeddedWalletError(
      "The selected wallet backup is too large.",
      "EMBEDDED_WALLET_INVALID_BACKUP",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new EmbeddedWalletError(
      "The selected file is not a valid MergePay wallet backup.",
      "EMBEDDED_WALLET_INVALID_BACKUP",
      { cause },
    );
  }
  validateWalletVault(parsed);
  return parsed;
}

export function validateWalletVault(
  value: unknown,
): asserts value is EncryptedWalletVault {
  if (!isRecord(value)) throw invalidBackup();
  if (
    value.schema !== VAULT_SCHEMA ||
    value.version !== VAULT_VERSION ||
    value.network !== "devnet" ||
    typeof value.address !== "string" ||
    typeof value.createdAt !== "string" ||
    !isRecord(value.kdf) ||
    value.kdf.name !== "PBKDF2" ||
    value.kdf.hash !== "SHA-256" ||
    value.kdf.iterations !== PBKDF2_ITERATIONS ||
    typeof value.kdf.salt !== "string" ||
    !isRecord(value.cipher) ||
    value.cipher.name !== "AES-GCM" ||
    typeof value.cipher.iv !== "string" ||
    typeof value.cipher.ciphertext !== "string"
  ) {
    throw invalidBackup();
  }

  try {
    PublicKey.fromString(value.address);
    if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error();
  } catch (cause) {
    throw new EmbeddedWalletError(
      "The wallet backup metadata is invalid.",
      "EMBEDDED_WALLET_INVALID_BACKUP",
      { cause },
    );
  }
}

export async function readStoredWalletVault(): Promise<EncryptedWalletVault | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionComplete(transaction);
    const value = await requestResult(
      transaction.objectStore(STORE_NAME).get(VAULT_KEY),
    );
    await completed;
    if (value === undefined) return null;
    validateWalletVault(value);
    return value;
  } finally {
    database.close();
  }
}

export async function writeStoredWalletVault(
  vault: EncryptedWalletVault,
): Promise<void> {
  validateWalletVault(vault);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(vault, VAULT_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function deleteStoredWalletVault(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(VAULT_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Wallet storage failed"));
    request.onblocked = () => reject(new Error("Wallet storage upgrade was blocked"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Wallet storage failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Wallet storage aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Wallet storage failed"));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidBackup(): EmbeddedWalletError {
  return new EmbeddedWalletError(
    "The selected file is not a supported MergePay DevNet wallet backup.",
    "EMBEDDED_WALLET_INVALID_BACKUP",
  );
}
