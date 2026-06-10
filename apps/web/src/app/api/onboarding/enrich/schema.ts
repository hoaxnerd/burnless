import { z } from "zod";

/**
 * Accept a bare domain ('stripe.com') or a full URL, but reject garbage
 * ('asdf') BEFORE it reaches the paid AI enrich call (ONB-03). We validate the
 * host has at least one dot and a TLD-like trailing segment, THEN prepend
 * https:// so the agent always receives a fetchable URL.
 *
 * Lives outside route.ts because Next.js route modules may only export route
 * fields (POST/GET/...) — `export const enrichSchema` from route.ts fails the
 * production build's route-type validation.
 */
export const enrichSchema = z.object({
  websiteUrl: z
    .string()
    .min(1, "Website URL is required")
    .transform((url) => url.trim())
    .refine(
      (url) => {
        const withScheme =
          url.startsWith("http://") || url.startsWith("https://")
            ? url
            : `https://${url}`;
        try {
          const { hostname } = new URL(withScheme);
          // Require a dotted, TLD-like host ('stripe.com'); reject 'asdf',
          // 'localhost', and bare tokens with no dot.
          return /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(hostname);
        } catch {
          return false;
        }
      },
      { message: "Please provide a valid website URL" },
    )
    .transform((url) => {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `https://${url}`;
      }
      return url;
    }),
});
