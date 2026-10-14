import type { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
import { Config } from "./config.js";
import { ContextSchema } from "./context.js";
export { Config };
export declare const name = "adaptive-router";
export declare const inject: string[];
type ContextState = z.infer<typeof ContextSchema>;
declare const StatusSchema: z.ZodObject<{
    tick: z.ZodNumber;
    actual: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        reasoningEffort: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
type Status = z.infer<typeof StatusSchema>;
declare module "@deepseek-ai/dsh-session-projection/types" {
    interface SessionProjectionStateMap {
        adaptiveRouterContext: ContextState;
        adaptiveRouter: Status;
    }
    interface SessionProjectionMap {
        adaptiveRouter: Status;
    }
}
export declare function apply(ctx: Context, config: object): void;
