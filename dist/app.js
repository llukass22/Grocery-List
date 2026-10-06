'use strict';
const catalog = [
  {name:'Meat',icon:'🥩',description:'Something hearty for the table.',items:['Chicken','Beef','Pork','Tuna','Salmon','Deli Meats']},
  {name:'Vegetables',icon:'🥬',description:'A little fresh goes a long way.',items:['Potatoes','Tomatoes','Onions','Cucumbers','Brussel Sprouts','Spring Onions']},
  {name:'Dairy',icon:'🥛',description:'Your fridge-door favorites.',items:['Milk','Coffee Creamer','Sour Cream','Eggs','Protein Yoghurt','Cottage Cheese','Butter','Cheese']},
  {name:'Grain',icon:'🌾',description:'The staples that make a meal.',items:['Rice','Porridge','Pasta']},
  {name:'Snacks',icon:'🍿',description:'For the moments in between.',items:['Crisps','Olives','Dips','Ice Cream']},
  {name:'Fruits',icon:'🍒',description:'A sweet addition to your day.',items:['Fruit Jam','Grapes','Bananas']},
  {name:'Drinks',icon:'🧃',description:'Keep your favorites on hand.',items:['Kvass','Juice']},
  {name:'Alcohol',icon:'🍷',description:'Something to raise a glass to.',items:['Beer','Wine','Hot Wine']}
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
let storageAvailable = true;
try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if(Array.isArray(saved)) shoppingList = saved.filter(i => i && typeof i.id === 'string' && typeof i.name === 'string' && i.name.trim() && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 10 && typeof i.done === 'boolean'); } catch { storageAvailable=false; }
let activeCategory = 'Vegetables';
const selections = new Map();
let toastTimeout;
function notify(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2600); }
function save() { try { localStorage.setItem(storageKey,JSON.stringify(shoppingList)); } catch { storageAvailable=false; notify('Your list works, but this browser could not save it.'); } updateStorageLabel(); }
function updateStorageLabel(){document.querySelector('.local-badge').lastChild.textContent=storageAvailable?' Saved on this device':' Session only';}
function options(select,value=1) { for(let n=1;n<=10;n++){const option=document.createElement('option');option.value=n;option.textContent=n;select.append(option);}select.value=value; }
function newItem(name,quantity){ return {id:globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2),name,quantity,done:false}; }
function addItems(items){ shoppingList.push(...items.map(i=>newItem(i.name,i.quantity))); save(); renderList(); notify(`${items.length === 1 ? items[0].name : items.length+' items'} added to your list`); }
function renderList(){
  const holder=$('shopping-items'); holder.replaceChildren();
  for(const item of shoppingList){
    const row=document.createElement('div');row.className='shopping-row'+(item.done?' done':'');
    const toggle=document.createElement('button');toggle.className='item-toggle';toggle.type='button';toggle.setAttribute('aria-pressed',String(item.done));toggle.setAttribute('aria-label',`${item.done?'Uncheck':'Check off'} ${item.name}`);
    const check=document.createElement('span');check.className='check-circle';check.setAttribute('aria-hidden','true');check.textContent=item.done?'✓':'';
    const name=document.createElement('span');name.className='item-name';name.textContent=item.name;toggle.append(check,name);
    toggle.addEventListener('click',()=>{ item.done=!item.done;save();renderList();holder.querySelectorAll('.item-toggle')[shoppingList.indexOf(item)]?.focus({preventScroll:true}); });
    const quantity=document.createElement('label');quantity.className='row-quantity';quantity.append('×');const select=document.createElement('select');select.setAttribute('aria-label',`Quantity for ${item.name}`);options(select,item.quantity);select.addEventListener('change',()=>{item.quantity=Number(select.value);save();});quantity.append(select);
    const remove=document.createElement('button');remove.className='remove-item';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${item.name}`);remove.addEventListener('click',()=>{const index=shoppingList.indexOf(item);shoppingList=shoppingList.filter(i=>i.id!==item.id);save();renderList();holder.querySelectorAll('.remove-item')[Math.min(index,shoppingList.length-1)]?.focus({preventScroll:true});notify(`${item.name} removed`);});
    row.append(toggle,quantity,remove);holder.append(row);
  }
  const total=shoppingList.length,done=shoppingList.filter(i=>i.done).length;
  $('list-count').textContent=`${total} ${total===1?'item':'items'}`;
  $('empty-state').hidden=total>0;$('progress-section').hidden=total===0;
  $('progress-text').textContent=`${done} of ${total} items in the basket`;
  $('progress-message').textContent=done===total?'All done. Happy cooking!':'You’ve got this.';
  $('progress-fill').style.width=`${total?done/total*100:0}%`;
  $('clear-list').disabled=total===0 || done!==total;
  $('clear-list').title=total>0&&done===total?'Clear your completed shopping list':'Check off every item to clear the list';
}
function updateSelection(){const count=selections.size;$('selection-summary').textContent=count?`${count} ${count===1?'item':'items'} selected`:'Select items to add to your list';$('add-selected').disabled=count===0;$('selection-button-text').textContent=count?`Add ${count} ${count===1?'item':'items'}`:'Add to list';}
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
$('add-form').addEventListener('submit',event=>{event.preventDefault();const input=$('item-name');const name=input.value.trim();if(!name){input.setCustomValidity('Enter an item name.');input.reportValidity();return;}input.setCustomValidity('');addItems([{name,quantity:Number($('item-quantity').value)}]);input.value='';$('item-quantity').value=1;input.focus();});
$('item-name').addEventListener('input',()=> $('item-name').setCustomValidity(''));
$('add-selected').addEventListener('click',()=>{if(!selections.size)return;addItems([...selections.values()]);selections.clear();renderCategory();});
$('clear-list').addEventListener('click',()=>{if(!shoppingList.length || !shoppingList.every(i=>i.done))return;shoppingList=[];save();renderList();notify('List cleared. Ready for your next shop.');$('item-name').focus();});
window.addEventListener('storage',event=>{if(event.key!==storageKey)return;try{const data=JSON.parse(event.newValue||'[]');if(Array.isArray(data)&&data.every(i=>i&&typeof i.id==='string'&&typeof i.name==='string'&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10&&typeof i.done==='boolean')){shoppingList=data;renderList();}}catch{}});
updateStorageLabel();renderList();renderCategory();
