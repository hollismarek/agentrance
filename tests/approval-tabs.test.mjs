import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const out=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {ConversationTab} from './src/components/ConversationTab';
 export function render(items,live=true){return renderToStaticMarkup(<ConversationTab session={{id:'chat',title:'Review',provider:'Kiro',cwd:'/repo',busy:true,live,items}} selected={false} onSelect={()=>{}} onClose={()=>{}}/>)}
`},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render}=module.exports;
const permission=request=>({kind:'permission',data:{request,params:{toolCall:{toolCallId:'tool-'+request,title:'Read repository'},options:[]}}});
test('inactive tabs show a visible and accessible count of active approvals',()=>{
 const html=render([permission(1),permission(2)]);
 assert.match(html,/aria-selected="false"/);assert.match(html,/awaiting-approval/);
 assert.match(html,/aria-label="Waiting for approval \(2 requests\)"/);
 assert.match(html,/! 2/);
 const resolved=render([permission(1),permission(2),{kind:'permission_resolved',data:{request:1,option:'yes'}}]);
 assert.match(resolved,/Waiting for approval \(1 request\)/);
});
test('resolved, expired and disconnected requests do not decorate a tab',()=>{
 for(const items of [[],[permission(1),{kind:'permission_resolved',data:{request:1,option:'yes'}}],[permission(1),{kind:'done'}],[permission(1),{kind:'connection_started'}],[permission(1),{kind:'disconnected'}]])assert.doesNotMatch(render(items),/tab-approval/);
 assert.doesNotMatch(render([permission(1)],false),/tab-approval/);
 assert.match(render([permission(1),{kind:'connection_started'},permission(1)]),/Waiting for approval \(1 request\)/);
});
