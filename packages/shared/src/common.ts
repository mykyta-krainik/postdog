import { z } from "zod";

export const idSchema = z.number().int().positive();

export const timestampSchema = z.number().int().nonnegative();

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type IdParams = z.infer<typeof idParamsSchema>;
