export const webConfig = {
  network: process.env.NEXT_PUBLIC_RIALO_NETWORK ?? "devnet",
  rpcUrl: process.env.NEXT_PUBLIC_RIALO_RPC_URL || null,
  programId: process.env.NEXT_PUBLIC_MERGEPAY_PROGRAM_ID || null,
} as const;
