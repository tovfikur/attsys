import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";

interface Event {
  id: string;
  employee_id: string;
  event: string;
  occurred_at: string;
}

export default function DeviceEvents() {
  const params = new URLSearchParams(window.location.search);
  const device_id = params.get("device_id") || "";
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get(
        `/api/devices/events?device_id=${encodeURIComponent(device_id)}`
      );
      setEvents(r.data.events || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load"));
    }
  }, [device_id]);

  useEffect(() => {
    if (!device_id) return;
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [device_id, load]);

  if (!device_id) return <div style={{ padding: 16 }}>Missing device_id</div>;
  return (
    <div className="app-container">
      <h2>Device Events</h2>
      <p className="card-desc">Device: {device_id}</p>
      {error && <div className="error-message">{error}</div>}
      <div className="tenant-list-section">
        <div className="tenant-grid">
          {events.map((ev) => (
            <div key={ev.id} className="tenant-card">
              <h4>{ev.event}</h4>
              <div className="tenant-meta">
                <span className="subdomain">Emp #{ev.employee_id}</span>
                <span className="status active">
                  {new Date(ev.occurred_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="empty-state">No events yet.</p>}
        </div>
      </div>
    </div>
  );
}
