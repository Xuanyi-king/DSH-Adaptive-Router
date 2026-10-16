// Integration uses public optional Host services; it does not install storage or own Profile files.
import type { Context } from '@deepseek-ai/cordis';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RouterLab, localOperator, type LabStorage } from './lab.js';
import { UpdateChecker, identifySource, type Installation } from './updates.js';
import { readConfig } from './config.js';
export function mountLab(ctx:Context,config:object,recordFor:(id:string)=>any){
  const profile=ctx.get('profileContext') as {name:string;dir:string}|undefined;
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const lab=new RouterLab(()=>readConfig(config),profile?.dir??'unavailable',manifest.version);
  const updates=new UpdateChecker();let ready:Promise<void>=Promise.resolve();let closed=false;
  let installation:Installation={version:manifest.version,installedCommit:null,declaredCommit:null,sourceKind:'unknown',profile:profile?.name??null,targetDsh:'0.2.1-alpha.2'};
  ctx.provide('adaptiveRouterLab',{lab,updates,get ready(){return ready;}});
  ctx.inject(['storageDomain'],child=>{if(!profile?.dir)return;ready=lab.open(child.get('storageDomain') as LabStorage);child.effect(()=>async()=>{await ready;await lab.close();});});
  ctx.on('session/event',(session,event)=>{
    if(!readConfig(config).labEnabled)return;
    try {const record=recordFor(String(session.id));if(record)lab.decision(String(session.id),record);lab.observe(session,event);}catch{/* Lab must never fail a native Session append. */}
  });
  ctx.on('agent/disposed',({agent})=>lab.forget(String(agent.session.id)));
  ctx.on('session/disposed',session=>lab.forget(String(session.id)));
  const on=ctx.on.bind(ctx) as (name:string,cb:()=>void)=>unknown;
  on('settings/document-updated',()=>lab.sync());
  ctx.inject(['connection','webServer'],child=>{
    const connection=(child as any).connection;
    const handle=async(endpoint:string,payload:any,_signal:AbortSignal,peer:unknown)=>{
      const denied=()=>({ok:false,error:{code:'lab/forbidden',message:'Router Lab 仅供原生认证的本地 operator Profile；远程或未知边界不开放数据访问。',details:{}}});
      if(closed||!localOperator(connection,child.get('webServer'),peer))return denied();
      try{
        const op=endpoint,args=payload?.args??{};
        if(!args||typeof args!=='object'||Array.isArray(args))throw Error('invalid-request');
        if(['feedback','clear'].includes(op)&&(child.get('settings') as any)?.writable!==true)return denied();
        await ready;
        let value:any;
        if(op==='read'){
          if(Object.keys(args).length)throw Error('invalid-request');await lab.flush();
          try {const bundles=await (child.get('pluginManager') as any)?.listBundles();const bundle=bundles?.find((b:any)=>b.name===manifest.name);installation={...installation,...identifySource(bundle?.source),version:bundle?.version??manifest.version};}catch{/* Unknown installation evidence stays unknown. */}
          let storagePath:string|null=null;
          try {const descriptors=(child.get('settings') as any)?.describe({redactSecrets:true})??[];const route=descriptors.find((d:any)=>d.ns==='storage-domain')?.value;const root=descriptors.find((d:any)=>d.ns==='storage-json')?.value?.root;
            if((route?.routes?.[lab.domainName]??route?.backend)==='json'&&typeof root==='string')storagePath=join(root,lab.domainName+'.json');}catch{/* No guessed paths. */}
          value={...lab.view(),installation,update:updates.state,storagePath};
        }else if(op==='feedback'){
          if(Object.keys(args).sort().join(',')!=='id,rating,revision'||typeof args.id!=='string'||!/^[a-f0-9-]{36}$/i.test(args.id)||typeof args.rating!=='string'||!Number.isSafeInteger(args.revision))throw Error('invalid-request');
          value=await lab.feedback(args.id,args.rating,args.revision);
        }else if(op==='clear'){
          if(Object.keys(args).length!==1||args.confirm!==true)throw Error('confirmation-required');value=await lab.clear();
        }else if(op==='export'){
          if(Object.keys(args).length!==1||!['json','csv'].includes(args.format))throw Error('invalid-request');value=await lab.export(args.format);
        }else if(op==='checkUpdates'){
          if(Object.keys(args).length)throw Error('invalid-request');value=await updates.check(installation);
        }else throw Error('unknown-operation');
        return {ok:true,value};
      }catch{return{ok:false,error:{code:'lab/rejected',message:'操作未完成：请刷新后重试，检查存储状态或记录修订。',details:{}}};}
    };
    // The target's rpc.handle captures a shadow Context without webServer injection.
    // Exact Fetch routes share native /api admission without taking Gateway's interceptor.
    for(const op of ['read','feedback','clear','export','checkUpdates'])child.effect(()=>connection.fetch.register({
      path:'/api/adaptiveRouterLab/'+op,methods:['POST'],requestBody:'streaming',
      async fetch(request:Request){
        const admission=connection.admit(request);
        if(!admission||'rejection'in admission)return new Response(null,{status:admission?.rejection??403});
        if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return new Response(null,{status:415});
        const reader=request.body?.getReader();let bytes=0;const parts:Uint8Array[]=[];
        try{
          if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4096){await reader.cancel();return new Response(null,{status:413});}parts.push(part.value);}
          const message=JSON.parse(Buffer.concat(parts).toString('utf8'));
          if(message.type!=='client-request'||typeof message.rpcId!=='string'||!message.rpcId.length||message.rpcId.length>128||message.method!=='adaptiveRouterLab/'+op)return new Response(null,{status:400});
          const result=await handle(op,message.payload,request.signal,admission.peer);
          return Response.json({type:'server-response',rpcId:message.rpcId,result});
        }catch{return new Response(null,{status:400});}
      },
    }));
  });
  ctx.effect(()=>async()=>{closed=true;updates.close();await lab.close();});
}
