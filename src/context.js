/** Adapted from dsh-plugin-jev-effort-selector (MIT), Copyright (c) 2026 半格 / HalfBit.
 * Modifications: record provider/model and image history. See THIRD_PARTY_NOTICES.md. */
import { z as zod } from "zod";
const USER_TEXT_CHARS = 300,
  ASSISTANT_TAIL_CHARS = 500,
  USER_TEXTS_PER_TURN = 3;
const COMPLETED_KINDS = new Set(["completed"]);
const TurnSummarySchema = zod.object({
  provider: zod.string().nullable(),
  model: zod.string().nullable(),
  hasImages: zod.boolean(),
  turn: zod.number(),
  userTexts: zod.array(zod.string()),
  assistantTail: zod.string(),
  steps: zod.number(),
  toolCalls: zod.number(),
  openTodos: zod.number(),
  effort: zod.string().nullable(),
  outcome: zod.string().nullable(),
});

/**
 * Host-only context state: the open turn plus the two before it. Plain JSON,
 * rebuilt from the log on demand. Manual picks are not counted here; they are
 * read from the harness's own `modelSelection` projection (see `pendingPick`).
 */
export const ContextSchema = zod.object({
  current: TurnSummarySchema.nullable(),
  previous: TurnSummarySchema.nullable(),
  earlier: TurnSummarySchema.nullable(),
});
function messageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (block && block.type === "text" && typeof block.text === "string")
      text += block.text;
  }
  return text;
}

/** Last `n` characters of `text`, marked when something was cut. */
function tail(text, n) {
  return text.length <= n ? text : `…${text.slice(text.length - n)}`;
}

/** First `n` characters of `text`, marked when something was cut. */
function head(text, n) {
  return text.length <= n ? text : `${text.slice(0, n)}…`;
}

/**
 * An empty summary for turn `turn`. `effort` is inherited from the turn
 * before: the harness appends `request/header` only when the config CHANGES,
 * so a turn with no header event ran at the previous header's values, and
 * that is what "effort used" must report.
 *
 * `openTodos` is NOT inherited: the harness clears the todo list at every
 * `turn/start`, so a turn that writes none has none.
 * @param turn - turn number.
 * @param inherit - the turn this one follows, or null.
 */
function freshTurn(turn, inherit = null) {
  return {
    turn,
    userTexts: [],
    assistantTail: "",
    steps: 0,
    toolCalls: 0,
    openTodos: 0,
    effort: inherit?.effort ?? null,
    outcome: null,
    provider: inherit?.provider ?? null,
    model: inherit?.model ?? null,
    hasImages: inherit?.hasImages ?? false,
  };
}

/** Initial context state: nothing seen yet. */
function initContext() {
  return { current: null, previous: null, earlier: null };
}

/**
 * Fold one session event into the context state. Turn boundaries come from
 * `turn/start`: everything until the next one belongs to that turn. Only
 * messages the person typed (`source.kind === 'user'`) count as user text;
 * plugin-injected reminders share the event type but are not what Jev should
 * read as "the user said".
 *
 * Returns the same reference for events that change nothing, so downstream
 * change detection stays cheap.
 * @param state - previous context state.
 * @param event - one committed session event.
 * @returns the next state.
 */
function foldContext(state, event) {
  const data = event.data;
  switch (event.type) {
    case "turn/start": {
      const turn =
        typeof data?.turn === "number"
          ? data.turn
          : (state.current?.turn ?? 0) + 1;
      return {
        ...state,
        current: freshTurn(turn, state.current),
        previous: state.current,
        earlier: state.previous,
      };
    }
    case "turn/end": {
      if (state.current === null) return state;
      const kind = data?.reason?.kind;
      return {
        ...state,
        current: {
          ...state.current,
          outcome: typeof kind === "string" ? kind : "unknown",
        },
      };
    }
    case "user/message": {
      if (data?.source?.kind !== "user") return state;
      const text = messageText(data).trim();
      const image =
        Array.isArray(data.content) &&
        data.content.some((b) => b.type === "image" && !b.offloaded);
      if (text === "" && !image) return state;
      const current = state.current ?? freshTurn(0);
      const userTexts = [
        ...current.userTexts,
        head(text, USER_TEXT_CHARS),
      ].slice(-USER_TEXTS_PER_TURN);
      return {
        ...state,
        current: {
          ...current,
          userTexts,
          hasImages: current.hasImages || image,
        },
      };
    }
    case "assistant/message": {
      if (state.current === null) return state;
      const text = messageText(data?.message).trim();
      if (text === "") return state;
      return {
        ...state,
        current: {
          ...state.current,
          assistantTail: tail(text, ASSISTANT_TAIL_CHARS),
        },
      };
    }
    case "step/start": {
      if (state.current === null) return state;
      return {
        ...state,
        current: { ...state.current, steps: state.current.steps + 1 },
      };
    }
    case "tool/call": {
      if (state.current === null) return state;
      return {
        ...state,
        current: { ...state.current, toolCalls: state.current.toolCalls + 1 },
      };
    }
    case "todo/write": {
      // Each write replaces the whole list, so the last one of the turn is
      // what the turn left behind. Read it here, not from the harness's own
      // `todos` projection: that one is reset by the NEXT turn's `turn/start`,
      // which is committed before `agent/request` runs — at decision time it
      // is always empty.
      if (state.current === null) return state;
      const todos = Array.isArray(data?.todos) ? data.todos : [];
      const openTodos = todos.filter(
        (item) => item && item.status !== "completed",
      ).length;
      if (openTodos === state.current.openTodos) return state;
      return { ...state, current: { ...state.current, openTodos } };
    }
    case "request/header": {
      if (state.current === null) return state;
      const config = data?.header?.config;
      const effort =
        typeof config?.reasoningEffort === "string"
          ? config.reasoningEffort
          : null;
      return {
        ...state,
        current: {
          ...state.current,
          effort,
          provider: config?.provider ?? null,
          model: config?.model ?? null,
        },
      };
    }
    default:
      return state;
  }
}

/**
 * The context block Jev reads before the current message.
 *
 * It describes the previous turn in facts Jev can weigh — what was asked,
 * how the assistant left off, how much work happened, whether it finished —
 * rather than in instructions. A first turn has no previous turn and gets
 * only the topic.
 * @param previous - the previous turn, or null.
 * @param earlier - the turn before that, or null.
 * @param title - the session title, or undefined.
 * @returns the system-role text.
 */
function contextBlock(previous, earlier, title) {
  const lines = [
    "Context: an ongoing conversation with an AI coding assistant.",
  ];
  if (title) lines.push(`Session topic: ${title}`);
  if (previous !== null) {
    lines.push("Previous turn:");
    if (previous.model)
      lines.push(`- model used: ${previous.provider}/${previous.model}`);
    if (previous.effort)
      lines.push(`- reasoning effort used: ${previous.effort}`);
    const said = previous.userTexts;
    if (said.length > 0)
      lines.push(`- user said: ${JSON.stringify(said[said.length - 1])}`);
    const before =
      said.length > 1
        ? said[said.length - 2]
        : earlier?.userTexts[earlier.userTexts.length - 1];
    if (before)
      lines.push(`- earlier the user said: ${JSON.stringify(before)}`);
    if (previous.assistantTail)
      lines.push(
        `- assistant ended with: ${JSON.stringify(previous.assistantTail)}`,
      );
    lines.push(
      `- activity: ${previous.steps} steps, ${previous.toolCalls} tool calls`,
    );
    lines.push(
      `- previous turn outcome: ${previous.outcome !== null && COMPLETED_KINDS.has(previous.outcome) ? "completed" : "not completed"}`,
    );
    lines.push(`- unfinished todos: ${previous.openTodos}`);
  }
  return lines.join("\n");
}

export { initContext, foldContext, contextBlock, messageText };
