import React from "react";
import { DB_URL, SB_HEADERS } from "./config";

// Diane's queue lives in diane_queue. Every read and write goes through the
// lance-db gateway, the same as the rest of Lance.
const TABLE = `${DB_URL}/diane_queue`;
const FIELDS = "id,kind,to_name,to_email,to_phone,subject,body,status,error,created_at,sent_at";

export async function loadDianeQueue() {
  const r = await fetch(`${TABLE}?select=${FIELDS}&order=created_at.desc&limit=200`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(r.status === 404 ? "Diane's queue is not open yet." : `Could not load Diane's queue (${r.status}).`);
  return r.json();
}

async function patchRow(id, fields) {
  const r = await fetch(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Save failed (${r.status}).`);
  const rows = await r.json();
  return rows[0];
}

// Only these moves are allowed from the screen. Diane sends rows marked approved
// and never sends anything else.
const MOVES = {
  approve: { from: ["draft"], to: "approved" },
  hold: { from: ["approved"], to: "draft" },
  reject: { from: ["draft", "approved"], to: "rejected" },
  restore: { from: ["rejected"], to: "draft" },
};

const TABS = [
  { id: "review", label: "To review", match: s => s === "draft" },
  { id: "approved", label: "Approved", match: s => s === "approved" },
  { id: "history", label: "History", match: s => ["sent", "failed", "rejected"].includes(s) },
];

const KIND = { prayer_note: "Prayer note" };
const kindLabel = k => KIND[k] || (k || "Note").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

function whenLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const btn = (kind) => ({
  minHeight: "44px", padding: "0 16px", borderRadius: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  ...(kind === "primary" ? { border: "none", background: "var(--gold)", color: "#0D1420" }
    : kind === "danger" ? { border: "1px solid rgba(214,110,80,0.5)", background: "transparent", color: "#F0A48C" }
    : { border: "1px solid var(--line)", background: "transparent", color: "var(--text-hi)" }),
});

function StatusChip({ row }) {
  const map = {
    sent: ["Sent", "var(--gold)"],
    failed: ["Failed", "#E0A15A"],
    rejected: ["Rejected", "var(--text-lo)"],
    approved: ["Approved", "var(--gold)"],
    draft: ["Draft", "var(--text-lo)"],
  };
  const [label, color] = map[row.status] || [row.status, "var(--text-lo)"];
  return <span style={{ fontSize: "12px", fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: "10px", padding: "2px 8px", flexShrink: 0 }}>{label}</span>;
}

function NoteCard({ row, busy, onMove, onSaveEdit }) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState(row.subject || "");
  const [body, setBody] = React.useState(row.body || "");
  const [confirmReject, setConfirmReject] = React.useState(false);
  const editable = row.status === "draft";
  const noEmail = !row.to_email;

  React.useEffect(() => { if (!editing) { setSubject(row.subject || ""); setBody(row.body || ""); } }, [row.subject, row.body, editing]);

  const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "12px", background: "var(--bg1)", border: "1px solid var(--line)", color: "var(--text-hi)", fontSize: "16px", fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "18px", padding: "14px 16px", margin: "0 8px 10px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", color: "var(--text-lo)" }}>{kindLabel(row.kind)} · {whenLabel(row.sent_at || row.created_at)}</div>
          <div className="serif" style={{ fontSize: "19px", color: "var(--text-hi)", marginTop: "2px", overflowWrap: "anywhere" }}>{row.to_name || "No name"}</div>
          <div style={{ fontSize: "13px", color: noEmail ? "#E0A15A" : "var(--text-lo)", overflowWrap: "anywhere" }}>{row.to_email || "No email on file, so Diane will skip this one."}</div>
        </div>
        <StatusChip row={row} />
      </div>

      {editing ? (
        <>
          <label style={{ fontSize: "13px", color: "var(--text-lo)" }}>Subject
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ ...field, marginTop: "4px" }} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--text-lo)" }}>Message
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ ...field, marginTop: "4px", lineHeight: 1.45, resize: "vertical" }} />
          </label>
        </>
      ) : (
        <>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-hi)", overflowWrap: "anywhere" }}>{row.subject || "No subject"}</div>
          <div style={{ fontSize: "15px", lineHeight: 1.5, color: "var(--text-hi)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{row.body}</div>
          {(row.body || "").length > 160 && (
            <button onClick={() => setOpen(o => !o)} style={{ alignSelf: "flex-start", minHeight: "36px", padding: 0, background: "none", border: "none", color: "var(--gold)", fontSize: "14px", cursor: "pointer" }}>{open ? "Show less" : "Read all"}</button>
          )}
        </>
      )}

      {row.status === "failed" && row.error && (
        <div style={{ fontSize: "13px", color: "#E0A15A", overflowWrap: "anywhere" }}>Why it failed: {row.error}</div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {editing ? (
          <>
            <button disabled={busy} style={btn("primary")} onClick={async () => { await onSaveEdit(row.id, { subject, body }); setEditing(false); }}>Save</button>
            <button disabled={busy} style={btn()} onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            {row.status === "draft" && <button disabled={busy || noEmail} style={{ ...btn("primary"), opacity: noEmail ? 0.4 : 1 }} onClick={() => onMove(row.id, "approve")}>Approve</button>}
            {row.status === "approved" && <button disabled={busy} style={btn()} onClick={() => onMove(row.id, "hold")}>Hold back</button>}
            {row.status === "rejected" && <button disabled={busy} style={btn()} onClick={() => onMove(row.id, "restore")}>Restore</button>}
            {editable && <button disabled={busy} style={btn()} onClick={() => setEditing(true)}>Edit</button>}
            {(row.status === "draft" || row.status === "approved") && (confirmReject ? (
              <>
                <button disabled={busy} style={btn("danger")} onClick={() => { setConfirmReject(false); onMove(row.id, "reject"); }}>Yes, reject</button>
                <button disabled={busy} style={btn()} onClick={() => setConfirmReject(false)}>Keep</button>
              </>
            ) : (
              <button disabled={busy} style={btn("danger")} onClick={() => setConfirmReject(true)}>Reject</button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function DianePanel({ onClose, onCount }) {
  const [rows, setRows] = React.useState([]);
  const [tab, setTab] = React.useState("review");
  const [state, setState] = React.useState("loading");
  const [err, setErr] = React.useState("");
  const [busyId, setBusyId] = React.useState(null);

  const refresh = React.useCallback(async () => {
    try {
      const data = await loadDianeQueue();
      setRows(data);
      setState("ready");
      setErr("");
      onCount?.(data.filter(r => r.status === "draft").length);
    } catch (e) { setState("error"); setErr(e.message); }
  }, [onCount]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const apply = async (id, fields) => {
    setBusyId(id); setErr("");
    try {
      const updated = await patchRow(id, fields);
      setRows(rs => {
        const next = rs.map(r => (r.id === id ? { ...r, ...(updated || fields) } : r));
        onCount?.(next.filter(r => r.status === "draft").length);
        return next;
      });
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  };

  const move = (id, name) => {
    const row = rows.find(r => r.id === id);
    const m = MOVES[name];
    if (!row || !m || !m.from.includes(row.status)) return;
    return apply(id, { status: m.to });
  };

  const counts = Object.fromEntries(TABS.map(t => [t.id, rows.filter(r => t.match(r.status)).length]));
  const shown = rows.filter(r => TABS.find(t => t.id === tab).match(r.status));
  const drafts = rows.filter(r => r.status === "draft" && r.to_email);

  const approveAll = async () => {
    for (const r of drafts) { await apply(r.id, { status: "approved" }); }
  };

  const empty = {
    review: ["Nothing to review.", "When Diane writes a new note, it lands here for you."],
    approved: ["Nothing waiting to send.", "Approved notes go out on Diane's next run."],
    history: ["No history yet.", "Sent, failed, and rejected notes show here."],
  }[tab];

  return (
    <div role="dialog" aria-label="Diane" style={{ position: "fixed", inset: 0, zIndex: 500, background: "var(--bg1)", display: "flex", flexDirection: "column", animation: "fadeIn 200ms cubic-bezier(0.22,1,0.36,1)" }}>
      <div style={{ padding: "calc(14px + env(safe-area-inset-top,0px)) 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h2 className="serif" style={{ fontSize: "30px", fontWeight: 500, color: "var(--text-hi)" }}>Diane</h2>
        <button onClick={onClose} aria-label="Close Diane" style={{ width: "44px", height: "44px", borderRadius: "14px", border: "1px solid var(--line)", background: "transparent", color: "var(--text-hi)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l10 10M14 4L4 14" /></svg>
        </button>
      </div>

      <div role="tablist" style={{ display: "flex", gap: "8px", padding: "14px 20px 4px", flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{ minHeight: "40px", padding: "0 14px", borderRadius: "20px", fontSize: "14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${tab === t.id ? "var(--gold)" : "var(--line)"}`, background: tab === t.id ? "rgba(212,175,90,0.14)" : "transparent", color: tab === t.id ? "var(--gold-hi)" : "var(--text-hi)" }}>
            {t.label}{counts[t.id] ? ` · ${counts[t.id]}` : ""}
          </button>
        ))}
      </div>

      {tab === "review" && drafts.length > 1 && (
        <div style={{ padding: "8px 20px 0", flexShrink: 0 }}>
          <button disabled={!!busyId} style={btn()} onClick={approveAll}>Approve all {drafts.length}</button>
        </div>
      )}
      {err && <div style={{ padding: "8px 20px 0", fontSize: "14px", color: "#E0A15A" }}>{err}</div>}

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px calc(16px + env(safe-area-inset-bottom,0px))" }}>
        {state === "loading" && <div style={{ textAlign: "center", padding: "56px 24px", color: "var(--text-lo)" }}>Loading Diane's notes...</div>}
        {state === "error" && (
          <div style={{ textAlign: "center", padding: "56px 24px" }}>
            <div style={{ color: "var(--text-hi)", fontSize: "16px" }}>{err}</div>
            <button style={{ ...btn(), marginTop: "14px" }} onClick={() => { setState("loading"); refresh(); }}>Try again</button>
          </div>
        )}
        {state === "ready" && shown.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 24px" }}>
            <div className="serif" style={{ fontSize: "22px", color: "var(--text-hi)" }}>{empty[0]}</div>
            <div style={{ fontSize: "14px", color: "var(--text-lo)", marginTop: "6px", lineHeight: 1.5 }}>{empty[1]}</div>
          </div>
        )}
        {state === "ready" && shown.map(r => (
          <NoteCard key={r.id} row={r} busy={busyId === r.id} onMove={move} onSaveEdit={apply} />
        ))}
      </div>
    </div>
  );
}
