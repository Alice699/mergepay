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
}

export function useWorkflow<TWorkflow>(
  slug: string | null,
  loader: WorkflowLoader<TWorkflow>,
): WorkflowLoadState<TWorkflow> {
  const [state, setState] = useState<InternalWorkflowLoadState<TWorkflow>>({
    slug: null,
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
          setState({ slug, status: "success", workflow, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          setState({ slug, status: "error", workflow: null, error });
        }
      });

    return () => {
      active = false;
    };
  }, [loader, slug]);

  if (!slug) {
    return { status: "idle", workflow: null, error: null };
  }

  if (state.slug !== slug) {
    return { status: "loading", workflow: null, error: null };
  }

  return {
    status: state.status,
    workflow: state.workflow,
    error: state.error,
  };
}
