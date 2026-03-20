"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

interface SentryUserContextProps {
  userId?: string | null;
  email?: string | null;
}

export function SentryUserContext({ userId, email }: SentryUserContextProps) {
  useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId, email: email ?? undefined });
    }
    return () => {
      Sentry.setUser(null);
    };
  }, [userId, email]);

  return null;
}
