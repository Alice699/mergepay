export interface SingleFlightRef<TResult> {
  current: Promise<TResult> | null;
}

/** Coalesces concurrent calls until the active operation settles. */
export function runSingleFlight<TResult>(
  active: SingleFlightRef<TResult>,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  if (active.current) return active.current;

  const execution = Promise.resolve().then(operation);
  active.current = execution;
  void execution.then(
    () => {
      if (active.current === execution) active.current = null;
    },
    () => {
      if (active.current === execution) active.current = null;
    },
  );
  return execution;
}
