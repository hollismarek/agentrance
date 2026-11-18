import test from 'node:test';
import assert from 'node:assert/strict';
import {withSavedProviders} from '../src/providerSetup.ts';
test('dismissed or unsaved first-run setup cannot start a chat or comparison',()=>{
 for(const operation of ['start','compare','comparison-submit']){
  const events=[];
  for(let attempt=0;attempt<2;attempt++)assert.equal(withSavedProviders(true,true,()=>events.push('settings'),()=>events.push(operation)),false);
  assert.deepEqual(events,['settings','settings']);
  // Only successful persistence clears needsSetup in useProviders.
  assert.equal(withSavedProviders(true,false,()=>events.push('settings'),()=>events.push(operation)),true);
  assert.equal(events.at(-1),operation);
 }
});
test('startup cannot create sessions before configuration initialization finishes',()=>{
 const events=[];
 assert.equal(withSavedProviders(false,false,()=>events.push('settings'),()=>events.push('start')),false);
 assert.deepEqual(events,[]);
});
