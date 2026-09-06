"use client";

import { useEffect, useState } from "react";

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
}

export function useWorkflow<TWorkflow>(
  slug: string | null,
  loader: WorkflowLoader<TWorkflow>,
  refreshKey = 0,
): WorkflowLoadState<TWorkflow> {
  const [state, setState] = useState<InternalWorkflowLoadState<TWorkflow>>({
    slug: null,
    refreshKey: 0,
    status: "idle",
    workflow: null,
    error: null,
  });

  useEffect(() => {
    let active = true;

    if (!slug) {
      return () => {
        active = false;
      };
    }

    void loader(slug)
      .then((workflow) => {
        if (active) {
          setState({ slug, refreshKey, status: "success", workflow, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          setState({ slug, refreshKey, status: "error", workflow: null, error });
        }
      });

    return () => {
      active = false;
    };
  }, [loader, refreshKey, slug]);

  if (!slug) {
    return { status: "idle", workflow: null, error: null };
  }

  if (state.slug !== slug || state.refreshKey !== refreshKey) {
    return { status: "loading", workflow: null, error: null };
  }

  return {
    status: state.status,
    workflow: state.workflow,
    error: state.error,
  };
}
