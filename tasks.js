(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const people = [['papa','Папа'],['mama','Мама'],['nikita','Никита'],['vlada','Влада']];
 const plans = {
  'gogol-floor-1': ['Квартира (Гоголя)','1 этаж'],
  'gogol-floor-2': ['Квартира (Гоголя)','2 этаж'],
  'nagaevo-house': ['Дача (Нагаево)','Дом'],
  'nagaevo-bath': ['Дача (Нагаево)','Баня']
 };
 const groups=[['gogol','Квартира (Гоголя)',['gogol-floor-1','gogol-floor-2']],['nagaevo','Дача (Нагаево)',['nagaevo-house','nagaevo-bath']]];
 let selected={gogol:'gogol-floor-1',nagaevo:'nagaevo-house'}, tasks=[], images={}, loading={}, sessionVersion=0, pin='', busy=false, current=null, placing=false, point={x:.5,y:.5};
 let showDone=false, showMarkers=true, scorePeriod='all', loaded=false, readSequence=0, pinResolve=null;
 const root=$('tasksView');
 const token=()=>{try{return JSON.parse(localStorage.getItem('family_schedule_shared_session_v3')||'null')?.token;}catch{return null;}};
 async function call(action,data={}) {
  const session=token(); if(!session) throw Error('Войдите в семейный планер.');
  const c=window.FAMILY_APP_CONFIG;
  const r=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/family_tasks_call',{
   method:'POST',headers:{'Content-Type':'application/json',apikey:c.anonKey},
   body:JSON.stringify({p_session_token:session,p_action:action,p_data:data})
  });
  const body=await r.json();
  if(!r.ok) throw Error(body.message || 'Не удалось связаться с сервером.');
  if(session!==token()) throw Error('Сеанс завершён.');
  return body;
 }
 function status(message,error=false){$('taskStatus').textContent=message;$('taskStatus').classList.toggle('task-error',error);}
 async function refresh(silent=false){
  const seq=++readSequence;
  if(!silent)status('Загружаем задания…');
  try{const data=await call('list');if(seq!==readSequence)return;tasks=data.tasks;loaded=true;render();status('Сохранено для всей семьи');}
  catch(e){if(seq===readSequence)status('Не удалось обновить задания. '+e.message,true);}
 }
 async function imageFor(key){
  if(images[key])return images[key];
  if(!loading[key]){
   const version=sessionVersion;
   loading[key]=call('plan',{plan:key}).then(data=>{
    if(version!==sessionVersion)throw Error('Сеанс завершён.');
    images[key]=data.image;return data.image;
   }).finally(()=>{delete loading[key];});
  }
  return loading[key];
 }
 function mapMarkup(key){
  return `<div class="task-plan-loading" data-map-status>Загружаем чертёж…</div><div class="task-plan-stage" hidden><img alt="${esc(plans[key].join(' · '))}" draggable="false"><div class="task-markers"></div></div>`;
 }
 function fillMap(container,key,withMarkers=true){
  imageFor(key).then(src=>{
   if(!container.isConnected||container.dataset.plan!==key)return;
   container.querySelector('img').src=src;
   container.querySelector('.task-plan-stage').hidden=false;
   container.querySelector('[data-map-status]').hidden=true;
   if(withMarkers)drawMarkers(container,key);
  }).catch(()=>{
   if(container.isConnected)container.querySelector('[data-map-status]').textContent='Не удалось загрузить чертёж. Нажмите «Обновить».';
  });
 }
 function drawMarkers(container,key){
  container.querySelector('.task-markers').innerHTML=showMarkers?tasks.filter(t=>t.plan===key&&!t.completed_at).map(t=>
   `<button class="task-marker" style="left:${100*t.x}%;top:${100*t.y}%" data-task="${t.id}" aria-label="${esc(t.title)}" title="${esc(t.title)}">!</button>`).join(''):'';
 }
 function render(){
  $('taskCards').innerHTML=groups.map(([id,title,keys])=>{
   const key=selected[id], list=tasks.filter(t=>t.plan===key&&(showDone||!t.completed_at));
   const pending=tasks.filter(t=>t.plan===key&&!t.completed_at).length;
   return `<section class="task-property" aria-label="${title}">
    <header><div><h3><span class="task-home" aria-hidden="true">⌂</span> ${title}</h3><p>${plans[key][1]} · Открытых заданий: ${pending}</p></div>
    <div class="task-switch" aria-label="План ${title}">${keys.map(k=>`<button data-plan-select="${k}" data-group="${id}" aria-pressed="${k===key}">${plans[k][1]}</button>`).join('')}</div></header>
    <div class="task-property-body"><div><div class="task-plan" data-plan="${key}">${mapMarkup(key)}</div><div class="task-map-tools"><span>Исходный чертёж</span><button class="link-btn" data-zoom="${key}">Увеличить ↗</button></div></div>
    <aside><div class="task-list-head"><h4>Список заданий</h4><button class="link-btn" data-add="${key}" aria-label="Добавить задание: ${title}, ${plans[key][1]}">+ Добавить</button></div>
    <div class="task-list">${list.length?list.map(t=>`<button class="task-row ${t.completed_at?'task-done':''}" data-task="${t.id}">
    <span class="task-check" aria-hidden="true">${t.completed_at?'✓':''}</span><span><strong>${esc(t.title)}</strong><small>${esc(t.room||plans[key][1])}${t.completed_at?' · '+esc(people.find(p=>p[0]===t.completed_by)?.[1]):''}</small></span><span class="task-points">+${t.points}</span></button>`).join(''):
    '<p class="task-empty">Всё спокойно — открытых заданий нет.<br>Добавьте новое дело для семьи.</p>'}</div>
    <p class="task-list-help">Нажмите на задание или отметку «!» на плане.<br>При выполнении выберите, кто помог.</p></aside></div></section>`;
  }).join('');
  root.querySelectorAll('.task-plan').forEach(c=>fillMap(c,c.dataset.plan));
  renderScores();
 }
 function renderScores(){
  const now=new Date();const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
  $('taskScores').innerHTML=people.map(([key,name])=>{
   const n=tasks.filter(t=>t.completed_by===key&&(scorePeriod==='all'||new Date(t.completed_at)>=start)).reduce((s,t)=>s+t.points,0);
   return `<div class="task-score ${key}"><span class="task-avatar">${name[0]}</span><div><strong>${name}</strong><p><b>${n}</b> баллов</p></div></div>`;
  }).join('');
 }
 function dialogOpen(html,wide=false){
  const dialog=$('taskDialog');dialog.classList.toggle('task-dialog-wide',wide);
  $('taskDialogContent').innerHTML=html;
  $('taskDialogError').textContent='';
  if(!dialog.open)dialog.showModal();
 }
 function details(id){
  current=tasks.find(t=>t.id===id);if(!current)return;
  const t=current;
  dialogOpen(`<p class="task-eyebrow">${esc(plans[t.plan].join(' · '))}</p><h2>${esc(t.title)}</h2><p>${esc(t.room)} <span class="task-points">+${t.points} баллов</span></p>
   ${t.completed_at?`<p>Выполнил(а): <strong>${esc(people.find(p=>p[0]===t.completed_by)?.[1])}</strong></p><button class="ghost" data-undo="${t.id}">Отменить выполнение</button>`:
   `<h3>Кто выполнил задание?</h3><div class="task-people">${people.map(([k,n])=>`<button class="${k}" data-complete="${k}">${n}</button>`).join('')}</div><p class="task-dialog-help">Баллы будут начислены выбранному участнику.</p><button class="link-btn" data-edit="${t.id}">Изменить задание</button>`}`);
 }
 async function getPin(){
  if(pin)return pin;
  dialogOpen('<h2>Правка заданий</h2><p class="task-dialog-help">Введите семейный PIN, чтобы добавлять и изменять задания.</p><form id="taskPinForm"><label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" required autofocus></label><button class="primary" type="submit">Продолжить</button></form>');
  return new Promise(resolve=>{pinResolve=resolve;});
 }
 async function verifyPin(value){
  const c=window.FAMILY_APP_CONFIG;
  const r=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/verify_family_edit_pin',{
   method:'POST',headers:{'Content-Type':'application/json',apikey:c.anonKey},body:JSON.stringify({p_session_token:token(),p_edit_pin:value})});
  if(!r.ok||await r.json()!==true)throw Error('Неверный PIN.');
  pin=value;const resolve=pinResolve;pinResolve=null;resolve?.(pin);
 }
 async function mutate(action,data){
  if(busy)return;busy=true;
  const dialog=$('taskDialog');dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await call(action,data);dialog.close();await refresh();}
  catch(e){$('taskDialogError').textContent=e.message;status(e.message,true);if(e.message.includes('PIN'))pin='';}
  finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 async function editTask(key,id=null){
  try{if(await getPin()===null)return;}catch(e){status(e.message,true);$('taskDialogError').textContent=e.message;return;}
  const t=id?tasks.find(t=>t.id===id):null;
  point={x:t?.x??.5,y:t?.y??.5};placing=true;
  dialogOpen(`<h2>${t?'Изменить задание':'Новое задание'}</h2><form id="taskForm">
   <input name="id" type="hidden" value="${esc(id||'')}">
   <label>Где<select name="plan" id="taskPlanSelect">${Object.entries(plans).map(([k,v])=>`<option value="${k}" ${k===key?'selected':''}>${esc(v.join(' · '))}</option>`).join('')}</select></label>
   <label>Задание<input name="title" required maxlength="120" value="${esc(t?.title||'')}" placeholder="Например, полить цветы"></label>
   <div class="task-form-grid"><label>Комната<input name="room" maxlength="80" value="${esc(t?.room||'')}" placeholder="Гостиная"></label><label>Баллы<input name="points" type="number" min="1" max="1000" step="1" required value="${t?.points||10}"></label></div>
   <p class="task-dialog-help">Нажмите на чертёж, чтобы выбрать место отметки.</p>
   <div id="taskPlaceMap" class="task-plan task-place-map" data-plan="${key}">${mapMarkup(key)}</div>
   <div class="task-form-actions"><button class="primary" type="submit">Сохранить задание</button>${t?`<button class="ghost task-delete" type="button" data-archive="${t.id}">Удалить</button>`:''}</div></form>`,true);
  updatePlaceMap(key);
 }
 function updatePlaceMap(key){
  const c=$('taskPlaceMap');c.dataset.plan=key;c.innerHTML=mapMarkup(key);
  fillMap(c,key,false);
  c.querySelector('.task-markers').innerHTML=`<span class="task-marker task-placement" style="left:${point.x*100}%;top:${point.y*100}%">!</span>`;
 }
 async function zoom(key){
  dialogOpen(`<h2>${esc(plans[key].join(' · '))}</h2><p class="task-dialog-help">Масштаб <input id="taskZoom" aria-label="Масштаб чертежа" type="range" min="100" max="250" value="100"> <span id="taskZoomValue">100%</span></p><div class="task-zoom-scroll"><img id="taskZoomImage" alt="${esc(plans[key].join(' · '))}"></div>`,true);
  try{const src=await imageFor(key);if($('taskZoomImage'))$('taskZoomImage').src=src;}catch(e){$('taskDialogError').textContent=e.message;}
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.planSelect){selected[b.dataset.group]=b.dataset.planSelect;render();}
  if(b.dataset.task)details(b.dataset.task);
  if(b.dataset.add)editTask(b.dataset.add);
  if(b.dataset.zoom)zoom(b.dataset.zoom);
 });
 $('taskDialog').addEventListener('click',async e=>{
  const b=e.target.closest('button');
  if(b?.dataset.complete&&current)mutate('complete',{id:current.id,person:b.dataset.complete});
  if(b?.dataset.edit&&current)editTask(current.plan,current.id);
  if(b?.dataset.undo){try{const p=await getPin();if(p!==null)await mutate('undo',{id:b.dataset.undo,pin:p});}catch(err){$('taskDialogError').textContent=err.message;}}
  if(b?.dataset.archive){b.textContent='Подтвердить удаление';b.dataset.confirmArchive=b.dataset.archive;delete b.dataset.archive;}
  else if(b?.dataset.confirmArchive)mutate('archive',{id:b.dataset.confirmArchive,pin});
  const stage=e.target.closest('#taskPlaceMap .task-plan-stage');
  if(stage&&placing){const r=stage.getBoundingClientRect();point={x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};const mark=stage.querySelector('.task-placement');mark.style.left=point.x*100+'%';mark.style.top=point.y*100+'%';}
 });
 $('taskDialog').addEventListener('change',e=>{if(e.target.id==='taskPlanSelect'){point={x:.5,y:.5};updatePlaceMap(e.target.value);}});
 $('taskDialog').addEventListener('input',e=>{if(e.target.id==='taskZoom'){$('taskZoomImage').style.width=e.target.value+'%';$('taskZoomValue').textContent=e.target.value+'%';}});
 $('taskDialog').addEventListener('submit',async e=>{
  if(e.target.getAttribute('id')==='taskForm'){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));mutate('save',{...data,points:+data.points,...point,pin});}
  if(e.target.getAttribute('id')==='taskPinForm'){e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await verifyPin(new FormData(e.target).get('pin'));}catch(err){$('taskDialogError').textContent=err.message;}finally{button.disabled=false;}}
 });
 $('taskDialogClose').onclick=()=>{if(!busy)$('taskDialog').close();};
 $('taskDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('taskDialog').addEventListener('close',()=>{placing=false;current=null;pinResolve?.(null);pinResolve=null;});
 $('taskRefresh').onclick=()=>refresh();
 $('taskNew').onclick=()=>{if(loaded)editTask(selected.gogol);};
 $('taskShowDone').onchange=e=>{showDone=e.target.checked;render();};
 $('taskShowMarkers').onchange=e=>{showMarkers=e.target.checked;render();};
 $('taskScorePeriod').onchange=e=>{scorePeriod=e.target.value;renderScores();};
 window.addEventListener('family-login',()=>{if(!root.hidden)refresh();});
 window.addEventListener('family-logout',()=>{
  sessionVersion++;readSequence++;images={};loading={};tasks=[];pin='';loaded=false;current=null;
  $('taskDialog').close();$('taskDialogContent').innerHTML='';$('taskCards').innerHTML='';$('taskScores').innerHTML='';
 });
 window.addEventListener('family-tasks-open',()=>refresh());
 setInterval(()=>{if(!root.hidden&&!document.hidden&&!$('taskDialog').open&&token())refresh(true);},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!root.hidden&&token())refresh(true);});
})();

