'use strict';
const catalog = [
  {name:'Meat',icon:'🥩',description:'Something hearty for the table.',items:['Chicken','Beef','Pork','Tuna','Salmon','Deli Meats']},
  {name:'Vegetables',icon:'🥬',description:'A little fresh goes a long way.',items:['Potatoes','Hash Browns','Tomatoes','Onions','Cucumbers','Brussel Sprouts','Spring Onions']},
  {name:'Dairy',icon:'🥛',description:'Your fridge-door favorites.',items:['Milk','Coffee Creamer','Sour Cream','Eggs','Protein Yoghurt','Cottage Cheese','Butter','Cheese']},
  {name:'Grain',icon:'🌾',description:'The staples that make a meal.',items:['Rice','Porridge','Pasta']},
  {name:'Snacks',icon:'🍿',description:'For the moments in between.',items:['Crisps','Olives','Dips','Ice Cream']},
  {name:'Fruits',icon:'🍒',description:'A sweet addition to your day.',items:['Fruit Jam','Grapes','Bananas']},
  {name:'Drinks',icon:'🧃',description:'Keep your favorites on hand.',items:['Kvass','Juice']},
  {name:'Alcohol',icon:'🍷',description:'Something to raise a glass to.',items:['Beer','Wine','Hot Wine']},
  {name:'Pantry',icon:'🧺',description:'Everyday essentials for your home.',items:['Toothpaste','Toilet Paper','Toilet Wet Wipes','Foil','Baking Paper','Dish Soap','Kurmis','Olive Oil','Salt','Pepper','Chicken Spices']}
];
const $ = id => document.getElementById(id);
const themeKey = 'basket-theme-v1';
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1c1c1c' : '#244f3d';
}
applyTheme(document.documentElement.dataset.theme);
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem(themeKey, theme); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === themeKey) applyTheme(event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
});
const storageKey = 'basket-grocery-list-v1';
let shoppingList = [];
let connected = false, unlocked = false, busy = false, refreshing = false, generation = 0;
let sessionExpiresAt = 0, checkingSession = false;
function canEdit() { return unlocked && sessionExpiresAt>Date.now() && connected && navigator.onLine && !busy; }
// Remove data left by discontinued offline and manual locking features.
try { for(const key of ['basket-offline-list-v1','basket-pending-lock-v1','basket-session-lock'])localStorage.removeItem(key); } catch {}
let legacyItems = [];
try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if(Array.isArray(saved)) legacyItems = saved.filter(i => i && /^[A-Za-z0-9-]{1,64}$/.test(i.id || '') && typeof i.name === 'string' && i.name.trim() && i.name.trim().length <= 120 && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 10 && typeof i.done === 'boolean'); } catch {}
let activeCategory = 'Vegetables';
const selections = new Map();
let toastTimeout;
function notify(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2600); }
function updateStorageLabel(){
  document.querySelector('.local-badge').lastChild.textContent=!unlocked?' Private shared list':busy?' Saving…':connected?' Shared list synced':' Connection lost';
  const status=$('connection-status');status.hidden=connected&&unlocked;
  status.textContent=!navigator.onLine?'An internet connection is required to use Basket.':unlocked&&!connected?'Connection lost. Reconnect to edit or see household updates.':'';
  if(!status.textContent)status.hidden=true;
  $('add-form').querySelector('button').disabled=!canEdit();$('import-local').disabled=!canEdit();
}
function showSession(value){unlocked=value;$('basket-app').hidden=!value;$('unlock-panel').hidden=value;$('import-local').hidden=!value||!legacyItems.length;if(!value){generation++;sessionExpiresAt=0;shoppingList=[];connected=false;}renderList();updateSelection();updateStorageLabel();}
async function api(url,method='GET',data){
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=await response.json();
  if(!response.ok){if(response.status===401)showSession(false);throw Object.assign(new Error(result.error||'Could not save your change.'),{status:response.status});}
  return result;
}
async function refresh(){
  if(!unlocked||busy||refreshing||document.hidden)return;
  if(sessionExpiresAt<=Date.now()){showSession(false);return;}
  if(!navigator.onLine){connected=false;renderList();updateSelection();updateStorageLabel();return;}
  refreshing=true;const version=generation;
  try{const result=await api('/api/items');if(version===generation&&unlocked){connected=true;shoppingList=result.items;}}
  catch{if(version===generation)connected=false;}finally{refreshing=false;renderList();updateSelection();updateStorageLabel();}
}
async function mutate(url,method,data){
  if(!canEdit()){if(!busy)notify('Reconnect to edit your shared list.');return false;}
  busy=true;const version=++generation;renderList();updateSelection();updateStorageLabel();
  try{const result=await api(url,method,data);if(version!==generation||!unlocked)return false;shoppingList=result.items;connected=true;return true;}
  catch(error){if(version===generation)connected=false;notify(error.status?error.message:'Could not confirm this change. Reconnect and refresh before retrying.');return false;}
  finally{busy=false;renderList();updateSelection();updateStorageLabel();}
}
function options(select,value=1) { for(let n=1;n<=10;n++){const option=document.createElement('option');option.value=n;option.textContent=n;select.append(option);}select.value=value; }
function newItem(name,quantity){ return {id:globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2),name,quantity,done:false}; }
async function addItems(items){const added=await mutate('/api/items','POST',{items:items.map(i=>newItem(i.name,i.quantity))});if(added)notify(`${items.length === 1 ? items[0].name : items.length+' items'} added to your list`);return added;}
function renderList(){
  const holder=$('shopping-items'); holder.replaceChildren();
  for(const item of shoppingList){
    const row=document.createElement('div');row.className='shopping-row'+(item.done?' done':'');
    const toggle=document.createElement('button');toggle.className='item-toggle';toggle.type='button';toggle.setAttribute('aria-pressed',String(item.done));toggle.setAttribute('aria-label',`${item.done?'Uncheck':'Check off'} ${item.name}`);
    const check=document.createElement('span');check.className='check-circle';check.setAttribute('aria-hidden','true');check.textContent=item.done?'✓':'';
    const name=document.createElement('span');name.className='item-name';name.textContent=item.name;toggle.append(check,name);
    toggle.disabled=!canEdit();toggle.addEventListener('click',async()=>{const index=shoppingList.indexOf(item);await mutate(`/api/items/${item.id}`,'PATCH',{done:!item.done});holder.querySelectorAll('.item-toggle')[index]?.focus({preventScroll:true});});
    const quantity=document.createElement('label');quantity.className='row-quantity';quantity.append('×');const select=document.createElement('select');select.setAttribute('aria-label',`Quantity for ${item.name}`);options(select,item.quantity);select.disabled=!canEdit();select.addEventListener('change',()=>mutate(`/api/items/${item.id}`,'PATCH',{quantity:Number(select.value)}));quantity.append(select);
    const remove=document.createElement('button');remove.className='remove-item';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${item.name}`);remove.disabled=!canEdit();remove.addEventListener('click',async()=>{const index=shoppingList.indexOf(item);if(await mutate(`/api/items/${item.id}`,'DELETE'))notify(`${item.name} removed`);holder.querySelectorAll('.remove-item')[Math.min(index,shoppingList.length-1)]?.focus({preventScroll:true});});
    row.append(toggle,quantity,remove);holder.append(row);
  }
  const total=shoppingList.length,done=shoppingList.filter(i=>i.done).length;
  $('list-count').textContent=`${total} ${total===1?'item':'items'}`;
  $('empty-state').hidden=total>0;$('progress-section').hidden=total===0;
  $('progress-text').textContent=`${done} of ${total} items in the basket`;
  $('progress-message').textContent=done===total?'All done. Happy cooking!':'You’ve got this.';
  $('progress-fill').style.width=`${total?done/total*100:0}%`;
  $('clear-list').disabled=!canEdit() || total===0 || done!==total;
  $('clear-list').title=total>0&&done===total?'Clear your completed shopping list':'Check off every item to clear the list';
}
function updateSelection(){const count=selections.size;$('selection-summary').textContent=count?`${count} ${count===1?'item':'items'} selected`:'Select items to add to your list';$('add-selected').disabled=!canEdit()||count===0;$('selection-button-text').textContent=count?`Add ${count} ${count===1?'item':'items'}`:'Add to list';}
function renderCategory(){
  document.querySelectorAll('.category-tab').forEach(button=>{const active=button.dataset.category===activeCategory;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  const category=catalog.find(c=>c.name===activeCategory);$('category-panel').setAttribute('aria-labelledby',`tab-${category.name}`);
  $('panel-icon').textContent=category.icon;$('category-title').textContent=category.name;$('category-description').textContent=`${category.items.length} ${category.items.length === 1 ? 'essential' : 'essentials'}`;
  const holder=$('category-items');holder.replaceChildren();
  for(const name of category.items){
    const row=document.createElement('div');row.className='product-row';const label=document.createElement('label');label.className='product-choice';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selections.has(name);const text=document.createElement('span');text.textContent=name;label.append(checkbox,text);
    const select=document.createElement('select');select.setAttribute('aria-label',`Quantity for ${name}`);options(select,selections.get(name)?.quantity || 1);
    checkbox.addEventListener('change',()=>{checkbox.checked?selections.set(name,{name,quantity:Number(select.value)}):selections.delete(name);updateSelection();});
    select.addEventListener('change',()=>{if(checkbox.checked){selections.set(name,{name,quantity:Number(select.value)});updateSelection();}});
    row.append(label,select);holder.append(row);
  }updateSelection();
}
for(const category of catalog){const button=document.createElement('button');button.type='button';button.className='category-tab';button.dataset.category=category.name;button.id=`tab-${category.name}`;button.setAttribute('role','tab');button.setAttribute('aria-controls','category-panel');const icon=document.createElement('span');icon.className='category-emoji';icon.setAttribute('aria-hidden','true');icon.textContent=category.icon;const label=document.createElement('span');label.textContent=category.name;button.append(icon,label);button.addEventListener('click',()=>{activeCategory=category.name;renderCategory();});button.addEventListener('keydown',event=>{const index=catalog.indexOf(category);let next;if(event.key==='ArrowRight')next=(index+1)%catalog.length;if(event.key==='ArrowLeft')next=(index-1+catalog.length)%catalog.length;if(event.key==='Home')next=0;if(event.key==='End')next=catalog.length-1;if(next!==undefined){event.preventDefault();activeCategory=catalog[next].name;renderCategory();document.getElementById(`tab-${activeCategory}`).focus();}});$('categories').append(button);}
options($('item-quantity'));
$('add-form').addEventListener('submit',async event=>{event.preventDefault();const input=$('item-name');const name=input.value.trim();if(!name){input.setCustomValidity('Enter an item name.');input.reportValidity();return;}input.setCustomValidity('');if(await addItems([{name,quantity:Number($('item-quantity').value)}])){if(input.value.trim()===name)input.value='';$('item-quantity').value=1;input.focus();}});
$('item-name').addEventListener('input',()=> $('item-name').setCustomValidity(''));
$('add-selected').addEventListener('click',async()=>{if(!selections.size)return;const batch=[...selections.values()];if(await addItems(batch)){for(const item of batch){if(selections.get(item.name)===item)selections.delete(item.name);}renderCategory();}});
$('clear-list').addEventListener('click',async()=>{if(!shoppingList.length || !shoppingList.every(i=>i.done))return;if(await mutate('/api/items','DELETE')){notify('List cleared. Ready for your next shop.');$('item-name').focus();}});
$('unlock-form').addEventListener('submit',async event=>{event.preventDefault();if(checkingSession||busy)return;const version=generation;const button=$('unlock-form').querySelector('button');button.disabled=true;$('unlock-error').textContent='';try{const session=await api('/api/session','POST',{password:$('shared-password').value});if(version!==generation)return;sessionExpiresAt=session.expiresAt;$('shared-password').value='';showSession(true);await refresh();}catch(error){$('unlock-error').textContent=error.message;}finally{button.disabled=false;}});
$('import-local').addEventListener('click',async()=>{if(await mutate('/api/items','POST',{items:legacyItems.slice(0,100)})){legacyItems=legacyItems.slice(100);try{localStorage.setItem(storageKey,JSON.stringify(legacyItems));}catch{}$('import-local').hidden=!legacyItems.length;notify(legacyItems.length?'Items imported. Tap again to import the rest.':'Your device list is now shared.');}});
updateStorageLabel();renderList();renderCategory();
async function checkSession(){
  if(checkingSession)return;
  if(!navigator.onLine){updateStorageLabel();return;}
  checkingSession=true;const version=generation;$('unlock-form').querySelector('button').disabled=true;
  try{
    const session=await api('/api/session');if(version!==generation)return;
    sessionExpiresAt=session.expiresAt;showSession(session.authenticated);$('unlock-error').textContent='';await refresh();
  }catch(error){if(version===generation){connected=false;$('unlock-error').textContent='Cannot reach the server. Reconnect to unlock your list.';}}
  finally{checkingSession=false;$('unlock-form').querySelector('button').disabled=false;updateStorageLabel();}
}
checkSession();
setInterval(()=>{if(!unlocked)checkSession();else refresh();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!unlocked)checkSession();else refresh();}});
window.addEventListener('online',checkSession);
window.addEventListener('offline',()=>{connected=false;renderList();updateSelection();updateStorageLabel();});

let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-app').hidden=false;});
$('install-app').addEventListener('click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;$('install-app').hidden=true;await prompt.prompt();await prompt.userChoice;});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('install-app').hidden=true;$('install-help').hidden=true;});
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
$('install-help').hidden=standalone||!(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
// Retire Basket's old caching worker without touching other apps on this origin.
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.filter(registration=>[registration.active,registration.waiting,registration.installing].some(worker=>worker&&new URL(worker.scriptURL).pathname==='/sw.js')).map(registration=>registration.unregister()))).catch(()=>{});}
if('caches' in window){caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('basket-shell-')).map(key=>caches.delete(key)))).catch(()=>{});}
