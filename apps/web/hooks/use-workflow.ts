"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WorkflowLoadStatus = "idle" | "loading" | "success" | "error";
export type WorkflowLoader<TWorkflow> = (slug: string) => Promise<TWorkflow>;

export interface WorkflowLoadState<TWorkflow> {
  status: WorkflowLoadStatus;
  workflow: TWorkflow | null;
  error: Error | null;
  refreshing: boolean;
  lastUpdatedAt: number | null;
  refresh: () => Promise<boolean>;
}

interface InternalWorkflowLoadState<TWorkflow>
  extends Omit<WorkflowLoadState<TWorkflow>, "refresh"> {
  slug: string | null;
  requestId: number;
}

export function useWorkflow<TWorkflow>(
  slug: string | null,
  loader: WorkflowLoader<TWorkflow>,
  enabled = true,
): WorkflowLoadState<TWorkflow> {
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const currentSlug = useRef(slug);
  const currentLoader = useRef(loader);
  const activeRequest = useRef<{
    loader: WorkflowLoader<TWorkflow>;
    promise: Promise<boolean>;
    requestId: number;
    slug: string;
  } | null>(null);

  const [state, setState] = useState<InternalWorkflowLoadState<TWorkflow>>({
    slug: null,
    requestId: 0,
    status: "idle",
    workflow: null,
    error: null,
    refreshing: false,
    lastUpdatedAt: null,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    currentSlug.current = slug;
    currentLoader.current = loader;
  }, [loader, slug]);

  const refresh = useCallback((): Promise<boolean> => {
    if (!enabled || !slug) return Promise.resolve(false);

    const inFlight = activeRequest.current;
    if (inFlight?.slug === slug && inFlight.loader === loader) {
      return inFlight.promise;
    }

    // Polling, focus, and transaction confirmation can request the same
    // account at once. Share one in-flight read and only let the newest valid
    // request update state.
    const requestId = ++requestSequence.current;
    setState((current) => {
      const canPreserve = current.slug === slug && current.workflow !== null;
      return {
        slug,
        requestId,
        status: canPreserve ? "success" : "loading",
        workflow: canPreserve ? current.workflow : null,
        error: null,
        refreshing: canPreserve,
        lastUpdatedAt: canPreserve ? current.lastUpdatedAt : null,
      };
    });

    const promise = Promise.resolve()
      .then(() => loader(slug))
      .then((workflow) => {
        if (
          !mounted.current ||
          requestSequence.current !== requestId ||
          currentSlug.current !== slug ||
          currentLoader.current !== loader
        ) return false;

        setState({
          slug,
          requestId,
          status: "success",
          workflow,
          error: null,
          refreshing: false,
          lastUpdatedAt: Date.now(),
        });
        return workflow !== null;
      })
      .catch((cause: unknown) => {
        if (
          !mounted.current ||
          requestSequence.current !== requestId ||
          currentSlug.current !== slug ||
          currentLoader.current !== loader
        ) return false;

        const error = cause instanceof Error ? cause : new Error(String(cause));
        setState((current) => {
          if (
            current.slug === slug &&
            current.status === "success" &&
            current.workflow !== null
          ) {
            return {
              ...current,
              requestId,
              error,
              refreshing: false,
            };
          }
          return {
            slug,
            requestId,
            status: "error",
            workflow: null,
            error,
            refreshing: false,
            lastUpdatedAt: null,
          };
        });
        return false;
      })
      .finally(() => {
        if (activeRequest.current?.requestId === requestId) {
          activeRequest.current = null;
        }
      });

    activeRequest.current = { loader, promise, requestId, slug };
    return promise;
  }, [enabled, loader, slug]);

  useEffect(() => {
    if (!enabled || !slug) return;
    void refresh();
  }, [enabled, refresh, slug]);

  const emptyState = {
    status: "idle" as const,
    workflow: null,
    error: null,
    refreshing: false,
    lastUpdatedAt: null,
    refresh,
  };

  if (!slug) {
    return emptyState;
  }

  if (state.slug !== slug) {
    return {
      ...emptyState,
      status: enabled ? "loading" : "idle",
    };
  }

  return {
    status: state.status,
    workflow: state.workflow,
    error: state.error,
    refreshing: enabled ? state.refreshing : false,
    lastUpdatedAt: state.lastUpdatedAt,
    refresh,
  };
}
