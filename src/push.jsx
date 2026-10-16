import React,{useState,useEffect}from"react";
import{SUPABASE_URL,SB_HEADERS}from"./config";

const PUSH_URL=`${SUPABASE_URL}/functions/v1/lance-push`;
const VAPID_PUBLIC="BIhoMEwSnYS5xipFER1Az1nDrJEfbS-ZELFbm2jczBYFKbPnjs5tVZo8TX8az2iCYKYbpmbdQcBw2kOdCBb42uU";

function keyBytes(b64){
  const pad="=".repeat((4-b64.length%4)%4);
  const raw=atob((b64+pad).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
const isStandalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
const supported=()=>"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window;

async function post(path,body){
  const r=await fetch(PUSH_URL+path,{method:"POST",headers:{...SB_HEADERS,"Content-Type":"application/json"},body:JSON.stringify(body||{})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||("Failed "+r.status));
  return j;
}

export function registerWorker(){
  if(!("serviceWorker"in navigator))return;
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

export default function NotifyCard(){
  const[state,setState]=useState("checking");// checking | unsupported | install | off | on | denied
  const[msg,setMsg]=useState("");
  const[busy,setBusy]=useState(false);

  useEffect(()=>{
    (async()=>{
      if(!supported()){setState(isStandalone()?"unsupported":"install");return}
      if(Notification.permission==="denied"){setState("denied");return}
      try{
        const reg=await navigator.serviceWorker.ready;
        const sub=await reg.pushManager.getSubscription();
        setState(sub&&Notification.permission==="granted"?"on":"off");
      }catch{setState("off")}
    })();
  },[]);

  const turnOn=async()=>{
    setBusy(true);setMsg("");
    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setState(perm==="denied"?"denied":"off");setBusy(false);return}
      const reg=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(VAPID_PUBLIC)});
      await post("/subscribe",{subscription:sub.toJSON(),device:navigator.userAgent});
      await post("/test");
      setState("on");setMsg("Done. A test message is on its way.");
    }catch(e){setMsg("Could not turn on: "+e.message)}
    setBusy(false);
  };
  const test=async()=>{setBusy(true);setMsg("");try{const r=await post("/test");setMsg(r.sent>0?"Sent.":"No device answered. Turn it off and on again.")}catch(e){setMsg(e.message)}setBusy(false)};
  const turnOff=async()=>{
    setBusy(true);
    try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe()}catch{}
    setState("off");setMsg("");setBusy(false);
  };

  const box={background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"18px",padding:"16px",display:"flex",flexDirection:"column",gap:"10px"};
  const btn={minHeight:"44px",padding:"0 16px",borderRadius:"22px",border:"1px solid var(--gold)",background:"rgba(212,175,90,0.14)",color:"var(--gold-hi)",fontSize:"15px",cursor:"pointer",alignSelf:"flex-start"};
  const ghost={...btn,border:"1px solid var(--line)",background:"transparent",color:"var(--text-hi)"};
  const small={fontSize:"14px",lineHeight:1.4,color:"var(--text-mid)"};
  if(state==="checking")return null;
  return(<div style={box}>
    <span className="eyebrow2">Notifications</span>
    {state==="install"&&(<span style={small}>To get alerts on your iPhone, open Lance from the icon on your Home Screen. If you have not added it yet, tap Share in Safari, then Add to Home Screen.</span>)}
    {state==="unsupported"&&(<span style={small}>This device does not support alerts from Lance.</span>)}
    {state==="denied"&&(<span style={small}>Alerts are blocked. Open Settings, then Notifications, then Lance, and switch them on.</span>)}
    {state==="off"&&(<><span style={small}>Get your morning briefing and Diane's drafts as alerts on this phone.</span><button style={btn} disabled={busy} onClick={turnOn}>{busy?"Working...":"Turn on alerts"}</button></>)}
    {state==="on"&&(<><span style={{...small,color:"var(--text-hi)"}}>Alerts are on for this device.</span><div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}><button style={ghost} disabled={busy} onClick={test}>Send a test</button><button style={ghost} disabled={busy} onClick={turnOff}>Turn off</button></div></>)}
    {msg&&<span style={{...small,color:"var(--gold)"}}>{msg}</span>}
  </div>);
}
