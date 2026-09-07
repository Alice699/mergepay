"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { MergePayUiError } from "@/lib/errors";

const REX_POLL_INTERVAL_MS = 1_500;
const REX_POLL_ATTEMPTS = 24;

export type CheckMergeOutcome =
  | "paid"
  | "no-payout"
  | "callback-failed"
  | "pending";

export interface CheckMergeInput {
  workflowSlug: string;
  sponsor: string;
}

export interface CheckMergeResult {
  signature: string;
  callbackSignature: string | null;
  workflowAddress: string;
  checksBefore: bigint;
  outcome: CheckMergeOutcome;
}

export type CheckMergeExecutor = TransactionExecutor<
  CheckMergeInput,
  CheckMergeResult
>;

function pause(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

export function useCheckMerge() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: CheckMergeExecutor = async ({ workflowSlug, sponsor }) => {
    wallet.resetTransaction();

    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect the sponsor wallet before requesting a merge check.",
        "WALLET_DISCONNECTED",
      );
    }
    if (wallet.address !== sponsor) {
      throw new MergePayUiError(
        "Only the wallet that created this workflow can request its merge check.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo DevNet must be reachable before requesting a merge check.",
        "RPC_UNAVAILABLE",
      );
    }

    const workflow = await network.client.getWorkflow(wallet.address, workflowSlug);
    if (!workflow) {
      throw new MergePayUiError(
        "Rialo did not return this workflow account. Refresh the record and try again.",
        "WORKFLOW_NOT_FOUND",
      );
    }
    if (workflow.state.sponsor !== wallet.address) {
      throw new MergePayUiError(
        "The active wallet does not match the sponsor stored on-chain.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (!workflow.state.funded) {
      throw new MergePayUiError(
        "Fund this workflow before requesting GitHub merge proof.",
        "WORKFLOW_NOT_FUNDED",
      );
    }
    if (workflow.state.paid || workflow.state.mergeConfirmed) {
      throw new MergePayUiError(
        "This bounty has already been paid from a confirmed merge proof.",
        "WORKFLOW_ALREADY_PAID",
      );
    }
    if (workflow.state.refunded) {
      throw new MergePayUiError(
        "This bounty was refunded and can no longer request a merge check.",
        "WORKFLOW_REFUNDED",
      );
    }
    if (workflow.state.deadlineUnixMs <= BigInt(Date.now())) {
      throw new MergePayUiError(
        "This bounty deadline has passed. The remaining sponsor action is a refund.",
        "WORKFLOW_EXPIRED",
      );
    }

    // The first state field is Venus' next async branch. It also advances for
    // native timers, so the GitHub check branch cannot be reconstructed from
    // the user-facing check counter alone.
    if (workflow.state.nextBranchNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new MergePayUiError(
        "This workflow has more async branches than the client can address safely.",
        "WORKFLOW_CHECK_LIMIT",
      );
    }
    const branchNumber = Number(workflow.state.nextBranchNumber);

    const instruction = network.client.buildCheckMerge({
      payer: wallet.address,
      workflowSlug,
      branchNumber,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Check pull request merge",
      summary:
        "Ask Rialo REX to verify " +
        workflow.state.githubOwner +
        "/" +
        workflow.state.githubRepo +
        " pull request #" +
        workflow.state.pullNumber.toString() +
        ". A unanimous merged report releases the escrow.",
      amountKelvin: workflow.state.amountKelvin.toString(),
      workflowAddress: instruction.workflowPda,
    });

    let callbackSignature: string | null = null;

    for (let attempt = 0; attempt < REX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const refreshed = await network.client.getWorkflow(
          wallet.address,
          workflowSlug,
        );
        if (refreshed?.state.mergeConfirmed && refreshed.state.paid) {
          return {
            signature: confirmation.signature,
            callbackSignature,
            workflowAddress: instruction.workflowPda,
            checksBefore: workflow.state.checks,
            outcome: "paid",
          };
        }
      } catch {
        // A temporary account-read failure must not erase a confirmed check.
      }

      try {
        const lineage = await network.client.getWorkflowLineage(
          confirmation.signature,
        );
        const callback = lineage.lineage.workflowNodes.find(
          (node) =>
            node.id !== confirmation.signature &&
            node.data.instructionProgramIds.includes(network.client.programId),
        );

        if (callback) {
          callbackSignature = callback.id;
          if (!callback.data.success) {
            return {
              signature: confirmation.signature,
              callbackSignature,
              workflowAddress: instruction.workflowPda,
              checksBefore: workflow.state.checks,
              outcome: "callback-failed",
            };
          }

          const finalWorkflow = await network.client.getWorkflow(
            wallet.address,
            workflowSlug,
          );
          return {
            signature: confirmation.signature,
            callbackSignature,
            workflowAddress: instruction.workflowPda,
            checksBefore: workflow.state.checks,
            outcome:
              finalWorkflow?.state.mergeConfirmed && finalWorkflow.state.paid
                ? "paid"
                : "no-payout",
          };
        }
      } catch {
        // Lineage can lag behind root confirmation while REX is still working.
      }

      if (attempt < REX_POLL_ATTEMPTS - 1) {
        await pause(REX_POLL_INTERVAL_MS);
      }
    }

    return {
      signature: confirmation.signature,
      callbackSignature,
      workflowAddress: instruction.workflowPda,
      checksBefore: workflow.state.checks,
      outcome: "pending",
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
