import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";

interface Site {
  id: string;
  name: string;
  code?: string;
  created_at: string;
}

export default function Sites() {
  const raw = localStorage.getItem('user') || sessionStorage.getItem('user')
  const user = raw ? JSON.parse(raw) : null
  const allowed = user && (user.role==='tenant_owner' || user.role==='hr_admin')
  const [sites, setSites] = useState<Site[]>([])
  const [name, setName] = useState('HQ')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/sites");
      setSites(r.data.sites || []);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await api.post("/api/sites", { name, code });
      setName("");
      setCode("");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <div style={{padding:16}}>Not authorized</div>
  return (
    <div className="app-container">
      <h2>Sites</h2>
      <div className="card">
        <div className="card-header"><h3>Create Site</h3></div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={create}>
          <div className="form-group"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)} required/></div>
          <div className="form-group"><label>Code</label><input value={code} onChange={e=>setCode(e.target.value)} /></div>
          <button className="submit-btn" type="submit" disabled={busy}>{busy?'Creating...':'Create'}</button>
        </form>
      </div>
      <div className="tenant-list-section" style={{marginTop:16}}>
        <h3>Registered Sites</h3>
        <div className="tenant-grid">
          {sites.map(s=> (
            <div key={s.id} className="tenant-card">
              <h4>{s.name}</h4>
              <div className="tenant-meta">
                <span className="subdomain">{s.code || '—'}</span>
                <span className={`status active`}>active</span>
              </div>
            </div>
          ))}
          {sites.length===0 && <p className="empty-state">No sites yet.</p>}
        </div>
      </div>
    </div>
  )
}
