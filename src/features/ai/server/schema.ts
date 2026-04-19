import { z } from "zod";

export const getQuickCaptureDraftSchema = z.object({
  text: z.string().trim().min(3).max(240),
});

