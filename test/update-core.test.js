const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {compareVersions,releaseInfo,appPath,zipEntries,packageFiles,safePath,sha256,writeJson}=require('../update-core');
const {restore,recover}=require('../update-worker');
const {zip,keys,envelope,artifact}=require('../test-support/update-fixture.cjs');
const signing=keys();
test('update versions compare numeric components and reject malformed/prerelease values',()=>{
 assert.equal(compareVersions('1.10.0','1.9.9'),1);assert.equal(compareVersions('2.0.0','2.0.0'),0);
 for(const value of ['1.01.0','v1.5.0','1.5','1.5.0-beta','1.5.0;calc','65536.0.0'])assert.throws(()=>compareVersions(value,'1.5.0'));
});
test('release signature authenticates the complete payload and rejects different keys and channels',()=>{
 const {release}=artifact();const signed=envelope(release,signing.privateKey);
 assert.equal(releaseInfo(signed,signing.policy).version,'1.5.1');
 assert.throws(()=>releaseInfo(signed,keys().policy),/assinatura/);
 assert.throws(()=>releaseInfo(signed,{...signing.policy,channel:'beta'}),/incompatível/);
 const altered=JSON.parse(signed);const payload=JSON.parse(Buffer.from(altered.payload,'base64'));payload.url='https://attacker.example/a.zip';altered.payload=Buffer.from(JSON.stringify(payload)).toString('base64');assert.throws(()=>releaseInfo(Buffer.from(JSON.stringify(altered)),signing.policy),/assinatura/);
 for(const patch of [{url:'http://updates.example/a.zip'},{url:'https://user:password@example.com/a.zip'},{platform:'linux'},{size:9999999999},{minimumVersion:'2.0.0'},{notes:['x'.repeat(1001)]}])assert.throws(()=>releaseInfo(envelope({...release,...patch},signing.privateKey),signing.policy));
});
test('packages must match signed hash, internal version, complete inventory and every file hash',()=>{
 const {buffer,release}=artifact();assert.equal(packageFiles(buffer,release).get('VERSION').toString(),'1.5.1');
 const corrupt=Buffer.from(buffer);corrupt[40]^=1;assert.throws(()=>packageFiles(corrupt,release),/assinatura publicada/);
 const wrong=artifact('1.5.1',{'VERSION':'1.5.2'});assert.throws(()=>packageFiles(wrong.buffer,wrong.release),/Versão interna/);
 const extra=artifact('1.5.1',{},[['NivoDock/private.txt','secret']]);assert.throws(()=>packageFiles(extra.buffer,extra.release),/adicionais/);
 const malicious=artifact('1.5.1',{'games.json':'[]'});assert.throws(()=>packageFiles(malicious.buffer,malicious.release),/fora da aplicação/);
});
test('ZIP reader rejects traversal, alias duplicates, symlinks, corruption and truncation',()=>{
 for(const name of ['../server.js','NivoDock/../../config.json','C:\\Windows\\evil.js','NivoDock/CON.txt','NivoDock/server.js:stream'])assert.throws(()=>zipEntries(zip([[name,'bad']])));
 assert.throws(()=>zipEntries(zip([['NivoDock/a.js','one'],['NivoDock/A.js','two']])),/duplicados/);
 assert.throws(()=>zipEntries(zip([['NivoDock/a.js','target']],{symlink:'NivoDock/a.js'})),/suportada/);
 assert.throws(()=>zipEntries(zip([['NivoDock/a.js','hello']],{corruptCRC:true})),/corrompido/);
 assert.throws(()=>zipEntries(zip([['NivoDock/a.js','hello']]).subarray(0,-5)),/incompleto/);
});
test('user library, config, saves, cache, profiles and developer files are never update destinations',()=>{
 for(const name of ['games.json','config.json','.deck-profile/Default/Preferences','backups/save.sav','public/artwork/a.png','.updates/result.json','.git/config','node_modules/evil.js'])assert.throws(()=>appPath(name));
 for(const name of ['server.js','update-channel.json','public/update-ui.js','public/brand/icon.svg'])assert.equal(appPath(name),name);
});
test('update destinations reject filesystem junctions rather than writing through them',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-update-link-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-outside-'));t.after(()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'public'));fs.symlinkSync(outside,path.join(root,'public','brand'),'junction');
 assert.throws(()=>safePath(root,'public/brand/icon.svg'),/Link/);assert.equal(fs.readdirSync(outside).length,0);
});
test('rollback validates all backups before restoring, removes new app files and preserves personal data',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-rollback-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const backup='backup-'+'a'.repeat(32);fs.mkdirSync(path.join(root,'.updates',backup),{recursive:true});
 fs.writeFileSync(path.join(root,'server.js'),'new');fs.writeFileSync(path.join(root,'new-module.js'),'new module');fs.writeFileSync(path.join(root,'games.json'),'private library');
 fs.writeFileSync(path.join(root,'.updates',backup,'server.js'),'old');
 const journal={backup,fromVersion:'1.5.0',toVersion:'1.5.1',port:47955,phase:'applying',files:[{path:'server.js',existed:true,originalHash:sha256(Buffer.from('old'))},{path:'new-module.js',existed:false}]};
 assert.throws(()=>restore(root,{...journal,files:[{...journal.files[0],originalHash:'0'.repeat(64)}]}),/Backup/);assert.equal(fs.readFileSync(path.join(root,'server.js'),'utf8'),'new');
 restore(root,journal);assert.equal(fs.readFileSync(path.join(root,'server.js'),'utf8'),'old');assert.equal(fs.existsSync(path.join(root,'new-module.js')),false);assert.equal(fs.readFileSync(path.join(root,'games.json'),'utf8'),'private library');
 writeJson(path.join(root,'.updates','transaction.json'),{...journal,phase:'backingUp',id:'a'.repeat(32)});await recover(root);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.updates','transaction.json'))).phase,'cancelled');
});
