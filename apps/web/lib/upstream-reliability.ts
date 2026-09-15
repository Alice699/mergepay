export interface RetryDecision {
  retry: boolean;
  delayMs?: number;
}

export interface BoundedRetryResult<T> {
  value: T;
  attempts: number;
  durationMs: number;
}

export interface BoundedRetryOptions<T> {
  operation: (context: {
    attempt: number;
    signal: AbortSignal;
  }) => Promise<T>;
  shouldRetry?: (value: T, attempt: number) => boolean | RetryDecision;
  shouldRetryError?: (
    error: unknown,
    context: { attempt: number; timedOut: boolean },
  ) => boolean;
  maxAttempts?: number;
  timeoutMs: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}

export class BoundedRetryError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly durationMs: number,
    readonly timedOut: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BoundedRetryError";
  }
}

export async function runWithBoundedRetry<T>(
  options: BoundedRetryOptions<T>,
): Promise<BoundedRetryResult<T>> {
  const startedAt = Date.now();
  const maxAttempts = Math.min(
    Math.max(Math.trunc(options.maxAttempts ?? 2), 1),
    4,
  );
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 200);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1_000);
  const sleep = options.sleep ?? waitForRetry;
  let latestTimedOut = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new BoundedRetryError(
        "The upstream request was cancelled.",
        Math.max(0, attempt - 1),
        Date.now() - startedAt,
        false,
        { cause: options.signal.reason },
      );
    }

    const controller = new AbortController();
    let attemptTimedOut = false;
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        attemptTimedOut = true;
        const timeoutError = new DOMException(
          "Upstream attempt timed out.",
          "AbortError",
        );
        controller.abort(timeoutError);
        reject(timeoutError);
      }, options.timeoutMs);
    });

    let retryDelayMs: number | null = null;
    try {
      const value = await Promise.race([
        options.operation({
          attempt,
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
      const rawDecision = options.shouldRetry?.(value, attempt) ?? false;
      const decision =
        typeof rawDecision === "boolean"
          ? { retry: rawDecision }
          : rawDecision;

      if (!decision.retry || attempt >= maxAttempts) {
        return {
          value,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
        };
      }
      retryDelayMs = boundedDelay(
        decision.delayMs ?? exponentialDelay(baseDelayMs, attempt),
        maxDelayMs,
      );
    } catch (cause) {
      latestTimedOut = attemptTimedOut || isAbortError(cause);
      const retryable =
        !options.signal?.aborted &&
        (options.shouldRetryError?.(cause, {
          attempt,
          timedOut: latestTimedOut,
        }) ?? true);
      if (!retryable || attempt >= maxAttempts) {
        throw new BoundedRetryError(
          latestTimedOut
            ? "The upstream service did not respond in time."
            : "The upstream service could not be reached.",
          attempt,
          Date.now() - startedAt,
          latestTimedOut,
          { cause },
        );
      }
      retryDelayMs = boundedDelay(
        exponentialDelay(baseDelayMs, attempt),
        maxDelayMs,
      );
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    }

    if (retryDelayMs !== null) {
      await sleep(retryDelayMs, options.signal);
    }
  }

  throw new BoundedRetryError(
    "The upstream retry policy ended without a result.",
    maxAttempts,
    Date.now() - startedAt,
    latestTimedOut,
  );
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : null;
}

export function retryAfterSeconds(delayMs: number | null): number | null {
  return delayMs === null ? null : Math.max(1, Math.ceil(delayMs / 1_000));
}

function exponentialDelay(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * 2 ** Math.max(0, attempt - 1);
}

function boundedDelay(delayMs: number, maxDelayMs: number): number {
  if (!Number.isFinite(delayMs)) return maxDelayMs;
  return Math.min(Math.max(0, Math.round(delayMs)), maxDelayMs);
}

function isAbortError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.name === "AbortError" || /aborted|timed out/i.test(cause.message))
  );
}

function waitForRetry(
  durationMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (durationMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("The upstream request was cancelled."));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, durationMs);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("The upstream request was cancelled."));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
