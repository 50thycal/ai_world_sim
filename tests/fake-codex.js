#!/usr/bin/env node
import readline from 'node:readline';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
let n=0,threadParams;
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.id===undefined)continue;
 switch(m.method){
 case 'initialize':send({id:m.id,result:{userAgent:'fake'}});break;
 case 'account/read':send({id:m.id,result:{account:{type:'chatgpt',planType:'test'}}});break;
 case 'model/list':send({id:m.id,result:{data:[{model:'test-model',displayName:'Test model',isDefault:true}]}});break;
 case 'account/login/start':send({id:m.id,result:{type:'chatgptDeviceCode',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-0000',loginId:'login-test'}});break;
 case 'thread/start':threadParams=m.params;send({id:m.id,result:{thread:{id:'thread-'+(++n)}}});break;
 case 'turn/start':{
  const threadId=m.params.threadId,obs=JSON.parse(m.params.input[0].text);
  // Test-only wire capture in a disposable fake account, never the production client.
  if(obs.currentFacts||obs.name==='CaptureGrounding')writeFileSync(join(process.env.CODEX_HOME,'test-protocol.json'),JSON.stringify({thread:threadParams,turn:m.params}));
  send({id:m.id,result:{turn:{id:'turn-'+n,status:'inProgress'}}});
  if(obs.name==='IgnoreTermination'){process.on('SIGTERM',()=>{});writeFileSync(join(process.env.CODEX_HOME,'test-worker.pid'),String(process.pid));setInterval(()=>{},1000);break;}
  if(obs.name==='TimeoutWorker'){setInterval(()=>{},1000);break;}
  if(obs.name==='TimeoutOnce'&&!existsSync(join(process.env.CODEX_HOME,'timeout-once.flag'))){writeFileSync(join(process.env.CODEX_HOME,'timeout-once.flag'),'1');setInterval(()=>{},1000);break;}
  if(obs.name==='MessageWithoutCompletion'){send({method:'item/completed',params:{threadId,item:{type:'agentMessage',text:'SECRET-MESSAGE'}}});setInterval(()=>{},1000);break;}
  if(obs.name==='RateLimit'){send({method:'turn/completed',params:{threadId,turn:{status:'failed',error:{codexErrorInfo:'rateLimitExceeded',message:'SECRET-PROVIDER',additionalDetails:'SECRET'}}}});break;}
  if(obs.name==='CrashWorker')process.exit(37);
  if(obs.name==='TriggerFailure'){send({method:'turn/completed',params:{threadId,turn:{status:'failed'}}});break;}
  send({method:'thread/tokenUsage/updated',params:{threadId,tokenUsage:{last:{inputTokens:120,outputTokens:30}}}});
  // Answer in whichever decision shape the adapter's outputSchema requested.
  const decision={action:'wait',target:'none',message:'',reason:'I will observe.',...(m.params.outputSchema?.properties?.item?{item:'none'}:{}),...(m.params.outputSchema?.properties?.price?{price:0,offerId:0}:{})};
  send({method:'item/completed',params:{threadId,item:{type:'agentMessage',text:JSON.stringify(decision)}}});
  send({method:'turn/completed',params:{threadId,turn:{status:'completed'}}});break;
 }
 default:send({id:m.id,result:{}});
 }
}
