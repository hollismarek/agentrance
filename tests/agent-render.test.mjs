import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Check the actual React markup without requiring a browser download.
const output=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActivityPanel} from './src/ActivityPanel';
import {AgentSelector} from './src/components/AgentSelector';
export function render(live=true,busy=false,changing=false){
 const selection={current:'review',choices:[{id:'review',name:'Reviewer'},{id:'code',name:'Coder'}]};
 return renderToStaticMarkup(<ActivityPanel events={[]} live={live} provider="Kiro CLI" onPermission={async()=>{}}
   agentControl={<AgentSelector selection={selection} live={live} busy={busy} changing={changing} onChange={()=>{}}/>}/>);
}`},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render}=module.exports;
test('agent selector is present beside Activity when inspector is collapsed',()=>{
 const html=render();assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/class="activity-body"/);
 assert.match(html,/<\/button><div class="agent-selector"/);
 assert.match(html,/aria-label="Conversation agent"/);assert.match(html,/<option value="review" selected="">Reviewer<\/option>/);
 assert.doesNotMatch(html,/<select[^>]*disabled/);
});
test('saved, busy and switching sessions disable agent changes independently of Activity',()=>{
 for(const args of [[false,false,false],[true,true,false],[true,false,true]])assert.match(render(...args),/<select[^>]*disabled=""/);
 assert.match(render(true,false,true),/Switching…/);
});
