"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { routes } from "@/lib/constants";
import { isWorkflowSlug } from "@/lib/validation";

export function WorkflowLookup() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = String(new FormData(event.currentTarget).get("slug") ?? "").trim();
    if (!isWorkflowSlug(slug)) {
      setError("Enter the exact 64-character hexadecimal workflow ID.");
      return;
    }
    router.push(routes.bounty(slug.toLowerCase()));
  }
  return (
    <form className="lookup" onSubmit={submit}>
      <label htmlFor="workflow-lookup">Workflow ID lookup</label>
      <div className="lookup__row">
        <input
          id="workflow-lookup"
          name="slug"
          autoComplete="off"
          inputMode="text"
          maxLength={64}
          onChange={() => {
            if (error) setError(null);
          }}
          placeholder="64-character workflow ID"
          spellCheck={false}
        />
        <button className="lookup__submit" type="submit">
          <span>Inspect record</span>
          <span aria-hidden="true" className="lookup__submit-mark">
            <Search className="ui-icon" size={14} strokeWidth={2} />
          </span>
        </button>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </form>
  );
}
