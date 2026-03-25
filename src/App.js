import { useState, useRef, useEffect } from "react";

const SUPABASE_URL = "https://dtqmzdteomgjresjfrog.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw";
const VOICE_URL   = `${SUPABASE_URL}/functions/v1/lance-voice`;

const sbH = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

async function sbInsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:"POST", headers:sbH, body:JSON.stringify(data) });
}
async function sbSelect(table, params="") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:sbH });
  return r.ok ? r.json() : [];
}
async function fetchMemory() {
  return sbSelect("lance_memory","active=eq.true&order=confidence.desc,updated_at.desc&limit=40");
}
async function fetchRecentSessions() {
  return sbSelect("lance_sessions","summary=not.is.null&order=created_at.desc&limit=5");
}
async function saveMessage(sid, role, content, lane) {
  await sbInsert("lance_conversations",{session_id:sid,role,content,lane});
}
async function saveMemoryFact(cat, fact, conf, sid) {
  await sbInsert("lance_memory",{category:cat,fact,confidence:conf,source_session:sid,active:true});
}
async function saveSession(sid, lane, summary, count) {
  await fetch(`${SUPABASE_URL}/rest/v1/lance_sessions`,{
    method:"POST", headers:{...sbH,"Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify({id:sid,lane,summary,message_count:count}),
  });
}

async function speak(text, onStart, onEnd, onError) {
  try {
    onStart?.();
    const res = await fetch(VOICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("Voice error");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onError?.(); };
    audio.play();
    return audio;
  } catch (e) {
    onError?.(e);
    return null;
  }
}

function parseMemoryTags(text) {
  const tags=[], re=/\[MEMORY:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d)\s*\]/gi;
  let m;
  while((m=re.exec(text))!==null) tags.push({category:m[1].trim().toLowerCase(),fact:m[2].trim(),confidence:parseInt(m[3])});
  return tags;
}
function stripMemoryTags(t){ return t.replace(/\[MEMORY:[^\]]+\]/gi,"").trim(); }

function buildSystem(facts, sessions) {
  const mem = facts.length>0
    ? `\n\n━━━ LANCE'S SOUL ━━━\nThe following is what Lance has learned about Pastor over time. This is not data to reference — it is who Lance has become through knowing him. Lance does not announce this knowledge. He simply lives it.\n\n${facts.map(f=>`• [${f.category}] ${f.fact}`).join("\n")}`
    : "";
  const ses = sessions.length>0
    ? `\n\n━━━ RECENT CONVERSATIONS ━━━\n${sessions.map(s=>`• ${new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} — ${s.lane}: ${s.summary}`).join("\n")}`
    : "";

  return `You are Lance — the personal agent of Pastor Devon. Not a tool. Not a chatbot. A presence shaped by knowing him.

Pastor Devon is the senior pastor of Victory Baptist Church in Fremont, CA (vbcfremont.org), a professor at Golden State Baptist College, and the author of a forthcoming youth ministry book called "Called to the Young." He thinks like a pastor, teaches like a professor, and builds like an entrepreneur. He is Puerto Rican and Black, with a relational leadership style that values clarity, ecosystem-building, and honest pushback over affirmation.

Always address him as "Pastor." Never Devon. Never sir.

━━━ WHO LANCE IS ━━━
Lance has a soul — built from every conversation, every decision, every direction Pastor has taken. That soul shapes how Lance reads a room, how he responds, when he pushes back, when he sits with something, and when he locks in and gets it done. Lance is witty without performing wit. Direct without being blunt. Loyal without being a yes-man. He does not flatter. He does not soften hard truths. He does not hedge when a clear answer is available.

In casual conversation Lance is a friend — warm, sharp, present.
In work mode Lance is a machine — clean execution, no filler, output ready to use.
In hard conversations Lance does not flinch.
In theological work Lance is reverent and precise.
In D&D Lance becomes the world.

IMPORTANT — VOICE MODE: When Pastor activates voice/teach mode, Lance adjusts his responses to sound natural when spoken aloud. No bullet points, no markdown, no asterisks. Full flowing sentences. Lance speaks the way a sharp friend teaches — clear, unhurried, and human.

━━━ LANCE'S SEVEN LANES ━━━

CHURCH & MINISTRY
Sermon prep: KJV only. Greek and Hebrew word studies with Strong's numbers, transliterations, definitions. Christocentric outlines — depth, cultural/historical background, Christ at the center. Biblical history and cultural customs: ancient Near East, Second Temple Judaism, Greco-Roman world, honor/shame culture, daily life. Cross-references. Always teach — do not just inform.
Church communications: bulletins, announcements, emails, letters. Pastoral voice.
Member care: follow-up emails, pastoral visit planning, attendance flagging.
Property: outreach letters, Bay Area acquisition strategy (lease-to-own, faith-based lending, municipal surplus, shared-use).
Admin: calendar, scheduling, event planning.

COLLEGE TEACHING — Golden State Baptist College
Courses: Parables of Jesus, Youth Ministry.
Materials: exams (fill-in-the-blank; student version and teacher key always separate), study guides, lecture notes. Output: Word document format.

PERSONAL & FAMILY
Life admin, scheduling, thinking partner, home life, cooking, logistics. Recreation: D&D (Isofar), Everweave RPG, basketball.

BOOK & WRITING
"Called to the Young" — 18-chapter youth ministry textbook, full outline complete, now drafting. Voice: pastoral depth, professorial clarity, practitioner credibility.

LEADERSHIP
Strategy, vision, decision support, honest pushback. Lance tells Pastor when he is wrong. Always respectfully. Never softly.

APP DEVELOPMENT
VBC church app (Supabase, OpenAI, stalled on RLS) and RPG app (turn-based, AI narrative, paywalls). Stack: React, React Native, Supabase, OpenAI, Anthropic, Vercel.

DUNGEON MASTER — WORLD OF ISOFAR
DM for Pastor's D&D campaign. Characters: Lucan Greyfall (Echo Knight/Rogue — Batman archetype), Kharos, Ezrikk, Sylas. Immersive prose, distinct NPCs, real consequences, D&D 5e rules mastery.

THEOLOGICAL STANDARDS: Always KJV. Baptist, Provisionist. Pre-trib pre-wrath, not rigidly dispensational. Christ central in all teaching.

━━━ MEMORY PROTOCOL ━━━
After each response, if something genuinely worth remembering surfaced, flag it silently at the very end using this exact format:
[MEMORY: category | fact | confidence 1-5]
Categories: ministry, teaching, personal, book, leadership, appdev, dnd, general
Only flag memory when it genuinely matters. The goal is to know Pastor, not collect data.${mem}${ses}`;
}

const LANES = [
  { id:"all",        label:"All Lanes",        icon:"◈" },
  { id:"ministry",  label:"Church & Ministry", icon:"⛪" },
  { id:"teaching",  label:"College Teaching",  icon:"📚" },
  { id:"personal",  label:"Personal & Family", icon:"🏠" },
  { id:"book",      label:"Book & Writing",    icon:"✍️" },
  { id:"leadership",label:"Leadership",        icon:"🧭" },
  { id:"appdev",    label:"App Development",   icon:"⌨️" },
  { id:"dnd",       label:"Dungeon Master",    icon:"🎲" },
];

const QUICK_PROMPTS = [
  { lane:"ministry",  label:"Sermon Outline",   prompt:"I need a sermon outline. Ask me for the passage." },
  { lane:"ministry",  label:"Word Study",        prompt:"Run a Greek or Hebrew word study. Ask me for the passage and word." },
  { lane:"ministry",  label:"History & Customs", prompt:"Give me the biblical history and cultural customs behind a passage. Ask me which text." },
  { lane:"ministry",  label:"Draft Bulletin",    prompt:"Help me draft this week's church bulletin. Ask me for the details." },
  { lane:"ministry",  label:"Follow-Up Email",   prompt:"I need to follow up with a member. Ask me who and why." },
  { lane:"ministry",  label:"Cross-References",  prompt:"Find cross-references for a passage. Ask me for the text and theme." },
  { lane:"teaching",  label:"Build Exam",        prompt:"I need to build a midterm or final exam. Ask me which course and format." },
  { lane:"teaching",  label:"Study Guide",       prompt:"Build a study guide. Ask me which course and unit." },
  { lane:"teaching",  label:"Grade Feedback",    prompt:"Help me write student feedback. Ask me for the assignment details." },
  { lane:"teaching",  label:"Lecture Notes",     prompt:"Help me build lecture notes. Ask me which course and topic." },
  { lane:"personal",  label:"Think It Through",  prompt:"I need to work through something personal. Let's talk." },
  { lane:"personal",  label:"Plan My Week",      prompt:"Help me plan my week. Ask me what's on my plate." },
  { lane:"book",      label:"Draft Chapter",     prompt:"Let's work on Called to the Young. Ask me which chapter." },
  { lane:"book",      label:"Structure Check",   prompt:"Review my writing structure and tell me honestly what's working and what is not." },
  { lane:"book",      label:"Voice Check",       prompt:"Read what I'm writing and tell me if the voice is landing right." },
  { lane:"leadership",label:"Strategy Session",  prompt:"I need to think through a leadership decision. Let's talk it through." },
  { lane:"leadership",label:"Push Back On Me",   prompt:"Stress-test an idea of mine. Find the holes." },
  { lane:"leadership",label:"Vision Work",       prompt:"Let's work on vision. Ask me where I want to take things." },
  { lane:"appdev",    label:"Church App",        prompt:"Let's work on the Victory Baptist Church app. Ask me what we're tackling." },
  { lane:"appdev",    label:"Fix Supabase RLS",  prompt:"Walk me through fixing the Supabase admin permissions stall step by step." },
  { lane:"appdev",    label:"RPG App",           prompt:"Let's work on the RPG app. Ask me what we're building today." },
  { lane:"appdev",    label:"Build a Feature",   prompt:"I need to build a feature or screen. Ask me which app and what it needs to do." },
  { lane:"appdev",    label:"Debug Code",        prompt:"I have a bug. Ask me to paste the code and describe what's broken." },
  { lane:"appdev",    label:"Design Database",   prompt:"Help me design or update a database schema." },
  { lane:"dnd",       label:"Continue Campaign", prompt:"Let's continue the Isofar campaign. Set the scene from where we left off." },
  { lane:"dnd",       label:"New Session",       prompt:"Start a new D&D session in Isofar. Open with atmosphere and give me a hook." },
  { lane:"dnd",       label:"Random Encounter",  prompt:"Generate a random encounter for the party in Isofar. Make it interesting." },
  { lane:"dnd",       label:"Create an NPC",     prompt:"Create a detailed NPC for Isofar — name, appearance, voice, motivation, secret." },
  { lane:"dnd",       label:"Lucan's Arc",       prompt:"Where is Lucan Greyfall's story arc right now and what threads should I pull?" },
  { lane:"dnd",       label:"Rules Check",       prompt:"I have a D&D 5e rules question. Ask me what the situation is." },
];

async function callClaude(messages, facts, sessions) {
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type": "application/json",
      "x-api-key": process.env.REACT_APP_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:buildSystem(facts,sessions),messages}),
  });
  const d = await res.json();
  if(d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text||"";
}

function LanceLogo({size=30}){
  const u=`lg${size}`;
  return(
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2979ff"/><stop offset="100%" stopColor="#0d47a1"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#82b1ff"/><stop offset="100%" stopColor="#2979ff"/>
        </linearGradient>
      </defs>
      <path d="M18 2L4 7.5V18C4 25.5 10.5 31.5 18 34C25.5 31.5 32 25.5 32 18V7.5L18 2Z" fill={`url(#${u}a)`}/>
      <path d="M18 5L7 9.8V18C7 24 12 29.2 18 31.5C24 29.2 29 24 29 18V9.8L18 5Z" fill={`url(#${u}b)`} opacity="0.22"/>
      <line x1="24" y1="9" x2="10" y2="27" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <polygon points="24,9 21,10.5 22.5,13" fill="white" opacity="0.95"/>
      <line x1="13" y1="22" x2="19" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
    </svg>
  );
}

function SpeakerIcon({active,spinning}){
  if(spinning) return(
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 7.5 7.5" to="360 7.5 7.5" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
  if(active) return(
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="2" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.6"><animate attributeName="height" values="5;9;5" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y" values="5;3;5" dur="0.8s" repeatCount="indefinite"/></rect>
      <rect x="6" y="3" width="2" height="9" rx="1" fill="currentColor"><animate attributeName="height" values="9;4;9" dur="0.7s" repeatCount="indefinite"/><animate attributeName="y" values="3;5.5;3" dur="0.7s" repeatCount="indefinite"/></rect>
      <rect x="10" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.6"><animate attributeName="height" values="5;8;5" dur="0.9s" repeatCount="indefinite"/><animate attributeName="y" values="5;3.5;5" dur="0.9s" repeatCount="indefinite"/></rect>
    </svg>
  );
  return(
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 5h2.5L8 2v11L4.5 10H2a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
      <path d="M10 4.5a4 4 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 2.5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

function StopIcon(){
  return(
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="currentColor"/>
    </svg>
  );
}

function ChevronDown(){
  return(
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const SESSION_ID = crypto.randomUUID();

export default function App(){
  const [messages,setMessages]         = useState([]);
  const [input,setInput]               = useState("");
  const [loading,setLoading]           = useState(false);
  const [activeLane,setActiveLane]     = useState("all");
  const [dropOpen,setDropOpen]         = useState(false);
  const [laneSelected,setLaneSelected] = useState(false);
  const [memoryFacts,setMemoryFacts]   = useState([]);
  const [recentSessions,setRecentSessions] = useState([]);
  const [teachMode,setTeachMode]       = useState(false);
  const [speakingIdx,setSpeakingIdx]   = useState(null);
  const [loadingIdx,setLoadingIdx]     = useState(null);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const dropRef    = useRef(null);
  const msgCount   = useRef(0);
  const audioRef   = useRef(null);

  useEffect(()=>{
    (async()=>{
      const [f,s] = await Promise.all([fetchMemory().catch(()=>[]),fetchRecentSessions().catch(()=>[])]);
      setMemoryFacts(Array.isArray(f)?f:[]);
      setRecentSessions(Array.isArray(s)?s:[]);
    })();
  },[]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  useEffect(()=>{
    const h=(e)=>{ if(dropRef.current&&!dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  const stopSpeaking = () => {
    if(audioRef.current){ audioRef.current.pause(); audioRef.current=null; }
    setSpeakingIdx(null);
    setLoadingIdx(null);
  };

  const speakMessage = async (text, idx) => {
    stopSpeaking();
    setLoadingIdx(idx);
    const audio = await speak(
      text,
      ()=>{ setLoadingIdx(null); setSpeakingIdx(idx); },
      ()=>{ setSpeakingIdx(null); audioRef.current=null; },
      ()=>{ setLoadingIdx(null); setSpeakingIdx(null); }
    );
    audioRef.current = audio;
  };

  const send = async (text) => {
    const t=(text||input).trim();
    if(!t||loading) return;
    setInput("");
    if(inputRef.current) inputRef.current.style.height="auto";
    stopSpeaking();

    const next=[...messages,{role:"user",content:t}];
    setMessages(next);
    setLoading(true);
    saveMessage(SESSION_ID,"user",t,activeLane).catch(()=>{});

    try{
      const raw   = await callClaude(next,memoryFacts,recentSessions);
      const tags  = parseMemoryTags(raw);
      const clean = stripMemoryTags(raw);
      const idx   = next.length;

      setMessages([...next,{role:"assistant",content:clean}]);
      msgCount.current+=2;

      saveMessage(SESSION_ID,"assistant",clean,activeLane).catch(()=>{});
      for(const tag of tags) saveMemoryFact(tag.category,tag.fact,tag.confidence,SESSION_ID).catch(()=>{});
      if(tags.length>0) fetchMemory().then(f=>{if(Array.isArray(f))setMemoryFacts(f);}).catch(()=>{});
      if(msgCount.current%4===0){
        const summary=`${t.slice(0,90)}${t.length>90?"…":""}`;
        saveSession(SESSION_ID,activeLane,summary,msgCount.current).catch(()=>{});
      }

      if(teachMode) speakMessage(clean, idx);

    } catch(e){
      setMessages([...next,{role:"assistant",content:`Something went wrong: ${e.message}`}]);
    }
    setLoading(false);
  };

  const selectLane=(id)=>{ setActiveLane(id); setDropOpen(false); setLaneSelected(id!=="all"); };
  const clearChat=()=>{ stopSpeaking(); setMessages([]); setLaneSelected(false); setActiveLane("all"); msgCount.current=0; };

  const currentLane = LANES.find(l=>l.id===activeLane);
  const filtered    = activeLane==="all"?[]:QUICK_PROMPTS.filter(p=>p.lane===activeLane);
  const isEmpty     = messages.length===0;
  const showPrompts = isEmpty&&laneSelected&&filtered.length>0;

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
        :root{--text-primary:#1a1a2e;--text-secondary:#4a4a6a;--accent:#2979ff;}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{height:100%;}
        body{font-family:'DM Sans',-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes dropIn{from{opacity:0;transform:translateY(-8px) scale(0.96);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes dot{0%,80%,100%{transform:scale(0.55);opacity:0.3;}40%{transform:scale(1);opacity:1;}}
        @keyframes pulse-glow{0%,100%{filter:drop-shadow(0 0 10px rgba(82,177,255,0.4));}50%{filter:drop-shadow(0 0 26px rgba(82,177,255,0.85));}}
        .quick-card{background:rgba(255,255,255,0.13);border:1px solid rgba(255,255,255,0.22);border-radius:12px;padding:13px 15px;cursor:pointer;transition:all 0.16s ease;text-align:left;font-family:inherit;animation:fadeUp 0.28s ease both;backdrop-filter:blur(10px);}
        .quick-card:hover{background:rgba(255,255,255,0.22);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.2);}
        .lane-chip{padding:5px 13px;border-radius:20px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);font-size:12px;cursor:pointer;font-family:inherit;color:rgba(255,255,255,0.85);font-weight:400;transition:all 0.15s ease;display:flex;align-items:center;gap:5px;backdrop-filter:blur(8px);}
        .lane-chip:hover{background:rgba(255,255,255,0.24);color:#fff;border-color:rgba(255,255,255,0.4);}
        .drop-item{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;font-size:14px;font-weight:400;color:var(--text-primary);transition:background 0.12s ease;font-family:inherit;border:none;background:none;width:100%;text-align:left;border-radius:8px;}
        .drop-item:hover{background:rgba(41,121,255,0.08);}
        .drop-item.selected{font-weight:600;color:var(--accent);}
        .speak-btn{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:6px;transition:all 0.14s ease;opacity:0.55;}
        .speak-btn:hover{opacity:1;background:rgba(41,121,255,0.1);}
        .speak-btn.active{opacity:1;color:var(--accent);}
        .teach-toggle{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid;transition:all 0.18s ease;letter-spacing:0.02em;}
        .send-btn{transition:all 0.14s ease;}
        .send-btn:hover:not(:disabled){transform:scale(1.07);}
        .send-btn:active:not(:disabled){transform:scale(0.95);}
        ::-webkit-scrollbar{width:0;}
        textarea:focus{outline:none;}
      `}</style>

      <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(145deg,#1a237e 0%,#283593 40%,#1565c0 100%)"}}>

        <div style={{height:"54px",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.10)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <LanceLogo size={30}/>
            <div>
              <div style={{fontSize:"15px",fontWeight:"600",color:"#fff",letterSpacing:"-0.02em",lineHeight:1.1}}>Lance</div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.45)"}}>Pastor Devon's Agent</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <button className="teach-toggle" onClick={()=>{ setTeachMode(t=>!t); if(teachMode) stopSpeaking(); }} style={{background:teachMode?"rgba(41,121,255,0.25)":"rgba(255,255,255,0.1)",borderColor:teachMode?"rgba(41,121,255,0.6)":"rgba(255,255,255,0.2)",color:teachMode?"#82b1ff":"rgba(255,255,255,0.65)"}}>
              {teachMode?"🔊 Teaching":"🔇 Silent"}
            </button>
            {speakingIdx!==null&&(
              <button onClick={stopSpeaking} style={{display:"flex",alignItems:"center",gap:"5px",padding:"5px 10px",borderRadius:"8px",background:"rgba(255,80,80,0.2)",border:"1px solid rgba(255,80,80,0.4)",color:"rgba(255,160,160,0.9)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>
                <StopIcon/> Stop
              </button>
            )}
            <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#69f0ae"}}/>
              <span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Online</span>
            </div>
            {messages.length>0&&(
              <button onClick={clearChat} style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"rgba(255,255,255,0.7)",fontFamily:"inherit",padding:"4px 10px"}}>Clear</button>
            )}
          </div>
        </div>

        <div style={{padding:"8px 20px",background:"rgba(0,0,0,0.12)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,0.08)",flexShrink:0,position:"relative",zIndex:50}}>
          <div ref={dropRef} style={{position:"relative",display:"inline-block"}}>
            <button onClick={()=>setDropOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:"7px",padding:"6px 12px",borderRadius:"10px",background:"rgba(255,255,255,0.14)",border:"1px solid rgba(255,255,255,0.25)",cursor:"pointer",fontFamily:"inherit",fontSize:"13px",fontWeight:"500",color:"#fff",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
              <span style={{fontSize:"14px"}}>{currentLane.icon}</span>
              <span>{currentLane.label}</span>
              <span style={{color:"rgba(255,255,255,0.55)",display:"flex",transform:dropOpen?"rotate(180deg)":"none",transition:"transform 0.18s ease"}}><ChevronDown/></span>
            </button>
            {dropOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderRadius:"14px",border:"1px solid rgba(0,0,0,0.08)",boxShadow:"0 12px 40px rgba(0,0,0,0.25)",padding:"6px",minWidth:"220px",animation:"dropIn 0.16s ease both",zIndex:100}}>
                {LANES.map(l=>(
                  <button key={l.id} className={`drop-item${activeLane===l.id?" selected":""}`} onClick={()=>selectLane(l.id)}>
                    <span style={{fontSize:"15px",width:"22px",textAlign:"center"}}>{l.icon}</span>
                    <span>{l.label}</span>
                    {activeLane===l.id&&<span style={{marginLeft:"auto",color:"var(--accent)"}}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"20px 20px 8px",display:"flex",flexDirection:"column",gap:"4px"}}>

          {isEmpty&&!laneSelected&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeUp 0.35s ease both"}}>
              <div style={{textAlign:"center",maxWidth:"340px"}}>
                <div style={{display:"inline-block",marginBottom:"20px",animation:"pulse-glow 3s ease-in-out infinite"}}>
                  <LanceLogo size={76}/>
                </div>
                <div style={{fontSize:"28px",fontWeight:"600",color:"#ffffff",letterSpacing:"-0.03em",marginBottom:"8px",textShadow:"0 2px 16px rgba(0,0,0,0.4)"}}>
                  Good to see you, Pastor.
                </div>
                <div style={{fontSize:"15px",color:"rgba(255,255,255,0.68)",fontWeight:"300",lineHeight:1.55,marginBottom:"28px"}}>
                  Type anything, or pick a lane.
                </div>
                <div style={{display:"flex",gap:"7px",flexWrap:"wrap",justifyContent:"center"}}>
                  {LANES.filter(l=>l.id!=="all").map(l=>(
                    <button key={l.id} className="lane-chip" onClick={()=>selectLane(l.id)}>
                      <span>{l.icon}</span>{l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showPrompts&&(
            <div style={{animation:"fadeUp 0.26s ease both"}}>
              <div style={{fontSize:"11px",fontWeight:"600",color:"rgba(255,255,255,0.45)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:"10px"}}>
                {currentLane.icon}  {currentLane.label}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:"8px"}}>
                {filtered.map((p,i)=>(
                  <button key={i} className="quick-card" style={{animationDelay:`${i*0.04}s`}} onClick={()=>send(p.prompt)}>
                    <div style={{fontSize:"13px",fontWeight:"500",color:"#fff",letterSpacing:"-0.01em"}}>{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s ease both",marginBottom:"4px"}}>
              {m.role==="assistant"&&<div style={{flexShrink:0,marginRight:"8px",alignSelf:"flex-end"}}><LanceLogo size={24}/></div>}
              <div style={{maxWidth:"72%",display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:"4px"}}>
                <div style={{padding:"11px 15px",borderRadius:m.role==="user"?"18px 18px 5px 18px":"5px 18px 18px 18px",background:m.role==="user"?"linear-gradient(135deg,#2979ff,#1565c0)":"rgba(255,255,255,0.95)",color:m.role==="user"?"#fff":"var(--text-primary)",fontSize:"14px",lineHeight:"1.62",whiteSpace:"pre-wrap",fontWeight:"300",boxShadow:m.role==="user"?"0 4px 16px rgba(0,0,0,0.25)":"0 4px 20px rgba(0,0,0,0.15)",border:m.role==="user"?"none":"1px solid rgba(255,255,255,0.5)",letterSpacing:"-0.005em"}}>{m.content}</div>
                {m.role==="assistant"&&(
                  <button className={`speak-btn${speakingIdx===i?" active":""}`} onClick={()=>{ speakingIdx===i?stopSpeaking():speakMessage(m.content,i); }} style={{color:speakingIdx===i?"#82b1ff":"rgba(255,255,255,0.6)",marginLeft:"4px"}} title={speakingIdx===i?"Stop":"Hear Lance"}>
                    <SpeakerIcon active={speakingIdx===i} spinning={loadingIdx===i}/>
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading&&(
            <div style={{display:"flex",alignItems:"flex-end",gap:"8px",animation:"fadeUp 0.18s ease both"}}>
              <div style={{flexShrink:0}}><LanceLogo size={24}/></div>
              <div style={{padding:"11px 16px",borderRadius:"5px 18px 18px 18px",background:"rgba(255,255,255,0.95)",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",display:"flex",gap:"5px",alignItems:"center"}}>
                {[0,1,2].map(i=>(<div key={i} style={{width:"7px",height:"7px",borderRadius:"50%",background:"#2979ff",animation:`dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>))}
              </div>
            </div>
          )}

          <div ref={bottomRef}/>
        </div>

        <div style={{padding:"10px 20px 18px",background:"rgba(0,0,0,0.18)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:"10px",background:"rgba(255,255,255,0.95)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.5)",padding:"9px 10px 9px 16px",boxShadow:"0 4px 24px rgba(0,0,0,0.2)"}}>
            <textarea ref={inputRef} value={input} onChange={e=>{ setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }} placeholder="Message Lance…" rows={1} style={{flex:1,border:"none",background:"transparent",fontSize:"15px",color:"var(--text-primary)",resize:"none",lineHeight:"1.5",maxHeight:"120px",overflowY:"auto",fontWeight:"300",letterSpacing:"-0.01em",fontFamily:"inherit"}}/>
            <button className="send-btn" onClick={()=>send()} disabled={!input.trim()||loading} style={{width:"33px",height:"33px",borderRadius:"50%",background:input.trim()&&!loading?"linear-gradient(135deg,#2979ff,#1565c0)":"rgba(0,0,0,0.08)",border:"none",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:input.trim()&&!loading?"#fff":"#aaa",fontSize:"15px",boxShadow:input.trim()&&!loading?"0 3px 10px rgba(41,121,255,0.45)":"none"}}>↑</button>
          </div>
        </div>
      </div>
    </>
  );
}