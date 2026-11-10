const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const formats=require('../progress-formats');const fixtures=require('../test-support/progress-fixtures.cjs');const {zip}=require('../test-support/update-fixture.cjs');const {readers,readerFor}=require('../progress-readers');
const reader=id=>readers.find(r=>r.id===id);
test('Skyrim reads Unicode identity and XP from the bounded header, including a reached XP threshold',()=>{
 const data=formats.skyrimHeader(fixtures.skyrim({name:'Herói <script>',xp:492,next:375}));assert.equal(data.name,'Herói <script>');assert.equal(data.level,12);assert.equal(data.xp,492);assert.equal(data.nextXp,375);
 assert.throws(()=>formats.skyrimHeader(Buffer.from('wrong')));assert.throws(()=>formats.skyrimHeader(fixtures.skyrim().subarray(0,30)),e=>e.code==='incomplete');
 const newer=fixtures.skyrim();newer.writeUInt32LE(99,17);assert.throws(()=>formats.skyrimHeader(newer),/versão/);
});
test('Dragonwilds maps explicit skill/item identities and never invents level, difficulty, health maxima or campaign percentages',()=>{
 const input=fixtures.dragon(),bytes=Buffer.from(JSON.stringify(input)),before=Buffer.from(bytes);const result=reader('dragonwilds').parse(bytes);
 assert.equal(result.identity.name,'RUNE');assert.equal(result.skills[0].name,'Corte de madeira');assert.equal(result.skills[0].value,3314);assert.equal(result.skills[0].level,undefined);assert.equal(result.identity.level,undefined);assert.equal(result.equipment[0].name,'Túnica de aventureiro');assert.equal(result.equipment[0].maxDurability,undefined);assert.equal(result.metrics.find(m=>m.id==='recipes').value,2);assert.equal(JSON.stringify(result).includes('99999'),false);assert.equal(result.progress,undefined);assert.deepEqual(bytes,before);
 assert.throws(()=>reader('dragonwilds').parse(Buffer.from(JSON.stringify(fixtures.dragon({version:84})))),/estrutura/);
});
test('NMS validates LZ4 boundaries and keeps expedition balances separate from the main campaign',()=>{
 const input={F2P:4737,XTp:'Season','<h0':{Lg8:3600,Pk4:'Traveller'},vLc:{'6f=':{wGS:75000000,'7QL':2000,'kN;':3000}},'2YS':{'6f=':{wGS:0,'7QL':0,'kN;':0}}};const result=reader('nms').parse(fixtures.nms(input),{file:path.join(os.tmpdir(),'save.hg')});
 assert.equal(result.identity.subtitle,'Expedição ativa');assert.equal(result.metrics.find(m=>m.id==='Units').value,0);assert.equal(result.details.find(m=>m.id==='main-Units').value,75000000);
 assert.equal(formats.lz4Block(Buffer.from([0x32,97,98,99,3,0]),9).toString(),'abcabcabc');assert.throws(()=>formats.lz4Block(Buffer.from([0,0,0]),4),/Referência/);assert.throws(()=>formats.lz4Block(Buffer.from([0xf0,255]),200));
 assert.throws(()=>reader('nms').parse(fixtures.nms({...input,XTp:'Unknown'}),{file:'save.hg'}),/contexto/);
});
test('Megabonk decrypts a known format in memory and preserves zero currency without estimating character levels',()=>{
 const data={gold:0,silver:20,characterProgression:{Fox:{xp:977,numRuns:3}},achievements:['a','a','b'],purchases:['Sword'],menuMeta:{lastSelectedMap:'Forest'}};
 const bytes=fixtures.mega(data),copy=Buffer.from(bytes);const result=reader('megabonk').parse(bytes,{file:path.join(os.tmpdir(),'progression.json'),readCompanion:()=>fixtures.mega({stats:{kills:{name:'kills',value:22001},runs:{name:'runs',value:9}}})});
 assert.equal(result.metrics.find(m=>m.id==='gold').value,0);assert.equal(result.skills[0].value,977);assert.equal(result.skills[0].level,undefined);assert.equal(result.metrics.find(m=>m.id==='kills').value,22001);assert.deepEqual(bytes,copy);assert.throws(()=>formats.megabonkJson(Buffer.from('unrecognized encoding')),/reconhecido/);
});
test('Vampire Survivors reads permanent unlocks instead of treating the selected character as a run level',()=>{
 const result=reader('vampire').parse(Buffer.from(JSON.stringify({Coins:123.5,SelectedCharacter:'Hero',UnlockedCharacters:['one','two'],UnlockedWeapons:['one'],UnlockedStages:['forest'],UnlockedArcanas:[]})),{file:'SaveData.sav'});
 assert.equal(result.metrics.find(m=>m.id==='coins').value,123.5);assert.equal(result.metrics.find(m=>m.id==='characters').value,2);assert.equal(result.identity.level,undefined);
});
test('Minecraft editions never share a decoder or automatic save locations, and world time is not character XP',()=>{
 const bedrock=fixtures.bedrock({LevelName:'Bedrock world',Time:48000,GameType:6});assert.equal(formats.minecraft(bedrock,'bedrock').LevelName,'Bedrock world');assert.throws(()=>formats.minecraft(bedrock,'java'));
 const java=fixtures.java({LevelName:'Java world',DayTime:48000,Time:240000,GameType:0,Player:{XpLevel:7}});assert.equal(formats.minecraft(java,'java').Player.XpLevel,7);assert.throws(()=>formats.minecraft(java,'bedrock'));
 const result=reader('minecraft-java').parse(java,{file:'/world/level.dat'});assert.equal(result.metrics.find(m=>m.id==='days').value,2);assert.equal(result.metrics.find(m=>m.id==='level').value,7);
 assert.equal(readerFor({title:'Minecraft for Windows'}).id,'minecraft-bedrock');assert.equal(readerFor({title:'Minecraft Java Edition'}).id,'minecraft-java');
 const malicious=Buffer.from([10,0,0,9,0,1,97,3,127,255,255,255]);assert.throws(()=>formats.nbt(malicious),/limite/);
});
test('Hytale reads localized item labels selectively from ZIP and uses actual item durability maxima',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nivodock-hytale-reader-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const asset=path.join(root,'Assets.zip');fs.writeFileSync(asset,zip([['Server/Languages/en-US/server.lang','items.Weapon_Sword_Crude.name = Crude Sword\n']]));
 const data={Components:{Nameplate:{Text:'Player'},Player:{Version:5,GameMode:'Adventure',Inventory:{Version:4,ActiveHotbarSlot:0,HotBar:{Items:{0:{Id:'Weapon_Sword_Crude',Durability:61,MaxDurability:80}}},Storage:{Capacity:36,Items:{}}}},EntityStats:{Stats:{Health:{Value:0}}}}};
 const result=reader('hytale').parse(Buffer.from(JSON.stringify(data)),{file:path.join(root,'World','universe','players','id.json'),game:{installation:{assetsPath:asset}}});
 assert.equal(result.equipment[0].name,'Crude Sword');assert.equal(result.equipment[0].durability,61);assert.equal(result.equipment[0].maxDurability,80);assert.equal(result.metrics.find(m=>m.id==='health').value,0);assert.equal(result.identity.level,undefined);
 assert.equal(formats.zipText(asset,['Missing.lang']),'');assert.throws(()=>formats.zipText(path.join(root,'missing.zip'),[]));
});
test('Palworld identifies modern compression and returns an explicit unsupported state rather than a fabricated character',()=>{
 const bytes=Buffer.alloc(20);bytes.write('PlM',8);assert.throws(()=>reader('palworld').parse(bytes,{reader:reader('palworld')}),/PlM\/Oodle/);
});
