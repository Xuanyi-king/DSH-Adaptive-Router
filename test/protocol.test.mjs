import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { askJev } from '../lib/classifier.js';
import { readConfig } from '../lib/config.js';
const answer=(choice,probabilities)=>({type:'choice',choice,probabilities,confidence:.9});
const valid=()=>({model:'NeoHorse-Jev-4B',answers:{tier:answer('moderate',{simple:.05,moderate:.9,complex:.05}),role:answer('coding',{general:.05,coding:.9,reasoning:.05}),relation:answer('continues',{new:.1,continues:.9})}});
async function fixture(t,respond){
  const bodies=[]; const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;bodies.push(JSON.parse(raw));respond(res,req);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  return {bodies,config:readConfig({apiUrl:`http://127.0.0.1:${server.address().port}/v1/systemone`,classifierModel:'NeoHorse-Jev-4B',timeoutMs:100})};
}
test('NeoHorse and original Jev share the real tier/role/relation System One request',async t=>{
  const f=await fixture(t,res=>res.end(JSON.stringify(valid())));
  for(const model of ['NeoHorse-Jev-4B','jev-latest']){
    const result=await askJev({...f.config,classifierModel:model},'synthetic-key','synthetic task',true);
    assert.equal(result.role,'coding'); assert.equal(result.relation,'continues');
    assert.deepEqual(Object.keys(f.bodies.at(-1).questions),['tier','role','relation']);
    assert.equal(f.bodies.at(-1).model,model);
  }
});
for(const status of [401,403,413,422,429,529,503]) test(`System One HTTP ${status} has sanitized failure`,async t=>{
  const f=await fixture(t,res=>{res.writeHead(status);res.end('sensitive response body');});
  const result=await askJev(f.config,'key','synthetic',true);
  assert.equal(result.failure,status===503?'failed':`http-${status}`);
  assert.doesNotMatch(JSON.stringify(result),/sensitive|key/);
});
for(const malformed of ['missing-role','unknown-choice','bad-probability','bad-confidence','negative-confidence']) test(`NeoHorse rejects ${malformed}`,async t=>{
  const value=valid();
  if(malformed==='missing-role')delete value.answers.role;
  if(malformed==='unknown-choice')value.answers.tier.choice='unknown';
  if(malformed==='bad-probability')value.answers.role.probabilities.coding=2;
  if(malformed==='bad-confidence')value.answers.relation.confidence='0.9';
  if(malformed==='negative-confidence')value.answers.tier.confidence=-1;
  const f=await fixture(t,res=>res.end(JSON.stringify(value)));
  assert.equal((await askJev(f.config,'key','synthetic',true)).failure,'invalid-choice');
});
test('missing NeoHorse confidence is unknown and preserves conservative top-two policy',async t=>{
  const value=valid();delete value.answers.tier.confidence;delete value.answers.relation.confidence;
  const f=await fixture(t,res=>res.end(JSON.stringify(value)));
  const decision=await askJev(f.config,'key','synthetic',true);
  assert.equal(decision.tier,'moderate');assert.equal(decision.relation,'continues');assert.equal(decision.confidence,0);
});
test('non JSON response, timeout, cancellation and redirects are bounded failures',async t=>{
  const f=await fixture(t,res=>res.end('not JSON'));
  assert.equal((await askJev(f.config,'key','synthetic',false)).failure,'invalid-json');
  const slow=await fixture(t,()=>{});
  assert.equal((await askJev(slow.config,'key','synthetic',false)).failure,'timeout');
  const controller=new AbortController();const result=askJev(slow.config,'key','synthetic',false,controller.signal);controller.abort();
  assert.equal((await result).failure,'cancelled');
  const redirect=await fixture(t,res=>{res.writeHead(302,{location:f.config.apiUrl});res.end();});
  assert.equal((await askJev(redirect.config,'key','synthetic',false)).failure,'failed');
  assert.equal(f.bodies.length,1,'redirect must never forward credentials');
});
test('invalid URL, missing key, request limit and unreachable server fail conservatively',async()=>{
  const config=readConfig({apiUrl:'file:///etc/passwd'});
  assert.equal((await askJev(config,'key','x',false)).failure,'invalid-url');
  assert.equal((await askJev({...config,apiUrl:'http://127.0.0.1:1/v1/systemone'},'','x',false)).failure,'no-key');
  assert.equal((await askJev({...config,apiUrl:'http://127.0.0.1:1/v1/systemone'},'key','x',false)).failure,'failed');
  assert.equal((await askJev({...config,apiUrl:'http://127.0.0.1:1/v1/systemone'},'key','x'.repeat(1048577),false)).failure,'request-too-large');
});

test('Host-only synthetic probe reports sanitized protocol timing without chat content',async t=>{
  const {probeJev}=await import('../lib/classifier.js');
  const f=await fixture(t,res=>res.end(JSON.stringify(valid())));
  const result=await probeJev(f.config,'probe-key');
  assert.equal(result.ok,true);assert.equal(result.engine,'NeoHorse');assert.equal(result.model,'NeoHorse-Jev-4B');
  assert.ok(result.at>0);assert.ok(result.elapsedMs>=0);
  assert.doesNotMatch(JSON.stringify(result),/probe-key|Synthetic protocol/);
  assert.equal(f.bodies.length,1);assert.equal(typeof f.bodies[0].state,'string');
});
test('oversized System One responses are rejected with a bounded reader',async t=>{
  const f=await fixture(t,res=>res.end('x'.repeat(65537)));
  assert.equal((await askJev(f.config,'key','synthetic',false)).failure,'response-too-large');
});
