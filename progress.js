const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { native, canonical } = require('./environment');
const { SaveError } = require('./progress-formats');
const { readerFor, finite } = require('./progress-readers');
const clone = value => JSON.parse(JSON.stringify(value));
const displayPath = file => process.platform === 'win32' ? file : file.replace(/^\/mnt\/([a-z])\//i,(_,drive)=>drive.toUpperCase()+':\\').replace(/^([A-Z]:\\)(.*)$/,(m,drive,rest)=>drive+rest.replace(/\//g,'\\'));
const fileKey = file => canonical(native(file));
const key = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
function createProgressService({ getEnvironment, getPokemon = () => null, getPokemonLocations = () => [], now = Date.now }) {
  const cache = new Map(), discovery = new Map();
  function stat(file) { try { const s=fs.statSync(file);return s.isFile()?{file,size:s.size,mtime:s.mtimeMs,ctime:s.ctimeMs,ino:s.ino}:null; } catch { return null; } }
  function candidates(game, reader) {
    const env=getEnvironment(),selection=game.progressSelection;
    const id=JSON.stringify([reader?.id,game.id,game.exe,game.installDir,game.savePath,selection?.path,env.documents,env.userProfile,env.appData,env.localAppData]);
    let found=discovery.get(id);
    if(!found||found.until<now()){
      let paths=[];try{paths=reader?.pokemon||(!reader&&/pok[eé]mon/i.test(game.title||''))?getPokemonLocations(game).map(c=>c.path):reader?.discover?.(game,env)||[];}catch{}
      if(selection?.mode==='file'&&typeof selection.path==='string')paths.unshift(native(selection.path));
      const seen=new Set();paths=paths.filter(file=>{const k=fileKey(file);if(seen.has(k))return false;seen.add(k);return true;});
      found={until:now()+1500,paths};if(discovery.size>128)discovery.clear();discovery.set(id,found);
    }
    const files=found.paths.map(stat).filter(Boolean).sort((a,b)=>b.mtime-a.mtime||a.file.localeCompare(b.file));
    const selected=selection?.mode==='file'&&files.find(f=>fileKey(f.file)===fileKey(selection.path));
    const limited=files.slice(0,128);if(selected&&!limited.includes(selected))limited.push(selected);return limited;
  }
  function read(file,limit=32*1024*1024,headerOnly=false){
    const fd=fs.openSync(file,'r');try{const before=fs.fstatSync(fd);if(!before.isFile()||before.size<1||(!headerOnly&&before.size>limit))throw new SaveError('Arquivo vazio ou acima do limite de leitura.','incomplete');const size=headerOnly?Math.min(limit,before.size):before.size;const bytes=Buffer.alloc(size);if(fs.readSync(fd,bytes,0,size,0)!==size)throw new SaveError('O jogo ainda está gravando este arquivo.','incomplete');const after=fs.fstatSync(fd);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new SaveError('O jogo atualizou o save durante a leitura.','incomplete');return bytes;}finally{fs.closeSync(fd);}
  }
  function auxiliary(game,reader,file){const names=[];if(reader?.id==='megabonk')names.push(path.join(path.dirname(file),'stats.json'));if(reader?.id==='hytale'&&game.installation?.assetsPath)names.push(native(game.installation.assetsPath));return names.map(name=>{const s=stat(name);return s?`${name}:${s.size}:${s.mtime}`:name+':missing';}).join('|');}
  function parsed(game,reader,info){
    const id=reader.id+':'+fileKey(info.file),stamp=info.size+':'+info.mtime+':'+info.ctime+':'+info.ino+':'+auxiliary(game,reader,info.file),previous=cache.get(id);
    if(previous?.stamp===stamp&&(previous.valid||previous.retryAt>now()))return previous;
    let entry;
    try{
      if(info.size>(reader.maxSize||32*1024*1024))throw new SaveError('O save excede o limite deste leitor.');
      const data=reader.parse(read(info.file,reader.readLimit||32*1024*1024,Boolean(reader.readLimit)),{file:info.file,game,reader,readCompanion:other=>{if(path.dirname(other)!==path.dirname(info.file)||path.basename(other)!=='stats.json')throw new SaveError('Arquivo complementar inesperado.');return read(other,4*1024*1024);}});
      entry={stamp,valid:true,data,source:info};
    }catch(err){
      const stale=err.code==='incomplete'&&(previous?.valid?previous:previous?.lastGood);
      entry={stamp,valid:false,message:err instanceof SaveError?err.message:'Não foi possível ler o arquivo de save.',errorCode:err.code||'unreadable',retryAt:now()+1500,...(stale?{data:stale.data,source:stale.source,lastGood:stale}:{} )};
    }
    if(cache.size>512)cache.clear();cache.set(id,entry);return entry;
  }
  function basic(game,reader,status='basic',reason='Este jogo ainda não possui um leitor de progresso no NivoDock.'){
    const metrics=[];
    if(Number.isInteger(game.playCount)&&game.playCount>=0)metrics.push({id:'sessions',label:'Inicializações pelo NivoDock',value:game.playCount,origin:'launcher'});
    if(finite(game.totalPlayMinutes)&&game.totalPlayMinutes>0)metrics.push({id:'tracked-time',label:'Tempo acompanhado pelo NivoDock',value:game.totalPlayMinutes*60,unit:'seconds',origin:'launcher'});
    if(finite(game.lastPlayed)&&game.lastPlayed>0)metrics.push({id:'last-played',label:'Última abertura registrada',value:game.lastPlayed,unit:'date',origin:'launcher'});
    return {schemaVersion:1,reader:{id:reader?.id||'library',name:reader?.label||'Biblioteca',version:'1.0.0',format:reader?.format||'',extensions:reader?.extensions||[],canSelectFile:Boolean(reader&&(reader.pokemon||reader.tier!=='basic'))},support:{tier:'basic',maximumTier:reader?.tier||'basic',status,reason,fields:[],possibleFields:reader?.fields||[]},identity:{name:game.title,role:'Resumo do launcher'},metrics,skills:[],equipment:[],objectives:[],limitations:[],source:null,profiles:[],files:[],selection:game.progressSelection||{mode:'auto'}};
  }
  function get(game,{pokemonSave}={}){
    const reader=readerFor(game),files=candidates(game,reader);
    if(reader?.pokemon){
      const selected=game.savePath&&files.find(f=>fileKey(f.file)===fileKey(game.savePath));
      const save=pokemonSave===undefined?getPokemon(game):pokemonSave;
      if(!save||game.savePath&&!selected)return basic(game,reader,game.savePath&&!selected?'selection_missing':files.length?'unsupported':'no_save',game.savePath&&!selected?'O save escolhido não está acessível. Escolha outro arquivo ou volte ao modo automático.':files.length?'O save foi localizado, mas este conteúdo ainda não foi reconhecido pelo leitor Pokémon.':'Nenhum save compatível foi encontrado para esta edição.');
      const source=stat(native(save.fullPath));
      return {...basic(game,reader),support:{tier:'detailed',maximumTier:'detailed',status:'ready',reason:'Treinador e equipe lidos do save local.',fields:save.party?.length?reader.fields:['treinador'],possibleFields:reader.fields},identity:{name:save.trainer?.name||'Treinador',role:'Treinador'},pokemon:true,source:source?{kind:'save',path:displayPath(source.file),name:path.basename(source.file),updatedAt:source.mtime,size:source.size}:null};
    }
    if(!reader){
      const panel=basic(game,null);if(files.length){panel.support.status='unsupported';panel.support.reason='Save localizado. Esta edição ainda não possui um leitor de personagem validado.';panel.source={kind:'candidate',path:displayPath(files[0].file),name:path.basename(files[0].file),updatedAt:files[0].mtime,size:files[0].size};}return panel;
    }
    const panel=basic(game,reader,'no_save',reader.tier==='basic'?'Esta edição ainda não tem leitura de progresso validada. Nenhum arquivo de save reconhecido foi localizado.':'Leitor disponível, mas nenhum save compatível foi encontrado. Você pode escolher o arquivo manualmente.');
    if(!files.length){if(game.progressSelection){panel.support.status='selection_missing';panel.support.reason='O save ou perfil escolhido não está acessível. A seleção foi preservada.';}return panel;}
    const entries=files.map(info=>({info,entry:parsed(game,reader,info)}));
    const profiles=new Map();
    for(const row of entries){if(!row.entry.data)continue;const data=row.entry.data,id=key(reader.id+':'+String(data.profileKey||row.info.file));row.profileId=id;if(!profiles.has(id))profiles.set(id,{id,label:data.profileLabel||data.identity?.name||path.basename(row.info.file),updatedAt:row.info.mtime,latestPath:displayPath(row.info.file)});}
    const selection=game.progressSelection||{mode:'auto'};let chosen;
    if(selection.mode==='file')chosen=entries.find(r=>fileKey(r.info.file)===fileKey(selection.path));
    else if(selection.mode==='profile')chosen=entries.find(r=>r.profileId===selection.profileId);
    else chosen=entries[0]; // Newest file, never highest level or a different fallback character.
    panel.profiles=[...profiles.values()];panel.files=entries.map(r=>({path:displayPath(r.info.file),name:path.basename(r.info.file),updatedAt:r.info.mtime,profile:r.entry.data?.identity?.name||'',readable:r.entry.valid}));
    if(!chosen){panel.support.status='selection_missing';panel.support.reason='O personagem ou arquivo escolhido não está acessível. Nenhum outro perfil foi selecionado automaticamente.';return panel;}
    const {info,entry}=chosen;
    panel.source={kind:entry.data?'save':'candidate',path:displayPath(info.file),name:path.basename(info.file),updatedAt:entry.source?.mtime||info.mtime,size:entry.source?.size||info.size};
    if(!entry.data){panel.support.status=entry.errorCode==='unreadable'?'unreadable':'unsupported';panel.support.reason=entry.message;return panel;}
    const data=clone(entry.data);delete data.profileKey;delete data.profileLabel;
    if(reader.id==='megabonk'&&data.metrics?.some(m=>m.id==='kills'||m.id==='runs')){const companion=stat(path.join(path.dirname(info.file),'stats.json'));if(companion){panel.source.relatedFiles=[{name:'stats.json',updatedAt:companion.mtime}];panel.source.latestUpdatedAt=Math.max(panel.source.updatedAt,companion.mtime);}}
    const fields=[data.identity?.role||'Identidade',...(data.metrics||[]).map(m=>m.label),...(data.progress?['Experiência']:[]),...(data.skills?.length?['XP por habilidade/personagem']:[]),...(data.equipment?.length?['Equipamento identificado']:[]),...(data.objectives?.length?['Objetivo acompanhado']:[])];
    return {...panel,...data,support:{tier:reader.tier,maximumTier:reader.tier,status:entry.valid?'ready':'stale',reason:entry.valid?'Informações lidas do save local.':'O save está sendo gravado ou está incompleto. Exibindo a última leitura válida deste mesmo arquivo.',fields,possibleFields:reader.fields},source:{...panel.source,...(!entry.valid?{observedUpdatedAt:info.mtime}:{})}};
  }
  function signature(games){const parts=[];for(const game of games){const reader=readerFor(game);parts.push(game.id+':'+String(game.savePath||'')+':'+JSON.stringify(game.progressSelection||null));for(const info of candidates(game,reader))parts.push(`${info.file}:${info.size}:${info.mtime}:${info.ctime}:${info.ino}:${auxiliary(game,reader,info.file)}`);}return key(parts.join('|'));}
  function validateSelection(game,selection){
    if(!selection||!['auto','file','profile'].includes(selection.mode))throw new SaveError('Seleção de save inválida.');
    if(selection.mode==='auto')return{mode:'auto'};
    const reader=readerFor(game);if(!reader)throw new SaveError('Esta edição ainda não possui um leitor de save.');
    if(selection.mode==='profile'){
      if(reader.pokemon)throw new SaveError('Escolha um dos arquivos Pokémon disponíveis.');
      if(typeof selection.profileId!=='string'||!get(game).profiles.some(p=>p.id===selection.profileId))throw new SaveError('O perfil escolhido não está disponível.');return{mode:'profile',profileId:selection.profileId};
    }
    if(typeof selection.path!=='string'||selection.path.length>4096||selection.path.includes('\0')||!path.isAbsolute(native(selection.path))||!reader.extensions.includes(path.extname(selection.path).toLowerCase()))throw new SaveError('Escolha um arquivo com formato compatível com este jogo.');
    const info=stat(native(selection.path));if(!info)throw new SaveError('O arquivo escolhido não está acessível.');
    if(reader.pokemon){
      if(reader.id==='pokemon-za'&&path.basename(info.file).toLowerCase()!=='main')throw new SaveError('Escolha o arquivo main desta edição Pokémon.');
      if(info.size>16*1024*1024||!getPokemon({...game,savePath:displayPath(info.file)}))throw new SaveError('O save escolhido não foi reconhecido pelo leitor Pokémon.');
      return{mode:'file',path:displayPath(info.file)};
    }
    const result=parsed(game,reader,info);if(!result.valid)throw new SaveError(result.message);
    return{mode:'file',path:displayPath(info.file)};
  }
  return {get,signature,validateSelection,readerFor};
}
module.exports={createProgressService,displayPath};
