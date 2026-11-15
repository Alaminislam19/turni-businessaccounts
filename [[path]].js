// Cloudflare Pages Function: protected Google Sheets snapshot API.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const b64u=s=>btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
const decode=s=>JSON.parse(new TextDecoder().decode(unb64(s)));
let jwksCache={keys:null,at:0};
async function checkAccess(req,env){
  const team=env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const aud=env.ACCESS_AUD;
  if(!team||!aud)throw new Error('Access configuration missing');
  const token=req.headers.get('Cf-Access-Jwt-Assertion');
  if(!token)throw new Error('Access token missing');
  const [h,p,s,...extra]=token.split('.');if(!h||!p||!s||extra.length)throw new Error('Malformed token');
  const header=decode(h),payload=decode(p);
  if(header.alg!=='RS256'||!header.kid)throw new Error('Unexpected JWT algorithm');
  if(payload.iss!==`https://${team}`||!Array.isArray(payload.aud)||!payload.aud.includes(aud)||!Number.isFinite(payload.exp)||payload.exp<=Date.now()/1000||!Number.isFinite(payload.iat)||payload.iat>Date.now()/1000+60)throw new Error('Invalid Access claims');
  if(!jwksCache.keys||Date.now()-jwksCache.at>300000){const r=await fetch(`https://${team}/cdn-cgi/access/certs`);if(!r.ok)throw new Error('Access keys unavailable');jwksCache={keys:(await r.json()).keys,at:Date.now()}}
  let jwk=jwksCache.keys.find(k=>k.kid===header.kid);
  if(!jwk){jwksCache.keys=null;throw new Error('Unknown Access key: retry');}
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(s),new TextEncoder().encode(`${h}.${p}`)))throw new Error('Invalid Access signature');
}
let tokenCache={token:'',until:0};
async function googleToken(env){
  if(tokenCache.until>Date.now()+60000)return tokenCache.token;
  const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}');
  if(!sa.client_email||!sa.private_key||!sa.token_uri)throw new Error('Google credentials missing');
  if(sa.token_uri!=='https://oauth2.googleapis.com/token')throw new Error('Unexpected token endpoint');
  const pkcs8=unb64(sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'').replace(/\+/g,'-').replace(/\//g,'_'));
  const key=await crypto.subtle.importKey('pkcs8',pkcs8,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const h=b64u(new TextEncoder().encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p=b64u(new TextEncoder().encode(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:sa.token_uri,iat:now,exp:now+3600})));
  const sig=b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(`${h}.${p}`)));
  const r=await fetch(sa.token_uri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${h}.${p}.${sig}`})});
  if(!r.ok)throw new Error('Google authentication failed');
  const x=await r.json();tokenCache={token:x.access_token,until:Date.now()+Math.min(x.expires_in||3600,3600)*1000};return tokenCache.token;
}
async function sheet(env,method,range,body){
  const id=env.SHEET_ID;if(!id||!/^[\w-]+$/.test(id))throw new Error('SHEET_ID missing/invalid');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}${method==='PUT'?'?valueInputOption=RAW':''}`;
  const r=await fetch(url,{method,headers:{authorization:`Bearer ${await googleToken(env)}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw new Error(`Google Sheets API failed (${r.status}). Check sharing, tab name and permissions.`);
  return r.json();
}
async function state(env){const d=await sheet(env,'GET','AppState!A2:C2');const row=d.values?.[0]||[];const revision=Number(row[0]||0);if(!Number.isSafeInteger(revision)||revision<0)throw new Error('Invalid sheet revision');return{revision,state:row[1]?JSON.parse(row[1]):null,updatedAt:row[2]||null}}
export async function onRequest({request,env}){
  try{
    await checkAccess(request,env);
    const path=new URL(request.url).pathname;
    if(path==='/api/health'&&request.method==='GET')return json({ok:true,access:'verified'});
    if(path==='/api/state'&&request.method==='GET')return json(await state(env));
    if(path==='/api/state'&&request.method==='PUT'){
      if(Number(request.headers.get('content-length')||0)>3500000)return json({error:'Payload too large'},413);
      const raw=await request.text();if(raw.length>3500000)return json({error:'Payload too large'},413);
      let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
      if(!Number.isSafeInteger(data.revision)||data.revision<0||!data.state||typeof data.state!=='object'||!Array.isArray(data.state.o)||!Array.isArray(data.state.p))return json({error:'Invalid state or revision'},400);
      const previous=await state(env);
      if(previous.revision!==data.revision)return json({error:'Version conflict',revision:previous.revision},409);
      const next=previous.revision+1;
      await sheet(env,'PUT','AppState!A2:C2',{range:'AppState!A2:C2',majorDimension:'ROWS',values:[[next,JSON.stringify(data.state),new Date().toISOString()]]});
      return json({ok:true,revision:next});
    }
    return json({error:'Not found'},404);
  }catch(e){const message=String(e?.message||e);if(/Access|JWT|token missing|signature|claims/i.test(message))return json({error:'Unauthorized'},401);console.error('API failure',message);return json({error:'Backend configuration or Sheets request failed. Check Cloudflare logs.'},500)}
}
