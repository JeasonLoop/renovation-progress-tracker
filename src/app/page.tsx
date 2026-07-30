"use client";

import { RenovationApp } from "@/components/renovation-app";
import { getLocalSession, setLocalSession } from "@/lib/local-auth";
import { useEffect, useState } from "react";

export default function Home() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    if (isLocal) {
      const session = getLocalSession();
      if (!session) {
        window.location.replace("/login");
        return;
      }
      setReady(true);
      return;
    }

    let cancelled = false;
    void fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const session = await response.json() as { authenticated?: boolean; username?: string };
        if (!response.ok || !session.authenticated || !session.username) throw new Error("登录已失效");
        setLocalSession(session.username);
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) window.location.replace("/login");
      });
    return () => { cancelled = true; };
  }, []);

  if (!ready) return null;
  return <RenovationApp />;
}
