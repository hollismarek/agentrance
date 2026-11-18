import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/providerForms.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {toProviderForm,providersFromForms,uniqueProvider,providerIsConfigured,providerPreset}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const provider={id:'saved-id',name:'Custom name',executable:'/path with spaces/node',args:['/adapter/index.js','one argument with spaces','',String.raw`C:\project`],env:{PATH:'/custom/bin',REGION:'value=with spaces'},cwd:'/project with spaces'};
test('form round trips preserve saved IDs, exact argument boundaries and environment values',()=>{
 const form=toProviderForm(provider);assert.deepEqual(providersFromForms([form]),[provider]);
 form.name='Renamed';form.cwd='/different project';
 assert.equal(providersFromForms([form])[0].id,'saved-id');assert.equal(provider.name,'Custom name');
 form.args.push('added');assert.equal(provider.args.length,4);
});
test('duplicate environment names and invalid provider fields fail before persistence',()=>{
 const form=toProviderForm(provider);
 assert.throws(()=>providersFromForms([{...form,env:[{key:'X',value:'a'},{key:'X',value:'b'}]}]),/duplicate environment/);
 for(const key of ['', 'A=B','bad\0key'])assert.throws(()=>providersFromForms([{...form,env:[{key,value:''}]}]));
 for(const patch of [{cwd:'.'},{name:''},{executable:''}])assert.throws(()=>providersFromForms([{...form,...patch}]));
 assert.throws(()=>providersFromForms([]));
});
test('adding presets or discoveries allocates new IDs without replacing saved settings',()=>{
 const detected=providerPreset('kiro');const copy=uniqueProvider(detected,[{id:'kiro'},{id:'kiro-2'}],'/chosen');
 assert.equal(copy.id,'kiro-3');assert.equal(copy.cwd,'/chosen');assert.equal(detected.cwd,'');
 assert.equal(providerIsConfigured(copy,[toProviderForm(detected)]),true);
 assert.equal(providerPreset('codex').executable,'codex-acp');
 assert.deepEqual(providerPreset('kiro').args,['acp','--agent-engine=v3']);
 assert.equal(providerPreset('custom').executable,'');
});
