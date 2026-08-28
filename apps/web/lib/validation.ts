import { WORKFLOW_SLUG_HEX_LENGTH } from "./constants";

const workflowSlugPattern = new RegExp(
  `^[0-9a-fA-F]{${WORKFLOW_SLUG_HEX_LENGTH}}$`,
);

export function isWorkflowSlug(value: string): boolean {
  return workflowSlugPattern.test(value);
}

export function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
