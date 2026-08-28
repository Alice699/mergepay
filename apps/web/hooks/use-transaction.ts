"use client";

import { useCallback, useState } from "react";

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

  const execute = useCallback(
    async (input: TInput): Promise<TResult> => {
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
    },
    [executor],
  );

  const reset = useCallback(() => setState(initialState), []);

  return { ...state, execute, reset };
}
