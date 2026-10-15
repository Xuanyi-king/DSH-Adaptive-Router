import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../lib/config.js';
import { readiness, presetPatch, engineFor, explainReason } from '../lib/diagnostics.js';
const catalog={groups:[{id:'p',name:'P',models:[{id:'m',name:'M',reasoning:{efforts:[{id:'low'},{id:'high'}]}}]}],failures:[]};
const cfg=extra=>readConfig({apiUrl:'https://example.com/systemone',candidates:[{provider:'p',model:'m',enabled:true,tier:'complex',roles:['general'],effortByTier:{}}],...extra});
const check=(c,extra={})=>readiness(c,{catalog,current:{provider:'p',model:'m'},keyAvailable:true,verified:false,...extra});
test('manual and disabled modes require no classifier or candidates',()=>{
  assert.equal(check(cfg({mode:'MANUAL',apiUrl:'',candidates:[]})).state,'Manual');
  assert.equal(check(cfg({enabled:false})).state,'Disabled');
});
test('four modes validate only their active dependencies',()=>{
  assert.equal(check(cfg({mode:'EFFORT_AUTO',candidates:[]})).state,'Unverified');
  assert.equal(check(cfg({candidates:[]})).state,'Needs Setup');
  assert.equal(check(cfg({mode:'MODEL_AUTO',fixedEffort:'max'})).state,'Needs Setup');
  assert.equal(check(cfg({mode:'EFFORT_AUTO',lockEffort:true})).state,'Manual');
  assert.equal(check(cfg({mode:'MODEL_AUTO',lockModel:true})).state,'Manual');
});
test('readiness distinguishes configuration from verified connection and unknown directory',()=>{
  assert.equal(check(cfg({apiUrl:''})).code,'no-url');
  assert.equal(check(cfg({}),{keyAvailable:false}).code,'no-key');
  assert.equal(check(cfg({})).state,'Unverified');
  assert.equal(check(cfg({}),{verified:true}).state,'Ready');
  assert.equal(check(cfg({}),{catalog:null,verified:true}).state,'Unverified');
  assert.equal(check(cfg({}),{conflict:true}).state,'Conflict');
  assert.equal(check(cfg({}),{failure:'timeout'}).state,'Degraded');
});
test('non-reasoning current model is usable with model-default explanation',()=>{
  const plain={groups:[{id:'p',models:[{id:'m',name:'M'}]}],failures:[]};
  assert.equal(check(cfg({mode:'EFFORT_AUTO',candidates:[]}),{catalog:plain}).code,'model-default');
});
test('presets are explicit patches and never erase a custom credential reference or original threshold',()=>{
  const original=cfg({apiKeyEnv:'MY_PRIVATE_REF',confidenceThreshold:.77});
  const patch=presetPatch('neohorse-hosted',original);
  assert.equal(patch.apiUrl,'https://tokenrhythm.studio/v1/systemone');
  assert.equal(patch.classifierModel,'NeoHorse-Jev-4B');
  assert.equal(patch.apiKeyEnv,undefined);
  assert.equal(patch.confidenceThreshold,undefined);
  assert.equal(presetPatch('custom',original).apiUrl,undefined);
  assert.equal(engineFor({...original,...patch}),'NeoHorse');
});
test('every supported bypass and safety code has an actionable explanation',()=>{
  for(const code of ['no-url','no-key','timeout','failed','invalid-choice','no-compatible-model','validation-failed','context-too-large','context-capacity-blocked','router-error','manual','native-manual','conflict','settings-changed']) {
    const detail=explainReason(code); assert.ok(detail.reason); assert.ok(detail.action,code);
  }
});

test('fallback explanations follow committed replacement and blocked state survives an old Header',async()=>{
  const {actualControl}=await import('../lib/ui.js');
  const actual={provider:'p',model:'m'};
  const fallback=actualControl(actual,{decision:{selection:actual,control:'Fallback',reason:'no-url',fallbackApplied:true}});
  assert.match(fallback.reason,/已应用.*备用模型/);
  assert.doesNotMatch(fallback.reason,/保留原生请求/);
  const blocked=actualControl({provider:'p',model:'other'},{decision:{selection:actual,control:'Blocked',reason:'context-capacity-blocked'}});
  assert.equal(blocked.control,'Blocked');
});

test('an unconfirmed fallback proposal matching an older Header is still bypass, not an applied fallback',async()=>{
  const {actualControl}=await import('../lib/ui.js');
  const actual={provider:'p',model:'m'};
  assert.equal(actualControl(actual,{decision:{selection:actual,control:'Fallback',reason:'failed',fallbackApplied:false}}).control,'Bypass');
});
