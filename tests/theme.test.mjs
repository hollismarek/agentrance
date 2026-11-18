import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTheme,resolveTheme,watchTheme} from '../src/theme.ts';
test('missing or invalid preferences follow the OS, with explicit light/dark overrides',()=>{
 for(const value of [null,undefined,'invalid','system',{}])assert.equal(parseTheme(value),'system');
 for(const value of ['light','dark'])assert.equal(parseTheme(value),value);
 assert.equal(resolveTheme('system',true),'dark');assert.equal(resolveTheme('system',false),'light');
 assert.equal(resolveTheme('light',true),'light');assert.equal(resolveTheme('dark',false),'dark');
});
test('system changes update appearance live and subscription cleanup stops updates',()=>{
 const listeners=new Set(),values=[];
 const media={matches:false,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 const stop=watchTheme('system',media,value=>values.push(value));
 media.matches=true;listeners.forEach(fn=>fn());assert.deepEqual(values,['light','dark']);
 stop();assert.equal(listeners.size,0);
 const stopOverride=watchTheme('light',media,value=>values.push(value));
 media.matches=false;listeners.forEach(fn=>fn());media.matches=true;listeners.forEach(fn=>fn());
 assert.deepEqual(values.slice(2),['light','light','light']);stopOverride();assert.equal(listeners.size,0);
});

test('both palettes keep principal text and status combinations readable',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile(new URL('../src/theme.css',import.meta.url),'utf8');
 const luminance=hex=>{
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 };
 for(const selector of [':root{',':root[data-theme="light"]{']){
  const block=css.split(selector)[1].split('}')[0];
  const colors=Object.fromEntries([...block.matchAll(/--([\w-]+):(#\w+);/g)].map(m=>[m[1],m[2]]));
  for(const [fg,bg] of [['text','bg'],['muted','sidebar'],['text','code-bg'],['awaiting','approval-bg'],['failed','inspector'],['primary-text','primary-bg'],['selected-text','provider-icon-bg']]){
   const [low,high]=[luminance(colors[fg]),luminance(colors[bg])].sort((a,b)=>a-b);
   assert.ok((high+.05)/(low+.05)>=4.5,`${selector} ${fg} on ${bg}`);
  }
 }
});
