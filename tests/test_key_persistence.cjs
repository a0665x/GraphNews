const assert=require('node:assert/strict');const memory=new Map();global.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const ui=require('../dist/explorer-ui.js');
const fields=()=>Object.fromEntries(['rememberKey','key','keyStatus','forgetKey'].map(id=>[id,{value:'',addEventListener(k,f){this[k]=f}}]));
(async()=>{
 let release;const held=new Promise(resolve=>release=resolve),calls=[],form=fields();ui.write('massiveKey','test-only-history');
 ui.initKey(id=>form[id],{persist:async()=>{calls.push('save-start');await held;calls.push('save-end')},forget:async()=>calls.push('delete')});
 await Promise.resolve();await Promise.resolve();form.forgetKey.onclick();assert.equal(ui.read('massiveKey'),null);
 assert(!calls.includes('delete'),'Forget waits for older pending save');release();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(calls,['save-start','save-end','delete'],'Pending saves cannot resurrect a forgotten key');
 console.log('PASS: historical key migration and serialized save/forget prevent credential resurrection');
})().catch(error=>{console.error(error);process.exitCode=1});
