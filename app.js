(function(){
"use strict";

const CFG = window.FAMILY_APP_CONFIG || {};
const API = (CFG.supabaseUrl || "").replace(/\/$/,"") + "/rest/v1/rpc/";
const SESSION_KEY = "family_schedule_shared_session_v2";
const LAST_TAB_KEY = "family_schedule_last_tab_v2";

const profiles = [
  {slug:"mama", name:"Мама"},
  {slug:"papa", name:"Папа"},
  {slug:"nikita", name:"Никита"},
  {slug:"vlada", name:"Влада"}
];

let session = loadSession();
let activeSlug = loadLastTab();
let schedule = [];
let draft = [];
let editPin = "";

function configured(){
  return CFG.supabaseUrl && CFG.anonKey &&
    !CFG.supabaseUrl.includes("PASTE_") &&
    !CFG.anonKey.includes("PASTE_");
}
function headers(){
  return {
    "Content-Type":"application/json",
    "apikey":CFG.anonKey,
    "Authorization":"Bearer " + CFG.anonKey
  };
}
async function rpc(name, body){
  if(!configured()) throw new Error("BACKEND_NOT_CONFIGURED");
  const r = await fetch(API + name, {
    method:"POST",
    headers:headers(),
    body:JSON.stringify(body || {})
  });
  const txt = await r.text();
  let data = null;
  try{ data = txt ? JSON.parse(txt) : null; }catch(e){ data = txt; }
  if(!r.ok) throw new Error((data && data.message) || txt || ("HTTP "+r.status));
  return data;
}
function loadSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function saveSession(s){
  session = s;
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }catch(e){}
}
function clearSession(){
  session = null;
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
}
function loadLastTab(){
  try{
    const s = localStorage.getItem(LAST_TAB_KEY);
    if(profiles.some(p=>p.slug===s)) return s;
  }catch(e){}
  return "mama";
}
function saveLastTab(slug){
  activeSlug = slug;
  try{ localStorage.setItem(LAST_TAB_KEY, slug); }catch(e){}
}
function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function mins(t){
  const [h,m]=t.split(":").map(Number);
  return h*60+m;
}
function hhmm(m){
  const h=Math.floor(m/60), mm=m%60;
  return String(h).padStart(2,"0")+":"+String(mm).padStart(2,"0");
}
function showLogin(){ document.getElementById("loginOverlay").classList.remove("hidden"); }
function hideLogin(){ document.getElementById("loginOverlay").classList.add("hidden"); }

function renderProfileTabs(){
  const box=document.getElementById("profiles");
  box.innerHTML="";
  profiles.forEach((p,i)=>{
    const b=document.createElement("button");
    b.className="profile-btn"+(p.slug===activeSlug?" active":"");
    b.innerHTML='<div class="avatar">'+(i+1)+'</div><div class="profile-name">'+esc(p.name)+'</div>';
    b.onclick=async()=>{
      if(p.slug===activeSlug) return;
      closeEditor();
      editPin="";
      saveLastTab(p.slug);
      renderProfileTabs();
      await refresh();
    };
    box.appendChild(b);
  });
}

function buildTimeline(items){
  const normalized=(items||[]).map(x=>({
    start:mins(x.start_time.slice(0,5)),
    end:mins(x.end_time.slice(0,5)),
    text:x.title
  })).sort((a,b)=>a.start-b.start);

  const out=[{start:420,end:420,text:"Подъём",type:"marker"}];
  let cur=420;

  for(const x of normalized){
    const s=Math.max(420,x.start), e=Math.min(1320,x.end);
    if(e<=s) continue;
    if(s>cur) out.push({start:cur,end:s,text:"Свободное время",type:"free"});
    if(e>cur){
      out.push({start:Math.max(cur,s),end:e,text:x.text,type:"busy"});
      cur=Math.max(cur,e);
    }
  }

  if(cur<1320) out.push({start:cur,end:1320,text:"Свободное время",type:"free"});
  out.push({start:1320,end:1320,text:"Спать",type:"marker"});
  return out;
}

function renderSchedule(){
  const box=document.getElementById("schedule");
  box.innerHTML="";
  for(const x of buildTimeline(schedule)){
    const d=document.createElement("div");
    d.className="slot "+(x.type==="free"?"free":x.type==="marker"?"sleep":"");
    const time = x.start===x.end ? hhmm(x.start) : hhmm(x.start)+"–"+hhmm(x.end);
    d.innerHTML='<div class="time">'+time+'</div><div class="label">'+esc(x.text)+'</div>';
    box.appendChild(d);
  }
}

function renderHeader(profileName){
  document.getElementById("profileTitle").textContent=profileName || "";
  try{
    document.getElementById("dateText").textContent=
      new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  }catch(e){}
}

async function refresh(){
  if(!session || !session.token) throw new Error("NO_SESSION");
  document.getElementById("schedule").innerHTML='<div class="loading">Загрузка…</div>';
  const res=await rpc("get_family_schedule",{
    p_session_token:session.token,
    p_profile_slug:activeSlug
  });
  schedule=Array.isArray(res.items)?res.items:[];
  hideLogin();
  renderHeader(res.profile_name);
  renderProfileTabs();
  renderSchedule();
}

async function doLogin(){
  const password=document.getElementById("familyPassword").value;
  const err=document.getElementById("loginError");
  err.textContent="";
  if(!password){ err.textContent="Введите пароль."; return; }
  try{
    const res=await rpc("login_family",{p_password:password});
    saveSession({token:res.session_token});
    document.getElementById("familyPassword").value="";
    await refresh();
  }catch(e){
    err.textContent=e.message==="BACKEND_NOT_CONFIGURED"
      ? "База ещё не подключена."
      : "Неверный пароль или нет связи с сервером.";
  }
}

async function openEditor(){
  const pin = window.prompt("Введите PIN-код для правки:");
  if(pin===null) return;
  try{
    const ok=await rpc("verify_family_edit_pin",{
      p_session_token:session.token,
      p_edit_pin:pin
    });
    if(ok!==true){
      alert("Неверный PIN-код.");
      return;
    }
    editPin=pin;
  }catch(e){
    alert("Не удалось проверить PIN-код.");
    return;
  }

  draft=schedule.map(x=>({
    start:x.start_time.slice(0,5),
    end:x.end_time.slice(0,5),
    title:x.title
  }));
  document.getElementById("viewer").classList.add("off");
  document.getElementById("editor").classList.add("on");
  document.getElementById("editBtn").style.display="none";
  renderEditor();
}

function closeEditor(){
  document.getElementById("viewer").classList.remove("off");
  document.getElementById("editor").classList.remove("on");
  document.getElementById("editBtn").style.display="";
  editPin="";
}

function renderEditor(){
  const box=document.getElementById("editRows");
  box.innerHTML="";
  if(!draft.length){
    box.innerHTML='<div class="help">Пока занятий нет. Нажмите «+ Добавить занятие».</div>';
  }
  draft.forEach((x,i)=>{
    const row=document.createElement("div");
    row.className="edit-row";
    row.innerHTML=
      '<input type="time" value="'+esc(x.start)+'" data-i="'+i+'" data-f="start">'+
      '<input type="time" value="'+esc(x.end)+'" data-i="'+i+'" data-f="end">'+
      '<input class="activity" type="text" value="'+esc(x.title)+'" placeholder="Например: школа, работа, тренировка" data-i="'+i+'" data-f="title">'+
      '<button class="x" data-del="'+i+'">×</button>';
    box.appendChild(row);
  });
  box.querySelectorAll("input").forEach(inp=>{
    inp.oninput=()=>{ draft[Number(inp.dataset.i)][inp.dataset.f]=inp.value; };
  });
  box.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick=()=>{ draft.splice(Number(btn.dataset.del),1); renderEditor(); };
  });
}

function validateDraft(){
  for(const x of draft){
    if(!x.start || !x.end || !x.title.trim()) return "Заполните начало, конец и название каждого занятия.";
    if(mins(x.start)<420 || mins(x.end)>1320) return "Занятия можно ставить только с 07:00 до 22:00.";
    if(mins(x.end)<=mins(x.start)) return "Окончание должно быть позже начала.";
  }
  const sorted=[...draft].sort((a,b)=>mins(a.start)-mins(b.start));
  for(let i=1;i<sorted.length;i++){
    if(mins(sorted[i].start)<mins(sorted[i-1].end)) return "Занятия не должны пересекаться.";
  }
  draft=sorted;
  return null;
}

async function saveDraft(){
  const msg=validateDraft();
  if(msg){ alert(msg); return; }
  try{
    await rpc("replace_family_schedule",{
      p_session_token:session.token,
      p_profile_slug:activeSlug,
      p_edit_pin:editPin,
      p_items:draft.map(x=>({start_time:x.start,end_time:x.end,title:x.title.trim()}))
    });
    closeEditor();
    await refresh();
  }catch(e){
    alert("Не удалось сохранить изменения. Проверьте интернет и попробуйте ещё раз.");
  }
}

document.getElementById("loginBtn").onclick=doLogin;
document.getElementById("familyPassword").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
document.getElementById("editBtn").onclick=openEditor;
document.getElementById("cancelBtn").onclick=closeEditor;
document.getElementById("addBtn").onclick=()=>{
  draft.push({start:"07:00",end:"08:00",title:""});
  renderEditor();
};
document.getElementById("saveBtn").onclick=saveDraft;
document.getElementById("logoutBtn").onclick=()=>{
  clearSession(); schedule=[]; closeEditor(); showLogin();
};

(async function init(){
  renderProfileTabs();
  if(session && session.token){
    try{ await refresh(); return; }catch(e){ clearSession(); }
  }
  showLogin();
})();
})();