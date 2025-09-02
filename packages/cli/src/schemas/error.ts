import { z } from "@hono/zod-openapi";

export const ErrorSchema: z.ZodObject<{
  code: z.ZodNumber;
  message: z.ZodString;
}> = z.object({
  code: z.number().openapi({
    example: 400,
  }),
  message: z.string().openapi({
    example: "Bad Request",
  }),
});
