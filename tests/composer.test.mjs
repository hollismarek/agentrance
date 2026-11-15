import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const result=await build({entryPoints:['src/components/Composer.tsx'],bundle:true,format:'cjs',platform:'node',write:false});
const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {Composer}=module.exports;
function editor(id,events,canSend=true){const element=Composer({text:id,onText:text=>events.push(['draft',id,text]),onSend:()=>events.push(['send',id]),canSend});return element.props.children[0].props;}
function key(overrides={}){return {key:'Enter',shiftKey:false,repeat:false,nativeEvent:{},preventDefault(){this.prevented=true},...overrides};}
test('typing and Enter affect only the composer owning that conversation',()=>{
 const events=[];const a=editor('a',events),b=editor('b',events);
 a.onChange({target:{value:'draft a'}});b.onChange({target:{value:'draft b'}});b.onKeyDown(key());
 assert.deepEqual(events,[['draft','a','draft a'],['draft','b','draft b'],['send','b']]);
});
test('Shift Enter and IME preserve input; busy composer and repeated Enter do not send',()=>{
 const events=[],a=editor('a',events),busy=editor('busy',events,false);
 for(const e of [key({shiftKey:true}),key({nativeEvent:{isComposing:true}}),key({nativeEvent:{keyCode:229}})]){a.onKeyDown(e);assert.equal(e.prevented,undefined)}
 a.onKeyDown(key({repeat:true}));busy.onKeyDown(key());assert.deepEqual(events,[]);
});
