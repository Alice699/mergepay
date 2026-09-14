"use client";

import { useCallback, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/single-flight";

export type TransactionStatus = "idle" | "pending" | "success" | "error";
export type TransactionExecutor<TInput, TResult> = (
  input: TInput,
) => Promise<TResult>;

export interface TransactionState<TResult> {
  status: TransactionStatus;
  result: TResult | null;
  error: Error | null;
}

const initialState = {
  status: "idle",
  result: null,
  error: null,
} as const;

export function useTransaction<TInput, TResult>(
  executor: TransactionExecutor<TInput, TResult>,
) {
  const [state, setState] = useState<TransactionState<TResult>>(initialState);
  const activeExecution = useRef<Promise<TResult> | null>(null);

  const execute = useCallback(
    (input: TInput): Promise<TResult> => {
      return runSingleFlight(activeExecution, async () => {
        setState({ status: "pending", result: null, error: null });

        try {
          const result = await executor(input);
          setState({ status: "success", result, error: null });
          return result;
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          setState({ status: "error", result: null, error });
          throw error;
        }
      });
    },
    [executor],
  );

  const reset = useCallback(() => setState(initialState), []);

  return { ...state, execute, reset };
}
