import { WORKFLOW_SLUG_HEX_LENGTH } from "./constants";

const workflowSlugPattern = new RegExp(
  `^[0-9a-fA-F]{${WORKFLOW_SLUG_HEX_LENGTH}}$`,
);

export function isWorkflowSlug(value: string): boolean {
  return workflowSlugPattern.test(value);
}

export function generateWorkflowSlug(): string {
  const bytes = new Uint8Array(WORKFLOW_SLUG_HEX_LENGTH / 2);
  globalThis.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
