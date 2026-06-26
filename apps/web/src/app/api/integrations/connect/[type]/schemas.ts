import { z } from "zod";

/** Pasted credential for a data integration. Lives in a sibling schemas.ts (NOT
 *  route.ts) because Next.js 16 only allows specific named exports from a route
 *  file — exporting a zod schema from route.ts breaks `next build`. */
export const connectSchema = z.object({ apiKey: z.string().min(8) });
