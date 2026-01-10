import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";

interface Device {
  id: string;
  device_id: string;
  status: string;
  type: string;
  site_name: string;
  created_at: string;
}

export default function Devices() {
  const raw = localStorage.getItem('user') || sessionStorage.getItem('user')
  const user = raw ? JSON.parse(raw) : null
  const [devices, setDevices] = useState<Device[]>([])
  const [siteName, setSiteName] = useState('HQ')
  const [type, setType] = useState('terminal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [creds, setCreds] = useState<{device_id:string, secret:string} | null>(null)

  const allowed = user && (user.role === 'tenant_owner' || user.role === 'hr_admin')

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/devices");
      setDevices(r.data.devices || []);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setCreds(null)
    try {
      const r = await api.post("/api/devices/register", {
        site_name: siteName,
        type,
      });
      setCreds(r.data);
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed"));
    } finally {
      setBusy(false);
    }
  }

  const toggle = async (device_id: string, status: string) => {
    try {
      await api.post("/api/devices/status", {
        device_id,
        status: status === "active" ? "disabled" : "active",
      });
      void load();
    } catch (err: unknown) {
      console.error(err);
    }
  }

  if (!allowed) return <div style={{padding:16}}>Not authorized</div>
  return (
    <div className="app-container">
      <h2>Devices</h2>
      <div className="card">
        <div className="card-header"><h3>Register Device</h3></div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={register}>
          <div className="form-group"><label>Site Name</label><input value={siteName} onChange={e=>setSiteName(e.target.value)} required/></div>
          <div className="form-group"><label>Type</label><input value={type} onChange={e=>setType(e.target.value)} required/></div>
          <button className="submit-btn" type="submit" disabled={busy}>{busy?'Registering...':'Register'}</button>
        </form>
        {creds && (
          <div className="success-message" style={{marginTop:8}}>
            Device ID: {creds.device_id} Secret: {creds.secret}
          </div>
        )}
      </div>
      <div className="tenant-list-section" style={{marginTop:16}}>
        <h3>Registered Devices</h3>
        <div className="tenant-grid">
          {devices.map(d=> (
            <div key={d.device_id} className="tenant-card">
              <h4>{d.site_name}</h4>
              <div className="tenant-meta">
                <span className="subdomain">{d.device_id}</span>
                <span className={`status ${d.status}`}>{d.status}</span>
              </div>
              <div className="visit-link">Type: {d.type}</div>
              <div style={{marginTop:8}}>
                <button className="cancel-btn" onClick={()=>toggle(d.device_id, d.status)}>Toggle Status</button>
                <a href={`/devices/events?device_id=${d.device_id}`} style={{marginLeft:12}}>View Events →</a>
                <a href={`/devices/ingest`} style={{marginLeft:12}}>Test Ingest →</a>
              </div>
            </div>
          ))}
          {devices.length===0 && <p className="empty-state">No devices yet.</p>}
        </div>
      </div>
    </div>
  )
}
