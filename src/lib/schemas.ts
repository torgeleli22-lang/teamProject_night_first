import * as z from "zod/v4";

export const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const QuestionTypeSchema = z.enum(["multiple_choice", "fill_blank", "shuffle", "predict_output", "find_bug", "short_answer"]);

export const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("fill_blank"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("shuffle"), order: z.array(z.number().int().min(0).max(50)).max(50) }),
  z.object({ type: z.literal("predict_output"), text: z.string().max(1000) }),
  z.object({ type: z.literal("find_bug"), line: z.number().int().min(1).max(200) }),
  z.object({ type: z.literal("short_answer"), text: z.string().max(2000) }),
]);
