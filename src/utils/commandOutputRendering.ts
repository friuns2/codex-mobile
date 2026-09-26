export function resolveCommandOutputText(
  isExpanded: boolean,
  aggregatedOutput: string | null | undefined,
): string | null {
  if (!isExpanded) return null
  return aggregatedOutput || '(no output)'
}
