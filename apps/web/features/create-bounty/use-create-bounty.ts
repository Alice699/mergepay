"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useWallet } from "@/hooks/use-wallet";
import { useNetwork } from "@/hooks/use-network";
import { MergePayUiError } from "@/lib/errors";
import type { CreateBountyFormValues } from "./schema";

export type CreateBountyExecutor = TransactionExecutor<
  CreateBountyFormValues,
  CreateBountyResult
>;

export interface CreateBountyResult {
  signature: string;
  workflowAddress: string;
  workflowSlug: string;
}

export function useCreateBounty() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: CreateBountyExecutor = async (values) => {
    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect a Rialo wallet before creating a bounty.",
        "WALLET_DISCONNECTED",
      );
    }

    const instruction = network.client.buildCreateBounty({
      payer: wallet.address,
      workflowSlug: values.workflowSlug,
      beneficiary: values.beneficiary,
      githubOwner: values.githubOwner,
      githubRepo: values.githubRepo,
      pullNumber: BigInt(values.pullNumber),
      amountKelvin: BigInt(values.amountKelvin),
      deadlineUnixMs: BigInt(values.deadlineUnixMs),
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Create bounty",
      summary: `Create a workflow for ${values.githubOwner}/${values.githubRepo} pull request #${values.pullNumber}.`,
      amountKelvin: values.amountKelvin,
      workflowAddress: instruction.workflowPda,
    });

    return {
      signature: confirmation.signature,
      workflowAddress: instruction.workflowPda,
      workflowSlug: values.workflowSlug,
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
