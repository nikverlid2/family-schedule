(()=>{"use strict";
const C=window.FAMILY_APP_CONFIG||{};
const A=C.supabaseUrl.replace(/\/$/,"")+"/rest/v1/rpc/";
const F=C.supabaseUrl.replace(/\/$/,"")+"/functions/v1/";
const S="family_schedule_shared_session_v3";
const P=[["mama","Мама"],["papa","Папа"],["nikita","Никита"],["vlada","Влада"]];
const D=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const V="BP92_u9wwGgMF84QEg4xeOutgggTLyOXLlUfsbo8ilPEOC07auVmfpM15Yu7EAT6mXWy1xMvVqWiN9sdZRejNoc";

let s=JSON.parse(localStorage.getItem(S)||"null");
let p=localStorage.getItem("fsp")||"mama";
let d=+localStorage.getItem("fsd")||(()=>{let x=new Date().getDay();return x||7})();
let a=[],q=[],pin="",editing=false,dirty=false;

const $=x=>document.getElementById(x);
const H=()=>({"Content-Type":"application/json","apikey":C.anonKey});
const td=()=>{let x=new Date().getDay();return x||7};
const m=x=>{let[h,n]=x.slice(0,5).split(":").map(Number);return h*60+n};
const hm=x=>String(x/60|0).padStart(2,"0")+":"+String(x%60).padStart(2,"0");
const e=x=>String(x).replace(/[&<>"']/g,z=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[z]));

async function rpc(n,b){
  const r=await fetch(A+n,{method:"POST",headers:H(),body:JSON.stringify(b)});
  const x=await r.json();
  if(!r.ok) throw Error(x.message||"error");
  return x;
}

function setEditorMode(on){
  editing=on;
  $("viewer").classList.toggle("off",on);
  $("editor").classList.toggle("on",on);
  $("editBtn").style.display=on?"none":"";
}

function tabs(){
  $("profiles").innerHTML=P.map(x=>`<button class="profile-btn ${x[0]==p?"active":""}" data-p="${x[0]}">${x[1]}</button>`).join("");
  document.querySelectorAll("[data-p]").forEach(x=>x.onclick=async()=>{
    if(editing&&dirty&&!confirm("Есть несохранённые изменения. Переключиться без сохранения?")) return;
    p=x.dataset.p;
    localStorage.setItem("fsp",p);
    tabs();
    await load(editing);
  });

  $("weekdays").innerHTML=D.map((x,i)=>`<button class="day-btn ${i+1==d?"active":""} ${i+1==td()?"today":""}" data-d="${i+1}">${x}</button>`).join("");
  document.querySelectorAll("[data-d]").forEach(x=>x.onclick=async()=>{
    if(iSameDay(x)) return;
    if(editing&&dirty&&!confirm("Есть несохранённые изменения. Переключиться без сохранения?")) return;
    d=+x.dataset.d;
    localStorage.setItem("fsd",d);
    tabs();
    await load(editing);
  });
}
function iSameDay(btn){ return +btn.dataset.d===d; }

async function load(keepEditor=false){
  const r=await rpc("get_family_schedule",{p_session_token:s.token,p_profile_slug:p,p_weekday:d});
  a=r.items||[];
  $("profileTitle").textContent=r.profile_name+" · "+D[d-1];
  $("dateText").textContent=d==td()?"Сегодня":"Еженедельное расписание";
  $("loginOverlay").classList.add("hidden");
  view();

  if(keepEditor&&pin){
    q=a.map(y=>({
      start:y.start_time.slice(0,5),
      end:y.end_time.slice(0,5),
      title:y.title,
      color:y.color||"blue",
      temp:!!y.is_temporary,
      repeats:y.repeat_count||1
    }));
    dirty=false;
    setEditorMode(true);
    red();
  }
}

function view(){
  let o=[{s:420,e:420,t:"Подъём",c:"sleep"}],cur=420;
  for(const x of [...a].sort((x,y)=>m(x.start_time)-m(y.start_time))){
    const st=m(x.start_time),en=m(x.end_time);
    if(st>cur) o.push({s:cur,e:st,t:"Свободное время",c:"free"});
    o.push({s:st,e:en,t:x.title,c:x.color||"blue",tmp:x.is_temporary});
    cur=en;
  }
  if(cur<1320) o.push({s:cur,e:1320,t:"Свободное время",c:"free"});
  o.push({s:1320,e:1320,t:"Спать",c:"sleep"});
  $("schedule").innerHTML=o.map(x=>`<div class="slot ${x.c}"><div class="time">${x.s==x.e?hm(x.s):hm(x.s)+"–"+hm(x.e)}</div><div class="label">${e(x.t)}${x.tmp?'<span class="temporary-badge">временно</span>':""}</div></div>`).join("");
}

async function login(){
  try{
    const r=await rpc("login_family",{p_password:$("familyPassword").value});
    s={token:r.session_token};
    localStorage.setItem(S,JSON.stringify(s));
    $("loginError").textContent="";
    await load(false);
  }catch{
    $("loginError").textContent="Неверный пароль или нет связи.";
  }
}

async function edit(){
  if(editing) return;
  const x=prompt("Введите PIN-код для правки:");
  if(x===null) return;
  try{
    if(await rpc("verify_family_edit_pin",{p_session_token:s.token,p_edit_pin:x})!==true) throw 0;
    pin=x;
    q=a.map(y=>({
      start:y.start_time.slice(0,5),
      end:y.end_time.slice(0,5),
      title:y.title,
      color:y.color||"blue",
      temp:!!y.is_temporary,
      repeats:y.repeat_count||1
    }));
    dirty=false;
    setEditorMode(true);
    red();
  }catch{
    alert("Неверный PIN.");
  }
}

function close(){
  setEditorMode(false);
  pin="";
  dirty=false;
  q=[];
}

function markDirty(){dirty=true}

function red(){
  $("editRows").innerHTML=q.map((x,i)=>`<div class="edit-row">
    <input type="time" data-i="${i}" data-f="start" value="${x.start}">
    <input type="time" data-i="${i}" data-f="end" value="${x.end}">
    <div class="activity-wrap">
      <input data-i="${i}" data-f="title" value="${e(x.title)}" placeholder="Название">
      <label class="temp-line">
        <input type="checkbox" data-t="${i}" ${x.temp?"checked":""}> Временно
        ${x.temp?`Повторов: <select class="repeat-select" data-r="${i}">${Array.from({length:12},(_,j)=>`<option ${x.repeats==j+1?"selected":""}>${j+1}</option>`).join("")}</select>`:""}
      </label>
    </div>
    <div class="color-picker">${["red","orange","blue"].map(c=>`<button class="swatch ${c} ${x.color==c?"selected":""}" data-c="${c}" data-ci="${i}"></button>`).join("")}</div>
    <button class="x" data-x="${i}">×</button>
  </div>`).join("");

  document.querySelectorAll("[data-f]").forEach(x=>x.oninput=()=>{q[+x.dataset.i][x.dataset.f]=x.value;markDirty()});
  document.querySelectorAll("[data-t]").forEach(x=>x.onchange=()=>{q[+x.dataset.t].temp=x.checked;markDirty();red()});
  document.querySelectorAll("[data-r]").forEach(x=>x.onchange=()=>{q[+x.dataset.r].repeats=+x.value;markDirty()});
  document.querySelectorAll("[data-c]").forEach(x=>x.onclick=()=>{q[+x.dataset.ci].color=x.dataset.c;markDirty();red()});
  document.querySelectorAll("[data-x]").forEach(x=>x.onclick=()=>{q.splice(+x.dataset.x,1);markDirty();red()});
}

function date(){
  let x=new Date(),z=(d-td()+7)%7;
  x.setDate(x.getDate()+z);
  return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
}

async function save(){
  q.sort((x,y)=>m(x.start)-m(y.start));
  for(let i=0;i<q.length;i++){
    const x=q[i];
    if(!x.title.trim()||m(x.start)<420||m(x.end)>1320||m(x.end)<=m(x.start)||(i&&m(x.start)<m(q[i-1].end))){
      alert("Проверь время, название и пересечения.");
      return;
    }
  }
  try{
    await rpc("replace_family_schedule",{
      p_session_token:s.token,
      p_profile_slug:p,
      p_weekday:d,
      p_edit_pin:pin,
      p_items:q.map(x=>({
        start_time:x.start,
        end_time:x.end,
        title:x.title.trim(),
        color:x.color,
        is_temporary:x.temp,
        repeat_count:x.temp?x.repeats:1,
        temporary_start_date:x.temp?date():null
      }))
    });
    dirty=false;
    await load(true);
    fetch(F+"notify-family-schedule",{method:"POST",headers:H(),body:JSON.stringify({session_token:s.token,profile_slug:p})}).catch(()=>{});
    alert("Сохранено. Режим правки остаётся включён — можно переключить день.");
  }catch{
    alert("Не удалось сохранить.");
  }
}

$("loginBtn").onclick=login;
$("familyPassword").onkeydown=x=>{if(x.key=="Enter")login()};
$("editBtn").onclick=edit;
$("cancelBtn").onclick=close;
$("saveBtn").onclick=save;
$("addBtn").onclick=()=>{q.push({start:"07:00",end:"08:00",title:"",color:"blue",temp:false,repeats:1});markDirty();red()};
$("logoutBtn").onclick=()=>{localStorage.removeItem(S);s=null;close();$("loginOverlay").classList.remove("hidden")};
$("notifyBtn").onclick=async()=>{
  try{
    const r=await navigator.serviceWorker.register("./service-worker.js?v=4");
    const perm=await Notification.requestPermission();
    if(perm!="granted") return;
    const key=Uint8Array.from(atob((V+"=".repeat((4-V.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
    const sub=await r.pushManager.getSubscription()||await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    const j=sub.toJSON();
    await rpc("register_family_push",{p_session_token:s.token,p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_user_agent:navigator.userAgent});
    alert("Уведомления включены.");
  }catch{
    alert("На iPhone добавьте сайт на экран «Домой» и откройте его оттуда.");
  }
};

tabs();
if(s?.token) load(false).catch(()=>{$("loginOverlay").classList.remove("hidden")});
})();