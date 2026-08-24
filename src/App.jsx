import React,{useState,useRef,useEffect,useCallback}from"react";
import{callClaude,speak,readFile,detectDocumentContent,webSearch,formatSearchResults}from"./api";
import{loadMemory,loadProfile,loadRecentSessions,saveMessage,saveMemoryFact,saveProfileFact,saveSession,parseMemoryTags,stripMemoryTags,parseFlyerTag,parseSmsTag,parseEmailTag}from"./memory";
import{SESSION_ID,SUPABASE_URL,SB_HEADERS}from"./config";
import{LanceLogo,SendIcon,SpeakerIcon,StopIcon,DownloadIcon,AttachIcon,CloseIcon}from"./icons";

const DOCX_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-docx";
const PPTX_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-pptx";
const FLYER_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-flyer";
const SMS_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-sms";
const GMAIL_AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SEND_URL="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-gmail-send";
const GMAIL_REDIRECT_URI="https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-gmail-callback";
const GOOGLE_CLIENT_ID=""; // Set once Pastor provides it from Google Cloud Console
const TTS_URL=`${SUPABASE_URL}/functions/v1/lance-tts`;
const SERMON_URL=`${SUPABASE_URL}/functions/v1/lance-sermon-prep`;
const EXAM_URL=`${SUPABASE_URL}/functions/v1/lance-exam-gen`;
const DEVOTION_URL=`${SUPABASE_URL}/functions/v1/lance-devotion`;

// Pinned conversations DB
async function loadPinned(){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/lance_pinned?active=eq.true&order=pin_order.asc,saved_order.asc`,{headers:SB_HEADERS});
  return r.ok?r.json():[];
}
async function saveConversation(title,summary,messages,pinned=false,pinOrder=0,savedOrder=0){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/lance_pinned`,{
    method:"POST",headers:{...SB_HEADERS,"Prefer":"return=representation"},
    body:JSON.stringify({title,summary,messages,pinned,pin_order:pinOrder,saved_order:savedOrder,active:true})
  });
  return r.ok?r.json():null;
}
async function togglePin(id,pinned,pinOrder){
  await fetch(`${SUPABASE_URL}/rest/v1/lance_pinned?id=eq.${id}`,{
    method:"PATCH",headers:SB_HEADERS,
    body:JSON.stringify({pinned,pin_order:pinOrder,updated_at:new Date().toISOString()})
  });
}
async function deleteConversation(id){
  await fetch(`${SUPABASE_URL}/rest/v1/lance_pinned?id=eq.${id}`,{
    method:"PATCH",headers:SB_HEADERS,
    body:JSON.stringify({active:false,updated_at:new Date().toISOString()})
  });
}
async function renameConversation(id,title){
  await fetch(`${SUPABASE_URL}/rest/v1/lance_pinned?id=eq.${id}`,{
    method:"PATCH",headers:SB_HEADERS,
    body:JSON.stringify({title,updated_at:new Date().toISOString()})
  });
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

function WordDocCard({text, filename, onDownload, downloading}){
  return(
    <div onClick={onDownload} style={{
      display:"flex",alignItems:"center",gap:"10px",
      padding:"10px 14px",marginTop:"6px",
      background:"var(--glass-hi)",
      border:"1px solid var(--line)",
      borderRadius:"14px",cursor:"pointer",
      backdropFilter:"blur(24px) saturate(1.5)",
      WebkitBackdropFilter:"blur(24px) saturate(1.5)",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)",
      transition:"all 200ms cubic-bezier(0.22,1,0.36,1)",
      maxWidth:"220px",
      opacity:downloading?0.7:1,
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)"}
    >
      <div style={{
        width:"36px",height:"44px",borderRadius:"10px",flexShrink:0,
        background:"linear-gradient(160deg,#2B579A 0%,#1E3A6E 100%)",
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",position:"relative",
        boxShadow:"0 2px 6px rgba(43,87,154,0.35)"
      }}>
        <div style={{
          position:"absolute",top:0,right:0,
          width:"10px",height:"10px",
          background:"rgba(255,255,255,0.25)",
          borderBottomLeftRadius:"4px"
        }}/>
        <span style={{color:"#fff",fontSize:"11px",fontWeight:700,letterSpacing:"0.02em",marginTop:"4px"}}>W</span>
        <div style={{width:"18px",height:"1.5px",background:"rgba(255,255,255,0.5)",marginTop:"2px",borderRadius:"1px"}}/>
        <div style={{width:"14px",height:"1.5px",background:"rgba(255,255,255,0.3)",marginTop:"2px",borderRadius:"1px"}}/>
        <div style={{width:"16px",height:"1.5px",background:"rgba(255,255,255,0.3)",marginTop:"2px",borderRadius:"1px"}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"var(--text-hi)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {downloading?"Preparing…":"Lance Document"}
        </div>
        <div style={{fontSize:"12px",color:"var(--text-lo)",marginTop:"1px"}}>
          {downloading?"Building your .docx":"Tap to download .docx"}
        </div>
      </div>
      {!downloading&&(
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,color:"#C9A84C"}}>
          <path d="M8 1v9M4.5 6.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      )}
      {downloading&&(
        <div style={{width:"16px",height:"16px",border:"2px solid #C9A84C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
      )}
    </div>
  );
}

function PptxDocCard({text, filename, onDownload, downloading}){
  return(
    <div onClick={onDownload} style={{
      display:"flex",alignItems:"center",gap:"10px",
      padding:"10px 14px",marginTop:"6px",
      background:"var(--glass-hi)",
      border:"1px solid var(--line)",
      borderRadius:"14px",cursor:"pointer",
      backdropFilter:"blur(24px) saturate(1.5)",
      WebkitBackdropFilter:"blur(24px) saturate(1.5)",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)",
      transition:"all 200ms cubic-bezier(0.22,1,0.36,1)",
      maxWidth:"220px",
      opacity:downloading?0.7:1,
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)"}
    >
      <div style={{
        width:"36px",height:"44px",borderRadius:"10px",flexShrink:0,
        background:"linear-gradient(160deg,#D24726 0%,#A6350F 100%)",
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",position:"relative",
        boxShadow:"0 2px 6px rgba(210,71,38,0.35)"
      }}>
        <div style={{
          position:"absolute",top:0,right:0,
          width:"10px",height:"10px",
          background:"rgba(255,255,255,0.25)",
          borderBottomLeftRadius:"4px"
        }}/>
        <span style={{color:"#fff",fontSize:"11px",fontWeight:700,letterSpacing:"0.02em",marginTop:"4px"}}>P</span>
        <div style={{width:"18px",height:"14px",border:"1.5px solid rgba(255,255,255,0.5)",marginTop:"3px",borderRadius:"1px"}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"var(--text-hi)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {downloading?"Preparing…":"Lance Slides"}
        </div>
        <div style={{fontSize:"12px",color:"var(--text-lo)",marginTop:"1px"}}>
          {downloading?"Building your .pptx":"Tap to download .pptx"}
        </div>
      </div>
      {!downloading&&(
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,color:"#C9A84C"}}>
          <path d="M8 1v9M4.5 6.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      )}
      {downloading&&(
        <div style={{width:"16px",height:"16px",border:"2px solid #C9A84C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
      )}
    </div>
  );
}

function FlyerCard({onGenerate, generating}){
  return(
    <div onClick={onGenerate} style={{
      display:"flex",alignItems:"center",gap:"10px",
      padding:"10px 14px",marginTop:"6px",
      background:"var(--glass-hi)",
      border:"1px solid var(--line)",
      borderRadius:"14px",cursor:"pointer",
      backdropFilter:"blur(24px) saturate(1.5)",
      WebkitBackdropFilter:"blur(24px) saturate(1.5)",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)",
      transition:"all 200ms cubic-bezier(0.22,1,0.36,1)",
      maxWidth:"220px",
      opacity:generating?0.7:1,
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)"}
    >
      <div style={{
        width:"36px",height:"44px",borderRadius:"10px",flexShrink:0,
        background:"linear-gradient(160deg,#C9A84C 0%,#8a6e2a 100%)",
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:"0 2px 6px rgba(201,168,76,0.35)"
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="2" stroke="#fff" strokeWidth="1.4"/><circle cx="6.5" cy="6.5" r="1.5" fill="#fff"/><path d="M2 12l4-4 3 3 3-4 4 5" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" fill="none"/></svg>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"var(--text-hi)"}}>
          {generating?"Designing…":"Lance Flyer"}
        </div>
        <div style={{fontSize:"12px",color:"var(--text-lo)",marginTop:"1px"}}>
          {generating?"Building your graphic":"Tap to create a flyer"}
        </div>
      </div>
      {!generating&&(
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,color:"#C9A84C"}}>
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {generating&&(
        <div style={{width:"16px",height:"16px",border:"2px solid #C9A84C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
      )}
    </div>
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
        background:status==="sent"?"linear-gradient(160deg,#2E9E5B,#1F7A44)":"linear-gradient(160deg,#1F4E96,#0F2A52)",
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

function EmailCard({emailData,status,onEdit,onSend,gmailConnected}){
  const[to,setTo]=React.useState(emailData.to);
  const[subject,setSubject]=React.useState(emailData.subject);
  const[body,setBody]=React.useState(emailData.body);
  if(status==="sent"){
    return(
      <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",marginTop:"6px",background:"var(--glass-hi)",border:"1px solid var(--line)",borderRadius:"14px",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06)",maxWidth:"260px"}}>
        <div style={{width:"36px",height:"36px",borderRadius:"10px",background:"linear-gradient(160deg,#2E9E5B,#1F7A44)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div><div style={{fontSize:"14px",fontWeight:600,color:"var(--text-hi)"}}>Email sent</div><div style={{fontSize:"12px",color:"var(--text-lo)"}}>Delivered to {to}</div></div>
      </div>
    );
  }
  return(
    <div style={{background:"var(--glass-hi)",border:"1px solid var(--line)",borderRadius:"14px",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.2)",padding:"14px",marginTop:"6px",maxWidth:"320px"}}>
      {!gmailConnected&&(
        <div style={{fontSize:"12px",color:"#E8B461",background:"rgba(217,119,6,0.12)",padding:"8px 10px",borderRadius:"10px",marginBottom:"10px"}}>Gmail is not connected yet. Connect it in settings first.</div>
      )}
      <div style={{fontSize:"11px",color:"var(--text-lo)",marginBottom:"3px"}}>To</div>
      <input value={to} onChange={e=>setTo(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid var(--line)",borderRadius:"10px",padding:"6px 8px",fontSize:"13px",marginBottom:"8px",fontFamily:"inherit",color:"var(--text-hi)"}}/>
      <div style={{fontSize:"11px",color:"var(--text-lo)",marginBottom:"3px"}}>Subject</div>
      <input value={subject} onChange={e=>setSubject(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid var(--line)",borderRadius:"10px",padding:"6px 8px",fontSize:"13px",marginBottom:"8px",fontFamily:"inherit",color:"var(--text-hi)"}}/>
      <div style={{fontSize:"11px",color:"var(--text-lo)",marginBottom:"3px"}}>Message</div>
      <textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid var(--line)",borderRadius:"10px",padding:"6px 8px",fontSize:"13px",marginBottom:"10px",fontFamily:"inherit",resize:"vertical",color:"var(--text-hi)"}}/>
      <button onClick={()=>onSend({to,subject,body})} disabled={status==="sending"||!gmailConnected} style={{width:"100%",background:gmailConnected?"linear-gradient(135deg,#D4B45C,#A8863A)":"var(--glass)",color:gmailConnected?"#0B0E16":"var(--text-lo)",border:"none",borderRadius:"10px",padding:"10px",fontSize:"13px",fontWeight:600,cursor:gmailConnected?"pointer":"default",fontFamily:"inherit"}}>
        {status==="sending"?"Sending…":status==="error"?"Failed, tap to retry":"Send Email"}
      </button>
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
    if(/^[*\-] /.test(t)){blocks.push(<div key={i} style={{display:"flex",gap:"10px",margin:"4px 0",paddingLeft:"2px",lineHeight:1.6,color:"#1F2937"}}><span style={{color:"#9CA3AF",flexShrink:0}}>&#8211;</span><span>{inline(t.slice(2))}</span></div>);return}
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

const CSS=`:root{--bg0:#06080F;--bg1:#0B111D;--gold:#C9A84C;--gold-hi:#E8C96A;--gold-lo:#8A6E2A;--glass:rgba(255,255,255,0.055);--glass-hi:rgba(255,255,255,0.09);--line:rgba(255,255,255,0.08);--text-hi:#F5F6F8;--text-mid:rgba(245,246,248,0.62);--text-lo:rgba(245,246,248,0.38)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;background:linear-gradient(175deg,#0A0E18 0%,#06080F 60%);position:relative}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 120% 60% at 50% -10%,rgba(201,168,76,0.10),transparent 60%);pointer-events:none;z-index:0}
textarea:focus,button:focus{outline:none}
textarea::placeholder{color:var(--text-lo)}
::-webkit-scrollbar{width:0}
.glass{background:var(--glass);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);border:1px solid var(--line)}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 8px rgba(201,168,76,0.3))}50%{filter:drop-shadow(0 0 18px rgba(201,168,76,0.6))}}
@keyframes dot{0%,80%,100%{transform:scale(0.5);opacity:0.25}40%{transform:scale(1);opacity:1}}
@keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4),0 0 12px rgba(201,168,76,0.2)}50%{box-shadow:0 0 0 6px rgba(201,168,76,0),0 0 20px rgba(201,168,76,0.4)}}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes ringRotate{to{transform:rotate(360deg)}}
.lance-ring{position:absolute;inset:-4px;border-radius:50%;pointer-events:none;opacity:0;transition:opacity 280ms cubic-bezier(0.22,1,0.36,1)}
.lance-ring::before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0%,var(--gold) 25%,transparent 50%,transparent 100%);mask:radial-gradient(circle,transparent 50%,black 51%,black 54%,transparent 55%);-webkit-mask:radial-gradient(circle,transparent 50%,black 51%,black 54%,transparent 55%);animation:ringRotate 2.4s linear infinite}
.lance-ring.active{opacity:1}
.wave{display:flex;align-items:center;gap:3px;height:24px;justify-content:center}
.wave span{width:3px;background:var(--gold);border-radius:2px;animation:waveBar 1.2s ease-in-out infinite}
.wave span:nth-child(1){height:8px;animation-delay:0s}
.wave span:nth-child(2){height:14px;animation-delay:0.1s}
.wave span:nth-child(3){height:18px;animation-delay:0.2s}
.wave span:nth-child(4){height:14px;animation-delay:0.3s}
.wave span:nth-child(5){height:10px;animation-delay:0.4s}
@keyframes waveBar{0%,100%{transform:scaleY(0.5);opacity:0.4}50%{transform:scaleY(1);opacity:1}}
.speak-btn{border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:6px;border-radius:10px;transition:all 200ms cubic-bezier(0.22,1,0.36,1);opacity:0.5;color:var(--text-mid);min-width:36px;min-height:36px}
.speak-btn:hover{opacity:1;background:rgba(201,168,76,0.08)}
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
.copy-btn:hover{opacity:1;background:rgba(201,168,76,0.08)}
.copy-btn:active{transform:scale(0.96)}
.copy-btn.copied{opacity:1;color:var(--gold)}
.mic-btn{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;transition:all 200ms cubic-bezier(0.22,1,0.36,1);flex-shrink:0}
.mic-btn:active{transform:scale(0.96)}
.mic-btn.idle{background:var(--glass);color:var(--text-lo);border:1px solid var(--line);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5)}
.mic-btn.listening{background:linear-gradient(135deg,#D4B45C,#A8863A);color:#0B0E16;border:1px solid var(--gold-hi);animation:micPulse 1.4s ease-in-out infinite}
.saved-backdrop{position:fixed;inset:0;background:rgba(6,8,15,0.7);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:390;animation:fadeIn 280ms cubic-bezier(0.22,1,0.36,1)}
.saved-panel{position:fixed;right:0;top:0;bottom:0;width:320px;background:var(--bg1);border-left:1px solid var(--line);-webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);z-index:400;display:flex;flex-direction:column;animation:slideIn 300ms cubic-bezier(0.22,1,0.36,1);border-top-left-radius:28px;border-bottom-left-radius:28px;box-shadow:inset 1px 0 0 rgba(255,255,255,0.06),-8px 0 32px rgba(0,0,0,0.3)}
.saved-item{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:background 180ms cubic-bezier(0.22,1,0.36,1);color:var(--text-mid);font-size:15px;letter-spacing:-0.01em}
.saved-item:hover{background:rgba(255,255,255,0.04)}
.saved-item:active{transform:scale(0.99)}
.saved-item.active{background:rgba(201,168,76,0.08);color:var(--text-hi);border-left:2px solid var(--gold)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}`;

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
  const[editingId,setEditingId]=useState(null);
  const[smsStatusByIdx,setSmsStatusByIdx]=useState({});
  const[previewDoc,setPreviewDoc]=useState(null);
  const[emailStatusByIdx,setEmailStatusByIdx]=useState({});
  const[gmailConnected,setGmailConnected]=useState(false);
  const[gmailEmail,setGmailEmail]=useState("");
  const[editTitle,setEditTitle]=useState("");
  const[savedConvos,setSavedConvos]=useState([]);
  const[activeConvoId,setActiveConvoId]=useState(null);
  const[saveStatus,setSaveStatus]=useState(null);

  const bottomRef=useRef(null);
  const inputRef=useRef(null);
  const audioRef=useRef(null);
  const fileRef=useRef(null);
  const recognitionRef=useRef(null);
  const msgCount=useRef(0);

  useEffect(()=>{
    (async()=>{
      const[f,p,s,c]=await Promise.all([
        loadMemory().catch(()=>[]),
        loadProfile().catch(()=>[]),
        loadRecentSessions().catch(()=>[]),
        loadPinned().catch(()=>[]),
      ]);
      setMemoryFacts(Array.isArray(f)?f:[]);
      setProfile(Array.isArray(p)?p:[]);
      setRecentSessions(Array.isArray(s)?s:[]);
      setSavedConvos(Array.isArray(c)?c:[]);
    })();
    // Check Gmail connection status
    (async()=>{
      try{
        const r=await fetch(`${SUPABASE_URL}/rest/v1/lance_gmail_tokens?id=eq.1&select=email_address,refresh_token`,{headers:SB_HEADERS});
        const rows=await r.json();
        if(Array.isArray(rows)&&rows[0]?.refresh_token){setGmailConnected(true);setGmailEmail(rows[0].email_address||"")}
      }catch(e){}
    })();
    // Handle redirect back from Google OAuth
    const params=new URLSearchParams(window.location.search);
    if(params.get("gmail")==="connected"){
      setGmailConnected(true);
      window.history.replaceState({},"",window.location.pathname);
    }
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages,loading]);

  const stopSpeaking=useCallback(()=>{
    if(audioRef.current){audioRef.current.pause();audioRef.current=null}
    setSpeakingIdx(null);setLoadingIdx(null);
  },[]);

  const speakText=useCallback(async(text,idx)=>{
    stopSpeaking();setLoadingIdx(idx);
    try{
      const res=await fetch(TTS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
      if(res.ok&&res.headers.get("content-type")?.includes("audio")){
        const blob=await res.blob();const url=URL.createObjectURL(blob);
        const audio=new Audio(url);
        audio.onplay=()=>{setLoadingIdx(null);setSpeakingIdx(idx)};
        audio.onended=()=>{setSpeakingIdx(null);audioRef.current=null;URL.revokeObjectURL(url);if(voiceModeRef.current){setTimeout(()=>startListening(),700)}};
        audio.onerror=()=>{setSpeakingIdx(null);audioRef.current=null};
        audioRef.current=audio;audio.play();
      }else{
        setLoadingIdx(null);setSpeakingIdx(idx);
        const utt=new SpeechSynthesisUtterance(text.slice(0,2000));
        utt.rate=0.95;utt.onend=()=>{setSpeakingIdx(null);if(voiceModeRef.current){setTimeout(()=>startListening(),700)}};
        window.speechSynthesis.speak(utt);
        audioRef.current={pause:()=>window.speechSynthesis.cancel()};
      }
    }catch(e){setLoadingIdx(null);setSpeakingIdx(null)}
  },[stopSpeaking]);

  const startListening=useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    const rec=new SR();rec.lang="en-US";rec.continuous=false;rec.interimResults=false;
    rec.onstart=()=>setListening(true);
    rec.onresult=(e)=>{const t=e.results[0][0].transcript;setListening(false);if(t.trim())setTimeout(()=>sendText(t.trim()),100)};
    rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);
    recognitionRef.current=rec;rec.start();
  },[]);
  const toggleMic=useCallback(()=>{
    if(listening){recognitionRef.current?.stop();setListening(false);return}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Try Safari on iPhone for voice input.");return}
    startListening();
  },[listening,startListening]);
  const toggleVoiceConversation=useCallback(()=>{
    if(teachMode){
      setTeachMode(false);stopSpeaking();
      if(listening){recognitionRef.current?.stop();setListening(false)}
      return;
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Try Safari on iPhone for voice conversation.");return}
    setTeachMode(true);startListening();
  },[teachMode,listening,startListening,stopSpeaking]);

  // Save current conversation
  const handleSave=useCallback(async()=>{
    if(messages.length===0)return;
    const saved=savedConvos.filter(c=>c.active!==false);
    if(saved.length>=10&&!activeConvoId){setSaveStatus("max");setTimeout(()=>setSaveStatus(null),2000);return}
    const firstUser=messages.find(m=>m.role==="user")?.content||"Conversation";
    const title=firstUser.slice(0,50)+(firstUser.length>50?"…":"");
    const summary=messages.slice(-2).map(m=>m.content.slice(0,100)).join(" | ");
    const cleanMessages=messages.map(({role,content})=>({role,content}));
    const result=await saveConversation(title,summary,cleanMessages,false,0,saved.length);
    if(result){
      const updated=await loadPinned().catch(()=>[]);
      setSavedConvos(Array.isArray(updated)?updated:[]);
      setActiveConvoId(result[0]?.id||null);
      setSaveStatus("saved");setTimeout(()=>setSaveStatus(null),2000);
    }
  },[messages,savedConvos,activeConvoId]);

  // Pin/unpin a conversation
  const handlePin=useCallback(async(convo)=>{
    const pinned=savedConvos.filter(c=>c.pinned&&c.active!==false);
    if(!convo.pinned&&pinned.length>=2){setSaveStatus("maxpin");setTimeout(()=>setSaveStatus(null),2000);return}
    const newPinned=!convo.pinned;
    const pinOrder=newPinned?pinned.length:0;
    await togglePin(convo.id,newPinned,pinOrder);
    const updated=await loadPinned().catch(()=>[]);
    setSavedConvos(Array.isArray(updated)?updated:[]);
  },[savedConvos]);

  // Load a saved conversation
  const handleLoadConvo=useCallback((convo)=>{
    stopSpeaking();
    setMessages(Array.isArray(convo.messages)?convo.messages:[]);
    setActiveConvoId(convo.id);
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
        const r=await fetch(`${SUPABASE_URL}/rest/v1/lance_notifications`,{
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
  const handleSendEmail=useCallback(async(idx,data)=>{
    setEmailStatusByIdx(p=>({...p,[idx]:"sending"}));
    try{
      const res=await fetch(GMAIL_SEND_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
      const result=await res.json();
      if(result.success){setEmailStatusByIdx(p=>({...p,[idx]:"sent"}))}
      else{setEmailStatusByIdx(p=>({...p,[idx]:"error"}));console.error("Email error:",result.error)}
    }catch(e){setEmailStatusByIdx(p=>({...p,[idx]:"error"}));console.error(e)}
  },[]);
  const connectGmail=useCallback(()=>{
    if(!GOOGLE_CLIENT_ID){alert("Gmail connection is not configured yet. Ask Lance's developer to finish setup.");return}
    const scope="https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
    const authUrl=`${GMAIL_AUTH_URL}?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(GMAIL_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    window.location.href=authUrl;
  },[]);

  const handleCopy=async(text,idx)=>{
    try{await navigator.clipboard.writeText(text);setCopiedIdx(idx);setTimeout(()=>setCopiedIdx(null),2000)}catch(e){}
  };

  const detectIntent=(t)=>{
    if(/\b(sermon prep|preach on|sermon on|exegete|exposition of|[1-3]?\s?[A-Z][a-z]+ \d+:\d+)\b/.test(t))return"sermon";
    if(/\b(exam|quiz|test|fill.in|questions for)\b/i.test(t))return"exam";
    if(/\b(devotion|devos|daily word|morning word)\b/i.test(t))return"devotion";
    return null;
  };

  const sendText=useCallback(async(t)=>{
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
        raw=await callClaude(cleanMessages,memoryFacts,recentSessions,[],profile);
      }
      const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean,recentUserIntent(next));
      setMessages([...next,{role:"assistant",content:clean,isDoc,flyerData:parseFlyerTag(raw),smsData:parseSmsTag(raw),emailData:parseEmailTag(raw)}]);msgCount.current+=2;
      saveMessage("assistant",clean).catch(()=>{});
      for(const tag of tags){
        if(tag.type==="memory"){saveMemoryFact(tag.category,tag.fact,tag.confidence,SESSION_ID).catch(()=>{});}
        else if(tag.type==="profile"){saveProfileFact(tag.domain,tag.key,tag.value,tag.confidence).catch(()=>{});setProfile(prev=>[...prev.filter(p=>!(p.domain===tag.domain&&p.key===tag.key)),{domain:tag.domain,key:tag.key,value:tag.value,confidence:tag.confidence,active:true}]);}
      }
      if(tags.some(t=>t.type==="memory")){loadMemory().then(f=>{if(Array.isArray(f))setMemoryFacts(f)}).catch(()=>{});}
      if(msgCount.current%4===0){saveSession("general",`${t.slice(0,90)}${t.length>90?"…":""}`,msgCount.current).catch(()=>{});}
      if(teachMode)speakText(clean,idx);if(isDoc)setDocxIdx(idx);
    }catch(e){setMessages([...next,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
    setLoading(false);
  },[loading,messages,memoryFacts,profile,recentSessions,teachMode,stopSpeaking,speakText]);

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
        const raw=await callClaude(cleanMessages,memoryFacts,recentSessions,filesToSend,profile);
        const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean,recentUserIntent(next));
        setMessages([...next,{role:"assistant",content:clean,isDoc,flyerData:parseFlyerTag(raw),smsData:parseSmsTag(raw),emailData:parseEmailTag(raw)}]);msgCount.current+=2;
        saveMessage("assistant",clean).catch(()=>{});
        if(teachMode)speakText(clean,idx);
      }catch(e){setMessages(prev=>[...prev,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
      setLoading(false);
    }else{sendText(t);}
  },[input,loading,messages,memoryFacts,profile,recentSessions,pendingFiles,teachMode,stopSpeaking,speakText,sendText]);

  const handleKeyDown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
  const sendPreset=t=>{setInput(t);setTimeout(()=>send(t),0)};
  const clearChat=()=>{stopSpeaking();setMessages([]);setPendingFiles([]);setDocxIdx(null);setActiveConvoId(null);msgCount.current=0};

  const pinnedConvos=savedConvos.filter(c=>c.pinned&&c.active!==false).sort((a,b)=>a.pin_order-b.pin_order);
  const allSaved=savedConvos.filter(c=>c.active!==false);
  const isEmpty=messages.length===0;

  return(<><style>{CSS}</style>
  <div style={{height:"100%",display:"flex",flexDirection:"column",background:"transparent",position:"relative",zIndex:1}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>

    {/* Drag overlay */}
    {dragOver&&(<div style={{position:"fixed",inset:0,background:"rgba(201,168,76,0.10)",border:"2px dashed rgba(201,168,76,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{color:"#fff",fontSize:"18px",fontWeight:600}}>Drop file or screenshot</div></div>)}

    {/* Document preview overlay */}
    {previewDoc&&(<DocPreviewModal
      text={previewDoc.text}
      filename={previewDoc.filename}
      downloading={downloadingIdx===previewDoc.idx}
      onClose={()=>setPreviewDoc(null)}
      onDownloadWord={()=>handleDownload(previewDoc.text,previewDoc.idx)}
      onDownloadPptx={()=>handleDownloadPptx(previewDoc.text,previewDoc.idx)}
    />)}

    {/* Listening overlay */}
    {listening&&(<div style={{position:"fixed",inset:0,background:"rgba(6,8,15,0.8)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn 200ms cubic-bezier(0.22,1,0.36,1)"}} onClick={toggleMic}><div className="wave" style={{transform:"scale(2)",marginBottom:"32px"}}><span/><span/><span/><span/><span/></div><div style={{color:"var(--text-hi)",fontSize:"20px",fontWeight:600,marginBottom:"8px",letterSpacing:"-0.02em"}}>Listening</div><div style={{color:"var(--text-lo)",fontSize:"14px"}}>Tap anywhere to cancel</div></div>)}

    {/* Saved conversations panel */}
    {showSaved&&(<div className="saved-backdrop" onClick={()=>setShowSaved(false)}/>)}
    {showSaved&&(<div className="saved-panel">
      <div style={{padding:"calc(16px + env(safe-area-inset-top)) 14px 16px",borderBottom:"1px solid rgba(201,168,76,0.2)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"#C9A84C",fontSize:"14px",fontWeight:600}}>Saved ({allSaved.length}/10)</div>
        <button onClick={()=>setShowSaved(false)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:"50%",cursor:"pointer",color:"rgba(255,255,255,0.85)",fontSize:"20px",lineHeight:1,width:"36px",height:"36px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
      </div>

      {/* Pinned section */}
      {pinnedConvos.length>0&&(<>
        <div style={{padding:"8px 14px 4px",fontSize:"11px",fontWeight:700,color:"rgba(201,168,76,0.6)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Pinned ({pinnedConvos.length}/2)</div>
        {pinnedConvos.map(c=>(<div key={c.id} className={`saved-item${activeConvoId===c.id?" active":""}`} onClick={()=>handleLoadConvo(c)}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"6px"}}>
            <div style={{flex:1,minWidth:0}}>
              {editingId===c.id?(<input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} onClick={e=>e.stopPropagation()} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter"){e.target.blur()}if(e.key==="Escape"){setEditingId(null);setEditTitle("")}}} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(201,168,76,0.4)",borderRadius:"4px",color:"#fff",fontSize:"13px",fontWeight:500,padding:"2px 6px",width:"100%",outline:"none"}}/>):(<div style={{color:"#C9A84C",fontSize:"13px",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>)}
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:"11px",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.summary?.slice(0,60)}</div>
            </div>
            <div style={{display:"flex",gap:"4px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" style={{color:"#C9A84C",opacity:1}} onClick={()=>handlePin(c)} title="Unpin"><PinIcon active={true}/></button>
              <button className="speak-btn" onClick={()=>startRename(c)} title="Rename"><PencilIcon/></button><button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
            </div>
          </div>
        </div>))}
      </>)}

      {/* All saved */}
      <div style={{padding:"8px 14px 4px",fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.3)",letterSpacing:"0.08em",textTransform:"uppercase"}}>All Saved</div>
      <div style={{flex:1,overflowY:"auto"}}>
        {allSaved.length===0&&(<div style={{padding:"20px 14px",color:"rgba(255,255,255,0.3)",fontSize:"13px",textAlign:"center"}}>No saved conversations yet</div>)}
        {allSaved.map(c=>(<div key={c.id} className={`saved-item${activeConvoId===c.id?" active":""}`} onClick={()=>handleLoadConvo(c)}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"6px"}}>
            <div style={{flex:1,minWidth:0}}>
              {editingId===c.id?(<input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} onClick={e=>e.stopPropagation()} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter"){e.target.blur()}if(e.key==="Escape"){setEditingId(null);setEditTitle("")}}} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(201,168,76,0.4)",borderRadius:"4px",color:"#fff",fontSize:"13px",fontWeight:500,padding:"2px 6px",width:"100%",outline:"none"}}/>):(<div style={{color:"#fff",fontSize:"13px",fontWeight:c.pinned?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>)}
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:"11px",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.summary?.slice(0,60)}</div>
            </div>
            <div style={{display:"flex",gap:"4px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" style={{color:c.pinned?"#C9A84C":"rgba(255,255,255,0.4)"}} onClick={()=>handlePin(c)} title={c.pinned?"Unpin":"Pin (max 2)"}><PinIcon active={c.pinned}/></button>
              <button className="speak-btn" onClick={()=>startRename(c)} title="Rename"><PencilIcon/></button><button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
            </div>
          </div>
        </div>))}
      </div>

      <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:"11px",color:"rgba(255,255,255,0.3)",textAlign:"center"}}>Save up to 10 conversations. Pin 2.</div>
    </div>)}

{/* Header */}
<div style={{paddingTop:"env(safe-area-inset-top,0px)",background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",borderBottom:"1px solid var(--line)",flexShrink:0}}>
<div style={{height:"54px",padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
  <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
    <div style={{position:"relative",width:"28px",height:"28px",flexShrink:0}}>
      <LanceLogo size={28}/>
      <div className={`lance-ring${(listening||teachMode||speakingIdx!==null)?" active":""}`}/>
    </div>
    <div>
      <div style={{fontSize:"17px",fontWeight:600,color:"var(--text-hi)",letterSpacing:"-0.02em",lineHeight:1.1}}>Lance</div>
      <div style={{fontSize:"11px",color:"var(--text-lo)",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",lineHeight:1.2}}>Personal Agent</div>
    </div>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:"8px",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none",flexShrink:1}}>
        {saveStatus&&(<div style={{fontSize:"12px",color:saveStatus==="saved"?"var(--gold)":saveStatus==="maxpin"?"#ff8080":"#ff8080",fontWeight:600,whiteSpace:"nowrap"}}>{saveStatus==="saved"?"Saved!":saveStatus==="max"?"Max 5":"Max 2 pins"}</div>)}
    {pinnedConvos.map((c,i)=>(<button key={c.id} onClick={()=>handleLoadConvo(c)} style={{background:activeConvoId===c.id?"rgba(201,168,76,0.18)":"var(--glass)",border:`1px solid ${activeConvoId===c.id?"var(--gold)":"var(--line)"}`,borderRadius:"10px",padding:"6px 10px",cursor:"pointer",fontSize:"13px",color:activeConvoId===c.id?"var(--gold-hi)":"var(--text-mid)",fontFamily:"inherit",maxWidth:"90px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minHeight:"36px",display:"flex",alignItems:"center",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}} title={c.title}>{c.title.slice(0,12)}</button>))}
    <button onClick={()=>setShowSaved(s=>!s)} style={{background:showSaved?"rgba(201,168,76,0.18)":"var(--glass)",border:`1px solid ${showSaved?"var(--gold)":"var(--line)"}`,borderRadius:"10px",padding:"6px 10px",cursor:"pointer",color:showSaved?"var(--gold-hi)":"var(--text-mid)",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px",minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}><SaveIcon/><span style={{fontSize:"13px",fontWeight:600}}>{allSaved.length}</span></button>
    {messages.length>0&&(<button onClick={handleSave} style={{background:"rgba(201,168,76,0.12)",border:"1px solid var(--gold)",borderRadius:"10px",padding:"6px 12px",cursor:"pointer",color:"var(--gold-hi)",fontSize:"13px",fontWeight:600,fontFamily:"inherit",minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}>Save</button>)}
    <button onClick={gmailConnected?undefined:connectGmail} title={gmailConnected?`Connected: ${gmailEmail}`:"Connect Gmail"} style={{background:gmailConnected?"rgba(46,158,91,0.15)":"var(--glass)",border:`1px solid ${gmailConnected?"rgba(46,158,91,0.4)":"var(--line)"}`,borderRadius:"10px",padding:"6px 11px",color:gmailConnected?"#3DB76D":"var(--text-mid)",fontSize:"12px",fontWeight:600,fontFamily:"inherit",cursor:gmailConnected?"default":"pointer",display:"flex",alignItems:"center",gap:"4px",minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 2.5h10v7a1 1 0 01-1 1H2a1 1 0 01-1-1v-7z" stroke="currentColor" strokeWidth="1.1" fill="none"/><path d="M1 2.5l5 3.5 5-3.5" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg>
      {gmailConnected?"Gmail":"Connect"}
    </button>
    <button className="teach-toggle" onClick={()=>{setTeachMode(t=>!t);if(teachMode)stopSpeaking()}} style={{background:teachMode?"rgba(201,168,76,0.18)":"var(--glass)",border:`1px solid ${teachMode?"var(--gold)":"var(--line)"}`,borderRadius:"10px",color:teachMode?"var(--gold-hi)":"var(--text-mid)",padding:"6px 11px",fontFamily:"inherit",fontSize:"13px",fontWeight:600,cursor:"pointer",minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}>{teachMode?"On":"Off"}</button>
    {speakingIdx!==null&&(<button onClick={stopSpeaking} style={{background:"rgba(255,80,80,0.15)",border:"1px solid rgba(255,80,80,0.4)",borderRadius:"10px",padding:"6px 10px",cursor:"pointer",color:"rgba(255,120,120,0.9)",fontSize:"13px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px",minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}><StopIcon/></button>)}
    {messages.length>0&&(<button onClick={clearChat} style={{background:"var(--glass)",border:"1px solid var(--line)",borderRadius:"10px",cursor:"pointer",fontSize:"13px",color:"var(--text-mid)",fontFamily:"inherit",padding:"6px 11px",fontWeight:600,minHeight:"36px",transition:"all 120ms cubic-bezier(0.22,1,0.36,1)"}}>Clear</button>)}
  </div>
</div></div>
{/* Chat body */}
<div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:"6px"}}>
  {isEmpty&&(<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeUp 0.35s cubic-bezier(0.22,1,0.36,1) both"}}>
    <div style={{textAlign:"center",maxWidth:"360px"}}>
      <div style={{display:"inline-block",marginBottom:"24px",animation:"pulseGlow 4s ease-in-out infinite"}}><LanceLogo size={72}/></div>
      <div style={{fontSize:"32px",fontWeight:600,color:"var(--text-hi)",letterSpacing:"-0.03em",marginBottom:"10px",lineHeight:1.2}}>Good to see you, Pastor.</div>
      <div style={{fontSize:"16px",color:"var(--text-mid)",fontWeight:400,lineHeight:1.5,marginBottom:"28px"}}>Type, talk, or drop a screenshot.</div>
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"10px"}}>
        <button onClick={()=>sendPreset("Prep a sermon")} style={{background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",border:"1px solid var(--line)",borderRadius:"10px",padding:"9px 16px",color:"var(--text-mid)",fontSize:"15px",fontWeight:500,fontFamily:"inherit",cursor:"pointer",transition:"all 200ms cubic-bezier(0.22,1,0.36,1)"}}>Sermon prep</button>
        <button onClick={()=>sendPreset("Give me today's devotion")} style={{background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",border:"1px solid var(--line)",borderRadius:"10px",padding:"9px 16px",color:"var(--text-mid)",fontSize:"15px",fontWeight:500,fontFamily:"inherit",cursor:"pointer",transition:"all 200ms cubic-bezier(0.22,1,0.36,1)"}}>Daily devotion</button>
        <button onClick={()=>sendPreset("Draft a letter")} style={{background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",border:"1px solid var(--line)",borderRadius:"10px",padding:"9px 16px",color:"var(--text-mid)",fontSize:"15px",fontWeight:500,fontFamily:"inherit",cursor:"pointer",transition:"all 200ms cubic-bezier(0.22,1,0.36,1)"}}>Draft a letter</button>
      </div>
    </div>
  </div>)}

  {messages.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s cubic-bezier(0.22,1,0.36,1) both",marginBottom:"4px"}}>
    {m.role==="assistant"&&(<div style={{flexShrink:0,marginRight:"9px",alignSelf:"flex-end"}}><LanceLogo size={22}/></div>)}
    <div style={{maxWidth:"82%",display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:"5px"}}>
      <div style={{padding:"12px 16px",borderRadius:m.role==="user"?"20px 20px 6px 20px":"6px 20px 20px 20px",background:m.role==="user"?"linear-gradient(135deg,#D4B45C,#A8863A)":"var(--glass)",backdropFilter:m.role==="user"?"none":"blur(24px) saturate(1.5)",WebkitBackdropFilter:m.role==="user"?"none":"blur(24px) saturate(1.5)",color:m.role==="user"?"#0B0E16":"var(--text-hi)",fontSize:"17px",lineHeight:"1.5",whiteSpace:"pre-wrap",fontWeight:400,letterSpacing:"-0.012em",border:m.role==="user"?"none":`1px solid var(--line)`,boxShadow:m.role==="user"?"0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)":"inset 0 1px 0 rgba(255,255,255,0.06)"}}>
        {m.imagePreview&&(<img src={m.imagePreview} alt="screenshot" style={{maxWidth:"100%",borderRadius:"10px",marginBottom:"10px",display:"block"}}/>)}
        {renderText(m.content)}
      </div>
      {m.role==="assistant"&&(<div style={{paddingLeft:"4px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2px",marginBottom:m.isDoc?"4px":"0"}}>
          <button className={`speak-btn${speakingIdx===i?" active":""}`} onClick={()=>speakingIdx===i?stopSpeaking():speakText(m.content,i)} style={{color:speakingIdx===i?"var(--gold-hi)":"var(--text-mid)",minWidth:"36px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center"}} title={speakingIdx===i?"Stop":"Hear Lance"}><SpeakerIcon active={speakingIdx===i} spinning={loadingIdx===i}/></button>
          <button className="speak-btn" onClick={()=>handleDownload(m.content,i)} style={{color:"var(--text-mid)",minWidth:"36px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center"}} title="Download Word doc"><DownloadIcon/></button>
          <button className={`copy-btn${copiedIdx===i?" copied":""}`} onClick={()=>handleCopy(m.content,i)} style={{minHeight:"36px"}}>{copiedIdx===i?"Copied":"Copy"}</button>
        </div>
        {m.emailData?(
          <EmailCard emailData={m.emailData} status={emailStatusByIdx[i]||"idle"} gmailConnected={gmailConnected} onSend={(data)=>handleSendEmail(i,data)}/>
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
    <div style={{flexShrink:0}}><LanceLogo size={22}/></div>
    <div style={{padding:"12px 18px",borderRadius:"6px 20px 20px 20px",background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",border:"1px solid var(--line)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06)",display:"flex",gap:"6px",alignItems:"center"}}>
      {[0,1,2].map(i=>(<div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--gold)",filter:"drop-shadow(0 0 4px rgba(201,168,76,0.6))",animation:`dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>))}
    </div>
  </div>)}
  <div ref={bottomRef}/>
</div>

    {/* Input */}
    <div style={{paddingTop:"10px",paddingLeft:"16px",paddingRight:"16px",paddingBottom:"max(16px,env(safe-area-inset-bottom,16px))",background:"var(--glass)",backdropFilter:"blur(24px) saturate(1.5)",WebkitBackdropFilter:"blur(24px) saturate(1.5)",borderTop:"1px solid var(--line)",flexShrink:0}}>
      {pendingFiles.length>0&&(<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
        {pendingFiles.map((f,i)=>(<div key={i} className="file-chip">
          <span>{f.name.length>20?f.name.slice(0,17)+"…":f.name}</span>
          <button onClick={()=>removeFile(i)} title="Remove"><CloseIcon/></button>
        </div>))}
      </div>)}
      <div style={{display:"flex",alignItems:"flex-end",gap:"8px",background:"rgba(255,255,255,0.07)",borderRadius:"20px",border:"1px solid var(--line)",padding:"9px 10px 9px 14px",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06)"}}>
        <button onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-lo)",display:"flex",alignItems:"center",padding:"4px",borderRadius:"6px",transition:"color 0.14s",flexShrink:0,minWidth:"36px",minHeight:"36px",justifyContent:"center"}} title="Attach file or screenshot" onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-lo)"}><AttachIcon/></button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.bmp,image/*" style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value=""}}/>
        <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"}} onKeyDown={handleKeyDown} onPaste={e=>{const items=Array.from(e.clipboardData?.items||[]);const imgItem=items.find(i=>i.type.startsWith("image/"));if(imgItem){e.preventDefault();const file=imgItem.getAsFile();if(file){const reader=new FileReader();reader.onload=()=>{const data=reader.result.split(",")[1];setPendingFiles(prev=>[...prev,{name:"screenshot.png",type:"image",mediaType:file.type||"image/png",data}])};reader.readAsDataURL(file)}}}} placeholder="Message Lance" rows={1} style={{flex:1,border:"none",background:"transparent",fontSize:"17px",color:"var(--text-hi)",resize:"none",lineHeight:"1.5",maxHeight:"120px",overflowY:"auto",fontWeight:400,letterSpacing:"-0.012em",fontFamily:"inherit"}}/>
        <button className={`mic-btn${teachMode?" listening":" idle"}`} onClick={toggleVoiceConversation} title={teachMode?"End voice conversation":"Start voice conversation"} style={{marginRight:"2px"}}>
          <VoiceChatIcon/>
        </button>
        <button className={`mic-btn${listening?" listening":" idle"}`} onClick={toggleMic} title={listening?"Stop":"Talk to Lance"}>
          <MicIcon/>
        </button>
        <button onClick={()=>send()} disabled={(!input.trim()&&pendingFiles.length===0)||loading} style={{width:"36px",height:"36px",borderRadius:"50%",background:(input.trim()||pendingFiles.length>0)&&!loading?"linear-gradient(135deg,#D4B45C,#A8863A)":"var(--glass)",border:"none",cursor:(input.trim()||pendingFiles.length>0)&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:(input.trim()||pendingFiles.length>0)&&!loading?"#0B0E16":"var(--text-lo)",boxShadow:(input.trim()||pendingFiles.length>0)&&!loading?"0 3px 12px rgba(201,168,76,0.4)":"none",transition:"all 200ms cubic-bezier(0.22,1,0.36,1)",transform:"scale(1)"}} onMouseDown={e=>e.currentTarget.style.transform="scale(0.96)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}><SendIcon/></button>
      </div>
    </div>
  </div></>);
}
