import React,{useState,useRef,useEffect,useCallback}from"react";
import{callClaude,speak,readFile,detectDocumentContent,webSearch,formatSearchResults}from"./api";
import{loadMemory,loadProfile,loadRecentSessions,saveMessage,saveMemoryFact,saveProfileFact,saveSession,parseMemoryTags,stripMemoryTags,parseFlyerTag,parseSmsTag,parseVideoTag,parseTaskTag,saveTask,loadOpenTasks,completeTask,deleteTask,parseStaffEventTags,parseStaffNoteTags,saveStaffEvent,saveStaffNote,loadBrainNotes,parseBrainTags,saveBrainNote}from"./memory";
import{SESSION_ID,SUPABASE_URL,SB_HEADERS,DB_URL}from"./config";
import{LanceLogo,SendIcon,SpeakerIcon,StopIcon,DownloadIcon,AttachIcon,CloseIcon}from"./icons";

const DOCX_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-docx";
const PPTX_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-pptx";
const FLYER_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-flyer";
const SMS_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-sms";
const WATCH_VIDEO_URL="/api/watch-video";
const TTS_URL=`${SUPABASE_URL}/functions/v1/lance-tts`;
const SERMON_URL=`${SUPABASE_URL}/functions/v1/lance-sermon-prep`;
const EXAM_URL=`${SUPABASE_URL}/functions/v1/lance-exam-gen`;
const DEVOTION_URL=`${SUPABASE_URL}/functions/v1/lance-devotion`;

// Chat + Project DB (lance_chats / lance_projects)
async function loadPinned(){
  const r=await fetch(`${DB_URL}/lance_chats?active=eq.true&order=updated_at.desc&limit=300`,{headers:SB_HEADERS});
  return r.ok?r.json():[];
}
async function saveConversation(title,summary,messages,projectId){
  const body={title,summary,messages,active:true};
  if(projectId)body.project_id=projectId;
  const r=await fetch(`${DB_URL}/lance_chats`,{
    method:"POST",headers:{...SB_HEADERS,"Prefer":"return=representation"},
    body:JSON.stringify(body)
  });
  return r.ok?r.json():null;
}
async function updateChatRow(id,patch){
  await fetch(`${DB_URL}/lance_chats?id=eq.${id}`,{
    method:"PATCH",headers:SB_HEADERS,
    body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
  });
}
async function togglePin(id,pinned){
  await updateChatRow(id,{pinned});
}
async function deleteConversation(id){
  await updateChatRow(id,{active:false});
}
async function renameConversation(id,title){
  await updateChatRow(id,{title});
}
async function loadProjectsDb(){
  const r=await fetch(`${DB_URL}/lance_projects?active=eq.true&order=created_at.asc`,{headers:SB_HEADERS});
  return r.ok?r.json():[];
}
async function createProjectRow(name,description){
  const r=await fetch(`${DB_URL}/lance_projects`,{
    method:"POST",headers:{...SB_HEADERS,"Prefer":"return=representation"},
    body:JSON.stringify({name,description,active:true})
  });
  return r.ok?r.json():null;
}
async function updateProjectRow(id,patch){
  await fetch(`${DB_URL}/lance_projects?id=eq.${id}`,{
    method:"PATCH",headers:SB_HEADERS,
    body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
  });
}
async function deleteProjectRow(id){
  await updateProjectRow(id,{active:false});
}
function chatGroupLabel(d){
  const t=new Date(d);const now=new Date();
  const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const day=86400000;
  if(t>=startToday)return "Today";
  if(t>=new Date(startToday.getTime()-day))return "Yesterday";
  if(t>=new Date(startToday.getTime()-7*day))return "Previous 7 days";
  return "Earlier";
}

function greeting(){
  const h=new Date().getHours();
  if(h<5)return "Still up";
  if(h<12)return "Good morning";
  if(h<17)return "Good afternoon";
  if(h<21)return "Good evening";
  return "Good evening";
}

function recentUserIntent(msgs){
  try{
    const userTexts=msgs.filter(m=>m.role==="user").slice(-3).map(m=>typeof m.content==="string"?m.content:"");
    return userTexts.join(" . ");
  }catch(e){return ""}
}

function generateFilename(text){
  try{
    if(!text||typeof text!=='string')return 'Lance Document';
    var lines=text.split('\n');
    var heading=lines.find(function(l){return l.trim().startsWith('#');});
    var raw=heading?heading.replace(/^#+\s*/,''):lines.find(function(l){return l.trim();})||'Lance Document';
    return raw.replace(/[*_`#>]/g,'').replace(/[^a-zA-Z0-9 ']/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||'Lance Document';
  }catch(e){return 'Lance Document';}
}

function MicIcon(){return(<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 7.5a4.5 4.5 0 009 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="7.5" y1="12" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>)}
function VoiceChatIcon(){return(<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 9V7M4.5 11V5M7 13V3M9.5 11V5M12 9V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>)}

function WordDocCard({ text, filename, onDownload, downloading }) {
  return (
    <button
      className="file-tile"
      onClick={onDownload}
      disabled={downloading}
      style={{ marginTop: 6, maxWidth: 230 }}
    >
      <div
        className="doc-glyph"
        style={{ background: 'linear-gradient(160deg, #2B579A, #1E3A6E)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>W</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-hi)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 150,
          }}
        >
          {filename}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 2 }}>
          {downloading ? 'Preparing…' : 'Word Document'}
        </div>
      </div>
      <div style={{ fontSize: 16, color: 'var(--text-lo)' }}>›</div>
    </button>
  );
}

function PptxDocCard({ text, filename, onDownload, downloading }) {
  return (
    <button
      className="file-tile"
      onClick={onDownload}
      disabled={downloading}
      style={{ marginTop: 6, maxWidth: 230 }}
    >
      <div
        className="doc-glyph"
        style={{ background: 'linear-gradient(160deg, #D24726, #A6350F)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>P</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-hi)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 150,
          }}
        >
          {filename}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 2 }}>
          {downloading ? 'Preparing…' : 'Presentation'}
        </div>
      </div>
      <div style={{ fontSize: 16, color: 'var(--text-lo)' }}>›</div>
    </button>
  );
}

function FlyerCard({ onGenerate, generating }) {
  return (
    <button
      className="file-tile"
      onClick={onGenerate}
      disabled={generating}
      style={{ marginTop: 6, maxWidth: 230 }}
    >
      <div
        className="doc-glyph"
        style={{ background: 'linear-gradient(160deg, #D4AF5A, #8A6E2A)' }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7 0L7.854 6.146L14 7L7.854 7.854L7 14L6.146 7.854L0 7L6.146 6.146L7 0Z"
            fill="white"
          />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-hi)',
          }}
        >
          Flyer
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 2 }}>
          {generating ? 'Designing…' : 'Branded graphic'}
        </div>
      </div>
      <div style={{ fontSize: 16, color: 'var(--text-lo)' }}>›</div>
    </button>
  );
}

function VideoCard({ videoData, state, onWatch }) {
  const status = state?.status || "idle";
  const label =
    status === "watching" ? "Watching…" :
    status === "done" ? "Video watched" :
    status === "error" ? "Could not watch" : "Watch this video";
  const sub =
    status === "watching" ? "Reading frames and audio" :
    status === "done" ? "Breakdown ready below" :
    status === "error" ? "Tap to retry" :
    videoData.clip ? `Clip ${videoData.clip}${videoData.fps ? ` · ${videoData.fps} fps` : ""}` :
    videoData.fps ? `${videoData.fps} fps` : "Scene-by-scene, tap to run";
  return (
    <div style={{ marginTop: 6, maxWidth: 320 }}>
      <button
        className="file-tile"
        onClick={status === "watching" ? undefined : onWatch}
        disabled={status === "watching"}
        style={{ width: "100%", maxWidth: 320 }}
      >
        <div
          className="doc-glyph"
          style={{ background: "linear-gradient(160deg, #E23B3B, #9A1F1F)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 2.5v9l7-4.5-7-4.5z" fill="#fff" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-hi)" }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)", marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 16, color: "var(--text-lo)" }}>›</div>
      </button>
      {status === "error" && state?.error && (
        <div style={{ fontSize: 12, color: "#E8B461", background: "rgba(217,119,6,0.12)", padding: "8px 10px", borderRadius: 10, marginTop: 6, maxWidth: 320 }}>{state.error}</div>
      )}
      {status === "done" && state?.analysis && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginTop: 8, maxWidth: 320, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)" }}>
          {renderDocBlock(state.analysis)}
        </div>
      )}
    </div>
  );
}

function AppIcon({ label, gradient, onTap, children }) {
  return (
    <button className="app-icon" onClick={onTap}>
      <div
        style={{
          width: 26,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: gradient || 'var(--gold-hi)',
        }}
      >
        {children}
      </div>
      <div className="app-icon-label">{label}</div>
    </button>
  );
}

function TextSentCard({status,onSend,scheduled}){
  return(
    <div onClick={status==="idle"?onSend:undefined} style={{
      display:"flex",alignItems:"center",gap:"10px",
      padding:"10px 14px",marginTop:"6px",
      background:"var(--glass-hi)",
      border:"1px solid var(--line)",
      borderRadius:"14px",cursor:status==="idle"?"pointer":"default",
      backdropFilter:"blur(24px) saturate(1.5)",
      WebkitBackdropFilter:"blur(24px) saturate(1.5)",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)",
      maxWidth:"220px",
      opacity:status==="sending"?0.7:1,
    }}>
      <div style={{
        width:"36px",height:"36px",borderRadius:"10px",flexShrink:0,
        background:status==="sent"?"linear-gradient(160deg,#2E9E5B,#1F7A44)":"linear-gradient(160deg,#D4AF5A,#A8823A)",
        display:"flex",alignItems:"center",justifyContent:"center",
      }}>
        {status==="sent"?(
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        ):(
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 3h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11H2a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinejoin="round"/></svg>
        )}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"var(--text-hi)"}}>
          {status==="sent"?"Text sent":status==="sending"?"Sending…":status==="error"?"Failed to send":scheduled?"Scheduled text":"Text ready"}
        </div>
        <div style={{fontSize:"12px",color:"var(--text-lo)",marginTop:"1px"}}>
          {status==="idle"?"Tap to send now":status==="sent"?"Delivered to your phone":status==="error"?"Tap to retry":"Sending to your phone"}
        </div>
      </div>
    </div>
  );
}

function StaffEventRow({ev,status,onAdd}){
  const label=[ev.date,ev.start&&fmtStaffTime(ev.start)+(ev.end?`–${fmtStaffTime(ev.end)}`:"")].filter(Boolean).join(" · ");
  return(
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 10px",borderRadius:"9px",background:"rgba(0,0,0,0.02)",marginBottom:"6px"}}>
      <div style={{width:"8px",height:"8px",borderRadius:"50%",background:STAFF_CAT_COLOR[ev.category]||STAFF_CAT_COLOR.Other,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"13px",fontWeight:600,color:"#1a2340",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title||"Untitled event"}</div>
        <div style={{fontSize:"11px",color:"#6B7280"}}>{label}{ev.location?` · ${ev.location}`:""}{ev.repeat==="weekly"?" · weekly":""}</div>
      </div>
      <button onClick={onAdd} disabled={status==="sending"||status==="sent"} style={{flexShrink:0,background:status==="sent"?"#E8F5EC":"linear-gradient(135deg,#1a2340,#0d1321)",color:status==="sent"?"#1F7A44":"#fff",border:"none",borderRadius:"7px",padding:"7px 11px",fontSize:"12px",fontWeight:600,cursor:status==="sent"?"default":"pointer",fontFamily:"inherit",minWidth:"56px"}}>
        {status==="sending"?"…":status==="sent"?"Added":status==="error"?"Retry":"Add"}
      </button>
    </div>
  );
}

function fmtStaffTime(t){
  if(!t)return"";
  const[h,m]=t.split(":").map(Number);
  const ap=h>=12?"pm":"am";
  return`${((h%12)||12)}${m?":"+String(m).padStart(2,"0"):""}${ap}`;
}

function StaffEventsCard({events,statusByEventIdx,onAdd,onAddAll}){
  const allDone=events.every((_,i)=>statusByEventIdx[i]==="sent");
  return(
    <div style={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(26,35,64,0.15)",borderRadius:"12px",padding:"12px",marginTop:"6px",maxWidth:"340px",boxShadow:"0 2px 12px rgba(0,0,0,0.1)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
        <div style={{fontSize:"12px",fontWeight:600,color:"#6B7280"}}>Staff calendar · {events.length} event{events.length===1?"":"s"}</div>
        {!allDone&&events.length>1&&(
          <button onClick={onAddAll} style={{background:"none",border:"none",color:"#A8863A",fontSize:"12px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Add all</button>
        )}
      </div>
      {events.map((ev,i)=>(<StaffEventRow key={i} ev={ev} status={statusByEventIdx[i]||"idle"} onAdd={()=>onAdd(i)}/>))}
    </div>
  );
}

function StaffNoteCard({note,status,onAdd}){
  if(status==="sent"){
    return(
      <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",marginTop:"6px",background:"rgba(255,255,255,0.97)",border:"1px solid rgba(26,35,64,0.15)",borderRadius:"12px",maxWidth:"300px"}}>
        <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"linear-gradient(160deg,#2E9E5B,#1F7A44)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div><div style={{fontSize:"13px",fontWeight:600,color:"#1a2340"}}>Posted to staff board</div></div>
      </div>
    );
  }
  return(
    <div style={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(26,35,64,0.15)",borderRadius:"12px",padding:"12px",marginTop:"6px",maxWidth:"320px",boxShadow:"0 2px 12px rgba(0,0,0,0.1)"}}>
      <div style={{fontSize:"11px",color:"#6B7280",marginBottom:"4px"}}>Staff note</div>
      <div style={{fontSize:"13px",color:"#1a2340",marginBottom:"10px",whiteSpace:"pre-wrap"}}>{note.text}</div>
      <button onClick={onAdd} disabled={status==="sending"} style={{width:"100%",background:"linear-gradient(135deg,#1a2340,#0d1321)",color:"#fff",border:"none",borderRadius:"8px",padding:"9px",fontSize:"13px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
        {status==="sending"?"Posting...":status==="error"?"Failed, tap to retry":"Post to staff board"}
      </button>
    </div>
  );
}

function TaskAddedCard({title,due}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",marginTop:"6px",background:"rgba(255,255,255,0.97)",border:"1px solid rgba(26,35,64,0.15)",borderRadius:"12px",maxWidth:"280px",boxShadow:"0 2px 12px rgba(0,0,0,0.1)"}}>
      <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"linear-gradient(160deg,#D4AF5A,#A8823A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 7.5h9M7.5 3v9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </div>
      <div><div style={{fontSize:"13px",fontWeight:600,color:"#1a2340"}}>Added to your list</div><div style={{fontSize:"11px",color:"#6B7280"}}>{title}{due?` -- due ${due}`:""}</div></div>
    </div>
  );
}

function dueLabel(d){if(!d)return null;const today=new Date().toLocaleDateString("en-CA");const t=new Date(d+"T12:00:00");const diff=Math.round((t-new Date(today+"T12:00:00"))/86400000);if(diff<0)return{text:`Overdue · ${t.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`,late:true};if(diff===0)return{text:"Due today",late:false};if(diff===1)return{text:"Due tomorrow",late:false};return{text:`Due ${t.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}`,late:false}}
function TasksPanel({tasks,onClose,onComplete,onDelete,onAdd}){
  const[draft,setDraft]=React.useState("");
  const[doneIds,setDoneIds]=React.useState([]);
  const[confirmId,setConfirmId]=React.useState(null);
  const submit=e=>{e.preventDefault();const t=draft.trim();if(!t)return;onAdd({title:t});setDraft("")};
  const complete=id=>{setDoneIds(d=>[...d,id]);setTimeout(()=>onComplete(id),350)};
  return(
    <div role="dialog" aria-label="Tasks" style={{position:"fixed",inset:0,zIndex:500,background:"var(--bg1)",display:"flex",flexDirection:"column",animation:"fadeIn 200ms cubic-bezier(0.22,1,0.36,1)"}}>
      <div style={{padding:"calc(14px + env(safe-area-inset-top,0px)) 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <h2 className="serif" style={{fontSize:"30px",fontWeight:500,color:"var(--text-hi)"}}>Tasks</h2>
        <button onClick={onClose} aria-label="Close tasks" style={{width:"44px",height:"44px",borderRadius:"14px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l10 10M14 4L4 14"/></svg>
        </button>
      </div>
      <form onSubmit={submit} style={{padding:"16px 20px 6px",display:"flex",gap:"8px",flexShrink:0}}>
        <label htmlFor="new-task" style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0 0 0 0)"}}>Add a task</label>
        <input id="new-task" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Add a task" style={{flex:1,minWidth:0,height:"46px",padding:"0 14px",borderRadius:"14px",background:"var(--surface)",border:"1px solid var(--line)",color:"var(--text-hi)",fontSize:"16px",outline:"none"}}/>
        <button type="submit" disabled={!draft.trim()} style={{height:"46px",padding:"0 16px",borderRadius:"14px",border:"none",background:draft.trim()?"var(--gold)":"var(--surface-hi)",color:draft.trim()?"#0D1420":"var(--text-lo)",fontSize:"15px",fontWeight:600,cursor:draft.trim()?"pointer":"default"}}>Add</button>
      </form>
      <div style={{padding:"4px 20px 0",fontSize:"13px",color:"var(--text-lo)",flexShrink:0}}>{tasks.length===0?"":`${tasks.length} open · Tell Lance about anything you need to do and it lands here.`}</div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px calc(16px + env(safe-area-inset-bottom,0px))"}}>
        {tasks.length===0?(
          <div style={{textAlign:"center",padding:"56px 24px"}}>
            <div className="serif" style={{fontSize:"22px",color:"var(--text-hi)"}}>Nothing open.</div>
            <div style={{fontSize:"14px",color:"var(--text-lo)",marginTop:"6px",lineHeight:1.5}}>Add a task above, or tell Lance "remind me to call Brother Mike."</div>
          </div>
        ):tasks.map(t=>{const due=dueLabel(t.due_date);const done=doneIds.includes(t.id);return(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 8px",borderRadius:"14px",opacity:done?0.45:1,transition:"opacity 300ms"}}>
            <button onClick={()=>complete(t.id)} aria-label={`Mark done: ${t.title}`} style={{width:"44px",height:"44px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"none",border:"none",cursor:"pointer"}}>
              <span style={{width:"24px",height:"24px",borderRadius:"12px",border:`2px solid ${done?"var(--gold)":"var(--line-hi)"}`,background:done?"var(--gold)":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{done&&(<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0D1420" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l2.5 2.5L11 4.5"/></svg>)}</span>
            </button>
            <div style={{flex:1,minWidth:0,padding:"8px 0"}}>
              <div style={{fontSize:"16px",lineHeight:1.35,color:"var(--text-hi)",textDecoration:done?"line-through":"none",overflowWrap:"anywhere"}}>{t.title}</div>
              {due&&(<div style={{fontSize:"13px",marginTop:"2px",color:due.late?"#E0A15A":"var(--text-lo)"}}>{due.text}</div>)}
            </div>
            {confirmId===t.id?(
              <div style={{display:"flex",gap:"6px",flexShrink:0}}>
                <button onClick={()=>{setConfirmId(null);onDelete(t.id)}} style={{minHeight:"40px",padding:"0 12px",borderRadius:"12px",border:"none",background:"#C2502E",color:"#fff",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>Delete</button>
                <button onClick={()=>setConfirmId(null)} style={{minHeight:"40px",padding:"0 12px",borderRadius:"12px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",fontSize:"14px",cursor:"pointer"}}>Keep</button>
              </div>
            ):(
              <button onClick={()=>setConfirmId(t.id)} aria-label={`Delete task: ${t.title}`} style={{width:"40px",height:"40px",flexShrink:0,borderRadius:"12px",border:"none",background:"none",color:"var(--text-lo)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><TrashIcon/></button>
            )}
          </div>);})}
      </div>
    </div>
  );
}
function renderDocBlock(text){
  const lines=text.split("\n");
  const blocks=[];
  let inCode=false,codeLines=[];
  lines.forEach((raw,i)=>{
    const t=raw.trim();
    if(t.startsWith("```")){
      if(!inCode){inCode=true;codeLines=[];return}
      blocks.push(<pre key={i} style={{background:"#F6F6F7",padding:"12px 14px",borderRadius:"8px",fontSize:"13px",fontFamily:"ui-monospace,Menlo,monospace",color:"#374151",overflowX:"auto",margin:"10px 0"}}>{codeLines.join("\n")}</pre>);
      inCode=false;return;
    }
    if(inCode){codeLines.push(raw);return}
    if(!t){blocks.push(<div key={i} style={{height:"12px"}}/>);return}
    const inline=(s)=>s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p,j)=>{
      if(p.startsWith("**")&&p.endsWith("**"))return <b key={j} style={{fontWeight:600}}>{p.slice(2,-2)}</b>;
      if(p.startsWith("*")&&p.endsWith("*"))return <i key={j}>{p.slice(1,-1)}</i>;
      return p;
    });
    if(t.startsWith("# ")){blocks.push(<h1 key={i} style={{fontSize:"23px",fontWeight:700,color:"#111827",margin:"22px 0 10px",fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif",lineHeight:1.3}}>{inline(t.slice(2))}</h1>);return}
    if(t.startsWith("## ")){blocks.push(<h2 key={i} style={{fontSize:"19px",fontWeight:600,color:"#111827",margin:"18px 0 8px",fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif",lineHeight:1.3}}>{inline(t.slice(3))}</h2>);return}
    if(t.startsWith("### ")){blocks.push(<h3 key={i} style={{fontSize:"16px",fontWeight:600,color:"#1F2937",margin:"14px 0 6px",fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif"}}>{inline(t.slice(4))}</h3>);return}
    if(t.startsWith("#### ")){blocks.push(<h4 key={i} style={{fontSize:"14px",fontWeight:600,color:"#374151",margin:"12px 0 4px"}}>{inline(t.slice(5))}</h4>);return}
    if(/^[-*_]{3,}$/.test(t)){blocks.push(<hr key={i} style={{border:"none",borderTop:"1px solid #E5E7EB",margin:"18px 0"}}/>);return}
    if(t.startsWith("> ")){blocks.push(<div key={i} style={{borderLeft:"3px solid #D1D5DB",paddingLeft:"14px",margin:"10px 0",color:"#4B5563",fontStyle:"italic"}}>{inline(t.slice(2))}</div>);return}
    if(/^[*\-] /.test(t)){blocks.push(<div key={i} style={{display:"flex",gap:"10px",margin:"4px 0",paddingLeft:"2px",lineHeight:1.6,color:"#1F2937"}}><span style={{color:"#70757E",flexShrink:0}}>&#8211;</span><span>{inline(t.slice(2))}</span></div>);return}
    if(/^\d+\.\s/.test(t)){const num=t.match(/^\d+/)[0];blocks.push(<div key={i} style={{display:"flex",gap:"10px",margin:"4px 0",paddingLeft:"2px",lineHeight:1.6,color:"#1F2937"}}><span style={{color:"#6B7280",fontWeight:500,flexShrink:0}}>{num}.</span><span>{inline(t.replace(/^\d+\.\s/,""))}</span></div>);return}
    blocks.push(<p key={i} style={{margin:"8px 0",lineHeight:1.65,color:"#1F2937",fontSize:"15.5px"}}>{inline(t)}</p>);
  });
  return blocks;
}

function DocPreviewModal({text,filename,onClose,onDownloadWord,onDownloadPptx,downloading}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(6,8,15,0.8)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",flexDirection:"column",animation:"fadeIn 0.2s ease"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#fff",margin:"env(safe-area-inset-top,20px) 12px 12px",flex:1,
        borderRadius:"28px 28px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",
        boxShadow:"0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid rgba(26,35,64,0.1)",flexShrink:0}}>
          <div style={{fontSize:"14px",fontWeight:600,color:"#1a2340",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{filename}</div>
          <button onClick={onClose} style={{background:"rgba(26,35,64,0.08)",border:"none",borderRadius:"50%",width:"32px",height:"32px",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#1a2340",fontSize:"18px",flexShrink:0,marginLeft:"10px"}}>&#215;</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px 22px",WebkitOverflowScrolling:"touch"}}>
          {renderDocBlock(text)}
        </div>
        <div style={{display:"flex",gap:"8px",padding:"12px 16px",borderTop:"1px solid rgba(26,35,64,0.1)",flexShrink:0}}>
          <button onClick={onDownloadWord} disabled={downloading} style={{flex:1,background:"linear-gradient(135deg,#2B579A,#1E3A6E)",color:"#fff",border:"none",borderRadius:"12px",padding:"12px",fontSize:"14px",fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:downloading?0.6:1}}>Save as Word</button>
          <button onClick={onDownloadPptx} disabled={downloading} style={{flex:1,background:"linear-gradient(135deg,#D24726,#A6350F)",color:"#fff",border:"none",borderRadius:"12px",padding:"12px",fontSize:"14px",fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:downloading?0.6:1}}>Save as Slides</button>
        </div>
      </div>
    </div>
  );
}
function PinIcon({active}){return(<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.5L11.5 4.5L9 7L9.5 10.5L6.5 8L3.5 10.5L4 7L1.5 4.5L4.5 1.5L6.5 3.5L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" fill={active?"currentColor":"none"} strokeLinejoin="round"/></svg>)}
function SaveIcon(){return(<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2h9v9l-4.5-2L2 11V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>)}
function TrashIcon(){return(<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3h9M4 3V2h4v1M5 5.5v4M7 5.5v4M2 3l.8 7.2A1 1 0 003.8 11h4.4a1 1 0 001-.8L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}
function PencilIcon(){return(<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>)}

function renderText(t){try{if(!t)return "";return t.replace(/#{1,6} /g,"").replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/__(.*?)__/g,"$1").replace(/`(.*?)`/g,"$1").replace(/^[-*] /gm,"\u2022 ").replace(/^---+$/gm,"").replace(/\n\n\n+/g,"\n\n").trim()}catch(e){return String(t||"")}}

const CSS=`:root{--bg0:#0A101A;--bg1:#0D1420;--surface:#151E2D;--surface-hi:#1B2436;--gold:#D4AF5A;--gold-hi:#E3C574;--gold-lo:#A8823A;--cyan:#6F86B0;--cyan-hi:#9AA9C8;--cyan-lo:#3B4A66;--glass:#151E2D;--glass-hi:#1B2436;--line:#24304A;--line-hi:#2E3B57;--text-hi:#ECE7DC;--text-mid:rgba(236,231,220,0.72);--text-lo:#8D97AA;--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;-webkit-text-size-adjust:100%}
body{font-family:var(--sans);-webkit-font-smoothing:antialiased;background:var(--bg1);color:var(--text-hi);position:relative}
.serif{font-family:var(--serif)}
.eyebrow2{font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-lo)}
button,input,textarea{font-family:inherit}
button:focus-visible,a:focus-visible,textarea:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
body::before{content:none}
textarea:focus,button:focus{outline:none}
textarea::placeholder{color:var(--text-lo)}
::-webkit-scrollbar{width:0}
.glass{background:var(--glass);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);border:1px solid var(--line)}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 8px rgba(212,175,90,0.3))}50%{filter:drop-shadow(0 0 18px rgba(212,175,90,0.6))}}
@keyframes dot{0%,80%,100%{transform:scale(0.5);opacity:0.25}40%{transform:scale(1);opacity:1}}
@keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,175,90,0.4),0 0 12px rgba(212,175,90,0.2)}50%{box-shadow:0 0 0 6px rgba(212,175,90,0),0 0 20px rgba(212,175,90,0.4)}}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes ringRotate{to{transform:rotate(360deg)}}
.lance-ring{position:absolute;inset:-4px;border-radius:50%;pointer-events:none;opacity:0;transition:opacity 280ms cubic-bezier(0.22,1,0.36,1)}
.lance-ring::before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0%,var(--gold) 25%,transparent 50%,transparent 100%);mask:radial-gradient(circle,transparent 50%,black 51%,black 54%,transparent 55%);-webkit-mask:radial-gradient(circle,transparent 50%,black 51%,black 54%,transparent 55%);animation:ringRotate 2.4s linear infinite}
.lance-ring.active{opacity:1}
.lance-ring-cyan{display:none}
.lance-ring-cyan::before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 180deg,transparent 0%,var(--cyan) 18%,transparent 40%,transparent 100%);mask:radial-gradient(circle,transparent 62%,black 63%,black 66%,transparent 67%);-webkit-mask:radial-gradient(circle,transparent 62%,black 63%,black 66%,transparent 67%);animation:ringRotate 5s linear infinite reverse}
.hud-tick{position:absolute;background:var(--line)}
.hud-panel{clip-path:none}
.hud-panel-user{clip-path:none}
.hud-corner{display:none}
.hud-corner-tl{top:-1px;left:-1px;border-top:1.5px solid var(--cyan);border-left:1.5px solid var(--cyan)}
.hud-corner-tr{top:-1px;right:-1px;border-top:1.5px solid var(--cyan);border-right:1.5px solid var(--cyan)}
.hud-corner-bl{bottom:-1px;left:-1px;border-bottom:1.5px solid var(--cyan);border-left:1.5px solid var(--cyan)}
.hud-corner-br{bottom:-1px;right:-1px;border-bottom:1.5px solid var(--cyan);border-right:1.5px solid var(--cyan)}
.hud-gauge-track{fill:none;stroke:var(--line);stroke-width:2.5}
.hud-gauge-fill{fill:none;stroke:var(--gold);stroke-width:2.5;stroke-linecap:round;transition:stroke-dashoffset 400ms cubic-bezier(0.22,1,0.36,1)}
.wave{display:flex;align-items:center;gap:3px;height:24px;justify-content:center}
.wave span{width:3px;background:var(--gold);border-radius:2px;animation:waveBar 1.2s ease-in-out infinite}
.wave span:nth-child(1){height:8px;animation-delay:0s}
.wave span:nth-child(2){height:14px;animation-delay:0.1s}
.wave span:nth-child(3){height:18px;animation-delay:0.2s}
.wave span:nth-child(4){height:14px;animation-delay:0.3s}
.wave span:nth-child(5){height:10px;animation-delay:0.4s}
@keyframes waveBar{0%,100%{transform:scaleY(0.5);opacity:0.4}50%{transform:scaleY(1);opacity:1}}
.speak-btn{border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:6px;border-radius:10px;transition:all 200ms cubic-bezier(0.22,1,0.36,1);opacity:0.5;color:var(--text-mid);min-width:36px;min-height:36px}
.speak-btn:hover{opacity:1;background:rgba(212,175,90,0.08)}
.speak-btn:active{transform:scale(0.96)}
.speak-btn.active{opacity:1;color:var(--gold)}
.teach-toggle{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--line);background:var(--glass);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);transition:all 200ms cubic-bezier(0.22,1,0.36,1);color:var(--text-mid);letter-spacing:0.01em;min-height:36px}
.teach-toggle:hover{background:var(--glass-hi);border-color:rgba(255,255,255,0.12)}
.teach-toggle:active{transform:scale(0.96)}
.file-chip{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--glass);border:1px solid var(--line);border-radius:10px;font-size:13px;color:var(--text-hi);font-family:inherit;-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5)}
.file-chip button{background:none;border:none;cursor:pointer;color:var(--text-lo);display:flex;align-items:center;padding:2px;transition:color 180ms cubic-bezier(0.22,1,0.36,1);min-width:24px;min-height:24px}
.file-chip button:hover{color:var(--text-hi)}
.file-chip button:active{transform:scale(0.96)}
.copy-btn{border:none;background:none;cursor:pointer;padding:4px 8px;border-radius:10px;font-size:11px;font-weight:600;font-family:inherit;transition:all 200ms cubic-bezier(0.22,1,0.36,1);opacity:0.5;color:var(--text-mid);letter-spacing:0.08em;text-transform:uppercase;min-height:28px}
.copy-btn:hover{opacity:1;background:rgba(212,175,90,0.08)}
.copy-btn:active{transform:scale(0.96)}
.copy-btn.copied{opacity:1;color:var(--gold)}
.mic-btn{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;transition:all 200ms cubic-bezier(0.22,1,0.36,1);flex-shrink:0}
.mic-btn:active{transform:scale(0.96)}
.mic-btn.idle{background:var(--glass);color:var(--text-lo);border:1px solid var(--line);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5)}
.mic-btn.listening{background:#D4AF5A;color:#0D1420;border:1px solid var(--gold-hi);animation:micPulse 1.4s ease-in-out infinite}
.saved-backdrop{position:fixed;inset:0;background:rgba(6,8,15,0.7);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:390;animation:fadeIn 280ms cubic-bezier(0.22,1,0.36,1)}
@media(max-width:560px){.saved-panel{width:100vw!important;border-left:none!important;border-radius:0!important}}
.saved-panel{position:fixed;right:0;top:0;bottom:0;width:min(400px,100vw);background:var(--bg1);border-left:1px solid var(--line);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);z-index:400;display:flex;flex-direction:column;animation:slideIn 300ms cubic-bezier(0.22,1,0.36,1);border-top-left-radius:28px;border-bottom-left-radius:28px;box-shadow:inset 1px 0 0 rgba(255,255,255,0.06),-8px 0 32px rgba(0,0,0,0.3)}
.saved-item{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:background 180ms cubic-bezier(0.22,1,0.36,1);color:var(--text-mid);font-size:15px;letter-spacing:-0.01em}
.saved-item:hover{background:rgba(255,255,255,0.04)}
.saved-item:active{transform:scale(0.99)}
.saved-item.active{background:rgba(212,175,90,0.08);color:var(--text-hi);border-left:2px solid var(--gold)}

/* App Icon Tile */
.app-icon {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: var(--glass-hi);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
  
  -webkit-
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 120ms cubic-bezier(0.22,1,0.36,1);
}

.app-icon:active {
  transform: scale(0.94);
}

.app-icon svg,
.app-icon .glyph {
  width: 26px;
  height: 26px;
}

.app-icon-label {
  font-size: 12px;
  color: var(--text-mid);
  font-weight: 500;
  letter-spacing: -0.01em;
}

/* File Tile */
.file-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--glass-hi);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
  
  -webkit-
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.22,1,0.36,1);
}

.file-tile:active {
  transform: scale(0.97);
}

.file-tile:hover {
  box-shadow: 0 0 0 1px rgba(212,175,90,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
}

/* Document Glyph */
.doc-glyph {
  width: 34px;
  height: 42px;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.doc-glyph::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background: rgba(255,255,255,0.28);
  border-bottom-left-radius: 6px;
}

/* History Item */
.hist-item {
  padding: 12px 12px;
  border-radius: 12px;
  margin: 2px 8px;
  transition: background 160ms cubic-bezier(0.22,1,0.36,1);
  cursor: pointer;
  color: var(--text-hi);
  font-size: 16px;
}

.hist-item:active {
  background: rgba(255,255,255,0.06);
}

.hist-item.current {
  background: var(--surface-hi);
  color: var(--text-hi);
}

/* Eyebrow Label */
.eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-lo);
  padding: 14px 16px 6px;
}

/* Project Row */
.proj-row {
  padding: 11px 14px;
  border-radius: 12px;
  margin: 2px 8px;
  transition: background 160ms cubic-bezier(0.22,1,0.36,1);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 15px;
}

.proj-row:active {
  background: rgba(255,255,255,0.06);
}

/* Ghost Button */
.ghost-btn {
  padding: 9px 14px;
  border-radius: 14px;
  background: var(--glass);
  border: 1px solid var(--line);
  color: var(--text-mid);
  font-size: 13px;
  font-weight: 600;
  min-height: 44px;
  cursor: pointer;
  transition: transform 120ms cubic-bezier(0.22,1,0.36,1);
  
  -webkit-
}

.ghost-btn:active {
  transform: scale(0.96);
}

/* Breathe Animation */
@keyframes breathe {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}

.doc-glyph{display:flex;align-items:center;justify-content:center}
.file-tile{font-family:inherit;text-align:left;border:1px solid var(--line)}
.file-tile:disabled{opacity:0.7}
.app-icon{font-family:inherit}
.ghost-btn{font-family:inherit}
.proj-row.current{background:var(--surface-hi);color:var(--text-hi)}

@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}`;

// ─── Home: the day at a glance ───────────────────────────────────────
const NOTEBOOK_URL="https://claude.ai/artifact/78TbzRawKv5XNu2UsXHsD9";
function fmtTime(t){if(!t)return"";const[h,m]=t.split(":").map(Number);const ap=h>=12?"PM":"AM";const hh=h%12||12;return m?`${hh}:${String(m).padStart(2,"0")} ${ap}`:`${hh} ${ap}`}
function dayLabel(iso,today){if(iso===today)return"Today";const d=new Date(iso+"T12:00:00");const t=new Date(today+"T12:00:00");const diff=Math.round((d-t)/86400000);if(diff===1)return"Tomorrow";return d.toLocaleDateString("en-US",{weekday:"short"})}
function HomeCard({children,style,onClick,label}){const base={background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"18px",padding:"16px",textAlign:"left",color:"inherit",display:"flex",flexDirection:"column",gap:"10px",minWidth:0,...style};return onClick?(<button onClick={onClick} aria-label={label} style={{...base,cursor:"pointer",font:"inherit"}}>{children}</button>):(<div style={base}>{children}</div>)}
function HomeView({upcoming,tasks,notes,onOpenTasks,onStart}){
  const today=upcoming?.today||new Date().toLocaleDateString("en-CA");
  const events=upcoming?.events||[];
  const todays=events.filter(e=>e.date===today);
  const later=events.filter(e=>e.date>today).slice(0,3);
  const note=(notes||[]).find(n=>n.pinned&&!n.example)||(notes||[]).find(n=>!n.example)||(notes||[])[0];
  const dateLine=new Date(today+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const row=(e,i,showDay)=>(<div key={i} style={{display:"flex",gap:"14px",alignItems:"baseline"}}>
    <span style={{width:"64px",flexShrink:0,fontSize:"14px",fontWeight:600,fontVariantNumeric:"tabular-nums",color:showDay?"var(--text-mid)":"var(--text-hi)"}}>{showDay?dayLabel(e.date,today):(e.start?fmtTime(e.start):"All day")}</span>
    <div style={{minWidth:0}}><div style={{fontSize:"16px",fontWeight:500,lineHeight:1.3}}>{e.title}</div>{(showDay&&e.start)||e.loc?(<div style={{fontSize:"13px",color:"var(--text-lo)",marginTop:"1px"}}>{[showDay&&e.start?fmtTime(e.start):"",e.loc].filter(Boolean).join(" · ")}</div>):null}</div>
  </div>);
  const starts=[["Sermon prep","Help me prep a sermon on "],["Save to notebook","Put this in my notebook: "],["Midweek devotional","Write this week's midweek devotional on "],["Add to staff calendar","Add to the staff calendar: "]];
  return(<div style={{display:"flex",flexDirection:"column",gap:"18px",padding:"8px 4px 12px",animation:"fadeUp 0.35s cubic-bezier(0.22,1,0.36,1) both"}}>
    <div>
      <div className="eyebrow2">{dateLine}</div>
      <h1 className="serif" style={{fontWeight:500,fontSize:"36px",lineHeight:1.08,letterSpacing:"-0.01em",marginTop:"6px",color:"var(--text-hi)"}}>{greeting()},<br/>Pastor.</h1>
    </div>
    <HomeCard>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span className="eyebrow2" style={{color:"var(--gold)"}}>Today</span>
        <a href="/staff-calendar.html" style={{fontSize:"13px",color:"var(--gold)",textDecoration:"none",minHeight:"28px",display:"flex",alignItems:"center"}}>Staff calendar</a>
      </div>
      {!upcoming?(<div style={{fontSize:"14px",color:"var(--text-lo)"}}>Checking the calendar…</div>)
        :todays.length?todays.map((e,i)=>row(e,i,false))
        :(<div style={{fontSize:"15px",color:"var(--text-mid)"}}>Nothing on the calendar today.</div>)}
      {later.length>0&&(<><div style={{height:"1px",background:"var(--line)"}}/><span className="eyebrow2">Coming up</span>{later.map((e,i)=>row(e,"l"+i,true))}</>)}
    </HomeCard>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"12px"}}>
      <HomeCard onClick={onOpenTasks} label="Open tasks" style={{minHeight:"118px"}}>
        <span className="eyebrow2">Open tasks</span>
        <span style={{fontSize:"15px",lineHeight:1.35,color:"var(--text-hi)"}}>{tasks.length?tasks[0].title:"Nothing open. Tell Lance what needs doing."}</span>
        {tasks.length>1&&(<span style={{fontSize:"13px",color:"var(--gold)",marginTop:"auto"}}>+{tasks.length-1} more</span>)}
      </HomeCard>
      <a href={NOTEBOOK_URL} target="_blank" rel="noreferrer" style={{textDecoration:"none",color:"inherit",display:"flex"}}>
        <HomeCard style={{minHeight:"118px",flex:1}}>
          <span className="eyebrow2">Notebook</span>
          <span className="serif" style={{fontSize:"16px",lineHeight:1.3,color:"var(--text-hi)"}}>{note?note.title:"Your notebook is empty."}</span>
          {note?.refs?.length>0&&(<span style={{fontSize:"13px",color:"var(--gold)",marginTop:"auto"}}>{note.refs[0]}</span>)}
        </HomeCard>
      </a>
    </div>
    <div>
      <div className="eyebrow2" style={{marginBottom:"10px"}}>Start with</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
        {starts.map(([label,prompt])=>(<button key={label} onClick={()=>onStart(prompt)} style={{minHeight:"40px",padding:"0 14px",borderRadius:"20px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",fontSize:"14px",cursor:"pointer"}}>{label}</button>))}
      </div>
    </div>
  </div>);
}
function IconBtn({onClick,label,children,active,badge,style}){return(<button onClick={onClick} aria-label={label} title={label} style={{position:"relative",width:"44px",height:"44px",borderRadius:"14px",border:`1px solid ${active?"var(--gold)":"var(--line)"}`,background:active?"rgba(212,175,90,0.14)":"var(--surface)",color:active?"var(--gold-hi)":"var(--text-hi)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,...style}}>{children}{badge?(<span style={{position:"absolute",top:"-5px",right:"-5px",minWidth:"20px",height:"20px",padding:"0 5px",borderRadius:"10px",background:"var(--gold)",color:"#0D1420",fontSize:"12px",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{badge}</span>):null}</button>)}
const ArrowMark=({size=26})=>(<svg width={size} height={size*30/26} viewBox="0 0 26 30" aria-hidden="true"><path d="M13 1 L24 28 L13 22 Z" fill="#D4AF5A"/><path d="M13 1 L2 28 L13 22 Z" fill="#A8823A"/></svg>);

export default function App(){
  const[messages,setMessages]=useState([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[memoryFacts,setMemoryFacts]=useState([]);
  const[profile,setProfile]=useState([]);
  const[recentSessions,setRecentSessions]=useState([]);
  const[teachMode,setTeachMode]=useState(false);
  const voiceModeRef=useRef(false);
  useEffect(()=>{voiceModeRef.current=teachMode},[teachMode]);
  const[speakingIdx,setSpeakingIdx]=useState(null);
  const[loadingIdx,setLoadingIdx]=useState(null);
  const[pendingFiles,setPendingFiles]=useState([]);
  const[dragOver,setDragOver]=useState(false);
  const[docxIdx,setDocxIdx]=useState(null);
  const[copiedIdx,setCopiedIdx]=useState(null);
  const[listening,setListening]=useState(false);
  const[downloadingIdx,setDownloadingIdx]=useState(null);
  const[showSaved,setShowSaved]=useState(false);
  const[libQuery,setLibQuery]=useState("");
  const[editingId,setEditingId]=useState(null);
  const[smsStatusByIdx,setSmsStatusByIdx]=useState({});
  const[previewDoc,setPreviewDoc]=useState(null);
  const[videoStateByIdx,setVideoStateByIdx]=useState({});
  const[micLevels,setMicLevels]=useState([0,0,0,0,0]);
  const micCtxRef=useRef(null);const micStreamRef=useRef(null);const micAnalyserRef=useRef(null);const micAnimRef=useRef(null);
  const interruptRecRef=useRef(null);
  const voiceAudioUnlockRef=useRef(null);
  const[micMuted,setMicMuted]=useState(false);
  const micMutedRef=useRef(false);
  useEffect(()=>{micMutedRef.current=micMuted},[micMuted]);
  const[staffEventStatusByIdx,setStaffEventStatusByIdx]=useState({});
  const[staffNoteStatusByIdx,setStaffNoteStatusByIdx]=useState({});
  const[openTasks,setOpenTasks]=useState([]);
  const[brainNotes,setBrainNotes]=useState([]);
  const[upcoming,setUpcoming]=useState(null);
  const[voiceSession,setVoiceSession]=useState(false);
  useEffect(()=>{if(!teachMode)setVoiceSession(false)},[teachMode]);
  const refreshBrain=useCallback(()=>{loadBrainNotes().then(n=>{if(Array.isArray(n))setBrainNotes(n)}).catch(()=>{})},[]);
  const handleBrainTags=useCallback((raw)=>{const notes=parseBrainTags(raw);if(!notes.length)return;Promise.all(notes.map(n=>saveBrainNote(n).catch(e=>console.error(e)))).then(refreshBrain)},[refreshBrain]);
  const[showTasks,setShowTasks]=useState(false);
    const[editTitle,setEditTitle]=useState("");
  const[savedConvos,setSavedConvos]=useState([]);
  const[projects,setProjects]=useState([]);
  const[activeProjectId,setActiveProjectId]=useState(null);
  const[projFormMode,setProjFormMode]=useState(null);
  const[projName,setProjName]=useState("");
  const[projDesc,setProjDesc]=useState("");
  const[projEditId,setProjEditId]=useState(null);
  const[activeConvoId,setActiveConvoId]=useState(null);

  const bottomRef=useRef(null);
  const inputRef=useRef(null);
  const audioRef=useRef(null);
  const fileRef=useRef(null);
  const recognitionRef=useRef(null);
  const msgCount=useRef(0);
  const chatIdRef=useRef(null);
  useEffect(()=>{chatIdRef.current=activeConvoId},[activeConvoId]);
  const projRef=useRef(null);
  useEffect(()=>{projRef.current=activeProjectId},[activeProjectId]);
  const activeProject=projects.find(p=>p.id===activeProjectId)||null;

  useEffect(()=>{
    (async()=>{
      const[f,p,s,c,pr]=await Promise.all([
        loadMemory().catch(()=>[]),
        loadProfile().catch(()=>[]),
        loadRecentSessions().catch(()=>[]),
        loadPinned().catch(()=>[]),
        loadProjectsDb().catch(()=>[]),
      ]);
      setProjects(Array.isArray(pr)?pr:[]);
      setMemoryFacts(Array.isArray(f)?f:[]);
      setProfile(Array.isArray(p)?p:[]);
      setRecentSessions(Array.isArray(s)?s:[]);
      setSavedConvos(Array.isArray(c)?c:[]);
    })();
    (async()=>{
      try{const t=await loadOpenTasks();setOpenTasks(Array.isArray(t)?t:[])}catch(e){}
    })();
    refreshBrain();
    fetch(`${DB_URL}/upcoming?days=7`,{headers:SB_HEADERS}).then(r=>r.ok?r.json():null).then(d=>{if(d&&Array.isArray(d.events))setUpcoming(d);else setUpcoming({events:[]})}).catch(()=>setUpcoming({events:[]}));
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages,loading]);

  const stopSpeaking=useCallback(()=>{
    if(audioRef.current){audioRef.current.pause();audioRef.current=null}
    if(interruptRecRef.current){try{interruptRecRef.current.abort()}catch(e){}interruptRecRef.current=null}
    setSpeakingIdx(null);setLoadingIdx(null);
  },[]);

  const stopInterruptListener=useCallback(()=>{
    if(interruptRecRef.current){
      try{interruptRecRef.current.onspeechstart=null;interruptRecRef.current.onresult=null;interruptRecRef.current.onerror=null;interruptRecRef.current.onend=null;interruptRecRef.current.abort()}catch(e){}
      interruptRecRef.current=null;
    }
  },[]);
  const startInterruptListener=useCallback(()=>{
    if(micMutedRef.current)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    try{
      const rec=new SR();rec.lang="en-US";rec.continuous=true;rec.interimResults=true;
      const barge=()=>{
        if(!interruptRecRef.current)return; // already torn down, ignore stray events
        stopInterruptListener();
        if(audioRef.current){try{audioRef.current.pause()}catch(e){}}
        setSpeakingIdx(null);setLoadingIdx(null);
        startListening();
      };
      rec.onspeechstart=barge;
      rec.onresult=barge; // fallback for browsers that skip onspeechstart
      rec.onerror=()=>{interruptRecRef.current=null};
      rec.onend=()=>{interruptRecRef.current=null};
      interruptRecRef.current=rec;
      rec.start();
    }catch(e){/* barge-in is a nice-to-have, voice still works without it */}
  },[stopInterruptListener]);
  const speakText=useCallback(async(text,idx)=>{
    stopSpeaking();setLoadingIdx(idx);
    try{
      const res=await fetch(TTS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
      if(res.ok&&res.headers.get("content-type")?.includes("audio")){
        const blob=await res.blob();const url=URL.createObjectURL(blob);
        // Reuse the gesture-unlocked element from voice mode if we have one -- a fresh
        // Audio() here has no tie to any user gesture and iOS will silently refuse to play it.
        const audio=voiceModeRef.current&&voiceAudioUnlockRef.current?voiceAudioUnlockRef.current:new Audio();
        audio.src=url;
        audio.onplay=()=>{setLoadingIdx(null);setSpeakingIdx(idx);if(voiceModeRef.current)startInterruptListener()};
        audio.onended=()=>{stopInterruptListener();setSpeakingIdx(null);if(audioRef.current===audio)audioRef.current=null;URL.revokeObjectURL(url);if(voiceModeRef.current){setTimeout(()=>startListening(),700)}};
        audio.onerror=()=>{stopInterruptListener();setSpeakingIdx(null);if(audioRef.current===audio)audioRef.current=null};
        audioRef.current=audio;audio.play().catch(()=>{setSpeakingIdx(null);setLoadingIdx(null)});
      }else{
        setLoadingIdx(null);setSpeakingIdx(idx);
        if(voiceModeRef.current)startInterruptListener();
        const utt=new SpeechSynthesisUtterance(text.slice(0,2000));
        utt.rate=0.95;utt.onend=()=>{stopInterruptListener();setSpeakingIdx(null);if(voiceModeRef.current){setTimeout(()=>startListening(),700)}};
        window.speechSynthesis.speak(utt);
        audioRef.current={pause:()=>window.speechSynthesis.cancel()};
      }
    }catch(e){setLoadingIdx(null);setSpeakingIdx(null)}
  },[stopSpeaking,startInterruptListener,stopInterruptListener]);

  const stopMicMeter=useCallback(()=>{
    if(micAnimRef.current)cancelAnimationFrame(micAnimRef.current);
    micAnimRef.current=null;
    if(micStreamRef.current){micStreamRef.current.getTracks().forEach(t=>t.stop());micStreamRef.current=null}
    if(micCtxRef.current){micCtxRef.current.close().catch(()=>{});micCtxRef.current=null}
    micAnalyserRef.current=null;
    setMicLevels([0,0,0,0,0]);
  },[]);
  const startMicMeter=useCallback(async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      micStreamRef.current=stream;
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      micCtxRef.current=ctx;
      const source=ctx.createMediaStreamSource(stream);
      const analyser=ctx.createAnalyser();analyser.fftSize=256;
      source.connect(analyser);
      micAnalyserRef.current=analyser;
      const data=new Uint8Array(analyser.frequencyBinCount);
      const weights=[0.5,0.8,1,0.8,0.5];
      const tick=()=>{
        analyser.getByteTimeDomainData(data);
        let sum=0;for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;sum+=v*v}
        const rms=Math.sqrt(sum/data.length);
        const level=Math.min(1,rms*4.5);
        setMicLevels(weights.map(w=>Math.min(1,level*w*(0.85+Math.random()*0.3))));
        micAnimRef.current=requestAnimationFrame(tick);
      };
      tick();
    }catch(e){/* mic level meter is optional, recognition still works without it */}
  },[]);
  const startListening=useCallback(()=>{
    if(micMutedRef.current)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    const rec=new SR();rec.lang="en-US";rec.continuous=false;rec.interimResults=false;
    rec.onstart=()=>{setListening(true);startMicMeter()};
    rec.onresult=(e)=>{const t=e.results[0][0].transcript;setListening(false);stopMicMeter();if(t.trim())setTimeout(()=>sendText(t.trim(),true),100)};
    rec.onerror=()=>{setListening(false);stopMicMeter()};rec.onend=()=>{setListening(false);stopMicMeter()};
    recognitionRef.current=rec;rec.start();
  },[startMicMeter,stopMicMeter]);
  const toggleMic=useCallback(()=>{
    if(listening){recognitionRef.current?.stop();setListening(false);return}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Try Safari on iPhone for voice input.");return}
    startListening();
  },[listening,startListening]);
  const toggleVoiceConversation=useCallback((forceStart)=>{
    if(teachMode&&forceStart!==true){
      setTeachMode(false);stopSpeaking();
      if(listening){recognitionRef.current?.stop();setListening(false)}
      return;
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Try Safari on iPhone for voice conversation.");return}
    // Unlock audio playback for the whole voice session right here, inside the real tap.
    // iOS only allows autoplay-free audio on elements that were played during an actual
    // user gesture -- a brand new Audio() built later when a reply comes back is not tied
    // to any gesture and gets silently blocked. Playing a silent clip on THIS element, right
    // now, and reusing this same element for every reply in the session keeps it unlocked.
    if(!voiceAudioUnlockRef.current){
      const a=new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAAAA");
      a.play().catch(()=>{});
      voiceAudioUnlockRef.current=a;
    }else{
      voiceAudioUnlockRef.current.play().catch(()=>{});
    }
    setTeachMode(true);startListening();
  },[teachMode,listening,startListening,stopSpeaking]);

  // Autosave: every conversation persists without a save button
  const autosaveChat=useCallback(async(msgs)=>{
    try{
      const clean=msgs.map(({role,content})=>({role,content}));
      const firstUser=msgs.find(m=>m.role==="user")?.content||"New chat";
      const title=firstUser.slice(0,44)+(firstUser.length>44?"\u2026":"");
      const last=msgs[msgs.length-1]?.content||"";
      const summary=last.slice(0,80);
      if(chatIdRef.current){
        await updateChatRow(chatIdRef.current,{messages:clean,summary});
      }else{
        const rows=await saveConversation(title,summary,clean,projRef.current);
        if(rows&&rows[0]?.id){chatIdRef.current=rows[0].id;setActiveConvoId(rows[0].id);}
      }
      loadPinned().then(cc=>{if(Array.isArray(cc))setSavedConvos(cc)}).catch(()=>{});
    }catch(e){}
  },[]);

  // Projects
  const refreshProjects=useCallback(async()=>{
    const pr=await loadProjectsDb().catch(()=>[]);
    setProjects(Array.isArray(pr)?pr:[]);
  },[]);
  const handleProjSubmit=useCallback(async()=>{
    const n=projName.trim();if(!n)return;
    if(projFormMode==="edit"&&projEditId){await updateProjectRow(projEditId,{name:n,description:projDesc.trim()});}
    else{const rows=await createProjectRow(n,projDesc.trim());if(rows&&rows[0]?.id)setActiveProjectId(rows[0].id);}
    setProjFormMode(null);setProjName("");setProjDesc("");setProjEditId(null);
    refreshProjects();
  },[projName,projDesc,projFormMode,projEditId,refreshProjects]);
  const handleProjDelete=useCallback(async(id)=>{
    await deleteProjectRow(id);
    if(activeProjectId===id)setActiveProjectId(null);
    refreshProjects();
  },[activeProjectId,refreshProjects]);

  // Pin/unpin a conversation
  const handlePin=useCallback(async(convo)=>{
    await togglePin(convo.id,!convo.pinned);
    const updated=await loadPinned().catch(()=>[]);
    setSavedConvos(Array.isArray(updated)?updated:[]);
  },[]);

  // Load a saved conversation
  const handleLoadConvo=useCallback((convo)=>{
    stopSpeaking();
    setMessages(Array.isArray(convo.messages)?convo.messages:[]);
    setActiveConvoId(convo.id);
    setActiveProjectId(convo.project_id||null);
    setShowSaved(false);
    msgCount.current=convo.messages?.length||0;
  },[stopSpeaking]);

  // Delete a saved conversation
  const handleDeleteConvo=useCallback(async(id)=>{
    await deleteConversation(id);
    const updated=await loadPinned().catch(()=>[]);
    setSavedConvos(Array.isArray(updated)?updated:[]);
    if(activeConvoId===id){setActiveConvoId(null)}
  },[activeConvoId]);
  const startRename=useCallback((c)=>{setEditingId(c.id);setEditTitle(c.title||"")},[]);
  const commitRename=useCallback(async()=>{
    if(editingId&&editTitle.trim()){
      await renameConversation(editingId,editTitle.trim());
      const updated=await loadPinned().catch(()=>[]);
      setSavedConvos(Array.isArray(updated)?updated:[]);
    }
    setEditingId(null);setEditTitle("");
  },[editingId,editTitle]);

  const handleFiles=useCallback(async(fileList)=>{
    const files=Array.from(fileList);
    const read=await Promise.all(files.map(readFile));
    setPendingFiles(prev=>[...prev,...read]);
  },[]);

  const removeFile=useCallback((idx)=>{setPendingFiles(prev=>prev.filter((_,i)=>i!==idx))},[]);
  const onDrop=useCallback((e)=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files.length)handleFiles(e.dataTransfer.files)},[handleFiles]);

  const handleDownload=async(text,idx)=>{
    try{
      setDocxIdx(idx);setDownloadingIdx(idx);
      const res=await fetch(DOCX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,filename:generateFilename(text)})});
      if(!res.ok)throw new Error("Docx failed: "+res.status);
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=(generateFilename(text)||"Lance Document")+".docx";
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      setDownloadingIdx(null);
    }catch(e){setDownloadingIdx(null);alert("Download failed: "+e.message)}
  };
  const handleDownloadPptx=async(text,idx)=>{
    try{
      setDownloadingIdx(idx);
      const titleLine=text.split("\n").find(l=>l.trim().startsWith("#"));
      const pptxTitle=titleLine?titleLine.replace(/^#+\s*/,"").trim():"Lance Presentation";
      const res=await fetch(PPTX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,filename:generateFilename(text),title:pptxTitle})});
      if(!res.ok)throw new Error("Pptx failed: "+res.status);
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=(generateFilename(text)||"Lance Presentation")+".pptx";
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      setDownloadingIdx(null);
    }catch(e){setDownloadingIdx(null);alert("Download failed: "+e.message)}
  };
  const handleGenerateFlyer=async(flyerData,idx)=>{
    try{
      setDownloadingIdx(idx);
      const res=await fetch(FLYER_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...flyerData,filename:flyerData.title||"lance-flyer"})});
      if(!res.ok)throw new Error("Flyer failed: "+res.status);
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=(flyerData.title||"Lance Flyer").replace(/[^a-zA-Z0-9 ]/g," ").trim()+".svg";
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      setDownloadingIdx(null);
    }catch(e){setDownloadingIdx(null);alert("Flyer failed: "+e.message)}
  };
  const handleSendSms=useCallback(async(smsData,idx)=>{
    if(!smsData?.message)return;
    setSmsStatusByIdx(p=>({...p,[idx]:"sending"}));
    try{
      if(smsData.sendAt){
        const r=await fetch(`${DB_URL}/lance_notifications`,{
          method:"POST",headers:SB_HEADERS,
          body:JSON.stringify({channel:"sms",message:smsData.message,send_at:smsData.sendAt})
        });
        if(!r.ok)throw new Error("Schedule failed");
        setSmsStatusByIdx(p=>({...p,[idx]:"sent"}));
      }else{
        const res=await fetch(SMS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:smsData.message})});
        const data=await res.json();
        if(data.success){setSmsStatusByIdx(p=>({...p,[idx]:"sent"}))}
        else{setSmsStatusByIdx(p=>({...p,[idx]:"error"}));console.error("SMS error:",data.error)}
      }
    }catch(e){setSmsStatusByIdx(p=>({...p,[idx]:"error"}));console.error(e)}
  },[]);
  const handleWatchVideo=useCallback(async(videoData,idx)=>{
    if(!videoData?.url)return;
    setVideoStateByIdx(p=>({...p,[idx]:{status:"watching"}}));
    try{
      const res=await fetch(WATCH_VIDEO_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(videoData)});
      const data=await res.json();
      if(res.ok&&data.analysis){setVideoStateByIdx(p=>({...p,[idx]:{status:"done",analysis:data.analysis}}))}
      else{setVideoStateByIdx(p=>({...p,[idx]:{status:"error",error:data.error||"Video watch failed."}}))}
    }catch(e){setVideoStateByIdx(p=>({...p,[idx]:{status:"error",error:e.message}}))}
  },[]);
  const handleAddStaffEvent=useCallback(async(msgIdx,evIdx,ev)=>{
    const key=`${msgIdx}:${evIdx}`;
    setStaffEventStatusByIdx(p=>({...p,[key]:"sending"}));
    try{
      await saveStaffEvent(ev);
      setStaffEventStatusByIdx(p=>({...p,[key]:"sent"}));
    }catch(e){setStaffEventStatusByIdx(p=>({...p,[key]:"error"}));console.error("Staff event error:",e)}
  },[]);
  const handleAddAllStaffEvents=useCallback(async(msgIdx,events)=>{
    for(let i=0;i<events.length;i++){await handleAddStaffEvent(msgIdx,i,events[i])}
  },[handleAddStaffEvent]);
  const handleAddStaffNote=useCallback(async(msgIdx,note)=>{
    setStaffNoteStatusByIdx(p=>({...p,[msgIdx]:"sending"}));
    try{
      await saveStaffNote(note);
      setStaffNoteStatusByIdx(p=>({...p,[msgIdx]:"sent"}));
    }catch(e){setStaffNoteStatusByIdx(p=>({...p,[msgIdx]:"error"}));console.error("Staff note error:",e)}
  },[]);
  const handleAddTask=useCallback(async(taskData)=>{
    if(!taskData?.title)return;
    try{
      await saveTask(taskData.title,taskData.due,taskData.category);
      const t=await loadOpenTasks();
      setOpenTasks(Array.isArray(t)?t:[]);
    }catch(e){console.error("Task save error:",e)}
  },[]);
  const handleCompleteTask=useCallback(async(id)=>{
    try{await completeTask(id);const t=await loadOpenTasks();setOpenTasks(Array.isArray(t)?t:[])}catch(e){console.error(e)}
  },[]);
  const handleDeleteTask=useCallback(async(id)=>{
    try{await deleteTask(id);const t=await loadOpenTasks();setOpenTasks(Array.isArray(t)?t:[])}catch(e){console.error(e)}
  },[]);

  const handleCopy=async(text,idx)=>{
    try{await navigator.clipboard.writeText(text);setCopiedIdx(idx);setTimeout(()=>setCopiedIdx(null),2000)}catch(e){}
  };

  const detectIntent=(t)=>{
    // Notes, saves, calendar and task requests go to Lance himself, even when they quote Scripture.
    if(/\b(notebook|jot|save this|remember|staff calendar|calendar|remind|task)\b/i.test(t))return null;
    // Sermon prep: asked for by name, or the message is nothing but a passage reference.
    if(/\b(sermon prep|preach on|sermon on|exegete|exposition of)\b/i.test(t))return"sermon";
    if(/^\s*(prep\s+)?[1-3]?\s?[A-Z][a-z]+\.?\s+\d+(:\d+(\s*[-–]\s*\d+)?)?\s*$/.test(t))return"sermon";
    if(/\b(exam|quiz|fill.in)\b/i.test(t))return"exam";
    if(/\b(devotion|devos|daily word|morning word)\b/i.test(t))return"devotion";
    return null;
  };

  const sendText=useCallback(async(t,viaVoice=false)=>{
    if(!t||loading)return;
    stopSpeaking();
    const next=[...messages,{role:"user",content:t}];
    setMessages(next);setLoading(true);
    saveMessage("user",t).catch(()=>{});
    try{
      const intent=detectIntent(t);let raw="";
      if(intent==="devotion"){const res=await fetch(DEVOTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});const data=await res.json();raw=data.content||"Could not generate devotion.";}
      else if(intent==="sermon"){const res=await fetch(SERMON_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference:t})});const data=await res.json();raw=data.content||"Could not generate sermon prep.";}
      else if(intent==="exam"){const res=await fetch(EXAM_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:t,questionCount:20})});const data=await res.json();raw=data.content||"Could not generate exam.";}
      else{
        let searchContext="";
        const needsSearch=/\b(latest|current|recent|today|news|2024|2025|2026|price|weather|who is|what is|how much|when did|search|look up|find out|research)\b/i.test(t);
        if(needsSearch&&t.length>10){try{const sd=await webSearch(t,5);if(sd.results?.length>0){searchContext="\n\n[WEB SEARCH RESULTS for: "+t+"]\n"+formatSearchResults(sd)+"\n[END SEARCH RESULTS]"}}catch(e){}}
        let apiMessages=next;
        if(searchContext){const last=next[next.length-1];const lc=typeof last.content==="string"?last.content:t;apiMessages=[...next.slice(0,-1),{role:"user",content:lc+searchContext}];}
        const cleanMessages=apiMessages.map(({role,content})=>({role,content}));
        raw=await callClaude(cleanMessages,memoryFacts,recentSessions,[],profile,activeProject,brainNotes);
      }
      const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=(intent==="sermon"||intent==="exam")?true:detectDocumentContent(clean,recentUserIntent(next));
      const finalMsgs=[...next,{role:"assistant",content:clean,isDoc,flyerData:parseFlyerTag(raw),smsData:parseSmsTag(raw),videoData:parseVideoTag(raw),taskData:parseTaskTag(raw),staffEventsData:parseStaffEventTags(raw),staffNotesData:parseStaffNoteTags(raw),brainData:parseBrainTags(raw)}];setMessages(finalMsgs);
      const _taskTag=parseTaskTag(raw);if(_taskTag?.title){handleAddTask(_taskTag)}handleBrainTags(raw);autosaveChat(finalMsgs);msgCount.current+=2;
      saveMessage("assistant",clean).catch(()=>{});
      for(const tag of tags){
        if(tag.type==="memory"){saveMemoryFact(tag.category,tag.fact,tag.confidence,SESSION_ID).catch(()=>{});}
        else if(tag.type==="profile"){saveProfileFact(tag.domain,tag.key,tag.value,tag.confidence).catch(()=>{});setProfile(prev=>[...prev.filter(p=>!(p.domain===tag.domain&&p.key===tag.key)),{domain:tag.domain,key:tag.key,value:tag.value,confidence:tag.confidence,active:true}]);}
      }
      if(tags.some(t=>t.type==="memory")){loadMemory().then(f=>{if(Array.isArray(f))setMemoryFacts(f)}).catch(()=>{});}
      if(msgCount.current%4===0){saveSession("general",`${t.slice(0,90)}${t.length>90?"…":""}`,msgCount.current).catch(()=>{});}
      if(teachMode||viaVoice)speakText(clean,idx);if(isDoc)setDocxIdx(idx);
    }catch(e){setMessages([...next,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
    setLoading(false);
  },[loading,messages,memoryFacts,profile,recentSessions,teachMode,stopSpeaking,speakText,activeProject,autosaveChat,brainNotes,handleBrainTags]);

  const send=useCallback(async(textOverride)=>{
    const t=(textOverride||input).trim();
    if((!t&&pendingFiles.length===0)||loading)return;
    setInput("");if(inputRef.current)inputRef.current.style.height="auto";
    if(pendingFiles.length>0){
      const filesToSend=[...pendingFiles];setPendingFiles([]);
      const displayText=t||(filesToSend.length>0?`[${filesToSend.map(f=>f.name).join(", ")}]`:"");
      const next=[...messages,{role:"user",content:displayText}];
      setMessages(next);setLoading(true);
      if(t)saveMessage("user",t).catch(()=>{});
      try{
        const cleanMessages=next.map(({role,content})=>({role,content}));
        const raw=await callClaude(cleanMessages,memoryFacts,recentSessions,filesToSend,profile,activeProject,brainNotes);
        const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean,recentUserIntent(next));
        const finalMsgs=[...next,{role:"assistant",content:clean,isDoc,flyerData:parseFlyerTag(raw),smsData:parseSmsTag(raw),videoData:parseVideoTag(raw),taskData:parseTaskTag(raw),staffEventsData:parseStaffEventTags(raw),staffNotesData:parseStaffNoteTags(raw),brainData:parseBrainTags(raw)}];setMessages(finalMsgs);
      const _taskTag=parseTaskTag(raw);if(_taskTag?.title){handleAddTask(_taskTag)}handleBrainTags(raw);autosaveChat(finalMsgs);msgCount.current+=2;
        saveMessage("assistant",clean).catch(()=>{});
        if(teachMode)speakText(clean,idx);
      }catch(e){setMessages(prev=>[...prev,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
      setLoading(false);
    }else{sendText(t);}
  },[input,loading,messages,memoryFacts,profile,recentSessions,pendingFiles,teachMode,stopSpeaking,speakText,sendText,activeProject,autosaveChat,brainNotes,handleBrainTags]);

  const handleKeyDown=e=>{};
  const clearChat=()=>{stopSpeaking();setMessages([]);setPendingFiles([]);setDocxIdx(null);setActiveConvoId(null);chatIdRef.current=null;msgCount.current=0};

  const pinnedConvos=savedConvos.filter(c=>c.pinned&&c.active!==false);
  const allSaved=savedConvos.filter(c=>c.active!==false);
  const isEmpty=messages.length===0;

  return(<><style>{CSS}</style>
  <div style={{height:"100%",display:"flex",flexDirection:"column",background:"transparent",position:"relative",zIndex:1}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>

    {/* Drag overlay */}
    {dragOver&&(<div style={{position:"fixed",inset:0,background:"rgba(212,175,90,0.10)",border:"2px dashed rgba(212,175,90,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{color:"#fff",fontSize:"18px",fontWeight:600}}>Drop file or screenshot</div></div>)}

    {showTasks&&(<TasksPanel tasks={openTasks} onClose={()=>setShowTasks(false)} onComplete={handleCompleteTask} onDelete={handleDeleteTask} onAdd={handleAddTask}/>)}

    {/* Document preview overlay */}
    {previewDoc&&(<DocPreviewModal
      text={previewDoc.text}
      filename={previewDoc.filename}
      downloading={downloadingIdx===previewDoc.idx}
      onClose={()=>setPreviewDoc(null)}
      onDownloadWord={()=>handleDownload(previewDoc.text,previewDoc.idx)}
      onDownloadPptx={()=>handleDownloadPptx(previewDoc.text,previewDoc.idx)}
    />)}


    {/* Voice mode */}
    {voiceSession&&teachMode&&(()=>{
      const lastUser=[...messages].reverse().find(m=>m.role==="user");
      const lastLance=[...messages].reverse().find(m=>m.role==="assistant");
      const state=micMuted?"Muted":listening?"Listening":loading?"Thinking":speakingIdx!==null?"Speaking":"Your turn";
      const hint=micMuted?"Tap Mute again to let Lance hear you.":state==="Speaking"?"Talk over Lance anytime to cut in.":"Lance answers out loud when you pause.";
      const quote=state==="Speaking"&&lastLance?lastLance.content:(lastUser?.content||"");
      const endVoice=()=>{setVoiceSession(false);toggleVoiceConversation()};
      const toggleMute=()=>setMicMuted(m=>{const next=!m;if(next){if(recognitionRef.current){try{recognitionRef.current.abort()}catch(e){}}if(interruptRecRef.current){try{interruptRecRef.current.abort()}catch(e){}interruptRecRef.current=null}setListening(false)}return next});
      const bars=listening?micLevels:[0.25,0.5,0.8,0.45,0.65,0.3,0.5];
      return(<div role="dialog" aria-label="Voice conversation with Lance" style={{position:"fixed",inset:0,zIndex:350,background:"var(--bg0)",display:"flex",flexDirection:"column",alignItems:"center",padding:"calc(16px + env(safe-area-inset-top,0px)) 20px calc(28px + env(safe-area-inset-bottom,0px))",animation:"fadeIn 200ms cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{alignSelf:"stretch",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span className="eyebrow2">{activeProject?`Voice · ${activeProject.name}`:"Voice"}</span>
          <button onClick={endVoice} aria-label="Switch to typing" title="Switch to typing" style={{width:"44px",height:"44px",borderRadius:"14px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8h1M9.5 8h1M13.5 8h1M6.5 12h7"/></svg>
          </button>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"0",width:"100%",maxWidth:"420px"}}>
          <div style={{width:"220px",height:"220px",borderRadius:"50%",border:"1px solid var(--line)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:"172px",height:"172px",borderRadius:"50%",border:`1px solid ${listening?"rgba(212,175,90,0.55)":"rgba(212,175,90,0.22)"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"border-color 200ms"}}>
              <div style={{width:"126px",height:"126px",borderRadius:"50%",background:"var(--surface)",border:"2px solid var(--gold)",display:"flex",alignItems:"center",justifyContent:"center",animation:state==="Speaking"?"breathe 1.6s ease-in-out infinite":"none"}}><ArrowMark size={48}/></div>
            </div>
          </div>
          <div aria-hidden="true" style={{marginTop:"26px",display:"flex",alignItems:"center",gap:"5px",height:"34px"}}>
            {bars.map((lvl,i)=>(<span key={i} style={{width:"4px",height:`${8+lvl*26}px`,borderRadius:"2px",background:micMuted?"var(--line-hi)":"var(--gold)",transition:"height 60ms linear"}}/>))}
          </div>
          <div aria-live="polite" style={{marginTop:"10px",fontSize:"20px",fontWeight:600,color:"var(--text-hi)"}}>{state}</div>
          {quote&&(<div className="serif" style={{marginTop:"22px",padding:"0 12px",textAlign:"center",fontSize:"21px",lineHeight:1.4,color:"var(--text-hi)",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{state==="Speaking"?quote:`“${quote}”`}</div>)}
          <div style={{marginTop:"12px",textAlign:"center",fontSize:"14px",lineHeight:1.5,color:"var(--text-lo)"}}>{hint}</div>
        </div>
        <div style={{display:"flex",gap:"28px",alignItems:"flex-start"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px"}}>
            <button onClick={toggleMute} aria-pressed={micMuted} aria-label={micMuted?"Unmute microphone":"Mute microphone"} style={{width:"64px",height:"64px",borderRadius:"32px",border:`1px solid ${micMuted?"var(--gold)":"var(--line-hi)"}`,background:micMuted?"rgba(212,175,90,0.16)":"var(--surface)",color:micMuted?"var(--gold-hi)":"var(--text-hi)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="7" y="2.5" width="6" height="10" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5"/>{micMuted&&(<path d="M3 3l14 14"/>)}</svg>
            </button>
            <span style={{fontSize:"13px",color:"var(--text-lo)"}}>{micMuted?"Unmute":"Mute"}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px"}}>
            <button onClick={endVoice} aria-label="End voice conversation" style={{width:"64px",height:"64px",borderRadius:"32px",border:"none",background:"#C2502E",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>
            </button>
            <span style={{fontSize:"13px",color:"var(--text-lo)"}}>End</span>
          </div>
        </div>
      </div>);
    })()}
    {/* Listening overlay */}
    {listening&&!voiceSession&&(<div style={{position:"fixed",inset:0,background:"rgba(10,16,26,0.9)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn 200ms cubic-bezier(0.22,1,0.36,1)"}} onClick={toggleMic}><div className="wave" style={{transform:"scale(2)",marginBottom:"32px"}}>
      {micLevels.map((lvl,i)=>(<span key={i} style={{height:`${8+lvl*26}px`,transition:"height 60ms linear",animation:"none"}}/>))}
    </div><div style={{color:"var(--text-hi)",fontSize:"20px",fontWeight:600,marginBottom:"8px",letterSpacing:"-0.02em"}}>Listening</div><div style={{color:"var(--text-lo)",fontSize:"14px"}}>Tap anywhere to cancel</div></div>)}

    {/* Library panel: projects + full chat history */}
    {showSaved&&(<div className="saved-backdrop" onClick={()=>setShowSaved(false)}/>)}
    {showSaved&&(<div className="saved-panel">
      <div style={{padding:"calc(14px + env(safe-area-inset-top,0px)) 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <h2 className="serif" style={{fontSize:"30px",fontWeight:500,color:"var(--text-hi)"}}>Library</h2>
        <button onClick={()=>setShowSaved(false)} aria-label="Close library" style={{width:"44px",height:"44px",borderRadius:"14px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l10 10M14 4L4 14"/></svg>
        </button>
      </div>
      <div style={{padding:"16px 20px 12px",display:"flex",flexDirection:"column",gap:"10px"}}>
        <label htmlFor="lib-search" style={{position:"absolute",width:"1px",height:"1px",overflow:"hidden",clip:"rect(0 0 0 0)"}}>Search chats</label>
        <div style={{display:"flex",alignItems:"center",gap:"10px",height:"46px",padding:"0 14px",borderRadius:"14px",background:"var(--surface)",border:"1px solid var(--line)",color:"var(--text-lo)"}}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="5"/><path d="M12 12l4 4"/></svg>
          <input id="lib-search" type="text" enterKeyHint="search" autoComplete="off" value={libQuery} onChange={e=>setLibQuery(e.target.value)} placeholder="Search chats" style={{flex:1,minWidth:0,border:"none",background:"transparent",color:"var(--text-hi)",fontSize:"16px",outline:"none"}}/>
          {libQuery&&(<button onClick={()=>setLibQuery("")} aria-label="Clear search" style={{width:"32px",height:"32px",border:"none",background:"none",color:"var(--text-lo)",cursor:"pointer",fontSize:"18px"}}>×</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"10px"}}>
          <button onClick={()=>{clearChat();setShowSaved(false)}} style={{height:"46px",borderRadius:"14px",border:"none",background:"var(--gold)",color:"#0D1420",fontSize:"15px",fontWeight:600,cursor:"pointer"}}>New chat</button>
          <button onClick={()=>{setProjFormMode("new");setProjName("");setProjDesc("");setProjEditId(null)}} style={{height:"46px",borderRadius:"14px",border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)",fontSize:"15px",fontWeight:500,cursor:"pointer"}}>New project</button>
        </div>
      </div>
      {projFormMode&&(<div style={{margin:"0 12px 12px",padding:"12px",background:"var(--glass)",border:"1px solid var(--line)",borderRadius:"14px"}}>
        <input autoFocus value={projName} onChange={e=>setProjName(e.target.value)} placeholder="Project name" style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid var(--line)",borderRadius:"10px",color:"var(--text-hi)",fontSize:"15px",padding:"9px 11px",marginBottom:"8px",outline:"none",fontFamily:"inherit"}}/>
        <textarea value={projDesc} onChange={e=>setProjDesc(e.target.value)} placeholder="Describe this folder. Every chat inside follows these instructions." rows={3} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid var(--line)",borderRadius:"10px",color:"var(--text-hi)",fontSize:"14px",padding:"9px 11px",marginBottom:"8px",outline:"none",resize:"vertical",fontFamily:"inherit",lineHeight:1.5}}/>
        <div style={{display:"flex",gap:"8px"}}>
          <button className="ghost-btn" style={{flex:1,background:"#D4AF5A",color:"#0D1420",border:"none"}} onClick={handleProjSubmit}>{projFormMode==="edit"?"Save project":"Create project"}</button>
          <button className="ghost-btn" onClick={()=>{setProjFormMode(null);setProjEditId(null)}}>Cancel</button>
        </div>
      </div>)}
      <div style={{flex:1,overflowY:"auto",paddingBottom:"12px"}}>
        {projects.length>0&&!libQuery.trim()&&(<div className="eyebrow">Projects</div>)}
        {projects.filter(()=>!libQuery.trim()).map(p=>(<div key={p.id} className={`proj-row${activeProjectId===p.id?" current":""}`} onClick={()=>setActiveProjectId(activeProjectId===p.id?null:p.id)}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px"}}>
            <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:"12px"}}>
              <span style={{width:"34px",height:"34px",borderRadius:"10px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:activeProjectId===p.id?"#2B2617":"var(--surface)",border:activeProjectId===p.id?"none":"1px solid var(--line)",color:activeProjectId===p.id?"var(--gold-hi)":"var(--text-lo)"}}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/></svg></span>
              <span style={{minWidth:0}}>
                <span style={{display:"block",fontSize:"16px",fontWeight:500,color:"var(--text-hi)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
                <span style={{display:"block",fontSize:"13px",color:activeProjectId===p.id?"var(--gold)":"var(--text-lo)",marginTop:"1px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeProjectId===p.id?"Active · new chats follow its instructions":(()=>{const n=savedConvos.filter(c=>c.project_id===p.id&&c.active!==false).length;return n===1?"1 chat":`${n} chats`})()}</span>
              </span>
            </div>
            <div style={{display:"flex",gap:"2px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" onClick={()=>{setProjFormMode("edit");setProjEditId(p.id);setProjName(p.name);setProjDesc(p.description||"")}} title="Edit"><PencilIcon/></button>
              <button className="speak-btn" onClick={()=>handleProjDelete(p.id)} title="Delete"><TrashIcon/></button>
            </div>
          </div>
        </div>))}
        {pinnedConvos.filter(c=>!libQuery.trim()||(c.title||"").toLowerCase().includes(libQuery.trim().toLowerCase())).length>0&&(<div className="eyebrow">Pinned</div>)}
        {pinnedConvos.filter(c=>!libQuery.trim()||(c.title||"").toLowerCase().includes(libQuery.trim().toLowerCase())).map(c=>(<div key={c.id} className={`hist-item${activeConvoId===c.id?" current":""}`} onClick={()=>handleLoadConvo(c)}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px"}}>
            <div style={{flex:1,minWidth:0}}>
              {editingId===c.id?(<input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} onClick={e=>e.stopPropagation()} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter"){e.target.blur()}if(e.key==="Escape"){setEditingId(null);setEditTitle("")}}} style={{background:"rgba(255,255,255,0.08)",border:"1px solid var(--gold)",borderRadius:"8px",color:"var(--text-hi)",fontSize:"14px",padding:"3px 7px",width:"100%",outline:"none",fontFamily:"inherit"}}/>):(<div style={{fontSize:"15px",color:"inherit",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>)}
            </div>
            <div style={{display:"flex",gap:"2px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" style={{color:"var(--gold)",opacity:1}} onClick={()=>handlePin(c)} title="Unpin"><PinIcon active={true}/></button>
              <button className="speak-btn" onClick={()=>startRename(c)} title="Rename"><PencilIcon/></button>
              <button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
            </div>
          </div>
        </div>))}
        {(()=>{const lq=libQuery.trim().toLowerCase();const hit=c=>!lq||(c.title||"").toLowerCase().includes(lq);const list=allSaved.filter(c=>!c.pinned&&(lq?hit(c):(!activeProjectId||c.project_id===activeProjectId)));let lastGroup=null;const out=[];
          if(list.length===0){out.push(<div key="empty" style={{padding:"24px 16px",color:"var(--text-lo)",fontSize:"14px",textAlign:"center"}}>{libQuery.trim()?`No chats match "${libQuery.trim()}"`:activeProjectId?"No chats in this project yet":"No chats yet"}</div>);}
          list.forEach(c=>{const g=chatGroupLabel(c.updated_at||c.created_at);
            if(g!==lastGroup){out.push(<div key={"g"+g} className="eyebrow">{activeProjectId?`${g} \u00b7 in project`:g}</div>);lastGroup=g;}
            out.push(<div key={c.id} className={`hist-item${activeConvoId===c.id?" current":""}`} onClick={()=>handleLoadConvo(c)}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px"}}>
                <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:"7px"}}>
                  {c.project_id&&(<span style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--gold)",flexShrink:0}}/>)}
                  {editingId===c.id?(<input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} onClick={e=>e.stopPropagation()} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter"){e.target.blur()}if(e.key==="Escape"){setEditingId(null);setEditTitle("")}}} style={{background:"rgba(255,255,255,0.08)",border:"1px solid var(--gold)",borderRadius:"8px",color:"var(--text-hi)",fontSize:"14px",padding:"3px 7px",width:"100%",outline:"none",fontFamily:"inherit"}}/>):(<div style={{fontSize:"15px",color:"inherit",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>)}
                </div>
                <div style={{display:"flex",gap:"2px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
                  <button className="speak-btn" style={{color:"var(--text-lo)"}} onClick={()=>handlePin(c)} title="Pin"><PinIcon active={false}/></button>
                  <button className="speak-btn" onClick={()=>startRename(c)} title="Rename"><PencilIcon/></button>
                  <button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
                </div>
              </div>
            </div>);});
          return out;})()}
      </div>
      {activeProject&&(<div style={{padding:"12px 16px calc(12px + env(safe-area-inset-bottom,0px))",borderTop:"1px solid var(--line)",display:"flex",alignItems:"center",gap:"10px"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"12px",color:"var(--gold-hi)",fontWeight:600}}>Project active: {activeProject.name}</div>
          <div style={{fontSize:"11px",color:"var(--text-lo)",marginTop:"1px"}}>New chats here follow its instructions</div>
        </div>
        <button className="ghost-btn" onClick={()=>setActiveProjectId(null)}>Leave</button>
      </div>)}
    </div>)}

    {/* Header */}
<header style={{position:"relative",paddingTop:"env(safe-area-inset-top,0px)",background:"var(--bg1)",borderBottom:isEmpty?"1px solid transparent":"1px solid var(--line)",flexShrink:0}}>
<div style={{minHeight:"64px",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"}}>
  <button onClick={()=>{if(!isEmpty)clearChat()}} aria-label={isEmpty?"Lance":"Back to home"} style={{display:"flex",alignItems:"center",gap:"10px",minWidth:0,background:"none",border:"none",color:"inherit",cursor:isEmpty?"default":"pointer",padding:0,textAlign:"left"}}>
    {!isEmpty&&(<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,color:"var(--text-mid)"}}><path d="M12.5 4L6.5 10l6 6"/></svg>)}
    <span style={{flexShrink:0,display:"flex"}}><ArrowMark size={isEmpty?26:22}/></span>
    <span style={{minWidth:0}}>
      <span className="serif" style={{display:"block",fontSize:isEmpty?"23px":"20px",fontWeight:600,lineHeight:1.1,color:"var(--text-hi)"}}>Lance</span>
      {activeProject&&(<span style={{display:"block",fontSize:"12px",color:"var(--gold)",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"150px"}}>{activeProject.name}</span>)}
    </span>
  </button>
  <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
    {speakingIdx!==null&&(<button onClick={stopSpeaking} style={{minHeight:"44px",padding:"0 14px",borderRadius:"14px",border:"1px solid rgba(214,110,80,0.5)",background:"rgba(194,80,46,0.15)",color:"#F0A48C",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>Stop</button>)}
    {!isEmpty&&(<IconBtn onClick={()=>{setTeachMode(t=>!t);if(teachMode)stopSpeaking()}} label={teachMode?"Read aloud is on":"Read aloud is off"} active={teachMode}>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h2.5L9 3v10L5.5 10H3z"/>{teachMode?(<path d="M11.5 5.5a3.5 3.5 0 010 5M13 3.8a6 6 0 010 8.4"/>):(<path d="M11.5 6l3 4M14.5 6l-3 4"/>)}</svg>
    </IconBtn>)}
    <IconBtn onClick={()=>setShowTasks(true)} label={`Open tasks, ${openTasks.length} open`} badge={openTasks.length||null}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
    </IconBtn>
    <IconBtn onClick={()=>setShowSaved(s=>!s)} label="Open library" active={showSaved}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h9"/></svg>
    </IconBtn>
  </div>
</div></header>
{/* Chat body */}
<div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:"14px",maxWidth:"760px",width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
  {isEmpty&&(<HomeView upcoming={upcoming} tasks={openTasks} notes={brainNotes} onOpenTasks={()=>setShowTasks(true)} onStart={(p)=>{setInput(p);setTimeout(()=>{const el=inputRef.current;if(el){el.focus();el.setSelectionRange(p.length,p.length)}},0)}}/>)}

  {messages.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s cubic-bezier(0.22,1,0.36,1) both",marginBottom:"4px"}}>
    <div style={{maxWidth:m.role==="user"?"84%":"100%",minWidth:0,display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:"6px"}}>
      <div style={{position:"relative",padding:m.role==="user"?"11px 15px":"2px 2px",background:m.role==="user"?"var(--line)":"transparent",borderRadius:m.role==="user"?"20px 20px 6px 20px":"0",color:"var(--text-hi)",fontSize:"16px",lineHeight:m.role==="user"?"1.45":"1.6",whiteSpace:"pre-wrap",fontWeight:400,overflowWrap:"anywhere"}}>
        {m.imagePreview&&(<img src={m.imagePreview} alt="screenshot" style={{maxWidth:"100%",borderRadius:"10px",marginBottom:"10px",display:"block"}}/>)}
        {renderText(m.content)}
      </div>
      {m.role==="assistant"&&(<div style={{paddingLeft:"4px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2px",marginBottom:m.isDoc?"4px":"0"}}>
          <button className={`speak-btn${speakingIdx===i?" active":""}`} onClick={()=>speakingIdx===i?stopSpeaking():speakText(m.content,i)} style={{color:speakingIdx===i?"var(--gold-hi)":"var(--text-mid)",minWidth:"36px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center"}} title={speakingIdx===i?"Stop":"Hear Lance"}><SpeakerIcon active={speakingIdx===i} spinning={loadingIdx===i}/></button>
          <button className="speak-btn" onClick={()=>handleDownload(m.content,i)} style={{color:"var(--text-mid)",minWidth:"36px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center"}} title="Download Word doc"><DownloadIcon/></button>
          <button className={`copy-btn${copiedIdx===i?" copied":""}`} onClick={()=>handleCopy(m.content,i)} style={{minHeight:"36px"}}>{copiedIdx===i?"Copied":"Copy"}</button>
        </div>
{m.brainData?.length>0&&m.brainData.map((n,bi)=>(<a key={"b"+bi} href={NOTEBOOK_URL} target="_blank" rel="noreferrer" style={{display:"flex",flexDirection:"column",gap:"8px",marginTop:"6px",padding:"14px",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"16px",textDecoration:"none",color:"inherit",maxWidth:"340px"}}>
          <span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}><span className="eyebrow2" style={{color:"var(--gold)",fontSize:"11px"}}>Saved to notebook · {({sermon:"Sermon seed",study:"Study",idea:"Idea",task:"Task",prayer:"Prayer"})[n.kind]||"Note"}</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#7FBF95" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Saved"><path d="M3.5 8.5l3 3 6-7"/></svg></span>
          <span className="serif" style={{fontSize:"18px",lineHeight:1.3}}>{n.title||"Untitled"}</span>
          {n.refs?.length>0&&(<span style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{n.refs.map(r=>(<span key={r} className="serif" style={{fontSize:"13px",padding:"3px 9px",borderRadius:"8px",background:"#2B2617",color:"#E3C574"}}>{r}</span>))}</span>)}
        </a>))}
                {m.staffEventsData?.length>0?(
          <StaffEventsCard events={m.staffEventsData} statusByEventIdx={Object.fromEntries(m.staffEventsData.map((_,ei)=>[ei,staffEventStatusByIdx[`${i}:${ei}`]||"idle"]))} onAdd={(ei)=>handleAddStaffEvent(i,ei,m.staffEventsData[ei])} onAddAll={()=>handleAddAllStaffEvents(i,m.staffEventsData)}/>
        ):m.staffNotesData?.length>0?(
          <StaffNoteCard note={m.staffNotesData[0]} status={staffNoteStatusByIdx[i]||"idle"} onAdd={()=>handleAddStaffNote(i,m.staffNotesData[0])}/>
        ):m.taskData?.title?(
          <TaskAddedCard title={m.taskData.title} due={m.taskData.due}/>
        ):m.videoData?(
          <VideoCard videoData={m.videoData} state={videoStateByIdx[i]} onWatch={()=>handleWatchVideo(m.videoData,i)}/>
        ):m.smsData?(
          <TextSentCard status={smsStatusByIdx[i]||"idle"} scheduled={!!m.smsData.sendAt} onSend={()=>handleSendSms(m.smsData,i)}/>
        ):m.flyerData?(
          <FlyerCard onGenerate={()=>handleGenerateFlyer(m.flyerData,i)} generating={downloadingIdx===i}/>
        ):(m.isDoc&&(<div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          <WordDocCard text={m.content} filename={generateFilename(m.content)} onDownload={()=>setPreviewDoc({text:m.content,filename:generateFilename(m.content),idx:i})} downloading={downloadingIdx===i}/>
          <PptxDocCard text={m.content} filename={generateFilename(m.content)} onDownload={()=>setPreviewDoc({text:m.content,filename:generateFilename(m.content),idx:i})} downloading={downloadingIdx===i}/>
        </div>))}
      </div>)}
    </div>
  </div>))}

  {loading&&(<div style={{display:"flex",alignItems:"flex-end",gap:"9px",animation:"fadeUp 0.18s cubic-bezier(0.22,1,0.36,1) both"}}>
    <div aria-label="Lance is thinking" style={{padding:"10px 4px",display:"flex",gap:"6px",alignItems:"center"}}>
      {[0,1,2].map(i=>(<div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--gold)",animation:`dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>))}
    </div>
  </div>)}
  <div ref={bottomRef}/>
</div>

    {/* Input */}
    <div style={{position:"relative",padding:"10px 16px calc(14px + env(safe-area-inset-bottom,0px))",background:"var(--bg1)",flexShrink:0}}>
      {pendingFiles.length>0&&(<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
        {pendingFiles.map((f,i)=>(<div key={i} className="file-chip">
          <span>{f.name.length>20?f.name.slice(0,17)+"…":f.name}</span>
          <button onClick={()=>removeFile(i)} title="Remove" aria-label={`Remove ${f.name}`}><CloseIcon/></button>
        </div>))}
      </div>)}
      <div style={{display:"flex",alignItems:"flex-end",gap:"6px",background:"var(--surface)",border:"1px solid var(--line-hi)",borderRadius:"26px",padding:"6px 6px 6px 8px"}}>
        <button onClick={()=>fileRef.current?.click()} aria-label="Attach a file or photo" title="Attach a file or photo" style={{width:"40px",height:"40px",borderRadius:"20px",border:"none",background:"transparent",color:"var(--text-lo)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.bmp,image/*" style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value=""}}/>
        <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"}} onKeyDown={handleKeyDown} onPaste={e=>{const items=Array.from(e.clipboardData?.items||[]);const imgItem=items.find(i=>i.type.startsWith("image/"));if(imgItem){e.preventDefault();const file=imgItem.getAsFile();if(file){const reader=new FileReader();reader.onload=()=>{const data=reader.result.split(",")[1];setPendingFiles(prev=>[...prev,{name:"screenshot.png",type:"image",mediaType:file.type||"image/png",data}])};reader.readAsDataURL(file)}}}} placeholder={isEmpty?"Ask Lance anything":"Message Lance"} aria-label="Message Lance" rows={1} style={{flex:1,minWidth:0,border:"none",background:"transparent",fontSize:"16px",color:"var(--text-hi)",resize:"none",lineHeight:"1.5",maxHeight:"120px",overflowY:"auto",fontWeight:400,fontFamily:"inherit",padding:"8px 0",outline:"none"}}/>
        <button onClick={toggleMic} aria-label={listening&&!voiceSession?"Stop dictating":"Dictate a message"} title="Dictate a message" style={{width:"40px",height:"40px",borderRadius:"20px",border:"none",background:listening&&!voiceSession?"rgba(212,175,90,0.18)":"transparent",color:listening&&!voiceSession?"var(--gold-hi)":"var(--text-lo)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="7" y="2.5" width="6" height="10" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5"/></svg>
        </button>
        {(input.trim()||pendingFiles.length>0)?(
          <button onClick={()=>send()} disabled={loading} aria-label="Send" title="Send" style={{width:"44px",height:"44px",borderRadius:"22px",border:"none",background:loading?"var(--surface-hi)":"var(--gold)",color:loading?"var(--text-lo)":"#0D1420",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:loading?"default":"pointer"}}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 16V4M5 9l5-5 5 5"/></svg>
          </button>
        ):(
          <button onClick={()=>{setVoiceSession(true);toggleVoiceConversation(true)}} aria-label="Talk with Lance" title="Talk with Lance" style={{width:"44px",height:"44px",borderRadius:"22px",border:"none",background:"var(--gold)",color:"#0D1420",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 9v2M6.5 6v8M10 3.5v13M13.5 6v8M17 9v2"/></svg>
          </button>
        )}
      </div>
    </div>
  </div></>);
}
