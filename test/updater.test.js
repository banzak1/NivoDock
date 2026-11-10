const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createUpdater,fetchBuffer}=require('../updater');const {keys,envelope,artifact}=require('../test-support/update-fixture.cjs');
const signing=keys();
function fixture(t,extra={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-updater-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'node.exe'),'runtime');fs.writeFileSync(path.join(root,'update-channel.json'),JSON.stringify(signing.policy));return {root,...extra};}
const options=f=>({...f,version:'1.5.0',port:47955,platform:'win32'});
test('unpublished channel stays quiet without network and cannot install',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'update-channel.json'),JSON.stringify({...signing.policy,manifestUrl:''}));let calls=0;
 const updater=createUpdater(options({...f,get:async()=>{calls++;}}));assert.equal((await updater.check()).state,'unconfigured');assert.equal(calls,0);await assert.rejects(updater.install('1.5.1'));assert.equal(updater.status().canInstall,false);
});
test('checks deduplicate; no installation happens without explicit request; stale selections and active games block apply',async t=>{
 const f=fixture(t),a=artifact();let calls=0,installs=0,busy=false;
 const updater=createUpdater(options({...f,isBusy:()=>busy,get:async address=>{calls++;await new Promise(r=>setTimeout(r,10));return envelope(a.release,signing.privateKey);},handoff:async()=>{installs++;}}));
 await Promise.all([updater.check(),updater.check()]);assert.equal(calls,1);assert.equal(updater.status().state,'available');assert.equal(installs,0);
 await assert.rejects(updater.install('1.5.2'),/mudou/);busy=true;assert.equal(updater.status().canInstall,false);await assert.rejects(updater.install('1.5.1'),/Encerre/);assert.equal(installs,0);
});
test('a game started during download defers installation and resume uses the already verified package',async t=>{
 const f=fixture(t),a=artifact();let busy=false,installs=0,downloads=0;
 const updater=createUpdater(options({...f,isBusy:()=>busy,get:async(address,opts)=>{if(address.endsWith('latest.json'))return envelope(a.release,signing.privateKey);downloads++;busy=true;opts.onProgress(a.buffer.length);return a.buffer;},handoff:async({release})=>{assert.equal(release.version,'1.5.1');installs++;}}));
 await updater.check();await updater.install('1.5.1');await updater.waitForWork();assert.equal(updater.status().state,'ready');assert.equal(installs,0);
 busy=false;await updater.install('1.5.1');await updater.waitForWork();assert.equal(installs,1);assert.equal(downloads,1);
});
test('bad signatures, corrupt packages, incompatible minimum versions and downgrades never execute a worker',async t=>{
 const f=fixture(t);let payload=artifact(),invalidSignature=false,corruptDownload=false,installs=0;
 const updater=createUpdater(options({...f,get:async address=>address.endsWith('latest.json')?envelope(payload.release,invalidSignature?keys().privateKey:signing.privateKey):(corruptDownload?Buffer.from('corrupt'):payload.buffer),handoff:async()=>{installs++;}}));
 invalidSignature=true;await updater.check();assert.equal(updater.status().state,'error');assert.equal(updater.status().availableVersion,'');invalidSignature=false;
 payload=artifact('1.4.9');payload.release.minimumVersion='1.0.0';await updater.check();assert.equal(updater.status().state,'upToDate');
 payload=artifact('1.5.1');payload.release.minimumVersion='1.5.1';await updater.check();assert.equal(updater.status().requiresManualInstall,true);assert.equal(updater.status().canInstall,false);
 payload=artifact('1.5.1');corruptDownload=true;await updater.check();await updater.install('1.5.1');await updater.waitForWork();assert.equal(updater.status().state,'error');assert.equal(installs,0);
});
test('previously announced newer versions cannot be replaced by an older feed',async t=>{
 const f=fixture(t);let a=artifact('1.5.3');const updater=createUpdater(options({...f,get:async()=>envelope(a.release,signing.privateKey)}));await updater.check();a=artifact('1.5.2');await updater.check();assert.equal(updater.status().state,'error');assert.equal(updater.status().availableVersion,'1.5.3');
});
test('offline errors leave the app usable and HTTP update transports are rejected',async t=>{
 const f=fixture(t);const updater=createUpdater(options({...f,get:async()=>{throw new Error('Offline');}}));await updater.check();assert.equal(updater.status().state,'error');assert.equal(updater.isApplying(),false);await assert.rejects(fetchBuffer('http://example.com/update',{limit:1024}),/HTTPS/);
});
test('publisher signs the exact validated package and rejects mismatched keys, channels and destructive output',async t=>{
 const {releaseInfo}=require('../update-core');const root=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-publish-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=path.join(root,'app');fs.mkdirSync(path.join(app,'scripts'),{recursive:true});
 for(const name of ['update-core.js','scripts/sign-update.cjs'])fs.copyFileSync(path.join(__dirname,'..',name),path.join(app,name));
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({version:'1.5.1'}));fs.writeFileSync(path.join(app,'update-channel.json'),JSON.stringify(signing.policy));
 const artifactWithPolicy=artifact('1.5.1',{'update-channel.json':JSON.stringify(signing.policy)}),archive=path.join(root,'app.zip'),key=path.join(root,'private.pem'),output=path.join(root,'latest.json');
 fs.writeFileSync(archive,artifactWithPolicy.buffer);const secret=signing.privateKey.export({type:'pkcs8',format:'pem'});fs.writeFileSync(key,secret,{mode:0o600});
 const {signUpdate}=require(path.join(app,'scripts/sign-update.cjs'));const params={packagePath:archive,packageUrl:'https://updates.example/app.zip',privateKeyPath:key,output,notes:['Correções.']};
 signUpdate(params);assert.equal(releaseInfo(fs.readFileSync(output),signing.policy).sha256,artifactWithPolicy.release.sha256);
 assert.equal(fs.readFileSync(output,'utf8').includes('PRIVATE KEY'),false);assert.throws(()=>signUpdate({...params,output:key}),/substituir/);assert.equal(fs.readFileSync(key,'utf8'),secret);
 const wrong=path.join(root,'wrong.pem');fs.writeFileSync(wrong,keys().privateKey.export({type:'pkcs8',format:'pem'}));assert.throws(()=>signUpdate({...params,privateKeyPath:wrong}),/assinatura/);
 fs.writeFileSync(path.join(app,'update-channel.json'),JSON.stringify({...signing.policy,manifestUrl:'https://other.example/latest.json'}));assert.throws(()=>signUpdate(params),/outro canal/);
});
