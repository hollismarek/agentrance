import test from 'node:test';import assert from 'node:assert/strict';
import {startupErrors,reportSendFailure} from '../src/comparisonErrors.ts';
test('Compare retains named startup failures as subsequent attachment failures arrive',()=>{
 const errors=startupErrors([{status:'rejected',reason:'missing executable'},{status:'fulfilled',value:'session'}],[{name:'Kiro'},{name:'Copilot'}]);
 let banner=errors.join('\n');reportSendFailure(errors,'Copilot','image unsupported',message=>banner=message);
 assert.equal(banner,'Kiro: missing executable\nCopilot: image unsupported');
 reportSendFailure(errors,'Gemini','disconnected',message=>banner=message);assert.match(banner,/Kiro: missing executable/);assert.match(banner,/Copilot: image unsupported/);assert.match(banner,/Gemini: disconnected/);
});
