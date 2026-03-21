"use client";

import { useEffect } from "react";
import { setUser } from "@/lib/error-reporting";

interface SentryUserContextProps {
  userId?: string | null;
  email?: string | null;
}

export function SentryUserContext({ userId, email }: SentryUserContextProps) {
  useEffect(() => {
    if (userId) {
      setUser({ id: userId, email: email ?? undefined });
    }
  }, [userId, email]);

  return null;
}
