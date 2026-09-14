"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WorkflowLoadStatus = "idle" | "loading" | "success" | "error";
export type WorkflowLoader<TWorkflow> = (
  slug: string,
) => Promise<TWorkflow | null>;
export type WorkflowSnapshotGuard<TWorkflow> = (
  previous: TWorkflow | null,
  incoming: TWorkflow,
) => boolean;

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
  acceptsSnapshot?: WorkflowSnapshotGuard<TWorkflow>,
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
  const lastVerified = useRef<{
    slug: string;
    workflow: TWorkflow;
    updatedAt: number;
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

        const verified = lastVerified.current;
        const verifiedForSlug = verified?.slug === slug ? verified : null;
        const snapshotError = workflow === null && verifiedForSlug
          ? new Error(
              "The latest Rialo read omitted a previously verified workflow account.",
            )
          : workflow !== null &&
              acceptsSnapshot &&
              !acceptsSnapshot(verifiedForSlug?.workflow ?? null, workflow)
            ? new Error(
                "The latest Rialo read returned an older or inconsistent workflow snapshot.",
              )
            : null;
        if (snapshotError) {
          setState(
            verifiedForSlug
              ? {
                  slug,
                  requestId,
                  status: "success",
                  workflow: verifiedForSlug.workflow,
                  error: snapshotError,
                  refreshing: false,
                  lastUpdatedAt: verifiedForSlug.updatedAt,
                }
              : {
                  slug,
                  requestId,
                  status: "error",
                  workflow: null,
                  error: snapshotError,
                  refreshing: false,
                  lastUpdatedAt: null,
                },
          );
          return false;
        }

        if (workflow === null) {
          setState({
            slug,
            requestId,
            status: "success",
            workflow: null,
            error: null,
            refreshing: false,
            lastUpdatedAt: Date.now(),
          });
          return false;
        }

        const updatedAt = Date.now();
        lastVerified.current = { slug, workflow, updatedAt };

        setState({
          slug,
          requestId,
          status: "success",
          workflow,
          error: null,
          refreshing: false,
          lastUpdatedAt: updatedAt,
        });
        return true;
      })
      .catch((cause: unknown) => {
        if (
          !mounted.current ||
          requestSequence.current !== requestId ||
          currentSlug.current !== slug ||
          currentLoader.current !== loader
        ) return false;

        const error = cause instanceof Error ? cause : new Error(String(cause));
        const verified = lastVerified.current;
        setState(
          verified?.slug === slug
            ? {
                slug,
                requestId,
                status: "success",
                workflow: verified.workflow,
                error,
                refreshing: false,
                lastUpdatedAt: verified.updatedAt,
              }
            : {
                slug,
                requestId,
                status: "error",
                workflow: null,
                error,
                refreshing: false,
                lastUpdatedAt: null,
              },
        );
        return false;
      })
      .finally(() => {
        if (activeRequest.current?.requestId === requestId) {
          activeRequest.current = null;
        }
      });

    activeRequest.current = { loader, promise, requestId, slug };
    return promise;
  }, [acceptsSnapshot, enabled, loader, slug]);

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
