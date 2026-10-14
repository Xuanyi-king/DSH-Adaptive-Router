/**
 * Host-only context state: the open turn plus the two before it. Plain JSON,
 * rebuilt from the log on demand. Manual picks are not counted here; they are
 * read from the harness's own `modelSelection` projection (see `pendingPick`).
 */
export const ContextSchema: zod.ZodObject<{
    current: zod.ZodNullable<zod.ZodObject<{
        provider: zod.ZodNullable<zod.ZodString>;
        model: zod.ZodNullable<zod.ZodString>;
        hasImages: zod.ZodBoolean;
        turn: zod.ZodNumber;
        userTexts: zod.ZodArray<zod.ZodString>;
        assistantTail: zod.ZodString;
        steps: zod.ZodNumber;
        toolCalls: zod.ZodNumber;
        openTodos: zod.ZodNumber;
        effort: zod.ZodNullable<zod.ZodString>;
        outcome: zod.ZodNullable<zod.ZodString>;
    }, zod.core.$strip>>;
    previous: zod.ZodNullable<zod.ZodObject<{
        provider: zod.ZodNullable<zod.ZodString>;
        model: zod.ZodNullable<zod.ZodString>;
        hasImages: zod.ZodBoolean;
        turn: zod.ZodNumber;
        userTexts: zod.ZodArray<zod.ZodString>;
        assistantTail: zod.ZodString;
        steps: zod.ZodNumber;
        toolCalls: zod.ZodNumber;
        openTodos: zod.ZodNumber;
        effort: zod.ZodNullable<zod.ZodString>;
        outcome: zod.ZodNullable<zod.ZodString>;
    }, zod.core.$strip>>;
    earlier: zod.ZodNullable<zod.ZodObject<{
        provider: zod.ZodNullable<zod.ZodString>;
        model: zod.ZodNullable<zod.ZodString>;
        hasImages: zod.ZodBoolean;
        turn: zod.ZodNumber;
        userTexts: zod.ZodArray<zod.ZodString>;
        assistantTail: zod.ZodString;
        steps: zod.ZodNumber;
        toolCalls: zod.ZodNumber;
        openTodos: zod.ZodNumber;
        effort: zod.ZodNullable<zod.ZodString>;
        outcome: zod.ZodNullable<zod.ZodString>;
    }, zod.core.$strip>>;
}, zod.core.$strip>;
import { z as zod } from "zod";
/** Initial context state: nothing seen yet. */
export function initContext(): {
    current: null;
    previous: null;
    earlier: null;
};
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
export function foldContext(state: any, event: any): any;
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
export function contextBlock(previous: any, earlier: any, title: any): string;
export function messageText(message: any): string;
