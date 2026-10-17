#!/usr/bin/env node
import readline from 'node:readline';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
let n=0;
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.id===undefined)continue;
 switch(m.method){
 case 'initialize':send({id:m.id,result:{userAgent:'fake'}});break;
 case 'account/read':send({id:m.id,result:{account:{type:'chatgpt',planType:'test'}}});break;
 case 'model/list':send({id:m.id,result:{data:[{model:'test-model',displayName:'Test model',isDefault:true}]}});break;
 case 'account/login/start':send({id:m.id,result:{type:'chatgptDeviceCode',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-0000',loginId:'login-test'}});break;
 case 'thread/start':send({id:m.id,result:{thread:{id:'thread-'+(++n)}}});break;
 case 'turn/start':{
  const threadId=m.params.threadId,obs=JSON.parse(m.params.input[0].text);
  send({id:m.id,result:{turn:{id:'turn-'+n,status:'inProgress'}}});
  if(obs.name==='IgnoreTermination'){process.on('SIGTERM',()=>{});writeFileSync(join(process.env.CODEX_HOME,'test-worker.pid'),String(process.pid));setInterval(()=>{},1000);break;}
  if(obs.name==='CrashWorker')process.exit(37);
  if(obs.name==='TriggerFailure'){send({method:'turn/completed',params:{threadId,turn:{status:'failed'}}});break;}
  send({method:'thread/tokenUsage/updated',params:{threadId,tokenUsage:{last:{inputTokens:120,outputTokens:30}}}});
  send({method:'item/completed',params:{threadId,item:{type:'agentMessage',text:JSON.stringify({action:'wait',target:'none',message:'',reason:'I will observe.'})}}});
  send({method:'turn/completed',params:{threadId,turn:{status:'completed'}}});break;
 }
 default:send({id:m.id,result:{}});
 }
}
