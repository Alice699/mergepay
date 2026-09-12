"use client";

import { useEffect, useRef, useState } from "react";

export type WorkflowLoadStatus = "idle" | "loading" | "success" | "error";
export type WorkflowLoader<TWorkflow> = (slug: string) => Promise<TWorkflow>;

export interface WorkflowLoadState<TWorkflow> {
  status: WorkflowLoadStatus;
  workflow: TWorkflow | null;
  error: Error | null;
}

interface InternalWorkflowLoadState<TWorkflow>
  extends WorkflowLoadState<TWorkflow> {
  slug: string | null;
  refreshKey: number;
  requestId: number;
}

export function useWorkflow<TWorkflow>(
  slug: string | null,
  loader: WorkflowLoader<TWorkflow>,
  refreshKey = 0,
): WorkflowLoadState<TWorkflow> {
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const currentSlug = useRef(slug);
  const currentLoader = useRef(loader);

  const [state, setState] = useState<InternalWorkflowLoadState<TWorkflow>>({
    slug: null,
    refreshKey: 0,
    requestId: 0,
    status: "idle",
    workflow: null,
    error: null,
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
    if (!slug) return;

    // A polling tick can arrive before a slow RPC read settles. Keep useful
    // current-account responses while preventing older reads from replacing a
    // newer response that has already completed.
    const requestId = ++requestSequence.current;

    void loader(slug)
      .then((workflow) => {
        if (
          !mounted.current ||
          currentSlug.current !== slug ||
          currentLoader.current !== loader
        ) return;

        setState((current) =>
          current.requestId > requestId
            ? current
            : {
                slug,
                refreshKey,
                requestId,
                status: "success",
                workflow,
                error: null,
              },
        );
      })
      .catch((cause: unknown) => {
        if (
          !mounted.current ||
          currentSlug.current !== slug ||
          currentLoader.current !== loader
        ) return;

        const error = cause instanceof Error ? cause : new Error(String(cause));
        setState((current) => {
          if (current.requestId > requestId) return current;
          if (
            current.slug === slug &&
            current.status === "success" &&
            current.workflow !== null
          ) {
            return { ...current, refreshKey, requestId };
          }
          return {
            slug,
            refreshKey,
            requestId,
            status: "error",
            workflow: null,
            error,
          };
        });
      });
  }, [loader, refreshKey, slug]);

  if (!slug) {
    return { status: "idle", workflow: null, error: null };
  }

  if (state.slug !== slug) {
    return { status: "loading", workflow: null, error: null };
  }

  if (state.refreshKey !== refreshKey) {
    if (state.status === "success" && state.workflow !== null) {
      return { status: "success", workflow: state.workflow, error: null };
    }
    return { status: "loading", workflow: null, error: null };
  }

  return {
    status: state.status,
    workflow: state.workflow,
    error: state.error,
  };
}
