// Optional observation layer. Never called from Provider admission or awaited by routing.
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ConfigValues } from './config.js';
import { engineFor } from './diagnostics.js';
const textFields = ['experimentConfigRevision','routingMode','classifierEngine','classifierModel','sessionScope','source','tier','role','relation','confidenceKind','plannedProvider','plannedModel','plannedEffort','actualProvider','actualModel','actualEffort','control','reasonCode','turnFinishReason','usageSource','durationSource','qualitySource','rating'] as const;
const numberFields = ['turnNumber','confidence','classifierElapsedMs','elapsedMs','modelRequestCount','toolStepCount','retryCount','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','feedbackTimestamp'] as const;
const tokenFields = ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'] as const;
type Compaction = {attempts:number;completed:number;failed:number;providerOverflows:number;trigger:'provider-overflow'|'router-capacity-check'|'mixed'|'unknown';recovered:boolean|null};
const newCompaction=():Compaction=>({attempts:0,completed:0,failed:0,providerOverflows:0,trigger:'unknown',recovered:null});
type Route = { provider: string; model: string; count: number; efforts: Record<string, number> };
export type LabRow = { compaction?:Compaction; requestAttribution?: 'message-source' | 'legacy-header'; schemaVersion: 1; recordId: string; timestamp: number; revision: number; routerBuildVersion: string; routerBuildCommit: string | null; fallbackApplied: boolean; routes: Route[]; routesTruncated: boolean }
  & Record<typeof textFields[number], string | null> & Record<typeof numberFields[number], number | null>;
const textShape = Object.fromEntries(textFields.map(k=>[k,z.string().max(160).nullable()])) as Record<typeof textFields[number], z.ZodNullable<z.ZodString>>;
const numberShape = Object.fromEntries(numberFields.map(k=>[k,z.number().finite().nonnegative().nullable()])) as Record<typeof numberFields[number], z.ZodNullable<z.ZodNumber>>;
const rowSchema = z.object({ compaction:z.object({attempts:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),failed:z.number().int().nonnegative(),providerOverflows:z.number().int().nonnegative(),trigger:z.enum(['provider-overflow','router-capacity-check','mixed','unknown']),recovered:z.boolean().nullable()}).strict().optional(), requestAttribution:z.enum(['message-source','legacy-header']).optional(),schemaVersion:z.literal(1),recordId:z.string().uuid(),timestamp:z.number().nonnegative(),revision:z.number().int().positive(),routerBuildVersion:z.string().max(80),routerBuildCommit:z.string().max(40).nullable(),fallbackApplied:z.boolean(),routesTruncated:z.boolean(),
  routes:z.array(z.object({provider:z.string().max(160),model:z.string().max(160),count:z.number().int().nonnegative(),efforts:z.record(z.string().max(80),z.number().int().nonnegative())}).strict()).max(16),
  ...textShape,...numberShape }).strict().refine(r=>Buffer.byteLength(JSON.stringify(r))<=4096) as z.ZodType<LabRow>;
const snapshotSchema=z.object({schemaVersion:z.literal(1),salt:z.string().uuid(),records:z.array(rowSchema).max(5000)}).strict();
type Snapshot=z.infer<typeof snapshotSchema>;
export interface LabDomain { global: {get():Snapshot;set(value:Snapshot):Promise<void>};close():Promise<void> }
export interface LabStorage {open(spec:object):Promise<LabDomain>}
const accepted=new Set(['turn/start','turn/end','step/start','request/header','tool/call','assistant/message','assistant/attempt','llm/retry-started','compaction/start','compaction/end']);
const str=(v:unknown)=>typeof v==='string' && v.length<=160 ? v : null;
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0 ? v : null;
const blank=()=>({schemaVersion:1 as const,salt:randomUUID(),records:[]});
export function localOperator(connection:any, server:any, peer:unknown):boolean {
  return !!connection?.operator && peer===connection.operator && connection.allowsRemoteAuthorities===false
    && ['127.0.0.1','::1','localhost','[::1]'].includes(server?.host);
}
export function summarize(rows:LabRow[]) {
  const totals=Object.fromEntries(tokenFields.map(k=>[k,{value:0,coverage:0}]));
  const controls:Record<string,number>={},outcomes:Record<string,number>={},feedback:Record<string,number>={},models=new Map<string,any>();
  let classified=0,elapsed=0,latencyCount=0;
  const compactions={observedTurns:0,unknownTurns:0,attempts:0,completed:0,failed:0,recoveredTurns:0};
  const requestAttribution={confirmed:0,unknown:0,total:0,legacyTurns:0,countMissingTurns:0};
  const addRoute=(route:Route,tier:string|null)=>{const key=JSON.stringify([route.provider,route.model]);const m=models.get(key)??{provider:route.provider,model:route.model,requests:0,efforts:Object.create(null),tiers:Object.create(null)};m.requests+=route.count;
    for(const [effort,n]of Object.entries(route.efforts))m.efforts[effort]=(m.efforts[effort]??0)+n;
    m.tiers[tier??'unknown']=(m.tiers[tier??'unknown']??0)+route.count;models.set(key,m);};
  for(const r of rows){if(r.compaction){compactions.observedTurns++;compactions.attempts+=r.compaction.attempts;compactions.completed+=r.compaction.completed;compactions.failed+=r.compaction.failed;if(r.compaction.recovered===true)compactions.recoveredTurns++;}else compactions.unknownTurns++;
    controls[r.control??'unknown']=(controls[r.control??'unknown']??0)+1;outcomes[r.turnFinishReason??'unknown']=(outcomes[r.turnFinishReason??'unknown']??0)+1;
    if(r.rating)feedback[r.rating]=(feedback[r.rating]??0)+1;
    if(r.tier)classified++;
    if(r.tier&&['Jev','NeoHorse'].includes(r.source??'')&&r.classifierElapsedMs!==null){elapsed+=r.classifierElapsedMs;latencyCount++;}
    for(const k of tokenFields)if(r[k]!==null){totals[k].value+=r[k]!;totals[k].coverage++;}
    if(r.modelRequestCount===null)requestAttribution.countMissingTurns++;else requestAttribution.total+=r.modelRequestCount;
    let accounted=0;
    if(r.requestAttribution==='message-source')for(const route of r.routes){addRoute(route,r.tier);accounted+=route.count;if(route.provider!=='unknown'||route.model!=='unknown')requestAttribution.confirmed+=route.count;}
    else requestAttribution.legacyTurns++;
    const unrepresented=Math.max(0,(r.modelRequestCount??0)-accounted);
    if(unrepresented)addRoute({provider:'unknown',model:'unknown',count:unrepresented,efforts:{unknown:unrepresented}},r.tier);
  }
  for(const k of tokenFields)if(!totals[k].coverage)(totals[k] as {value:number|null}).value=null;
  requestAttribution.unknown=requestAttribution.total-requestAttribution.confirmed;
  return {compactions,requestAttribution,turns:rows.length,classified,controls,outcomes,feedback,feedbackCount:Object.values(feedback).reduce((a,b)=>a+b,0),fallbackApplied:rows.filter(r=>r.fallbackApplied).length,
    tokenCoverage:rows.filter(r=>r.inputTokens!==null&&r.outputTokens!==null).length,tokens:totals,classifierLatency:{meanMs:latencyCount?elapsed/latencyCount:null,coverage:latencyCount},
    models:[...models.values()].slice(0,50),modelsTruncated:models.size>50,distributionTruncated:rows.filter(r=>r.routesTruncated).length,configRevisions:new Set(rows.map(r=>r.experimentConfigRevision)).size};
}
const csvColumns=['schemaVersion','recordId','timestamp','routerBuildVersion','routerBuildCommit',...textFields,...numberFields,'fallbackApplied','requestAttribution','compaction'] as const;
export function exportCsv(rows:LabRow[]) {const cell=(v:unknown)=>{let s=v==null?'':String(v);if(/^[\s]*[=+\-@\t\r\n]/u.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+csvColumns.join(',')+'\r\n'+rows.map(r=>csvColumns.map(k=>cell(k==='compaction'?(r.compaction?JSON.stringify(r.compaction):null):k==='requestAttribution'?(r.requestAttribution??'legacy-header'):r[k])).join(',')).join('\r\n');}
export class RouterLab {
  private domain?:LabDomain;private rows:LabRow[]=[];private salt:string=randomUUID();private pending=new Map<string,LabRow>();
  private active=new Map<string,{row:LabRow;lastSeq:number;lastTool:number;lastStep:number;compactionId?:string;compactionFinished?:boolean;compactionSucceeded?:boolean}>();
  private timer?:ReturnType<typeof setTimeout>;private chain:Promise<unknown>=Promise.resolve();private epoch=0;private closed=false;private clearing=false;
  error:string|null=null;dropped=0;readonly domainName:string;
  constructor(private config:()=>ConfigValues,scope:string,private version:string,private clock=()=>Date.now()) {this.domainName='adaptive_router_lab_'+createHash('sha256').update(scope).digest('hex').slice(0,16);}
  async open(storage:LabStorage) {try {this.domain=await storage.open({name:this.domainName,version:1,tables:{},global:{schema:snapshotSchema,initial:blank()}});
    if(this.closed){await this.domain.close();return;}const saved=snapshotSchema.parse(this.domain.global.get());this.salt=saved.salt;this.rows=this.prune(saved.records);if(this.rows.length!==saved.records.length)await this.domain.global.set({schemaVersion:1,salt:this.salt,records:this.rows});
  }catch{await this.domain?.close().catch(()=>{});this.domain=undefined;this.error='storage-unavailable';}}
  sync() {if(!this.config().enabled||!this.config().labEnabled)this.active.clear();}
  decision(sessionId:string,decision:any){const a=this.active.get(String(sessionId));if(!a||(decision.turn!==undefined&&decision.turn!==a.row.turnNumber))return;const r=a.row;
    // Later manual/native passes have no new classification; do not erase known facts.
    if(str(decision.source)!==null)r.source=str(decision.source);
    if(str(decision.tier)!==null){r.tier=str(decision.tier);r.role=str(decision.role);r.relation=str(decision.relation);
      r.confidence=typeof decision.confidence==='number'&&decision.confidence>=0&&decision.confidence<=1?decision.confidence:null;
      r.confidenceKind=r.confidence===null?'unknown':r.source==='NeoHorse'?'distribution-statistic':r.source==='Local'?'local-rule':'jev-reported';}
    if(count(decision.elapsedMs)!==null)r.classifierElapsedMs=count(decision.elapsedMs);
    r.control=str(decision.control);r.reasonCode=typeof decision.reason==='string'&&/^[a-z0-9-]{1,64}$/.test(decision.reason)?decision.reason:'unknown';
    if(decision.selection){r.plannedProvider=str(decision.selection.provider);r.plannedModel=str(decision.selection.model);r.plannedEffort=str(decision.selection.reasoningEffort);}
    r.fallbackApplied=r.fallbackApplied||decision.fallbackApplied===true;
  }
  overflow(sessionId:string,turn:number){const active=this.active.get(String(sessionId));if(!active||active.row.turnNumber!==turn)return;const c=active.row.compaction??=newCompaction();c.providerOverflows++;c.trigger=c.trigger==='router-capacity-check'?'mixed':'provider-overflow';}
  capacityRecovery(sessionId:string,turn:number){const active=this.active.get(String(sessionId));if(!active||active.row.turnNumber!==turn)return;const c=active.row.compaction??=newCompaction();c.trigger=c.trigger==='provider-overflow'?'mixed':'router-capacity-check';}
  observe(session:any,event:any) {if(!accepted.has(event.type)||this.closed)return;try{
    const c=this.config();if(!c.enabled||!c.labEnabled){this.active.clear();return;}if(!this.domain||this.clearing||session.header.origin==='subagent'){if(event.type==='turn/start'&&session.header.origin!=='subagent')this.dropped++;return;}
    const id=String(session.id),d=event.data;
    if(event.type==='turn/start'){
      if(this.active.size>=64&&!this.active.has(id)){this.dropped++;return;}
      const strings=Object.fromEntries(textFields.map(k=>[k,null])) as Record<typeof textFields[number],string|null>,numbers=Object.fromEntries(numberFields.map(k=>[k,null])) as Record<typeof numberFields[number],number|null>;
      const fingerprint={mode:c.mode,lockModel:c.lockModel,lockEffort:c.lockEffort,fixedEffort:c.fixedEffort,candidates:c.candidates,threshold:c.confidenceThreshold,classifierModel:c.classifierModel,apiUrl:c.apiUrl,apiKeyEnv:c.apiKeyEnv};
      const hash=(s:string)=>createHmac('sha256',this.salt).update(s).digest('hex').slice(0,32);
      const row={...strings,...numbers,schemaVersion:1,recordId:randomUUID(),timestamp:event.time,revision:1,routerBuildVersion:this.version,routerBuildCommit:null,
        experimentConfigRevision:hash(JSON.stringify(fingerprint)),sessionScope:hash(id),routingMode:c.mode,classifierEngine:engineFor(c),classifierModel:str(c.classifierModel),turnNumber:d.turn,
        requestAttribution:'message-source',modelRequestCount:0,toolStepCount:0,usageSource:'unavailable',durationSource:'observed',qualitySource:'unknown',fallbackApplied:false,routes:[],routesTruncated:false} as LabRow;
      this.active.set(id,{row,lastSeq:event.seq,lastTool:-1,lastStep:0});return;
    }
    const a=this.active.get(id);if(!a||event.seq<=a.lastSeq||(d.turn!==undefined&&d.turn!==a.row.turnNumber))return;a.lastSeq=event.seq;
    const r=a.row;const header=session.requestHeader()?.config;
    r.actualProvider=str(header?.provider);r.actualModel=str(header?.model);r.actualEffort=str(header?.reasoningEffort);
    if(event.type==='compaction/start'){
      const c=r.compaction??=newCompaction();c.attempts++;c.recovered=null;a.compactionId=d.compactionId;a.compactionFinished=false;a.compactionSucceeded=false;
    }
    if(event.type==='compaction/end'&&a.compactionId===d.compactionId){
      const c=r.compaction!;if(d.error!==undefined)c.failed++;else c.completed++;a.compactionId=undefined;a.compactionFinished=true;a.compactionSucceeded=d.error===undefined;
    }
    if(event.type==='assistant/message'&&!d.interrupted&&a.compactionFinished&&a.compactionSucceeded&&r.compaction?.completed)r.compaction.recovered=true;
    if(event.type==='step/start')a.lastStep=d.step;
    if(event.type==='tool/call'&&a.lastTool!==d.step){a.lastTool=d.step;r.toolStepCount!++;}
    if(event.type==='llm/retry-started')r.retryCount=(r.retryCount??0)+1;
    if(event.type==='assistant/message'||event.type==='assistant/attempt'){
      const usage=(event.type==='assistant/message'?d.usage:undefined)??d.stream?.findLast((s:any)=>s.type==='chunk'&&s.chunk?.type==='usage')?.chunk.usage;
      const first=r.modelRequestCount===0;r.modelRequestCount!++;
      for(const k of tokenFields){const n=count(usage?.[k]);r[k]=first?n:r[k]===null||n===null?null:r[k]!+n;if(r[k]!==null&&!Number.isSafeInteger(r[k]))r[k]=null;}
      r.usageSource=r.inputTokens!==null&&r.outputTokens!==null?'provider-reported':(usage||r.usageSource!=='unavailable')?'provider-reported-partial':'unavailable';
      // Native message settlements carry request identity; failed attempts do not.
      const source=event.type==='assistant/message'&&d.message?.source?.kind==='model'?d.message.source:undefined;
      const knownSource=!!str(source?.provider)?.trim()&&!!str(source?.model)?.trim();
      const provider=knownSource?str(source.provider)!:'unknown',model=knownSource?str(source.model)!:'unknown';
      const effort='unknown'; // Neither native settlement event proves per-request effort.
      let route=r.routes.find(m=>m.provider===provider&&m.model===model);if(!route&&r.routes.length<16){route={provider,model,count:0,efforts:{}};r.routes.push(route);}if(route){route.count++;const known=Object.hasOwn(route.efforts,effort);if(effort.length>80||(!known&&Object.keys(route.efforts).length>=16))r.routesTruncated=true;else Object.defineProperty(route.efforts,effort,{value:(known?route.efforts[effort]:0)+1,enumerable:true,configurable:true,writable:true});}else r.routesTruncated=true;
    }
    if(event.type==='turn/end'){
      if(r.compaction&&r.compaction.recovered===null&&(r.control==='Blocked'||d.reason?.kind==='error'&&(r.compaction.failed>0||r.compaction.providerOverflows>0)))r.compaction.recovered=false;
      this.active.delete(id);r.turnFinishReason=['completed','error','aborted','interrupted','blocked','max-tokens','forked'].includes(d.reason?.kind)?d.reason.kind:'unknown';
      r.elapsedMs=event.time>=r.timestamp?event.time-r.timestamp:null;r.durationSource=r.elapsedMs===null?'unavailable':'observed';
      if(r.plannedProvider&&(r.plannedProvider!==r.actualProvider||r.plannedModel!==r.actualModel||(r.plannedEffort??null)!==r.actualEffort)&&!['Blocked','Conflict','Manual'].includes(r.control??'')){r.control='Native';r.reasonCode='native-override';}
      if(!rowSchema.safeParse(r).success){this.dropped++;return;}this.pending.set(r.recordId,r);if(this.pending.size>128){this.pending.delete(this.pending.keys().next().value!);this.dropped++;}
      if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},1000);
    }
  }catch{this.error='observation-failed';}}
  forget(sessionId:string){this.active.delete(String(sessionId));}
  private prune(rows:LabRow[]){let result=rows.filter(r=>r.timestamp>=this.clock()-90*86400000).sort((a,b)=>a.timestamp-b.timestamp).slice(-5000);let bytes=result.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r)),0);while(bytes>8*1024*1024-65536&&result.length)bytes-=Buffer.byteLength(JSON.stringify(result.shift()));return result;}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const job=this.chain.then(fn);this.chain=job.catch(()=>{});return job;}
  async flush(){clearTimeout(this.timer);this.timer=undefined;if(!this.domain)return;const epoch=this.epoch;
    await this.serial(async()=>{if(epoch!==this.epoch)return;const batch=[...this.pending.values()];this.pending.clear();const rows=this.prune([...this.rows,...batch]);if(!batch.length&&rows.length===this.rows.length)return;
      try{await this.domain!.global.set({schemaVersion:1,salt:this.salt,records:rows});this.rows=rows;this.error=null;}
      catch{if(epoch!==this.epoch)return;for(const r of batch)if(!this.pending.has(r.recordId))this.pending.set(r.recordId,r);while(this.pending.size>128){this.pending.delete(this.pending.keys().next().value!);this.dropped++;}this.error='write-failed';}
    });}
  async feedback(id:string,rating:string,revision:number){if(!['met','rework','unknown'].includes(rating))throw Error('invalid-rating');await this.flush();const epoch=this.epoch;
    return this.serial(async()=>{if(this.closed||epoch!==this.epoch||!this.domain)throw Error('unavailable');const index=this.rows.findIndex(r=>r.recordId===id);if(index<0||this.rows[index].revision!==revision)throw Error('record-conflict');
      const rows=this.rows.slice();rows[index]={...rows[index],rating,feedbackTimestamp:this.clock(),qualitySource:'user-feedback',revision:revision+1};await this.domain.global.set({schemaVersion:1,salt:this.salt,records:rows});this.rows=rows;return this.view();});}
  async clear(){this.clearing=true;this.epoch++;this.active.clear();this.pending.clear();clearTimeout(this.timer);this.timer=undefined;
    return this.serial(async()=>{if(this.closed||!this.domain)throw Error('unavailable');const next=blank();await this.domain.global.set(next);this.rows=[];this.pending.clear();this.salt=next.salt;this.error=null;return this.view();}).finally(()=>{this.clearing=false;});}
  view(){return {available:!!this.domain&&!this.closed,domain:this.domainName,error:this.error,clearing:this.clearing,pending:this.pending.size,dropped:this.dropped,summary:summarize(this.rows),recent:structuredClone(this.rows.slice(-25).reverse())};}
  async export(format:string){await this.flush();if(!this.domain||this.error)throw Error('storage-unavailable');if(format==='csv')return exportCsv(this.rows);if(format!=='json')throw Error('invalid-format');return {schemaVersion:1,exportedAt:new Date(this.clock()).toISOString(),experimentMetadata:{unit:'DSH Turn',observational:true,causalEvidence:false},records:structuredClone(this.rows.map(r=>({...r,requestAttribution:r.requestAttribution??'legacy-header'}))),dataQualitySummary:summarize(this.rows)};}
  async close(){this.closed=true;this.active.clear();await this.flush();await this.chain;await this.domain?.close();}
}
