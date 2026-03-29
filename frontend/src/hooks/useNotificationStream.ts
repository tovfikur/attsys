import { useEffect, useRef } from "react";

export type NotificationCounts = {
  messenger_unread?: number;
  leaves_pending?: number;
  geo_breaches?: number;
};

type Props = {
  token: string | null;
  tenantHint: string | null;
  enabled: boolean;
  onCounts: (counts: NotificationCounts) => void;
};

/**
 * Opens a Server-Sent Events connection to /api/events.
 * The backend streams badge counts every ~20 seconds.
 * The browser auto-reconnects on disconnect.
 *
 * SSE does not support custom headers, so the JWT token and tenant
 * are passed as query parameters (the backend reads them via $_GET).
 */
export function useNotificationStream({
  token,
  tenantHint,
  enabled,
  onCounts,
}: Props): void {
  const onCountsRef = useRef(onCounts);
  useEffect(() => {
    onCountsRef.current = onCounts;
  }, [onCounts]);

  useEffect(() => {
    if (!enabled || !token) return;

    const params = new URLSearchParams();
    params.set("token", token);
    if (tenantHint) params.set("tenant", tenantHint);

    const url = `/api/events?${params.toString()}`;
    const es = new EventSource(url);

    es.addEventListener("counts", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as NotificationCounts;
        onCountsRef.current(data);
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do here.
      // The browser will retry with exponential backoff.
    };

    return () => {
      es.close();
    };
  }, [enabled, token, tenantHint]);
}
