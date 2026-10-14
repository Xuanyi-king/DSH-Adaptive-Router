import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const h = React.createElement;
function store(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe: f => { listeners.add(f); return () => listeners.delete(f); },
    set(next) { value = next; for (const f of listeners) f(); } };
}
const primitives = {
  Button: React.forwardRef((p, ref) => h('button', { ...p, ref, type: 'button' })),
  Input: React.forwardRef((p, ref) => h('input', { ...p, ref })),
  Checkbox: ({label, checked, onChange, disabled}) => h('label', null, h('input', {type:'checkbox', checked, disabled, onChange:e=>onChange(e.target.checked)}),label),
  Switch: ({label, checked, onChange, disabled}) => h('button',{role:'switch','aria-label':label,'aria-checked':checked,disabled,onClick:()=>onChange(!checked)},label),
  SettingsForm: ({state, labels, onSave, children}) => h('div', null, children, state.failed && h('p',{role:'status'},labels.saveFailed), h('button',{disabled:!state.dirty || state.invalid || state.saving || !state.writable,onClick:onSave},labels.save)),
  Menu: ({open, anchor, items=[], onSelect, children}) => h('div',null,anchor,open && h('div',{role:'menu'}, items.map(i=>i.type==='label'?h('p',{key:i.id},i.text):i.type==='separator'?null:h('button',{key:i.id,disabled:i.disabled,onClick:()=>onSelect(i.id)},i.label)),children)),
};
function mount(t) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url:'http://localhost'});
  for (const key of ['window','document','HTMLElement','Event','MouseEvent']) globalThis[key] = dom.window[key];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const config = store({status:'ready',writable:true,mode:'host',revision:7,value:{enabled:true,mode:'FULL_AUTO',candidates:[],apiUrl:'',apiKeyEnv:'JEV_API_KEY'}});
  const catalog = {groups:[{id:'p',name:'Native Provider',models:[{id:'fast',name:'Real Fast',reasoning:{efforts:[{id:'off',name:'Off'},{id:'high',name:'High'},{id:'max',name:'Max'}]}}]}],failures:[]};
  const writes=[], entries=[], cleanups=[];
  let answer=true, failing=false, plugin;
  const scope={...config,async mutate(ops,revision) { writes.push({ops,revision}); if(!answer) return false; const next={...config.getSnapshot().value}; for(const op of ops) next[op.path[0]]=op.value; config.set({...config.getSnapshot(),value:next,revision:revision+1}); return true; }};
  const ctx={
    slots:{inject(_key,f){ const off=f(); if(typeof off==='function') cleanups.push(off); },register(options,component){ const entry={options,component}; entries.push(entry); return ()=>entries.splice(entries.indexOf(entry),1); }},
    configForms:{get(){return scope;}}, connection:{}, sessions:{binding(){return {session:{getSnapshot:()=>({running:false})}};}},
    remote:{$on(){return ()=>{};},session:{async modelCatalog(){return failing ? {ok:false,error:{code:'unavailable'}} : {ok:true,value:catalog};}}},
    pluginNavigation:{openBundle(){}}, get(key){return this[key];},
    effect(f){const off=f(); for(const item of [off].flat()) if(typeof item==='function') cleanups.push(item);},on(){return ()=>{};},inject(_deps,f){f(ctx);},
  };
  const loader={load(spec){plugin=spec.factory(name=>name==='react'?React:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/dsh-client-store'?{createSnapshotStore:store}:{});}};
  vm.runInNewContext(fs.readFileSync('lib/client.js','utf8'),{window:{__ModuleLoader__:loader},console,setTimeout,clearTimeout,AbortController,structuredClone});
  plugin.apply(ctx);
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount()); for(const off of cleanups.reverse()) off(); dom.window.close();});
  const hook=s=>selector=>React.useSyncExternalStore(s.subscribe,()=>selector(s.getSnapshot()));
  return {entries,config,catalog,writes,setAnswer(v){answer=v;},setCatalogFailure(v){failing=v;},async render(key,extra={}) { const entry=entries.find(e=>e.options.name===key); assert.ok(entry,`missing ${key}`); const injected=entry.options.inject?.('session')??{}; const props={...injected,view:'page',...extra}; for(const [name,source] of Object.entries(injected.hooks??{})) props['use'+name[0].toUpperCase()+name.slice(1)]=hook(source); Object.assign(props,extra); await act(async()=>{root.render(h(entry.component,props));}); },async click(label){const element=[...document.querySelectorAll('button,label')].find(e=>e.textContent===label || e.getAttribute('aria-label')===label); assert.ok(element,label); await act(async()=>element.click());}};
}
test('native configuration picker authorizes models and saves through revision-fenced form',async t=>{
  const ui=mount(t); await ui.render('plugins.bundle.config');
  assert.match(document.body.textContent,/Real Fast/);
  assert.equal(document.querySelector('input[type=checkbox]').checked,false);
  await ui.click('Real Fast');
  await ui.click('保存');
  assert.equal(ui.writes.length,1);
  assert.equal(ui.writes[0].revision,7);
  const saved=ui.config.getSnapshot().value.candidates;
  assert.equal(saved.length,1); assert.equal(saved[0].provider,'p'); assert.equal(saved[0].model,'fast');
});
test('picker exposes only native efforts, including opt-in max, and preserves capability edits',async t=>{
  const ui=mount(t); await ui.render('plugins.bundle.config'); await ui.click('Real Fast');
  const control=[...document.querySelectorAll('label')].find(e=>e.firstChild?.textContent==='复杂任务档位').querySelector('select');
  assert.deepEqual([...control.options].map(o=>o.value),['','off','high','max']);
  await act(async()=>{control.value='max'; control.dispatchEvent(new Event('change',{bubbles:true}));});
  await ui.click('编程'); await ui.click('保存');
  assert.equal(ui.config.getSnapshot().value.candidates[0].effortByTier.complex,'max');
  assert.ok(ui.config.getSnapshot().value.candidates[0].roles.includes('coding'));
});
test('save refusal preserves the draft and unavailable stored candidates',async t=>{
  const ui=mount(t);
  const candidate={provider:'missing',model:'gone',enabled:true,tier:'complex',roles:['coding'],effortByTier:{complex:'xhigh'}};
  ui.config.set({...ui.config.getSnapshot(),value:{...ui.config.getSnapshot().value,candidates:[candidate]}});
  await ui.render('plugins.bundle.config');
  assert.match(document.body.textContent,/保留已保存配置/);
  await ui.click('Real Fast'); ui.setAnswer(false); await ui.click('保存');
  assert.match(document.body.textContent,/保存失败/);
  assert.equal([...document.querySelectorAll('label')].find(e=>e.textContent==='Real Fast').querySelector('input').checked,true);
  assert.equal(ui.writes[0].ops[0].value[0].model,'gone');
  assert.equal(ui.writes[0].ops[0].value[0].effortByTier.complex,'xhigh');
});
test('catalog removal between selection and save refuses newly unavailable authorization',async t=>{
  const ui=mount(t); await ui.render('plugins.bundle.config'); await ui.click('Real Fast');
  ui.catalog.groups=[];
  await ui.click('保存');
  assert.equal(ui.writes.length,0);
  assert.match(document.body.textContent,/配置未保存/);
});
test('chip displays committed native override and blocks mode switching during execution',async t=>{
  const ui=mount(t);
  const connection=store({rpc:{async call(){return {ok:true,value:{enabled:true,decision:{selection:{provider:'p',model:'fast',reasoningEffort:'off'},control:'Auto',reason:'local'}}};}}});
  await ui.render('conversation.input.right',{
    sessionId:'session',useProjection:()=>({tick:1,actual:{provider:'p',model:'balanced',reasoningEffort:'high'}}),
    useSession:selector=>selector({running:true}),useAdaptiveConnection:selector=>selector(connection.getSnapshot()),
  });
  assert.match(document.querySelector('button').textContent,/Native · balanced · high/);
  await ui.click('智能路由快捷菜单');
  assert.match(document.body.textContent,/Native override/);
  assert.equal([...document.querySelectorAll('button')].find(e=>e.textContent==='手动模式').disabled,true);
  assert.equal(ui.writes.length,0);
});
test('empty catalog and catalog failure remain usable with read-only configuration',async t=>{
  const ui=mount(t); ui.catalog.groups=[]; await ui.render('plugins.bundle.config');
  assert.match(document.body.textContent,/暂无可用模型/);
  ui.setCatalogFailure(true); await ui.click('刷新模型目录');
  assert.match(document.body.textContent,/模型目录加载失败/);
  await act(async()=>ui.config.set({...ui.config.getSnapshot(),writable:false}));
  assert.equal(document.querySelector('[role=switch]').disabled,true);
  assert.equal([...document.querySelectorAll('button')].find(e=>e.textContent==='保存').disabled,true);
  assert.equal(ui.writes.length,0);
});
test('rapid save clicks write once and preserve the draft revision after external updates',async t=>{
  const ui=mount(t); await ui.render('plugins.bundle.config'); await ui.click('Real Fast');
  await act(async()=>ui.config.set({...ui.config.getSnapshot(),revision:9}));
  const save=[...document.querySelectorAll('button')].find(e=>e.textContent==='保存');
  await act(async()=>{save.click(); save.click();});
  assert.equal(ui.writes.length,1); assert.equal(ui.writes[0].revision,7);
});
test('quick mode change is plugin-scoped and uses native configuration revision',async t=>{
  const ui=mount(t); await ui.render('conversation.input.right',{sessionId:'session',useProjection:()=>({tick:1,actual:null}),useSession:selector=>selector({running:false}),useAdaptiveConnection:()=>null});
  await ui.click('智能路由快捷菜单'); await ui.click('手动模式');
  assert.equal(ui.writes.length,1); assert.deepEqual(Array.from(ui.writes[0].ops).map(op=>({...op,path:Array.from(op.path)})),[{op:'set',path:['mode'],value:'MANUAL'}]);
  assert.equal(ui.writes[0].revision,7);
});
test('non-reasoning metadata offers an explicit recovery for previously stored effort mappings',async t=>{
  const ui=mount(t); delete ui.catalog.groups[0].models[0].reasoning;
  const candidate={provider:'p',model:'fast',enabled:true,tier:'complex',roles:['coding'],effortByTier:{complex:'high'}};
  ui.config.set({...ui.config.getSnapshot(),value:{...ui.config.getSnapshot().value,candidates:[candidate]}});
  await ui.render('plugins.bundle.config');
  assert.match(document.body.textContent,/由模型默认处理/);
  await ui.click('使用模型默认（清除旧档位映射）'); await ui.click('保存');
  assert.deepEqual(Object.entries(ui.config.getSnapshot().value.candidates[0].effortByTier),[]);
  assert.equal(ui.config.getSnapshot().value.candidates[0].tier,'complex');
  assert.deepEqual(ui.config.getSnapshot().value.candidates[0].roles,['coding']);
});
test('uncommitted route proposal is not mislabeled as an executed native override',async t=>{
  const ui=mount(t); const connection={rpc:{async call(){return {ok:true,value:{decision:{selection:{provider:'p',model:'fast'},control:'Auto'}}};}}}; await ui.render('conversation.input.right',{sessionId:'session',useProjection:()=>({tick:0,actual:null}),useSession:selector=>selector({running:false}),useAdaptiveConnection:()=>connection});
  await ui.click('智能路由快捷菜单');
  assert.doesNotMatch(document.body.textContent,/Native override/);
  assert.match(document.body.textContent,/等待原生请求/);
});
