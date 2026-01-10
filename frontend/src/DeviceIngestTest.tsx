import { useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";

type DeviceIngestBody = {
  device_id: string;
  secret: string;
  employee_id: string;
  event: "clockin" | "clockout";
  occurred_at: string;
  identifier?: string;
  payload?: unknown;
};

export default function DeviceIngestTest() {
  const [device_id, setDeviceId] = useState("");
  const [secret, setSecret] = useState("");
  const [employee_id, setEmployeeId] = useState("");
  const [event, setEvent] = useState<"clockin" | "clockout">("clockin");
  const [occurred_at, setOccurredAt] = useState(new Date().toISOString());
  const [identifier, setIdentifier] = useState("");
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const body: DeviceIngestBody = {
        device_id,
        secret,
        employee_id,
        event,
        occurred_at,
      };
      if (identifier) body.identifier = identifier;
      if (payload) {
        try {
          body.payload = JSON.parse(payload) as unknown;
        } catch {
          body.payload = { raw: payload };
        }
      }
      await api.post("/api/devices/ingest", body);
      setOk("Ingested");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-container">
      <h2>Device Ingest Test</h2>
      {error && <div className="error-message">{error}</div>}
      {ok && <div className="success-message">{ok}</div>}
      <form onSubmit={submit}>
        <div className="form-group"><label>Device ID</label><input value={device_id} onChange={e=>setDeviceId(e.target.value)} required/></div>
        <div className="form-group"><label>Secret</label><input value={secret} onChange={e=>setSecret(e.target.value)} required/></div>
        <div className="form-group"><label>Employee ID</label><input value={employee_id} onChange={e=>setEmployeeId(e.target.value)} required/></div>
        <div className="form-group"><label>Event</label><select value={event} onChange={e=>setEvent(e.target.value === 'clockout' ? 'clockout' : 'clockin')}><option value="clockin">clockin</option><option value="clockout">clockout</option></select></div>
        <div className="form-group"><label>Occurred At (ISO)</label><input value={occurred_at} onChange={e=>setOccurredAt(e.target.value)} required/></div>
        <div className="form-group"><label>Identifier</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)}/></div>
        <div className="form-group"><label>Payload (JSON)</label><textarea value={payload} onChange={e=>setPayload(e.target.value)} rows={4}/></div>
        <button className="submit-btn" type="submit" disabled={busy}>{busy?'Sending...':'Send'}</button>
      </form>
    </div>
  )
}
