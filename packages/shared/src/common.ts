import { z } from 'zod';

export const idSchema = z.number().int().positive();

export function distinctIdsSchema(min: number, max: number) {
  return z
    .array(idSchema)
    .min(min)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, 'Ids must be distinct');
}

export const timestampSchema = z.number().int().nonnegative();

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type IdParams = z.infer<typeof idParamsSchema>;
