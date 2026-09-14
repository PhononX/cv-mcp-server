import { ToolDoc } from './types';

/**
 * Renders a `ToolDoc` into the description string passed to `registerTool`.
 *
 * Section order is deliberate. Tool *selection* guidance comes first
 * (purpose -> when to use -> when not to use -> prerequisites) because some MCP
 * clients truncate long descriptions, and an agent that picks the wrong tool
 * cannot recover from a well-documented response shape. Examples and shapes,
 * which only matter once the tool is already chosen, come last.
 *
 * Every description is paid in the `tools/list` payload on every request, so
 * this stays terse and structured rather than prose. See
 * `.specs/features/agent-efficiency-improvements/` for the budget.
 */
export const renderToolDoc = (doc: ToolDoc): string => {
  const lines: string[] = [doc.purpose.trim()];

  lines.push(`USE WHEN: ${doc.whenToUse.trim()}`);

  if (doc.whenNotToUse) {
    lines.push(`USE INSTEAD: ${doc.whenNotToUse.trim()}`);
  }

  doc.prerequisites?.forEach((p) => {
    const condition = p.when ? ` when ${p.when}` : '';
    lines.push(
      `FIRST: \`${p.field}\` comes from \`${p.fromTool}\` (field \`${p.fromField}\`)${condition} — call it first if you don't have one.`,
    );
  });

  lines.push(`EXAMPLE: ${JSON.stringify(doc.example)}`);
  lines.push(`RETURNS: ${doc.responseShape.trim()}`);

  if (doc.recommendedFields?.length) {
    lines.push(
      `NARROW: pass response_fields ${JSON.stringify(doc.recommendedFields)} unless you need more — the full payload is much larger.`,
    );
  }

  doc.commonErrors?.forEach((e) => {
    lines.push(`ERROR ${e.code}: ${e.meaning} — ${e.nextAction}`);
  });

  return lines.join('\n');
};
