import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";

interface Row { id: string; employee_id: string; clock_in: string; clock_out: string | null; duration_minutes: number; date: string }
interface Day { employee_id: number; date: string; in_time: string | null; out_time: string | null; worked_minutes: number; status: string }

export default function Attendance() {
  const [rows, setRows] = useState<Row[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [start, setStart] = useState<string>(new Date().toISOString().slice(0,10))
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0,10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await api.get("/api/attendance");
    setRows(r.data.attendance || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const processDays = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const r = await api.post("/api/attendance/process", {
        start_date: start,
        end_date: end,
      });
      setDays(r.data.processed || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to process"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-container">
      <h2>Attendance</h2>
      <div className="card">
        <div className="card-header"><h3>Live Records</h3></div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e2e8f0' }}>Employee</th>
              <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e2e8f0' }}>Clock In</th>
              <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e2e8f0' }}>Clock Out</th>
              <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e2e8f0' }}>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ padding:'8px', borderBottom:'1px solid #e2e8f0' }}>{r.employee_id}</td>
                <td style={{ padding:'8px', borderBottom:'1px solid #e2e8f0' }}>{r.clock_in}</td>
                <td style={{ padding:'8px', borderBottom:'1px solid #e2e8f0' }}>{r.clock_out || '-'}</td>
                <td style={{ padding:'8px', borderBottom:'1px solid #e2e8f0' }}>{r.duration_minutes}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding:'12px', textAlign:'center', color:'#64748b' }}>No records</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>Process Attendance Days</h3></div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={processDays}>
          <div className="form-group"><label>Start</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></div>
          <div className="form-group"><label>End</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></div>
          <button className="submit-btn" type="submit" disabled={busy}>{busy?'Processing...':'Process'}</button>
        </form>
        <div className="tenant-list-section" style={{marginTop:12}}>
          <h3>Processed Days</h3>
          <div className="tenant-grid">
            {days.map(d => (
              <div key={d.employee_id+'-'+d.date} className="tenant-card">
                <h4>Emp #{d.employee_id}</h4>
                <div className="tenant-meta">
                  <span className="subdomain">{d.date}</span>
                  <span className={`status ${d.status==='Present'?'active':'disabled'}`}>{d.status}</span>
                </div>
                <div className="visit-link">Minutes: {d.worked_minutes}</div>
              </div>
            ))}
            {days.length===0 && <p className="empty-state">No processed days yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
