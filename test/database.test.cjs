'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mysql=require('mysql2/promise');
const {createStore}=require('../database.cjs');
const env={DB_HOST:'localhost',DB_USER:'test',DB_PASSWORD:'test',DB_NAME:'test'};
function fixture(t,options={}){
  const log=[];
  const connection={beginTransaction:async()=>log.push('begin'),commit:async()=>log.push('commit'),rollback:async()=>log.push('rollback'),release:()=>log.push('release'),execute:async(sql,params)=>{
    log.push({sql,params});
    if(sql.includes('FOR UPDATE'))return [[{id:1}]];
    if(sql.startsWith('SELECT id, name'))return [[{id:'a',name:'Milk',quantity:2,done:1}]];
    if(sql.includes('AND done = 0'))return [options.unchecked?[{id:'a'}]:[]];
    if(sql.startsWith('UPDATE'))return [{affectedRows:options.missing?0:1}];
    if(options.failure)throw new Error('database write failed');
    return [{affectedRows:1}];
  }};
  const original=mysql.createPool;
  mysql.createPool=()=>({getConnection:async()=>connection,execute:connection.execute,end:async()=>{}});
  t.after(()=>{mysql.createPool=original;});
  return {store:createStore(env),log};
}
test('SQL writes lock the list, bind item values and commit before release',async t=>{
  const {store,log}=fixture(t);
  const result=await store.add([{id:'a',name:"Milk'); DROP TABLE basket_items; --",quantity:2,done:false}]);
  assert.deepEqual(result,[{id:'a',name:'Milk',quantity:2,done:true}]);
  assert.equal(log[0],'begin');assert.match(log[1].sql,/FOR UPDATE/);
  assert.equal(log[2].sql.includes('DROP TABLE'),false);
  assert.equal(log[2].params[1],"Milk'); DROP TABLE basket_items; --");
  assert.deepEqual(log.slice(-2),['commit','release']);
});
test('updates only write changed fields',async t=>{
  const {store,log}=fixture(t);await store.update('a',{quantity:3});
  const update=log.find(entry=>entry.sql?.startsWith('UPDATE'));
  assert.equal(update.sql,'UPDATE basket_items SET quantity = ? WHERE id = ? AND list_id = 1');assert.deepEqual(update.params,[3,'a']);
});
test('clear rechecks completion under the write lock and rolls back if unchecked',async t=>{
  const {store,log}=fixture(t,{unchecked:true});await assert.rejects(store.clear(),{status:409});
  assert.match(log[1].sql,/FOR UPDATE/);assert.equal(log.some(entry=>entry.sql?.startsWith('DELETE')),false);
  assert.deepEqual(log.slice(-2),['rollback','release']);
});
test('failed writes and stale updates roll back and release the connection',async t=>{
  const {store,log}=fixture(t,{failure:true,missing:true});
  await assert.rejects(store.add([{id:'a',name:'Milk',quantity:1,done:false}]),/database write failed/);
  assert.deepEqual(log.slice(-2),['rollback','release']);
  await assert.rejects(store.update('missing',{done:true}),{status:404});
  assert.deepEqual(log.slice(-2),['rollback','release']);
});
