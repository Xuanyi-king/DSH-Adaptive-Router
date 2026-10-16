import test from 'node:test';import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';import Storage from '@deepseek-ai/dsh-storage';import * as domainPlugin from '@deepseek-ai/dsh-storage-domain';import * as jsonPlugin from '@deepseek-ai/dsh-storage-json';
import {mkdtemp,rm,readdir,readFile,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {RouterLab} from '../lib/lab.js';import {readConfig} from '../lib/config.js';
async function host(root){const ctx=new Context();await ctx.plugin(Storage);await ctx.plugin(jsonPlugin,{root});await ctx.plugin(domainPlugin,{backend:'json'});return ctx;}
function collect(lab,id='private-session',turn=1){const session={id,header:{origin:'main'},requestHeader:()=>({config:{provider:'p',model:'m'}})};let seq=turn*10;for(const [type,data]of [['turn/start',{turn}],['step/start',{turn,step:1}],['assistant/message',{turn,step:1,usage:{inputTokens:5,outputTokens:2,totalTokens:7},stream:[]}],['turn/end',{turn,reason:{kind:'completed'}}]])lab.observe(session,{type,data,seq:++seq,time:Date.now()});}
test('real DSH JSON Domain survives Host restart, isolates Profiles and remains owner-only metadata',async t=>{
  const root=await mkdtemp(join(tmpdir(),'router-lab-store-'));t.after(()=>rm(root,{recursive:true,force:true}));const config=readConfig({labEnabled:true});
  let ctx=await host(root);let lab=new RouterLab(()=>config,'profile-web','0.1.0');await lab.open(ctx.storage.domain);collect(lab);await lab.flush();const scope=lab.view().recent[0].sessionScope;await lab.close();await ctx.fiber.dispose();
  ctx=await host(root);lab=new RouterLab(()=>config,'profile-web','0.1.0');await lab.open(ctx.storage.domain);assert.equal(lab.view().summary.turns,1);assert.equal(lab.view().recent[0].sessionScope,scope);
  const other=new RouterLab(()=>config,'profile-desktop','0.1.0');await other.open(ctx.storage.domain);assert.equal(other.view().summary.turns,0);collect(other);await other.flush();assert.notEqual(other.view().recent[0].sessionScope,scope);
  for(const file of await readdir(root)){const raw=await readFile(join(root,file),'utf8');assert.doesNotMatch(raw,/private-session|Authorization|prompt|apiKey/);if(process.platform!=='win32')assert.equal((await stat(join(root,file))).mode&0o777,0o600);}
  await lab.clear();await lab.close();await other.close();await ctx.fiber.dispose();
  ctx=await host(root);lab=new RouterLab(()=>config,'profile-web','0.1.0');await lab.open(ctx.storage.domain);assert.equal(lab.view().summary.turns,0);await lab.close();await ctx.fiber.dispose();
});
