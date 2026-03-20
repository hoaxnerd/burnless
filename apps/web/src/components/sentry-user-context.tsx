"use client";

import { useEffect } from "react";

interface SentryUserContextProps {
  userId?: string | null;
  email?: string | null;
}

export function SentryUserContext({ userId, email }: SentryUserContextProps) {
  useEffect(() => {
    import("@sentry/nextjs")
      .then((Sentry) => {
        if (userId) {
          Sentry.setUser({ id: userId, email: email ?? undefined });
        } else {
          Sentry.setUser(null);
        }
      })
      .catch(() => {});
    return () => {
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.setUser(null))
        .catch(() => {});
    };
  }, [userId, email]);

  return null;
}
