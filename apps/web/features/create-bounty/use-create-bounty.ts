"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import type { CreateBountyFormValues } from "./schema";

export type CreateBountyExecutor = TransactionExecutor<
  CreateBountyFormValues,
  string
>;

export function useCreateBounty(executor: CreateBountyExecutor) {
  return useTransaction(executor);
}
