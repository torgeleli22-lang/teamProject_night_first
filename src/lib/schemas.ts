import * as z from "zod/v4";

export const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const QuestionTypeSchema = z.enum(["multiple_choice", "fill_blank", "predict_output", "short_answer", "trace"]);

export const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("fill_blank"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("predict_output"), text: z.string().max(1000) }),
  z.object({ type: z.literal("short_answer"), text: z.string().max(2000) }),
  z.object({ type: z.literal("trace"), values: z.array(z.string().max(200)).max(12) }),
]);
