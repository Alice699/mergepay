"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useWallet } from "@/hooks/use-wallet";
import { useNetwork } from "@/hooks/use-network";
import { MINIMUM_CREATE_BALANCE_KELVIN } from "@/lib/constants";
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

    if (wallet.balance.status !== "ready" || wallet.balance.kelvin === null) {
      throw new MergePayUiError(
        "The signer balance is not available yet. Refresh the wallet balance before creating a bounty.",
        "BALANCE_UNAVAILABLE",
      );
    }

    let liveBalance: bigint;
    try {
      liveBalance = await network.client.rpc.getBalance(wallet.address);
    } catch (cause) {
      throw new MergePayUiError(
        "The signer balance could not be refreshed from Rialo DevNet.",
        "BALANCE_UNAVAILABLE",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    if (liveBalance < MINIMUM_CREATE_BALANCE_KELVIN) {
      throw new MergePayUiError(
        "The signer needs enough RLO for workflow rent and transaction fees.",
        "INSUFFICIENT_FUNDS",
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
