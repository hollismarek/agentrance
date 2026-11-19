import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/projects.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {absoluteProject,projectChoices,initialProject,providersAtProject}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const providers=[{id:'kiro',name:'Kiro',cwd:'/first',args:['acp'],env:{}},{id:'copilot',name:'Copilot',cwd:'/second',args:['--acp'],env:{}}];
test('project choice accepts absolute native paths and rejects relative or NUL-containing paths',()=>{
 for(const path of ['/project with spaces/日本語','C:\\Projects\\Repo','D:/repo','\\\\server\\share'])assert.equal(absoluteProject(path),true,path);
 for(const path of ['', 'relative/project','~/repo','cd /repo && pwd','C:relative','/repo\0'])assert.equal(absoluteProject(path),false,path);
});
test('Compare requires a shared project instead of silently choosing differing provider defaults',()=>{
 assert.equal(initialProject(providers,[]),'');
 assert.equal(initialProject([providers[0]],[]),'/first');
 assert.equal(initialProject(providers,['/recent']),'/recent');
 const chosen=providersAtProject(providers,'/shared');
 assert.deepEqual(chosen.map(p=>p.cwd),['/shared','/shared']);
 assert.deepEqual(chosen.map(p=>p.id),['kiro','copilot']);
 assert.deepEqual(providers.map(p=>p.cwd),['/first','/second']);
 assert.throws(()=>providersAtProject(providers,'relative'));
});
test('recent project suggestions are unique, bounded and include configured and historical roots',()=>{
 assert.deepEqual(projectChoices(['/recent','/first'],providers,[{cwd:'/old'},{cwd:'relative'}]),['/recent','/first','/second','/old']);
 assert.equal(projectChoices(Array.from({length:30},(_,i)=>'/'+i),[],[]).length,20);
});
