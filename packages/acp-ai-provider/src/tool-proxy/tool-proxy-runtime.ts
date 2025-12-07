#!/usr/bin/env node
// deno-lint-ignore-file
/**
 * Tool Proxy Runtime Code
 *
 * This file exports the minified runtime code as a string constant.
 * It is used by the ToolProxyHost to inline the runtime logic when
 * spawning the proxy process using `node -e` or `deno eval`.
 *
 * Logic:
 * 1. polyglot detection (Node vs Deno)
 * 2. Connects to host via TCP (env ACP_TOOL_PROXY_PORT)
 * 3. Fetches tool definitions via 'getTools' request
 * 4. Proxies tool calls back to host via 'callHandler'
 */

export const RUNTIME_CODE = `
// MCP Protocol Version (2024-11-05 is the current stable spec)
const isDeno=typeof Deno!=="undefined",MCP_VER="2024-11-05";
let tools=[],host=null,pending=new Map,buf="",hbuf="",rid=0;
const env=k=>isDeno?Deno.env.get(k):process.env[k];
const write=async m=>{
  const s=JSON.stringify(m)+"\\n";
  if(isDeno)await Deno.stdout.write(new TextEncoder().encode(s));
  else process.stdout.write(s);
};
const send=(id,r,e)=>write({jsonrpc:"2.0",id,...(e?{error:e}:{result:r})});
const hostReq=(m,p)=>new Promise((res,rej)=>{
  const id="r-"+ ++rid;
  const s=JSON.stringify({jsonrpc:"2.0",id,method:m,params:p})+"\\n";
  if(isDeno)host.write(new TextEncoder().encode(s));
  else host.write(s);
  const t=setTimeout(()=>{pending.delete(id);rej(new Error("timeout"))},30000);
  pending.set(id,{resolve:v=>{clearTimeout(t);res(v)},reject:e=>{clearTimeout(t);rej(e)}});
});
const init=async()=>{
  const p=parseInt(env("ACP_TOOL_PROXY_PORT")||"0",10);
  if(p){
    if(isDeno){
      host=await Deno.connect({hostname:"127.0.0.1",port:p});
      (async()=>{
        const d=new TextDecoder(),b=new Uint8Array(65536);
        while(true){const n=await host.read(b);if(!n)break;
        hbuf+=d.decode(b.subarray(0,n));let ls=hbuf.split("\\n");hbuf=ls.pop();
        for(let l of ls)if(l.trim())onHostMsg(l)}})();
    }else{
      host=require("net").createConnection({host:"127.0.0.1",port:p});
      await new Promise(r=>host.on("connect",r));
      host.on("data",d=>{hbuf+=d;let ls=hbuf.split("\\n");hbuf=ls.pop();
        for(let l of ls)if(l.trim())onHostMsg(l)});
    }
    try{tools=await hostReq("getTools")}catch(e){
       const m="Failed to get tools: "+e.message+"\\n";
       if(isDeno)Deno.stderr.write(new TextEncoder().encode(m));
       else process.stderr.write(m);
    }
  }
};
const onHostMsg=l=>{try{let r=JSON.parse(l),h=pending.get(r.id);
  if(h){pending.delete(r.id);r.error?h.reject(new Error(r.error.message)):h.resolve(r.result)}}catch{}};
const handle=async l=>{let m;try{m=JSON.parse(l)}catch{return}if(m.jsonrpc!=="2.0")return;
  if(m.method==="initialize")send(m.id,{protocolVersion:MCP_VER,capabilities:{tools:{}},serverInfo:{name:"proxy",version:"1.0"}});
  else if(m.method==="notifications/initialized");
  else if(m.method==="tools/list")send(m.id,{tools:tools.map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema}))});
  else if(m.method==="tools/call"){let p=m.params,t=tools.find(x=>x.name===p.name);
    if(!t)send(m.id,null,{code:-32601,message:"Not found"});
    else try{let r=await hostReq("callHandler",{name:p.name,args:p.arguments||{}});send(m.id,r)}
    catch(e){send(m.id,{content:[{type:"text",text:"Error: "+e.message}],isError:true})}}
  else send(m.id,null,{code:-32601,message:"Unknown"});
};
init().then(async()=>{
  if(isDeno){
    const d=new TextDecoder(),b=new Uint8Array(65536);
    while(true){const n=await Deno.stdin.read(b);if(!n)break;
      buf+=d.decode(b.subarray(0,n));let ls=buf.split("\\n");buf=ls.pop();for(let l of ls)if(l.trim())handle(l)}
  }else{
    process.stdin.setEncoding("utf8");
    process.stdin.on("data",c=>{buf+=c;let ls=buf.split("\\n");buf=ls.pop();for(let l of ls)if(l.trim())handle(l)});
  }
});
`.trim().replace(/\n/g, "");
