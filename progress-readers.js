const fs = require('node:fs');
const path = require('node:path');
const { join, native } = require('./environment');
const { SaveError, jsonSave, skyrimHeader, nmsJson, megabonkJson, minecraft, zipText } = require('./progress-formats');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e14;
const str = value => typeof value === 'string' ? value.slice(0,240) : '';
const metric = (id,label,value,unit='') => ({id,label,value,unit});
const unique = list => new Set(Array.isArray(list) ? list.filter(v => typeof v === 'string') : []).size;
const profileLeaf = file => path.basename(path.dirname(file));
const RACES={ImperialRace:'Imperial',NordRace:'Nórdico',BretonRace:'Bretão',RedguardRace:'Redguard',HighElfRace:'Alto elfo',WoodElfRace:'Elfo da floresta',DarkElfRace:'Elfo negro',OrcRace:'Orc',KhajiitRace:'Khajiit',ArgonianRace:'Argoniano'};
// IDs are matched explicitly; neither list position nor XP is converted to a level.
const SKILLS={'Wf3i7Ha-B06DH719j1vtBw':'Mineração','4pefO9k1lUqfA6mvHNi1SA':'Corte de madeira','waK-8EyQFQ2xEjCGYmuTRQ':'Pesca','Tn7t6DQyX0-Q0cM5K7B90A':'Ferraria','0hreSMRVXUihq9qjDO2CFA':'Criação de runas','jqX0Gh6QI0GFFPCDFK_CJQ':'Culinária','heq7u88Q2UuLXFqLGTVwQw':'Agricultura','NOqC-z-2ckqi0El22qMFlw':'Fabricação de flechas','4zYUGF5u_0KbMLkWJmmBbQ':'Artesanato','PyUi-0LU_riFY46AnnFiWg':'Cerâmica'};
const DRAGON_ITEMS={'FOjGigKnBkev9f-VWFFdYA':'Túnica de aventureiro','ewbJ37oeTkypaVfRgI_GPg':'Calças de aventureiro'};
function dragon(bytes) {
  const j=jsonSave(bytes),p=j.GameProgress;
  if(j.Version!==83||!p?.Character||!p.Skills||!str(j.meta_data?.char_name))throw new SaveError('Esta estrutura de personagem Dragonwilds ainda não foi validada.');
  const skills=(Array.isArray(p.Skills.Skills)?p.Skills.Skills:[]).filter(s=>Object.hasOwn(SKILLS,s.Id)&&finite(s.Xp)).map(s=>({name:SKILLS[s.Id],value:s.Xp,unit:'XP'})).sort((a,b)=>b.value-a.value);
  const equipment=[];let unknownEquipment=0;
  for(const [slot,raw]of Object.entries(p.Loadout||{})){
    if(!/^\d+$/.test(slot)||!raw||typeof raw!=='object')continue;
    const item=Number.isInteger(raw.PlayerInventoryItemIndex)?p.Inventory?.[raw.PlayerInventoryItemIndex]:raw;
    if(!item?.ItemData)continue;
    if(Object.hasOwn(DRAGON_ITEMS,item.ItemData))equipment.push({slot:'Equipado',name:DRAGON_ITEMS[item.ItemData],...(finite(item.Durability)?{durability:item.Durability}:{})});else unknownEquipment++;
  }
  const metrics=[];if(finite(p.Character.Playtime_wall))metrics.push(metric('playtime','Tempo salvo',p.Character.Playtime_wall,'seconds'));
  if(Array.isArray(p.Progress?.RecipesUnlocked))metrics.push(metric('recipes','Receitas desbloqueadas',unique(p.Progress.RecipesUnlocked)));
  if(Array.isArray(p.Progress?.BuildingsUnlocked))metrics.push(metric('buildings','Construções desbloqueadas',unique(p.Progress.BuildingsUnlocked)));
  const tracked=p.QuestProgress?.Quests?.find?.(q=>q.QuestId===p.QuestProgress.QuestTracked);
  const objective=str(tracked?.QuestObjective),objectives=[];
  if(objective&&/\s/.test(objective)&&!/^Objective\d|^FinishQuest$/i.test(objective))objectives.push({label:'Objetivo acompanhado',text:objective});
  else if(p.QuestProgress?.QuestTracked==='_L6IAEaHSVPnhhaTamBHBA')objectives.push({label:'Missão acompanhada',text:'Growing Pains'});
  const unknownSkills=(p.Skills.Skills||[]).filter(s=>!Object.hasOwn(SKILLS,s.Id)).length;
  return {profileKey:str(j.meta_data.char_guid)||str(j.meta_data.char_name),identity:{name:str(j.meta_data.char_name),role:'Personagem'},metrics,skills,equipment,objectives,limitations:['Habilidades mostram XP real; níveis e próxima faixa ainda não foram validados para este save.',...(unknownEquipment?[`${unknownEquipment} itens equipados ainda não possuem nome identificado.`]:[]),...(unknownSkills?[`${unknownSkills} habilidades aguardam identificação.`]:[])]};
}
function skyrim(bytes,{file}){
 const h=skyrimHeader(bytes),tag=path.basename(file).match(/^(?:Save\d+|Autosave\d+|Quicksave)_([0-9a-f]{8})_/i)?.[1];
 return {profileKey:tag?`${h.name}:${h.race}:${tag.toLowerCase()}`:file,profileLabel:h.name+(tag?' • campanha '+tag.slice(-4):' • '+path.basename(file)),identity:{name:h.name,role:'Personagem',level:h.level,subtitle:Object.hasOwn(RACES,h.race)?RACES[h.race]:'Raça não identificada'},metrics:[metric('level','Nível',h.level),metric('location','Local salvo',h.location)],...(finite(h.xp)&&finite(h.nextXp)?{progress:{label:'Experiência do personagem',current:h.xp,total:h.nextXp}}:{}),limitations:['Habilidades, perks e equipamento ainda não são decodificados; mods não são interpretados por este leitor de cabeçalho.']};
}
const NMS_KEYS={Version:'F2P',PlayerStateData:'6f=',CommonStateData:'<h0',ActiveContext:'XTp',BaseContext:'vLc',ExpeditionContext:'2YS',Units:'wGS',Nanites:'7QL',Specials:'kN;',TotalPlayTime:'Lg8',SaveName:'Pk4'};
const nmsGet=(object,key)=>object?.[key]??object?.[NMS_KEYS[key]];
function nms(bytes,{file}){
 const j=nmsJson(bytes),active=nmsGet(j,'ActiveContext'),common=nmsGet(j,'CommonStateData')||{},main=nmsGet(j,'BaseContext'),season=nmsGet(j,'ExpeditionContext');
 let state,label;
 if(active==='Main'){state=main;label='Campanha principal';}else if(active==='Season'){state=season;label='Expedição ativa';}else if(nmsGet(j,'PlayerStateData')){state=j;label='Campanha';}else throw new SaveError('O contexto ativo deste save No Man’s Sky não é reconhecido.');
 const p=nmsGet(state,'PlayerStateData');if(!p||!finite(nmsGet(p,'Units')))throw new SaveError('O perfil de No Man’s Sky não é compatível com este leitor.');
 const metrics=[];for(const [key,text]of[['Units','Unidades'],['Nanites','Nanites'],['Specials','Mercúrio']])if(finite(nmsGet(p,key)))metrics.push(metric(key,text,nmsGet(p,key)));
 const time=nmsGet(common,'TotalPlayTime')??nmsGet(p,'TotalPlayTime');if(finite(time))metrics.push(metric('time','Tempo total deste save',time,'seconds'));
 const secondary=[];if(active==='Season'&&nmsGet(main,'PlayerStateData')){const base=nmsGet(main,'PlayerStateData');for(const [key,text]of[['Units','Unidades da campanha principal'],['Nanites','Nanites da campanha principal']])if(finite(nmsGet(base,key)))secondary.push(metric('main-'+key,text,nmsGet(base,key)));}
 const slotName=path.basename(file).match(/^save(\d*)\.hg$/i),slot=slotName?Math.ceil(Number(slotName[1]||1)/2):1;
 return {profileKey:path.dirname(file)+':'+slot,profileLabel:'Campanha '+slot,identity:{name:str(nmsGet(common,'SaveName'))||'Campanha '+slot,role:'Viajante',subtitle:label},metrics,details:secondary,limitations:['O contexto ativo é respeitado. Expedição e campanha principal não têm seus saldos misturados.','Naves, missões e equipamentos ainda não são interpretados.']};
}
function megabonk(bytes,{file,readCompanion}){
 const j=megabonkJson(bytes);if(!finite(j.gold)||!finite(j.silver)||!j.characterProgression||!j.menuMeta)throw new SaveError('Estrutura de progresso Megabonk não reconhecida.');
 const characters=Object.entries(j.characterProgression).filter(([name,p])=>str(name)&&p&&finite(p.xp)&&finite(p.numRuns));
 const metrics=[metric('gold','Ouro disponível',j.gold),metric('silver','Prata disponível',j.silver),metric('achievements','Desafios registrados',unique(j.achievements)),metric('purchases','Compras desbloqueadas',unique(j.purchases))];
 const skills=characters.filter(([,p])=>p.numRuns>0).map(([name,p])=>({name,value:p.xp,unit:'XP',detail:`${p.numRuns} partidas salvas`})).sort((a,b)=>b.value-a.value);
 const limitations=['XP por personagem vem do save; nenhum nível é estimado a partir do XP.'];
 try{const s=megabonkJson(readCompanion(path.join(path.dirname(file),'stats.json'))).stats;if(!s||typeof s!=='object')throw new SaveError('Estatísticas não reconhecidas.');for(const [id,label]of[['kills','Inimigos derrotados'],['runs','Partidas registradas']])if(s?.[id]?.name===id&&finite(s[id].value))metrics.push(metric(id,label,s[id].value));}catch{limitations.push('Estatísticas complementares não estão disponíveis neste perfil.');}
 const map=str(j.menuMeta.lastSelectedMap);if(map&&map!=='None')metrics.push(metric('map','Mapa selecionado',map));
 return {profileKey:path.dirname(file),profileLabel:profileLeaf(file)==='0'?'Perfil 0':'Perfil '+profileLeaf(file).slice(-4),identity:{name:'Perfil Megabonk',role:'Sobrevivente'},skillsLabel:'Personagens',skillsPreviewLabel:'Maiores XP por personagem',metrics,skills,limitations};
}
function vampire(bytes,{file}){
 const j=jsonSave(bytes);if(!finite(j.Coins)||!Array.isArray(j.UnlockedCharacters)||!Array.isArray(j.UnlockedWeapons))throw new SaveError('Este arquivo não contém progresso Vampire Survivors reconhecido.');
 return {profileKey:path.dirname(file),identity:{name:str(j.SelectedCharacter)||'Perfil Vampire Survivors',role:'Sobrevivente'},metrics:[metric('coins','Ouro disponível',j.Coins),metric('characters','Personagens desbloqueados',unique(j.UnlockedCharacters)),metric('weapons','Armas desbloqueadas',unique(j.UnlockedWeapons)),metric('stages','Áreas desbloqueadas',unique(j.UnlockedStages)),metric('arcanas','Arcanas desbloqueadas',unique(j.UnlockedArcanas))],limitations:['Desbloqueios permanentes são diferentes do nível temporário de uma partida.']};
}
const languages=new Map();
function hytaleNames(assets){
 if(!assets)return new Map();
 try{const st=fs.statSync(native(assets)),key=assets+':'+st.mtimeMs+':'+st.size;if(languages.has(key))return languages.get(key);const text=zipText(native(assets),['Server/Languages/en-US/server.lang']);const map=new Map();for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*items\.([\w.-]+)\.name\s*=\s*(.{1,160}?)\s*$/);if(m&&!/[{}$]/.test(m[2]))map.set(m[1],m[2]);}if(languages.size>4)languages.clear();languages.set(key,map);return map;}catch{return new Map();}
}
function hytale(bytes,{file,game}){
 const j=jsonSave(bytes),c=j.Components,p=c?.Player,inventory=p?.Inventory;
 if(p?.Version!==5||inventory?.Version!==4||!c.Nameplate||!c.EntityStats?.Stats)throw new SaveError('Esta versão do personagem Hytale ainda não foi validada.');
 const world=path.basename(path.resolve(file,'../../..')),names=hytaleNames(game.installation?.assetsPath),equipment=[];let unknown=0;
 const push=(item,slot)=>{if(!item?.Id)return;if(!names.has(item.Id)){unknown++;return;}equipment.push({slot,name:names.get(item.Id),...(finite(item.Durability)&&finite(item.MaxDurability)&&item.MaxDurability>0?{durability:item.Durability,maxDurability:item.MaxDurability}:{})});};
 push(inventory.HotBar?.Items?.[String(inventory.ActiveHotbarSlot)],'Em uso');
 for(const [slot,item]of Object.entries(inventory.Armor?.Items||{}))push(item,'Armadura');
 for(const item of Object.values(inventory.HotBar?.Items||{}).slice(0,9))if(item!==inventory.HotBar?.Items?.[String(inventory.ActiveHotbarSlot)])push(item,'Barra rápida');
 const metrics=[metric('world','Mundo',world)];if(finite(c.EntityStats.Stats.Health?.Value))metrics.push(metric('health','Vida no save',c.EntityStats.Stats.Health.Value));
 if(typeof p.GameMode==='string')metrics.push(metric('mode','Modo do personagem',str(p.GameMode)));
 if(finite(inventory.Storage?.Capacity))metrics.push(metric('inventory','Espaços ocupados',Object.values(inventory.Storage.Items||{}).filter(v=>v?.Id).length+'/'+inventory.Storage.Capacity));
 return {profileKey:file,profileLabel:(str(c.Nameplate.Text)||'Personagem')+' • '+world,identity:{name:str(c.Nameplate.Text)||'Personagem',role:'Explorador',subtitle:world},metrics,equipment,limitations:['Não há nível de personagem interpretado neste formato.',...(unknown?[`${unknown} itens não puderam ser identificados com os rótulos do jogo instalado.`]:[])]};
}
function mc(edition){return(bytes,{file})=>{const j=minecraft(bytes,edition),metrics=[metric('edition','Edição',edition==='bedrock'?'Bedrock':'Java')];const dayTime=edition==='java'?j.DayTime:j.Time;if(finite(dayTime))metrics.push(metric('days','Dia do mundo salvo',Math.floor(dayTime/24000)));const modes={0:'Sobrevivência',1:'Criativo',2:'Aventura',[edition==='java'?3:6]:'Espectador'};if(Number.isInteger(j.GameType)&&modes[j.GameType])metrics.push(metric('mode','Modo salvo',modes[j.GameType]));const player=j.Player;if(edition==='java'&&player&&finite(player.XpLevel))metrics.push(metric('level','Nível salvo do jogador',player.XpLevel));return{profileKey:path.dirname(file),identity:{name:str(j.LevelName),role:'Mundo'},metrics,limitations:[edition==='bedrock'?'Inventário e nível do jogador em LevelDB ainda não são interpretados.':'Mundos de servidor podem guardar o personagem em arquivos separados.']};};}
function opaque(bytes,{reader}){
 if(reader.id==='palworld'&&bytes.length>=12&&['PlM','PlZ','CNK'].includes(bytes.toString('ascii',8,11)))throw new SaveError(bytes.toString('ascii',8,11)==='PlM'?'Save Palworld encontrado (PlM/Oodle). Esta compressão ainda não é lida pelo NivoDock.':'Save Palworld encontrado; ainda falta um leitor validado desta estrutura.');
 throw new SaveError('Arquivo candidato localizado, mas este formato ainda não possui um leitor de progresso validado.');
}
function children(dir){try{return fs.readdirSync(native(dir),{withFileTypes:true}).slice(0,512);}catch{return[];}}
function search(roots,match,maxDepth=2){const result=[],seen=new Set(),queue=roots.filter(Boolean).map(dir=>({dir:native(dir),depth:0}));let visited=0;while(queue.length&&visited++<256){const{dir,depth}=queue.shift();if(seen.has(dir))continue;seen.add(dir);for(const f of children(dir)){const file=path.join(dir,f.name);if(f.isFile()&&match(f.name,file))result.push(file);if(f.isDirectory()&&depth<maxDepth&&!/^(?:backup|backups|logs|cache|crashes|mods)$/i.test(f.name))queue.push({dir:file,depth:depth+1});}}return result;}
const localLow=e=>join(e.userProfile,'AppData','LocalLow');
const readers=[
 {id:'dragonwilds',label:'RuneScape: Dragonwilds',tier:'progress',extensions:['.json'],match:g=>/dragonwilds/i.test(g.title||''),discover:(g,e)=>search([join(e.localAppData,'RSDragonwilds','Saved','SaveCharacters')],n=>/\.json$/i.test(n),0),parse:dragon,fields:['personagem','tempo salvo','XP por habilidade','equipamento identificado','receitas','objetivo acompanhado'],format:'JSON v83'},
 {id:'skyrim',label:'Skyrim Special Edition',tier:'progress',extensions:['.ess'],readLimit:65553,maxSize:512*1024*1024,match:g=>g.steamAppId==='489830'||/skyrim/i.test(g.title||''),discover:(g,e)=>search(['Skyrim Special Edition','Skyrim Special Edition GOG','Skyrim'].map(n=>join(e.documents,'My Games',n,'Saves')),n=>/\.ess$/i.test(n),0),parse:skyrim,fields:['personagem','nível','raça','local','XP do cabeçalho'],format:'TESV_SAVEGAME v12'},
 {id:'hytale',label:'Hytale',tier:'detailed',extensions:['.json'],match:g=>/^hytale$/i.test(g.title||''),discover:(g,e)=>search([join(e.appData,'Hytale','UserData','Saves'),join(e.localAppData,'Hytale','UserData','Saves')],(n,f)=>/\.json$/i.test(n)&&/[/\\]universe[/\\]players[/\\]/i.test(f),4),parse:hytale,fields:['personagem','mundo','equipamento identificado','durabilidade','vida salva','inventário'],format:'Player v5 / Inventory v4'},
 {id:'nms',label:'No Man’s Sky',tier:'progress',extensions:['.hg','.json'],match:g=>g.steamAppId==='275850'||/no man.s sky/i.test(g.title||''),discover:(g,e)=>search([join(e.appData,'HelloGames','NMS')],n=>/^save\d*\.hg$/i.test(n),2),parse:nms,fields:['campanha','contexto ativo','unidades','nanites','mercúrio','tempo salvo'],format:'JSON / blocos LZ4'},
 {id:'megabonk',label:'Megabonk',tier:'detailed',extensions:['.json'],match:g=>/megabonk/i.test(g.title||''),discover:(g,e)=>search([join(localLow(e),'Ved','Megabonk','Saves','CloudDir')],n=>/^progression\.json$/i.test(n),1),parse:megabonk,fields:['ouro','prata','desbloqueios','XP por personagem','inimigos','partidas'],format:'JSON / AES-CBC 1.0.17'},
 {id:'vampire',label:'Vampire Survivors',tier:'progress',extensions:['.sav','.json'],match:g=>/vampire survivors/i.test(g.title||''),discover:(g,e)=>search(['Vampire_Survivors_EGS','Vampire_Survivors','Vampire_Survivors_steam'].map(n=>join(e.appData,n)),n=>/^SaveData(?:\.sav)?$/i.test(n),3),parse:vampire,fields:['personagem selecionado','ouro','personagens/armas/áreas/arcanas desbloqueados'],format:'SaveData JSON'},
 {id:'minecraft-bedrock',label:'Minecraft Bedrock',tier:'progress',extensions:['.dat'],match:g=>/minecraft.*(?:for windows|bedrock)/i.test(g.title||'')||/Microsoft\.MinecraftUWP/i.test(g.storeId||''),discover:(g,e)=>search([join(e.localAppData,'Packages','Microsoft.MinecraftUWP_8wekyb3d8bbwe','LocalState','games','com.mojang','minecraftWorlds'),join(e.appData,'Minecraft Bedrock','Users')],n=>n==='level.dat',6),parse:mc('bedrock'),fields:['mundo','modo','dias do mundo'],format:'level.dat NBT LE'},
 {id:'minecraft-java',label:'Minecraft Java',tier:'progress',extensions:['.dat'],match:g=>/minecraft.*java/i.test(g.title||''),discover:(g,e)=>search([join(e.appData,'.minecraft','saves')],n=>n==='level.dat',1),parse:mc('java'),fields:['mundo','modo','dias','nível salvo em single-player'],format:'level.dat NBT BE/gzip'},
 {id:'palworld',label:'Palworld',tier:'basic',extensions:['.sav'],match:g=>g.steamAppId==='1623730'||/palworld/i.test(g.title||''),discover:(g,e)=>search([join(e.localAppData,'Pal','Saved','SaveGames')],n=>n==='LevelMeta.sav',2),parse:opaque,fields:[],format:'PlM/PlZ (leitura de progresso pendente)'},
 {id:'bloons',label:'Bloons TD 6',tier:'basic',extensions:['.save','.sav'],match:g=>g.steamAppId==='960090'||/bloons.*6/i.test(g.title||''),discover:(g,e)=>search([join(localLow(e),'Ninja Kiwi','BloonsTD6')],n=>/^profile\.(?:save|sav)$/i.test(n),4),parse:opaque,fields:[],format:'Perfil ainda sem decodificação validada'},
 {id:'nfsu2',label:'Need for Speed: Underground 2',tier:'basic',extensions:['.bin'],match:g=>/need for speed.*underground\s*2/i.test(g.title||''),discover:(g,e)=>search([join(e.localAppData,'NFS Underground 2')],(n,file)=>n===path.basename(path.dirname(file))&&!path.extname(n),1),parse:opaque,fields:[],format:'Perfil binário sem decodificação validada'},
 {id:'isaac',label:'The Binding of Isaac',tier:'basic',extensions:['.dat'],match:g=>g.steamAppId==='250900'||/binding of isaac/i.test(g.title||''),discover:(g,e)=>search(['Binding of Isaac Repentance+','Binding of Isaac Repentance','Binding of Isaac Afterbirth+','Binding of Isaac Rebirth'].map(n=>join(e.documents,'My Games',n)),n=>/persistentgamedata\d\.dat$/i.test(n),1).concat((e.steamRoots||[]).flatMap(root=>children(join(root,'userdata')).filter(d=>d.isDirectory()&&/^\d+$/.test(d.name)).flatMap(user=>search([join(root,'userdata',user.name,'250900','remote')],n=>/persistentgamedata\d\.dat$/i.test(n),0)))),parse:opaque,fields:[],format:'Progresso binário ainda sem decodificação validada'}
];
function pokemonKind(game){const t=(game.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!/pokemon/.test(t))return'';if(/legends.*z[ -]*a/.test(t))return'pokemon-za';if(/brilliant diamond|shining pearl/.test(t)&&game.type==='pc')return'pokemon-bdsp';if(game.category==='retro'||/gba|nintendo ds/i.test(game.platform||'')){if(/fire.?red|emerald|leaf.?green|ruby|sapphire/.test(t))return'pokemon-gen3';if(/soul.?silver|heart.?gold|platinum|diamond|pearl/.test(t))return'pokemon-gen4';}return'';}
function readerFor(game){const pokemon=pokemonKind(game);if(pokemon)return{id:pokemon,label:'Pokémon',tier:'detailed',extensions:pokemon==='pokemon-za'?['']:pokemon==='pokemon-bdsp'?['.bin']:pokemon==='pokemon-gen4'?['.sav','.dsv']:['.sav','.sgm','.ss1'],fields:['treinador','equipe','níveis','HP'],format:'Leitor Pokémon existente',pokemon:true};return readers.find(r=>r.match(game))||null;}
module.exports={readers,readerFor,pokemonKind,search,finite,str};
