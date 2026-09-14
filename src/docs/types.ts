/**
 * Declarative documentation for a single MCP tool.
 *
 * Tool descriptions are authored here rather than inherited from the generated
 * OpenAPI schemas: `orval.config.ts` pulls from a live spec URL, so upstream
 * description edits would otherwise change our tool text between builds with no
 * diff in this repo. See `.specs/features/agent-efficiency-improvements/`.
 *
 * Authoring one? READ THE ENDPOINT'S JSDoc in `src/generated/carbon-voice-api.ts`
 * first, and the cv-api handler behind it if the semantics are load-bearing.
 * Writing what a tool *sounds like* it does is how `list_my_action_items` came
 * to claim "assigned to you" when the endpoint actually returns items assigned
 * to you OR unassigned ones you created — a wrong answer to "what do I owe?".
 * The integration suite checks that every documented example is callable, but
 * nothing can check prose against behaviour except reading the contract.
 *
 * And keep a doc consistent with ITSELF. `recommendedFields` is a projection an
 * agent will actually apply, so any field the prose tells it to inspect has to
 * survive that projection — `list_my_action_items` told the agent to check
 * `assigned_to` while recommending a projection that stripped it, which makes
 * the tool's own instruction impossible to follow.
 */

/** An ID this tool requires that another tool produces. */
export interface ToolPrerequisite {
  /** Param on this tool that needs the value, e.g. `prompt_id`. */
  field: string;
  /** Tool that produces it, e.g. `list_ai_actions`. */
  fromTool: string;
  /** Field on that tool's response holding the value, e.g. `id`. */
  fromField: string;
  /**
   * Condition under which THIS source is the right one, e.g.
   * '`container_type` is `folder`'. Set it whenever another parameter selects
   * between sources: `list_action_items` takes a conversation id or a folder
   * id depending on `container_type`, and stating one source unconditionally
   * sends an agent to the wrong tool for the other. Omit when the source is
   * unconditional, which is the usual case.
   */
  when?: string;
}

/** A likely error and the single next step that resolves it. */
export interface ToolErrorHint {
  /** Error code as emitted by `handleAxiosError`, e.g. `BAD_REQUEST`. */
  code: string;
  /** What the error means in this tool's terms. */
  meaning: string;
  /** Concrete recovery step, naming a tool where one applies. */
  nextAction: string;
}

export interface ToolDoc {
  /** One line: what the tool does. */
  purpose: string;
  /** When an agent should reach for this tool. */
  whenToUse: string;
  /**
   * When an agent should reach for something else instead. Must name the
   * counterpart tool. Required for every tool that overlaps another.
   */
  whenNotToUse?: string;
  /** IDs this tool needs that other tools produce. */
  prerequisites?: ToolPrerequisite[];
  /** A valid argument object. Rendered as JSON, so keep it small. */
  example: Record<string, unknown>;
  /** Compact sketch of the response shape — not a full schema. */
  responseShape: string;
  /**
   * Suggested `response_fields` projection for the common case, so agents
   * narrow the payload on the first call rather than discovering it later.
   */
  recommendedFields?: string[];
  /** Likely failures and their one-step recoveries. */
  commonErrors?: ToolErrorHint[];
}

export type ToolDocRegistry = Record<string, ToolDoc>;
