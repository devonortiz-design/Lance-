import React,{useState,useRef,useEffect,useCallback}from"react";
import{callClaude,speak,readFile,detectDocumentContent,webSearch,formatSearchResults}from"./api";
import{loadMemory,loadProfile,loadRecentSessions,saveMessage,saveMemoryFact,saveProfileFact,saveSession,parseMemoryTags,stripMemoryTags}from"./memory";
import{SESSION_ID}from"./config";
import{LanceLogo,SendIcon,SpeakerIcon,StopIcon,DownloadIcon,AttachIcon,CloseIcon}from"./icons";

const SUPABASE_URL="https://dtqmzdteomgjresjfrog.supabase.co";
const DOCX_URL=`${SUPABASE_URL}/functions/v1/lance-docx`;
const TTS_URL=`${SUPABASE_URL}/functions/v1/lance-tts`;
const SERMON_URL=`${SUPABASE_URL}/functions/v1/lance-sermon-prep`;
const EXAM_URL=`${SUPABASE_URL}/functions/v1/lance-exam-gen`;
const DEVOTION_URL=`${SUPABASE_URL}/functions/v1/lance-devotion`;

const CSS=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');:root{--accent:#C9A84C;--text:#1a2340;--text2:#4a5568}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body,#root{height:100%;-webkit-text-size-adjust:100%}body{font-family:'DM Sans',-apple-system,sans-serif;-webkit-font-smoothing:antialiased}textarea:focus,button:focus{outline:none}::-webkit-scrollbar{width:0}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 10px rgba(201,168,76,0.4))}50%{filter:drop-shadow(0 0 26px rgba(201,168,76,0.75))}}@keyframes dot{0%,80%,100%{transform:scale(0.55);opacity:0.3}40%{transform:scale(1);opacity:1}}@keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4)}50%{box-shadow:0 0 0 8px rgba(201,168,76,0)}}.speak-btn{border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:6px;transition:all 0.14s;opacity:0.55}.speak-btn:hover{opacity:1;background:rgba(201,168,76,0.12)}.speak-btn.active{opacity:1;color:#C9A84C}.teach-toggle{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid;transition:all 0.18s;letter-spacing:0.02em}.file-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;font-size:13px;color:#fff;font-family:inherit}.file-chip button{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.6);display:flex;align-items:center;padding:0;transition:color 0.12s}.file-chip button:hover{color:#fff}.copy-btn{border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:6px;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.14s;opacity:0.55;color:rgba(255,255,255,0.6)}.copy-btn:hover{opacity:1;background:rgba(201,168,76,0.12)}.copy-btn.copied{opacity:1;color:#C9A84C}.mic-btn{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:33px;height:33px;border-radius:50%;transition:all 0.14s;flex-shrink:0}.mic-btn.idle{background:rgba(0,0,0,0.08);color:#aaa}.mic-btn.listening{background:linear-gradient(135deg,#C9A84C,#a07830);color:#fff;animation:micPulse 1s ease-in-out infinite}`;

function MicIcon(){return(<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 7.5a4.5 4.5 0 009 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="7.5" y1="12" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>)}

function renderText(t){return t.replace(/#{1,6} /g,"").replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/__(.*?)__/g,"$1").replace(/`(.*?)`/g,"$1").replace(/^[-*] /gm,"\u2022 ").replace(/^---+$/gm,"").replace(/\n{3,}/g,"\n\n").trim()}

export default function App(){
const[messages,setMessages]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);const[memoryFacts,setMemoryFacts]=useState([]);const[profile,setProfile]=useState([]);const[recentSessions,setRecentSessions]=useState([]);const[teachMode,setTeachMode]=useState(false);const[speakingIdx,setSpeakingIdx]=useState(null);const[loadingIdx,setLoadingIdx]=useState(null);const[pendingFiles,setPendingFiles]=useState([]);const[dragOver,setDragOver]=useState(false);const[docxIdx,setDocxIdx]=useState(null);const[copiedIdx,setCopiedIdx]=useState(null);const[listening,setListening]=useState(false);
const bottomRef=useRef(null);const inputRef=useRef(null);const audioRef=useRef(null);const fileRef=useRef(null);const recognitionRef=useRef(null);const msgCount=useRef(0);

useEffect(()=>{(async()=>{const[f,p,s]=await Promise.all([loadMemory().catch(()=>[]),loadProfile().catch(()=>[]),loadRecentSessions().catch(()=>[])]);setMemoryFacts(Array.isArray(f)?f:[]);setProfile(Array.isArray(p)?p:[]);setRecentSessions(Array.isArray(s)?s:[])})()},[]);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages,loading]);

const stopSpeaking=useCallback(()=>{if(audioRef.current){audioRef.current.pause();audioRef.current=null}setSpeakingIdx(null);setLoadingIdx(null)},[]);

const speakText=useCallback(async(text,idx)=>{
stopSpeaking();setLoadingIdx(idx);
try{
const res=await fetch(TTS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
if(res.ok&&res.headers.get("content-type")?.includes("audio")){
const blob=await res.blob();const url=URL.createObjectURL(blob);const audio=new Audio(url);
audio.onplay=()=>{setLoadingIdx(null);setSpeakingIdx(idx)};
audio.onended=()=>{setSpeakingIdx(null);audioRef.current=null;URL.revokeObjectURL(url)};
audio.onerror=()=>{setSpeakingIdx(null);audioRef.current=null;URL.revokeObjectURL(url)};
audioRef.current=audio;audio.play();
}else{
setLoadingIdx(null);setSpeakingIdx(idx);
const utt=new SpeechSynthesisUtterance(text.slice(0,2000));utt.rate=0.95;
utt.onend=()=>{setSpeakingIdx(null)};
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

const handleFiles=useCallback(async(fileList)=>{const files=Array.from(fileList);const read=await Promise.all(files.map(readFile));setPendingFiles(prev=>[...prev,...read])},[]);
const removeFile=useCallback((idx)=>{setPendingFiles(prev=>prev.filter((_,i)=>i!==idx))},[]);
const onDrop=useCallback((e)=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files.length)handleFiles(e.dataTransfer.files)},[handleFiles]);
const handleDownload=async(text,idx)=>{try{setDocxIdx(idx);const res=await fetch(DOCX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,filename:"lance-document"})});if(!res.ok)throw new Error("Docx failed: "+res.status);const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="lance-document.docx";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}catch(e){alert("Download failed: "+e.message)}};
const handleCopy=async(text,idx)=>{try{await navigator.clipboard.writeText(text);setCopiedIdx(idx);setTimeout(()=>setCopiedIdx(null),2000)}catch(e){}};
const detectIntent=(t)=>{if(/\b(sermon prep|preach on|sermon on|exegete|exposition of|[1-3]?\s?[A-Z][a-z]+ \d+:\d+)\b/.test(t))return"sermon";if(/\b(exam|quiz|test|fill.in|questions for)\b/i.test(t))return"exam";if(/\b(devotion|devos|daily word|morning word)\b/i.test(t))return"devotion";return null};

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
if(needsSearch&&t.length>10){try{const sd=await webSearch(t,5);if(sd.results&&sd.results.length>0){searchContext="\n\n[WEB SEARCH RESULTS for: "+t+"]\n"+formatSearchResults(sd)+"\n[END SEARCH RESULTS]"}}catch(e){}}
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
const tags=parseMemoryTags(raw);const clean=stripMemoryTags(raw);const idx=next.length;const isDoc=detectDocumentContent(clean);
setMessages([...next,{role:"assistant",content:clean,isDoc}]);msgCount.current+=2;
saveMessage("assistant",clean).catch(()=>{});
if(teachMode)speakText(clean,idx);
}catch(e){setMessages(prev=>[...prev,{role:"assistant",content:`Something went wrong: ${e.message}`,isDoc:false}]);}
setLoading(false);
}else{sendText(t);}
},[input,loading,messages,memoryFacts,profile,recentSessions,pendingFiles,teachMode,stopSpeaking,speakText,sendText]);

const handleKeyDown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
const clearChat=()=>{stopSpeaking();setMessages([]);setPendingFiles([]);setDocxIdx(null);msgCount.current=0};
const isEmpty=messages.length===0;

return(<><style>{CSS}</style><div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(160deg,#0d1321 0%,#1a2340 45%,#0f1b2d 100%)"}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}>
{dragOver&&(<div style={{position:"fixed",inset:0,background:"rgba(41,121,255,0.18)",border:"2px dashed rgba(130,177,255,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{color:"#fff",fontSize:"18px",fontWeight:600}}>Drop file for Lance to read</div></div>)}
{listening&&(<div style={{position:"fixed",inset:0,background:"rgba(13,19,33,0.85)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={toggleMic}><div style={{width:"80px",height:"80px",borderRadius:"50%",background:"linear-gradient(135deg,#C9A84C,#a07830)",display:"flex",alignItems:"center",justifyContent:"center",animation:"micPulse 1s ease-in-out infinite",marginBottom:"20px"}}><MicIcon/></div><div style={{color:"#fff",fontSize:"18px",fontWeight:600,marginBottom:"8px"}}>Listening…</div><div style={{color:"rgba(255,255,255,0.5)",fontSize:"14px"}}>Tap anywhere to cancel</div></div>)}
<div style={{paddingTop:"env(safe-area-inset-top,0px)",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.10)",flexShrink:0}}>
<div style={{height:"54px",padding:"0 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
<div style={{display:"flex",alignItems:"center",gap:"10px"}}><LanceLogo size={30}/><div><div style={{fontSize:"17px",fontWeight:600,color:"#fff",letterSpacing:"-0.02em",lineHeight:1.1}}>Lance</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.45)"}}>Pastor Devon's Agent</div></div></div>
<div style={{display:"flex",alignItems:"center",gap:"10px"}}>
<button className="teach-toggle" onClick={()=>{setTeachMode(t=>!t);if(teachMode)stopSpeaking()}} style={{background:teachMode?"rgba(201,168,76,0.2)":"rgba(255,255,255,0.1)",borderColor:teachMode?"rgba(201,168,76,0.5)":"rgba(255,255,255,0.2)",color:teachMode?"#C9A84C":"rgba(255,255,255,0.65)"}}>{teachMode?"🔊 Teaching":"🔇 Silent"}</button>
{speakingIdx!==null&&(<button onClick={stopSpeaking} style={{display:"flex",alignItems:"center",gap:"5px",padding:"5px 10px",borderRadius:"8px",background:"rgba(255,80,80,0.2)",border:"1px solid rgba(255,80,80,0.4)",color:"rgba(255,160,160,0.9)",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}><StopIcon/> Stop</button>)}
<div style={{display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#69f0ae"}}/><span style={{fontSize:"12px",color:"rgba(255,255,255,0.4)"}}>Online</span></div>
{messages.length>0&&(<button onClick={clearChat} style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"8px",cursor:"pointer",fontSize:"14px",color:"rgba(255,255,255,0.7)",fontFamily:"inherit",padding:"4px 10px"}}>Clear</button>)}
</div></div></div>
<div style={{flex:1,overflowY:"auto",padding:"20px 20px 8px",display:"flex",flexDirection:"column",gap:"4px"}}>
{isEmpty&&(<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeUp 0.35s ease both"}}><div style={{textAlign:"center",maxWidth:"360px"}}><div style={{display:"inline-block",marginBottom:"20px",animation:"pulseGlow 3s ease-in-out infinite"}}><LanceLogo size={76}/></div><div style={{fontSize:"32px",fontWeight:600,color:"#fff",letterSpacing:"-0.03em",marginBottom:"8px",textShadow:"0 2px 16px rgba(0,0,0,0.4)"}}>Good to see you, Pastor.</div><div style={{fontSize:"17px",color:"rgba(255,255,255,0.68)",fontWeight:300,lineHeight:1.55}}>Type, tap the mic, or drop a file.</div></div></div>)}
{messages.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s ease both",marginBottom:"4px"}}>
{m.role==="assistant"&&(<div style={{flexShrink:0,marginRight:"8px",alignSelf:"flex-end"}}><LanceLogo size={24}/></div>)}
<div style={{maxWidth:"74%",display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:"4px"}}>
<div style={{padding:"11px 15px",borderRadius:m.role==="user"?"18px 18px 5px 18px":"5px 18px 18px 18px",background:m.role==="user"?"linear-gradient(135deg,#C9A84C,#a07830)":"rgba(255,255,255,0.95)",color:m.role==="user"?"#fff":"var(--text)",fontSize:"16px",lineHeight:"1.65",whiteSpace:"pre-wrap",fontWeight:300,boxShadow:m.role==="user"?"0 4px 16px rgba(0,0,0,0.25)":"0 4px 20px rgba(0,0,0,0.15)",border:m.role==="user"?"none":"1px solid rgba(255,255,255,0.5)",letterSpacing:"-0.005em"}}>{renderText(m.content)}</div>
{m.role==="assistant"&&(<div style={{display:"flex",alignItems:"center",gap:"2px",paddingLeft:"4px"}}>
<button className={`speak-btn${speakingIdx===i?" active":""}`} onClick={()=>speakingIdx===i?stopSpeaking():speakText(m.content,i)} style={{color:speakingIdx===i?"#C9A84C":"rgba(255,255,255,0.6)"}} title={speakingIdx===i?"Stop":"Hear Lance"}><SpeakerIcon active={speakingIdx===i} spinning={loadingIdx===i}/></button>
<button className="speak-btn" onClick={()=>handleDownload(m.content,i)} style={{color:"rgba(255,255,255,0.6)"}} title="Download as Word doc"><DownloadIcon/></button>
<button className={`copy-btn${copiedIdx===i?" copied":""}`} onClick={()=>handleCopy(m.content,i)}>{copiedIdx===i?"✓ Copied":"Copy"}</button>
</div>)}
</div></div>))}
{loading&&(<div style={{display:"flex",alignItems:"flex-end",gap:"8px",animation:"fadeUp 0.18s ease both"}}><div style={{flexShrink:0}}><LanceLogo size={24}/></div><div style={{padding:"11px 16px",borderRadius:"5px 18px 18px 18px",background:"rgba(255,255,255,0.95)",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",display:"flex",gap:"5px",alignItems:"center"}}>{[0,1,2].map(i=>(<div key={i} style={{width:"7px",height:"7px",borderRadius:"50%",background:"#C9A84C",animation:`dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>))}</div></div>)}
<div ref={bottomRef}/>
</div>
<div style={{paddingTop:"10px",paddingLeft:"20px",paddingRight:"20px",paddingBottom:"max(18px,env(safe-area-inset-bottom,18px))",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
{pendingFiles.length>0&&(<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>{pendingFiles.map((f,i)=>(<div key={i} className="file-chip"><span>{f.name.length>24?f.name.slice(0,21)+"…":f.name}</span><button onClick={()=>removeFile(i)} title="Remove"><CloseIcon/></button></div>))}</div>)}
<div style={{display:"flex",alignItems:"flex-end",gap:"8px",background:"rgba(255,255,255,0.95)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.5)",padding:"9px 10px 9px 14px",boxShadow:"0 4px 24px rgba(0,0,0,0.2)"}}>
<button onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(74,74,106,0.6)",display:"flex",alignItems:"center",padding:"4px",borderRadius:"6px",transition:"color 0.14s",flexShrink:0}} title="Attach file" onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="rgba(74,74,106,0.6)"}><AttachIcon/></button>
<input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value=""}}/>
<textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"}} onKeyDown={handleKeyDown} placeholder="Message Lance…" rows={1} style={{flex:1,border:"none",background:"transparent",fontSize:"17px",color:"var(--text)",resize:"none",lineHeight:"1.5",maxHeight:"120px",overflowY:"auto",fontWeight:300,letterSpacing:"-0.01em",fontFamily:"inherit"}}/>
<button className={`mic-btn${listening?" listening":" idle"}`} onClick={toggleMic} title={listening?"Stop listening":"Talk to Lance"}><MicIcon/></button>
<button onClick={()=>send()} disabled={(!input.trim()&&pendingFiles.length===0)||loading} style={{width:"33px",height:"33px",borderRadius:"50%",background:(input.trim()||pendingFiles.length>0)&&!loading?"linear-gradient(135deg,#C9A84C,#a07830)":"rgba(0,0,0,0.08)",border:"none",cursor:(input.trim()||pendingFiles.length>0)&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:(input.trim()||pendingFiles.length>0)&&!loading?"#fff":"#aaa",boxShadow:(input.trim()||pendingFiles.length>0)&&!loading?"0 3px 10px rgba(201,168,76,0.4)":"none",transition:"all 0.14s"}}><SendIcon/></button>
</div></div>
</div></>);}
