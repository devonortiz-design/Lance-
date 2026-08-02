import React,{useState,useRef,useEffect,useCallback}from"react";
import{callClaude,speak,readFile,detectDocumentContent,webSearch,formatSearchResults}from"./api";
import{loadMemory,loadProfile,loadRecentSessions,saveMessage,saveMemoryFact,saveProfileFact,saveSession,parseMemoryTags,stripMemoryTags}from"./memory";
import{SESSION_ID,SUPABASE_URL,SB_HEADERS}from"./config";
import{LanceLogo,SendIcon,SpeakerIcon,StopIcon,DownloadIcon,AttachIcon,CloseIcon}from"./icons";

const DOCX_URL="/api/docx";
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

function MicIcon(){return(<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 7.5a4.5 4.5 0 009 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="7.5" y1="12" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>)}

function WordDocCard({text, filename, onDownload, downloading}){
  return(
    <div onClick={onDownload} style={{
      display:"flex",alignItems:"center",gap:"10px",
      padding:"10px 14px",marginTop:"6px",
      background:"rgba(255,255,255,0.97)",
      border:"1px solid rgba(26,35,64,0.15)",
      borderRadius:"12px",cursor:"pointer",
      boxShadow:"0 2px 12px rgba(0,0,0,0.1)",
      transition:"all 0.15s",maxWidth:"220px",
      opacity:downloading?0.7:1,
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.18)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.1)"}
    >
      {/* Word doc icon */}
      <div style={{
        width:"36px",height:"44px",borderRadius:"4px",flexShrink:0,
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
        <div style={{fontSize:"13px",fontWeight:600,color:"#1a2340",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {downloading?"Preparing&#195;&#162;&#194;&#128;&#194;&#166;":"Lance Document"}
        </div>
        <div style={{fontSize:"11px",color:"#6B7280",marginTop:"1px"}}>
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
function PinIcon({active}){return(<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.5L11.5 4.5L9 7L9.5 10.5L6.5 8L3.5 10.5L4 7L1.5 4.5L4.5 1.5L6.5 3.5L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" fill={active?"currentColor":"none"} strokeLinejoin="round"/></svg>)}
function SaveIcon(){return(<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2h9v9l-4.5-2L2 11V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>)}
function TrashIcon(){return(<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3h9M4 3V2h4v1M5 5.5v4M7 5.5v4M2 3l.8 7.2A1 1 0 003.8 11h4.4a1 1 0 001-.8L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}

function renderText(t){try{if(!t)return "";return t.replace(/#{1,6} /g,"").replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/__(.*?)__/g,"$1").replace(/`(.*?)`/g,"$1").replace(/^[-*] /gm,"\u2022 ").replace(/^---+$/gm,"").replace(/\n{3,}/g,"\n\n").trim()}catch(e){return String(t||"")}}

const CSS=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
:root{--accent:#C9A84C;--text:#1a2340;--navy:#0d1321}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;-webkit-text-size-adjust:100%}
body{font-family:'DM Sans',-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
textarea:focus,button:focus{outline:none}
::-webkit-scrollbar{width:0}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 10px rgba(201,168,76,0.4))}50%{filter:drop-shadow(0 0 26px rgba(201,168,76,0.75))}}
@keyframes dot{0%,80%,100%{transform:scale(0.55);opacity:0.3}40%{transform:scale(1);opacity:1}}
@keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4)}50%{box-shadow:0 0 0 8px rgba(201,168,76,0)}}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
.speak-btn{border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:6px;transition:all 0.14s;opacity:0.55}
.speak-btn:hover{opacity:1;background:rgba(201,168,76,0.12)}
.speak-btn.active{opacity:1;color:#C9A84C}
.teach-toggle{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid;transition:all 0.18s;letter-spacing:0.02em}
.file-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;font-size:13px;color:#fff;font-family:inherit}
.file-chip button{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.6);display:flex;align-items:center;padding:0;transition:color 0.12s}
.file-chip button:hover{color:#fff}
.copy-btn{border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:6px;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.14s;opacity:0.55;color:rgba(255,255,255,0.6)}
.copy-btn:hover{opacity:1;background:rgba(201,168,76,0.12)}
.copy-btn.copied{opacity:1;color:#C9A84C}
.mic-btn{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:33px;height:33px;border-radius:50%;transition:all 0.14s;flex-shrink:0}
.mic-btn.idle{background:rgba(0,0,0,0.08);color:#aaa}
.mic-btn.listening{background:linear-gradient(135deg,#C9A84C,#a07830);color:#fff;animation:micPulse 1s ease-in-out infinite}@keyframes spin{to{transform:rotate(360deg)}}
.saved-panel{position:fixed;right:0;top:0;bottom:0;width:280px;background:rgba(13,19,33,0.97);border-left:1px solid rgba(201,168,76,0.2);backdrop-filter:blur(20px);z-index:400;display:flex;flex-direction:column;animation:slideIn 0.22s ease}
.saved-item{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:background 0.12s}
.saved-item:hover{background:rgba(255,255,255,0.05)}
.saved-item.active{background:rgba(201,168,76,0.1)}`;

export default function App(){
  const[messages,setMessages]=useState([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[memoryFacts,setMemoryFacts]=useState([]);
  const[profile,setProfile]=useState([]);
  const[recentSessions,setRecentSessions]=useState([]);
  const[teachMode,setTeachMode]=useState(false);
  const[speakingIdx,setSpeakingIdx]=useState(null);
  const[loadingIdx,setLoadingIdx]=useState(null);
  const[pendingFiles,setPendingFiles]=useState([]);
  const[dragOver,setDragOver]=useState(false);
  const[docxIdx,setDocxIdx]=useState(null);
  const[copiedIdx,setCopiedIdx]=useState(null);
  const[listening,setListening]=useState(false);
  const[downloadingIdx,setDownloadingIdx]=useState(null);
  const[showSaved,setShowSaved]=useState(false);
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
        audio.onended=()=>{setSpeakingIdx(null);audioRef.current=null;URL.revokeObjectURL(url)};
        audio.onerror=()=>{setSpeakingIdx(null);audioRef.current=null};
        audioRef.current=audio;audio.play();
      }else{
        setLoadingIdx(null);setSpeakingIdx(idx);
        const utt=new SpeechSynthesisUtterance(text.slice(0,2000));
        utt.rate=0.95;utt.onend=()=>setSpeakingIdx(null);
        window.speechSynthesis.speak(utt);
        audioRef.current={pause:()=>window.speechSynthesis.cancel()};
      }
    }catch(e){setLoadingIdx(null);setSpeakingIdx(null)}
  },[stopSpeaking]);

  const toggleMic=useCallback(()=>{
    if(listening){recognitionRef.current?.stop();setListening(false);return}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Try Safari on iPhone for voice input.");return}
    const rec=new SR();rec.lang="en-US";rec.continuous=false;rec.interimResults=false;
    rec.onstart=()=>setListening(true);
    rec.onresult=(e)=>{const t=e.results[0][0].transcript;setListening(false);if(t.trim())setTimeout(()=>sendText(t.trim()),100)};
    rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);
    recognitionRef.current=rec;rec.start();
  },[listening]);

  // Save current conversation
  const handleSave=useCallback(async()=>{
    if(messages.length===0)return;
    const saved=savedConvos.filter(c=>c.active!==false);
    if(saved.length>=5&&!activeConvoId){setSaveStatus("max");setTimeout(()=>setSaveStatus(null),2000);return}
    const firstUser=messages.find(m=>m.role==="user")?.content||"Conversation";
    const title=firstUser.slice(0,50)+(firstUser.length>50?"&#195;&#162;&#194;&#128;&#194;&#166;":"");
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
      const res=await fetch(DOCX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,filename:generateFilename(m.content)})});
      if(!res.ok)throw new Error("Docx failed: "+res.status);
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=(text.split("\n").find(l=>l.startsWith("#"))?.replace(/^#+\s*/,"").replace(/[*_`#>]/g,"").replace(/[^a-zA-Z0-9 ']/g," ").trim().slice(0,60)||"Lance Document")+".docx";
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      setDownloadingIdx(null);
    }catch(e){setDownloadingIdx(null);alert("Download failed: "+e.message)}
  };

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
      const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean);
      setMessages([...next,{role:"assistant",content:clean,isDoc}]);msgCount.current+=2;
      saveMessage("assistant",clean).catch(()=>{});
      for(const tag of tags){
        if(tag.type==="memory"){saveMemoryFact(tag.category,tag.fact,tag.confidence,SESSION_ID).catch(()=>{});}
        else if(tag.type==="profile"){saveProfileFact(tag.domain,tag.key,tag.value,tag.confidence).catch(()=>{});setProfile(prev=>[...prev.filter(p=>!(p.domain===tag.domain&&p.key===tag.key)),{domain:tag.domain,key:tag.key,value:tag.value,confidence:tag.confidence,active:true}]);}
      }
      if(tags.some(t=>t.type==="memory")){loadMemory().then(f=>{if(Array.isArray(f))setMemoryFacts(f)}).catch(()=>{});}
      if(msgCount.current%4===0){saveSession("general",`${t.slice(0,90)}${t.length>90?"&#195;&#162;&#194;&#128;&#194;&#166;":""}`,msgCount.current).catch(()=>{});}
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
        const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean);
        setMessages([...next,{role:"assistant",content:clean,isDoc}]);msgCount.current+=2;
        saveMessage("assistant",clean).catch(()=>{});
        if(teachMode)speakText(clean,idx);
      }catch(e){setMessages(prev=>[...prev,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
      setLoading(false);
    }else{sendText(t);}
  },[input,loading,messages,memoryFacts,profile,recentSessions,pendingFiles,teachMode,stopSpeaking,speakText,sendText]);

  const handleKeyDown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
  const clearChat=()=>{stopSpeaking();setMessages([]);setPendingFiles([]);setDocxIdx(null);setActiveConvoId(null);msgCount.current=0};

  const pinnedConvos=savedConvos.filter(c=>c.pinned&&c.active!==false).sort((a,b)=>a.pin_order-b.pin_order);
  const allSaved=savedConvos.filter(c=>c.active!==false);
  const isEmpty=messages.length===0;

  return(<><style>{CSS}</style>
  <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(160deg,#0d1321 0%,#1a2340 45%,#0f1b2d 100%)"}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>

    {/* Drag overlay */}
    {dragOver&&(<div style={{position:"fixed",inset:0,background:"rgba(41,121,255,0.18)",border:"2px dashed rgba(130,177,255,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{color:"#fff",fontSize:"18px",fontWeight:600}}>Drop file or screenshot</div></div>)}

    {/* Listening overlay */}
    {listening&&(<div style={{position:"fixed",inset:0,background:"rgba(13,19,33,0.85)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={toggleMic}><div style={{width:"80px",height:"80px",borderRadius:"50%",background:"linear-gradient(135deg,#C9A84C,#a07830)",display:"flex",alignItems:"center",justifyContent:"center",animation:"micPulse 1s ease-in-out infinite",marginBottom:"20px"}}><MicIcon/></div><div style={{color:"#fff",fontSize:"18px",fontWeight:600,marginBottom:"8px"}}>Listening&#195;&#162;&#194;&#128;&#194;&#166;</div><div style={{color:"rgba(255,255,255,0.5)",fontSize:"14px"}}>Tap anywhere to cancel</div></div>)}

    {/* Saved conversations panel */}
    {showSaved&&(<div className="saved-panel">
      <div style={{padding:"16px 14px",borderBottom:"1px solid rgba(201,168,76,0.2)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"#C9A84C",fontSize:"14px",fontWeight:600}}>Saved ({allSaved.length}/5)</div>
        <button onClick={()=>setShowSaved(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:"18px",lineHeight:1}}>&#195;&#131;&#194;&#151;</button>
      </div>

      {/* Pinned section */}
      {pinnedConvos.length>0&&(<>
        <div style={{padding:"8px 14px 4px",fontSize:"11px",fontWeight:700,color:"rgba(201,168,76,0.6)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Pinned ({pinnedConvos.length}/2)</div>
        {pinnedConvos.map(c=>(<div key={c.id} className={`saved-item${activeConvoId===c.id?" active":""}`} onClick={()=>handleLoadConvo(c)}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"6px"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#C9A84C",fontSize:"13px",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:"11px",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.summary?.slice(0,60)}&#195;&#162;&#194;&#128;&#194;&#166;</div>
            </div>
            <div style={{display:"flex",gap:"4px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" style={{color:"#C9A84C",opacity:1}} onClick={()=>handlePin(c)} title="Unpin"><PinIcon active={true}/></button>
              <button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
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
              <div style={{color:"#fff",fontSize:"13px",fontWeight:c.pinned?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:"11px",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.summary?.slice(0,60)}</div>
            </div>
            <div style={{display:"flex",gap:"4px",flexShrink:0}} onClick={e=>e.stopPropagation()}>
              <button className="speak-btn" style={{color:c.pinned?"#C9A84C":"rgba(255,255,255,0.4)"}} onClick={()=>handlePin(c)} title={c.pinned?"Unpin":"Pin (max 2)"}><PinIcon active={c.pinned}/></button>
              <button className="speak-btn" onClick={()=>handleDeleteConvo(c.id)} title="Delete"><TrashIcon/></button>
            </div>
          </div>
        </div>))}
      </div>

      <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:"11px",color:"rgba(255,255,255,0.3)",textAlign:"center"}}>Save up to 5 conversations &#195;&#162;&#194;&#128;&#194;&#162; Pin 2</div>
    </div>)}

    {/* Header */}
    <div style={{paddingTop:"env(safe-area-inset-top,0px)",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.10)",flexShrink:0}}>
    <div style={{height:"54px",padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        <LanceLogo size={28}/>
        <div>
          <div style={{fontSize:"16px",fontWeight:600,color:"#fff",letterSpacing:"-0.02em",lineHeight:1.1}}>Lance</div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.45)"}}>Pastor Devon's Agent</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        {/* Save status toast */}
        {saveStatus&&(<div style={{fontSize:"12px",color:saveStatus==="saved"?"#C9A84C":saveStatus==="maxpin"?"#ff8080":"#ff8080",fontWeight:600}}>{saveStatus==="saved"?"Saved!":saveStatus==="max"?"Max 5":"Max 2 pins"}</div>)}
        {/* Pinned quick access */}
        {pinnedConvos.map((c,i)=>(<button key={c.id} onClick={()=>handleLoadConvo(c)} style={{background:activeConvoId===c.id?"rgba(201,168,76,0.25)":"rgba(255,255,255,0.08)",border:`1px solid ${activeConvoId===c.id?"rgba(201,168,76,0.5)":"rgba(255,255,255,0.15)"}`,borderRadius:"8px",padding:"3px 8px",cursor:"pointer",fontSize:"11px",color:activeConvoId===c.id?"#C9A84C":"rgba(255,255,255,0.6)",fontFamily:"inherit",maxWidth:"70px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={c.title}>&#195;&#176;&#194;&#159;&#194;&#147;&#194;&#140; {c.title.slice(0,12)}</button>))}
        <button onClick={()=>setShowSaved(s=>!s)} style={{background:showSaved?"rgba(201,168,76,0.2)":"rgba(255,255,255,0.08)",border:`1px solid ${showSaved?"rgba(201,168,76,0.4)":"rgba(255,255,255,0.15)"}`,borderRadius:"8px",padding:"4px 9px",cursor:"pointer",color:showSaved?"#C9A84C":"rgba(255,255,255,0.6)",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px"}}><SaveIcon/><span style={{fontSize:"12px",fontWeight:600}}>{allSaved.length}</span></button>
        {messages.length>0&&(<button onClick={handleSave} style={{background:"rgba(201,168,76,0.12)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:"8px",padding:"4px 9px",cursor:"pointer",color:"#C9A84C",fontSize:"12px",fontWeight:600,fontFamily:"inherit"}}>Save</button>)}
        <button className="teach-toggle" onClick={()=>{setTeachMode(t=>!t);if(teachMode)stopSpeaking()}} style={{background:teachMode?"rgba(201,168,76,0.2)":"rgba(255,255,255,0.08)",borderColor:teachMode?"rgba(201,168,76,0.5)":"rgba(255,255,255,0.15)",color:teachMode?"#C9A84C":"rgba(255,255,255,0.55)",padding:"4px 9px"}}>{teachMode?"&#195;&#176;&#194;&#159;&#194;&#148;&#194;&#138;":"&#195;&#176;&#194;&#159;&#194;&#148;&#194;&#135;"}</button>
        {speakingIdx!==null&&(<button onClick={stopSpeaking} style={{background:"rgba(255,80,80,0.2)",border:"1px solid rgba(255,80,80,0.4)",borderRadius:"8px",padding:"4px 8px",cursor:"pointer",color:"rgba(255,160,160,0.9)",fontSize:"12px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px"}}><StopIcon/></button>)}
        {messages.length>0&&(<button onClick={clearChat} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"rgba(255,255,255,0.5)",fontFamily:"inherit",padding:"4px 8px"}}>Clear</button>)}
      </div>
    </div></div>

    {/* Chat body */}
    <div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:"4px"}}>
      {isEmpty&&(<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeUp 0.35s ease both"}}>
        <div style={{textAlign:"center",maxWidth:"340px"}}>
          <div style={{display:"inline-block",marginBottom:"18px",animation:"pulseGlow 3s ease-in-out infinite"}}><LanceLogo size={72}/></div>
          <div style={{fontSize:"30px",fontWeight:600,color:"#fff",letterSpacing:"-0.03em",marginBottom:"8px"}}>Good to see you, Pastor.</div>
          <div style={{fontSize:"16px",color:"rgba(255,255,255,0.6)",fontWeight:300,lineHeight:1.5}}>Type, talk, or drop a screenshot.</div>
        </div>
      </div>)}

      {messages.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s ease both",marginBottom:"4px"}}>
        {m.role==="assistant"&&(<div style={{flexShrink:0,marginRight:"8px",alignSelf:"flex-end"}}><LanceLogo size={22}/></div>)}
        <div style={{maxWidth:"76%",display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:"4px"}}>
          <div style={{padding:"11px 14px",borderRadius:m.role==="user"?"18px 18px 5px 18px":"5px 18px 18px 18px",background:m.role==="user"?"linear-gradient(135deg,#C9A84C,#a07830)":"rgba(255,255,255,0.95)",color:m.role==="user"?"#fff":"var(--text)",fontSize:"16px",lineHeight:"1.65",whiteSpace:"pre-wrap",fontWeight:300,boxShadow:m.role==="user"?"0 4px 16px rgba(0,0,0,0.25)":"0 4px 20px rgba(0,0,0,0.15)",border:m.role==="user"?"none":"1px solid rgba(255,255,255,0.5)"}}>
            {/* Show image preview if message contains image */}
            {m.imagePreview&&(<img src={m.imagePreview} alt="screenshot" style={{maxWidth:"100%",borderRadius:"8px",marginBottom:"8px",display:"block"}}/>)}
            {renderText(m.content)}
          </div>
          {m.role==="assistant"&&(<div style={{paddingLeft:"4px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"2px",marginBottom:m.isDoc?"4px":"0"}}>
              <button className={`speak-btn${speakingIdx===i?" active":""}`} onClick={()=>speakingIdx===i?stopSpeaking():speakText(m.content,i)} style={{color:speakingIdx===i?"#C9A84C":"rgba(255,255,255,0.6)"}} title={speakingIdx===i?"Stop":"Hear Lance"}><SpeakerIcon active={speakingIdx===i} spinning={loadingIdx===i}/></button>
              <button className="speak-btn" onClick={()=>handleDownload(m.content,i)} style={{color:"rgba(255,255,255,0.6)"}} title="Download Word doc"><DownloadIcon/></button>
              <button className={`copy-btn${copiedIdx===i?" copied":""}`} onClick={()=>handleCopy(m.content,i)}>{copiedIdx===i?"&#195;&#162;&#194;&#156;&#194;&#147; Copied":"Copy"}</button>
            </div>
            {m.isDoc&&(<WordDocCard text={m.content} filename={generateFilename(m.content)} onDownload={()=>handleDownload(m.content,i)} downloading={downloadingIdx===i}/> )})
          </div>)}
        </div>
      </div>))}

      {loading&&(<div style={{display:"flex",alignItems:"flex-end",gap:"8px",animation:"fadeUp 0.18s ease both"}}>
        <div style={{flexShrink:0}}><LanceLogo size={22}/></div>
        <div style={{padding:"11px 16px",borderRadius:"5px 18px 18px 18px",background:"rgba(255,255,255,0.95)",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",display:"flex",gap:"5px",alignItems:"center"}}>
          {[0,1,2].map(i=>(<div key={i} style={{width:"7px",height:"7px",borderRadius:"50%",background:"#C9A84C",animation:`dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>))}
        </div>
      </div>)}
      <div ref={bottomRef}/>
    </div>

    {/* Input */}
    <div style={{paddingTop:"10px",paddingLeft:"16px",paddingRight:"16px",paddingBottom:"max(16px,env(safe-area-inset-bottom,16px))",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
      {pendingFiles.length>0&&(<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
        {pendingFiles.map((f,i)=>(<div key={i} className="file-chip">
          {f.type==="image"&&<span>&#195;&#176;&#194;&#159;&#194;&#147;&#194;&#183;</span>}
          <span>{f.name.length>20?f.name.slice(0,17)+"&#195;&#162;&#194;&#128;&#194;&#166;":f.name}</span>
          <button onClick={()=>removeFile(i)} title="Remove"><CloseIcon/></button>
        </div>))}
      </div>)}
      <div style={{display:"flex",alignItems:"flex-end",gap:"8px",background:"rgba(255,255,255,0.95)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.5)",padding:"9px 10px 9px 14px",boxShadow:"0 4px 24px rgba(0,0,0,0.2)"}}>
        <button onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(74,74,106,0.6)",display:"flex",alignItems:"center",padding:"4px",borderRadius:"6px",transition:"color 0.14s",flexShrink:0}} title="Attach file or screenshot" onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="rgba(74,74,106,0.6)"}><AttachIcon/></button>
        {/* Accept all image types including HEIC, screenshots */}
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.bmp,image/*" style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value=""}}/>
        <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"}} onKeyDown={handleKeyDown} onPaste={e=>{const items=Array.from(e.clipboardData?.items||[]);const imgItem=items.find(i=>i.type.startsWith("image/"));if(imgItem){e.preventDefault();const file=imgItem.getAsFile();if(file){const reader=new FileReader();reader.onload=()=>{const data=reader.result.split(",")[1];setPendingFiles(prev=>[...prev,{name:"screenshot.png",type:"image",mediaType:file.type||"image/png",data}])};reader.readAsDataURL(file)}}}} placeholder="Message Lance&#195;&#162;&#194;&#128;&#194;&#166; (paste screenshots here)" rows={1} style={{flex:1,border:"none",background:"transparent",fontSize:"17px",color:"var(--text)",resize:"none",lineHeight:"1.5",maxHeight:"120px",overflowY:"auto",fontWeight:300,letterSpacing:"-0.01em",fontFamily:"inherit"}}/>
        <button className={`mic-btn${listening?" listening":" idle"}`} onClick={toggleMic} title={listening?"Stop":"Talk to Lance"}>
          <MicIcon/>
        </button>
        <button onClick={()=>send()} disabled={(!input.trim()&&pendingFiles.length===0)||loading} style={{width:"33px",height:"33px",borderRadius:"50%",background:(input.trim()||pendingFiles.length>0)&&!loading?"linear-gradient(135deg,#C9A84C,#a07830)":"rgba(0,0,0,0.08)",border:"none",cursor:(input.trim()||pendingFiles.length>0)&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:(input.trim()||pendingFiles.length>0)&&!loading?"#fff":"#aaa",boxShadow:(input.trim()||pendingFiles.length>0)&&!loading?"0 3px 10px rgba(201,168,76,0.4)":"none",transition:"all 0.14s"}}><SendIcon/></button>
      </div>
    </div>
  </div></>);
}
