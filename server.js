const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn, exec, execFile } = require('child_process');

const { createArtworkService } = require('./artwork');
const { atomicWriteJson, buildGame, reconcileCatalog } = require('./library');
const { createEnvironment, join: joinSystemPath, native: nativeSystemPath, canonical } = require('./environment');
const { createDiscovery } = require('./discovery');
const os = require('os');
const { getSaveLocations } = require('./save-locations');
const { createProgressService } = require('./progress');
const { readerFor } = require('./progress-readers');
const APP_VERSION = require('./package.json').version;

const { createUpdater } = require('./updater');
const { createAutostart } = require('./autostart');
const PORT = Number(process.env.NIVODOCK_PORT || 47890);
const AUTO_VERIFY = require.main === module && process.env.NIVODOCK_DISABLE_AUTOSCAN !== '1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const GAMES_FILE = path.join(__dirname, 'games.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const isWSL = process.platform === 'linux';

function toNativePath(winPath) {
  if (!winPath) return '';
  if (!isWSL) return winPath;
  if (winPath.startsWith('/')) return winPath;
  return winPath
    .replace(/^([A-Za-z]):\\?/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
    .replace(/\\/g, '/');
}

function toWindowsPath(p) {
  if (!p) return '';
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  }
  return p;
}

function pathExists(winOrNativePath) {
  try {
    return Boolean(winOrNativePath && fs.existsSync(toNativePath(winOrNativePath)));
  } catch {
    return false;
  }
}

// ============================================================================
// POKÉMON GEN 3 (.SAV / .SGM / .SS1) REAL-TIME SAVE PARSER
// Extracts Trainer Name, TID, PlayTime & 6 Party Pokémon (Name, Level, HP, Animated Sprite)
// ============================================================================
const GEN3_CHAR = {
  0xBB:'A',0xBC:'B',0xBD:'C',0xBE:'D',0xBF:'E',0xC0:'F',0xC1:'G',0xC2:'H',0xC3:'I',0xC4:'J',0xC5:'K',0xC6:'L',0xC7:'M',
  0xC8:'N',0xC9:'O',0xCA:'P',0xCB:'Q',0xCC:'R',0xCD:'S',0xCE:'T',0xCF:'U',0xD0:'V',0xD1:'W',0xD2:'X',0xD3:'Y',0xD4:'Z',
  0xD5:'a',0xD6:'b',0xD7:'c',0xD8:'d',0xD9:'e',0xDA:'f',0xDB:'g',0xDC:'h',0xDD:'i',0xDE:'j',0xDF:'k',0xE0:'l',0xE1:'m',
  0xE2:'n',0xE3:'o',0xE4:'p',0xE5:'q',0xE6:'r',0xE7:'s',0xE8:'t',0xE9:'u',0xEA:'v',0xEB:'w',0xEC:'x',0xED:'y',0xEE:'z',
  0xA1:'0',0xA2:'1',0xA3:'2',0xA4:'3',0xA5:'4',0xA6:'5',0xA7:'6',0xA8:'7',0xA9:'8',0xAA:'9',0xAB:'!',0xAC:'?',0xAD:'.',0xAE:'-',0x00:' '
};

function decodeGen3Str(b, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[off + i];
    if (c === 0xFF) break;
    s += GEN3_CHAR[c] || '';
  }
  return s.trim();
}

const SUBSTRUCT_ORDER = [
  [0,1,2,3], [0,1,3,2], [0,2,1,3], [0,3,1,2], [0,2,3,1], [0,3,2,1],
  [1,0,2,3], [1,0,3,2], [2,0,1,3], [3,0,1,2], [2,0,3,1], [3,0,2,1],
  [1,2,0,3], [1,3,0,2], [2,1,0,3], [3,1,0,2], [2,3,0,1], [3,2,0,1],
  [1,2,3,0], [1,3,2,0], [2,1,3,0], [3,1,2,0], [2,3,1,0], [3,2,1,0]
];

// Gen 3 Internal Species ID (277..411) -> National Dex (252..386)
const GEN3_HOENN_TO_NAT = {
  277:252,278:253,279:254,280:255,281:256,282:257,283:258,284:259,285:260,286:261,287:262,288:263,289:264,290:265,291:266,292:267,293:268,294:269,295:270,296:271,297:272,298:273,299:274,300:275,
  301:290,302:291,303:292,304:276,305:277,306:285,307:286,308:327,309:278,310:279,311:283,312:284,313:320,314:321,315:300,316:301,317:352,318:343,319:344,320:299,321:324,322:302,323:339,324:340,
  325:370,326:341,327:342,328:349,329:350,330:318,331:319,332:328,333:329,334:330,335:296,336:297,337:309,338:310,339:322,340:323,341:363,342:364,343:365,344:331,345:332,346:361,347:362,348:337,
  349:338,350:298,351:325,352:326,353:311,354:312,355:303,356:307,357:308,358:333,359:334,360:360,361:355,362:356,363:315,364:287,365:288,366:289,367:316,368:317,369:357,370:293,371:294,372:295,
  373:366,374:367,375:368,376:359,377:353,378:354,379:336,380:335,381:369,382:304,383:305,384:306,385:351,386:313,387:314,388:345,389:346,390:347,391:348,392:280,393:281,394:282,395:371,396:372,
  397:373,398:374,399:375,400:376,401:377,402:378,403:379,404:382,405:383,406:384,407:380,408:381,409:385,410:386,411:358
};

function gen3ToNationalDex(internalId) {
  if (internalId >= 1 && internalId <= 251) return internalId;
  return GEN3_HOENN_TO_NAT[internalId] || internalId;
}

function decodeGen3PartyMon(buf, offset) {
  if (offset < 0 || offset + 100 > buf.length) return null;
  const pid = buf.readUInt32LE(offset);
  const otid = buf.readUInt32LE(offset + 4);
  if (pid === 0 && otid === 0) return null;
  const nickname = decodeGen3Str(buf, offset + 8, 10);
  const otName = decodeGen3Str(buf, offset + 20, 7);
  if (!nickname || nickname.length < 1) return null;

  const key = (pid ^ otid) >>> 0;
  const dec = Buffer.alloc(48);
  for (let i = 0; i < 48; i += 4) {
    dec.writeUInt32LE((buf.readUInt32LE(offset + 32 + i) ^ key) >>> 0, i);
  }
  const order = SUBSTRUCT_ORDER[pid % 24];
  const growthPos = order[0];
  const speciesInternal = dec.readUInt16LE(growthPos * 12);
  const natDex = gen3ToNationalDex(speciesInternal);
  const level = buf[offset + 84];
  const curHp = buf.readUInt16LE(offset + 86);
  const maxHp = buf.readUInt16LE(offset + 88);

  if (level < 1 || level > 100 || maxHp < 5 || maxHp > 999 || curHp > maxHp || speciesInternal < 1 || speciesInternal > 1000) {
    return null;
  }

  return {
    nickname,
    otName,
    speciesId: natDex,
    level,
    curHp,
    maxHp,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${natDex}.gif`,
    fallbackSprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${natDex}.png`
  };
}

function parseGen3SaveFile(nativeFilePath) {
  try {
    if (!fs.existsSync(nativeFilePath)) return null;
    const raw = fs.readFileSync(nativeFilePath);
    let buf = raw;
    try { buf = zlib.gunzipSync(raw, { maxOutputLength: 16 * 1024 * 1024 }); } catch {}

    // Case A: Standard 64KB / 128KB .sav Battery File
    if ((buf.length === 131072 || buf.length === 65536) && buf.readUInt16LE(0xFF4) <= 13) {
      let bestParty = [];
      let bestTrainer = null;
      const slots = buf.length >= 0x1C000 ? 2 : 1;

      for (let slot = 0; slot < slots; slot++) {
        const base = slot * 0xE000;
        let trainer = null;
        let party = [];

        for (let sec = 0; sec < 14; sec++) {
          const off = base + sec * 0x1000;
          const secId = buf.readUInt16LE(off + 0xFF4);
          if (secId === 0) {
            trainer = {
              name: decodeGen3Str(buf, off, 7) || 'Treinador',
              gender: buf[off + 8] === 0 ? 'M' : 'F',
              tid: buf.readUInt16LE(off + 0x0A),
              hours: buf.readUInt16LE(off + 0x0E),
              mins: buf[off + 0x10]
            };
          }
          if (secId === 1) {
            // Try FireRed/LeafGreen offset (0x34 / 0x38) and Ruby/Sapphire/Emerald offset (0x234 / 0x238)
            for (const baseOff of [0x34, 0x234]) {
              const count = buf[off + baseOff];
              if (count >= 1 && count <= 6) {
                const candidate = [];
                for (let i = 0; i < count; i++) {
                  const mon = decodeGen3PartyMon(buf, off + baseOff + 4 + i * 100);
                  if (mon) candidate.push(mon);
                }
                if (candidate.length > party.length) party = candidate;
              }
            }
          }
        }

        if (party.length > bestParty.length || (!bestTrainer && trainer)) {
          bestParty = party;
          bestTrainer = trainer;
        }
      }

      if (bestTrainer && bestParty.length > 0) {
        return {
          sourceFile: path.basename(nativeFilePath),
          trainer: bestTrainer,
          party: bestParty
        };
      }
    }

    // Case B: Emulator Save State (.sgm / .ss1) or memory dump
    let bestParty = [];
    for (let off = 0; off <= buf.length - 100; off += 4) {
      const m1 = decodeGen3PartyMon(buf, off);
      if (m1 && m1.otName.length >= 2) {
        const party = [m1];
        for (let i = 1; i < 6; i++) {
          const mn = decodeGen3PartyMon(buf, off + i * 100);
          if (mn && mn.otName === m1.otName) {
            party.push(mn);
          } else {
            break;
          }
        }
        if (party.length > bestParty.length) {
          bestParty = party;
        }
      }
    }

    if (bestParty.length > 0) {
      return {
        sourceFile: path.basename(nativeFilePath),
        trainer: {
          name: bestParty[0].otName || 'Treinador',
          gender: 'M',
          tid: 0,
          hours: 0,
          mins: 0
        },
        party: bestParty
      };
    }
  } catch (e) {
    console.error('Error parsing Gen3 save:', e);
  }
  return null;
}

// ============================================================================
// POKÉMON GEN 4 (NDS: HeartGold / SoulSilver / Diamond / Pearl / Platinum) PARSER
// Reads .dsv (DeSmuME) and .sav (512KB) files, decrypting PRNG blocks & party
// ============================================================================
function prngNextGen4(seed) {
  return Number((BigInt(seed >>> 0) * 0x41C64E6Dn + 0x6073n) & 0xFFFFFFFFn) >>> 0;
}

function decodeGen4Str(b, off, maxChars) {
  let s = '';
  for (let i = 0; i < maxChars; i++) {
    if (off + i * 2 + 2 > b.length) break;
    const code = b.readUInt16LE(off + i * 2);
    if (code === 0xFFFF || code === 0x0000) break;
    if (code >= 0x0121 && code <= 0x012A) s += String.fromCharCode(48 + (code - 0x0121));
    else if (code >= 0x012B && code <= 0x0144) s += String.fromCharCode(65 + (code - 0x012B));
    else if (code >= 0x0145 && code <= 0x015E) s += String.fromCharCode(97 + (code - 0x0145));
    else if (code === 0x01DE) s += ' ';
  }
  return s.trim();
}

function decodeGen4PartyMon(b, off) {
  if (off < 0 || off + 236 > b.length) return null;
  const pid = b.readUInt32LE(off);
  const checksum = b.readUInt16LE(off + 6);
  if (pid === 0 && checksum === 0) return null;

  const dec = Buffer.alloc(128);
  let seed = checksum;
  for (let i = 0; i < 128; i += 2) {
    seed = prngNextGen4(seed);
    const word = b.readUInt16LE(off + 8 + i) ^ (seed >>> 16);
    dec.writeUInt16LE(word, i);
  }

  const shift = ((pid & 0x3E000) >>> 0xD) % 24;
  const order = SUBSTRUCT_ORDER[shift];
  const posA = order[0];
  const posC = order[2];

  const speciesId = dec.readUInt16LE(posA * 32);
  const nickname = decodeGen4Str(dec, posC * 32, 11);

  const battle = Buffer.alloc(100);
  seed = pid;
  for (let i = 0; i < 100; i += 2) {
    seed = prngNextGen4(seed);
    const word = b.readUInt16LE(off + 0x88 + i) ^ (seed >>> 16);
    battle.writeUInt16LE(word, i);
  }

  const level = battle[0x04];
  const curHp = battle.readUInt16LE(0x06);
  const maxHp = battle.readUInt16LE(0x08);

  if (speciesId < 1 || speciesId > 493 || level < 1 || level > 100 || maxHp < 5 || maxHp > 999 || curHp > maxHp) {
    return null;
  }

  return {
    nickname: nickname || `#${speciesId}`,
    speciesId,
    level,
    curHp,
    maxHp,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${speciesId}.gif`,
    fallbackSprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`
  };
}

function parseGen4SaveFile(nativeFilePath) {
  try {
    if (!fs.existsSync(nativeFilePath)) return null;
    const buf = fs.readFileSync(nativeFilePath);
    if (buf.length < 0x10000) return null;

    // Layouts for HG/SS, Platinum, and D/P
    const layouts = [
      { name: 'HGSS', footerOff: 0xF618, trainerOff: 0x0064, partyCountOff: 0x0094, partyOff: 0x0098 },
      { name: 'Pt',   footerOff: 0xCF18, trainerOff: 0x0068, partyCountOff: 0x009C, partyOff: 0x00A0 },
      { name: 'DP',   footerOff: 0xC0EC, trainerOff: 0x0064, partyCountOff: 0x0094, partyOff: 0x0098 }
    ];

    for (const lay of layouts) {
      let bestBase = -1;
      let maxSaveNum = -1;
      for (const base of [0x00000, 0x40000]) {
        if (base + lay.footerOff + 16 > buf.length) continue;
        const magic = buf.readUInt32LE(base + lay.footerOff + 8);
        const saveNum = buf.readUInt32LE(base + lay.footerOff);
        if (magic === 0x20060623 && saveNum >= maxSaveNum) {
          maxSaveNum = saveNum;
          bestBase = base;
        }
      }

      if (bestBase !== -1) {
        const count = buf[bestBase + lay.partyCountOff];
        if (count >= 1 && count <= 6) {
          const party = [];
          for (let i = 0; i < count; i++) {
            const mon = decodeGen4PartyMon(buf, bestBase + lay.partyOff + i * 236);
            if (mon) party.push(mon);
          }
          if (party.length > 0) {
            return {
              sourceFile: path.basename(nativeFilePath),
              trainer: {
                name: decodeGen4Str(buf, bestBase + lay.trainerOff, 8) || 'Treinador',
                gender: buf[bestBase + lay.trainerOff + 0x18] === 0 ? 'M' : 'F',
                tid: buf.readUInt16LE(bestBase + lay.trainerOff + 0x10),
                hours: buf.readUInt16LE(bestBase + lay.trainerOff + 0x22),
                mins: buf[bestBase + lay.trainerOff + 0x24]
              },
              party
            };
          }
        }
      }
    }
  } catch (e) {
    console.error('Error parsing Gen4 save:', e);
  }
  return null;
}

// ============================================================================
// POKÉMON LEGENDS: Z-A (Switch & PC Native Recomp Port) SwishCrypto + PA9 Parser
// Reads `main` (3,093,124 bytes) directly from ZA Recomp, Ryujinx, and Eden!
// ============================================================================
const SWISH_XORPAD = [
  0xA0, 0x92, 0xD1, 0x06, 0x07, 0xDB, 0x32, 0xA1, 0xAE, 0x01, 0xF5, 0xC5, 0x1E, 0x84, 0x4F, 0xE3,
  0x53, 0xCA, 0x37, 0xF4, 0xA7, 0xB0, 0x4D, 0xA0, 0x18, 0xB7, 0xC2, 0x97, 0xDA, 0x5F, 0x53, 0x2B,
  0x75, 0xFA, 0x48, 0x16, 0xF8, 0xD4, 0x8A, 0x6F, 0x61, 0x05, 0xF4, 0xE2, 0xFD, 0x04, 0xB5, 0xA3,
  0x0F, 0xFC, 0x44, 0x92, 0xCB, 0x32, 0xE6, 0x1B, 0xB9, 0xB1, 0x2E, 0x01, 0xB0, 0x56, 0x53, 0x36,
  0xD2, 0xD1, 0x50, 0x3D, 0xDE, 0x5B, 0x2E, 0x0E, 0x52, 0xFD, 0xDF, 0x2F, 0x7B, 0xCA, 0x63, 0x50,
  0xA4, 0x67, 0x5D, 0x23, 0x17, 0xC0, 0x52, 0xE1, 0xA6, 0x30, 0x7C, 0x2B, 0xB6, 0x70, 0x36, 0x5B,
  0x2A, 0x27, 0x69, 0x33, 0xF5, 0x63, 0x7B, 0x36, 0x3F, 0x26, 0x9B, 0xA3, 0xED, 0x7A, 0x53, 0x00,
  0xA4, 0x48, 0xB3, 0x50, 0x9E, 0x14, 0xA0, 0x52, 0xDE, 0x7E, 0x10, 0x2B, 0x1B, 0x77, 0x6E
];
const SWISH_PRIM_SIZES = { 8: 1, 9: 2, 10: 4, 11: 8, 12: 1, 13: 2, 14: 4, 15: 8, 16: 4, 17: 8 };

function swishXorshift32(s) {
  s ^= (s << 2) >>> 0;
  s ^= (s >>> 15);
  s ^= (s << 13) >>> 0;
  return s >>> 0;
}

function swishPopcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

function makeSwishRng(key) {
  let seed = key >>> 0;
  const pc = swishPopcount32(seed);
  for (let i = 0; i < pc; i++) seed = swishXorshift32(seed);
  let counter = 0;
  return {
    nextByte() {
      const res = (seed >>> (counter * 8)) & 0xFF;
      if (counter === 3) { seed = swishXorshift32(seed); counter = 0; } else counter++;
      return res;
    },
    nextInt32(b0, b1, b2, b3) {
      return ((b0 ^ this.nextByte()) | ((b1 ^ this.nextByte()) << 8) | ((b2 ^ this.nextByte()) << 16) | ((b3 ^ this.nextByte()) << 24)) >>> 0;
    }
  };
}

const PA9_BLOCK_POS = [
  [0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],
  [1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],
  [1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],
  [1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0],
  [0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],
  [1,0,2,3],[1,0,3,2]
];

function decryptPA9Pokemon(raw) {
  const ec = raw.readUInt32LE(0);
  const sanity = raw.readUInt16LE(4);
  const chk = raw.readUInt16LE(6);
  if ((ec === 0 && chk === 0) || sanity !== 0) return null;
  const sv = (ec >>> 13) & 31;
  const dec = Buffer.from(raw);
  let seed = ec;
  for (let i = 8; i < 328; i += 2) {
    seed = (Math.imul(seed, 0x41C64E6D) + 0x00006073) >>> 0;
    dec.writeUInt16LE(dec.readUInt16LE(i) ^ (seed >>> 16), i);
  }
  seed = ec;
  for (let i = 328; i < 344; i += 2) {
    seed = (Math.imul(seed, 0x41C64E6D) + 0x00006073) >>> 0;
    dec.writeUInt16LE(dec.readUInt16LE(i) ^ (seed >>> 16), i);
  }
  const unshuffled = Buffer.from(dec);
  const pos = PA9_BLOCK_POS[sv];
  for (let b = 0; b < 4; b++) {
    const srcOff = 8 + pos[b] * 80;
    const dstOff = 8 + b * 80;
    dec.copy(unshuffled, dstOff, srcOff, srcOff + 80);
  }
  let calcChk = 0;
  for (let i = 8; i < 328; i += 2) calcChk = (calcChk + unshuffled.readUInt16LE(i)) & 0xFFFF;
  if (calcChk !== chk) return null;

  const speciesId = unshuffled.readUInt16LE(8);
  if (speciesId <= 0 || speciesId > 1025) return null;

  let nickname = '';
  for (let i = 0x58; i < 0x58 + 26; i += 2) {
    const c = unshuffled.readUInt16LE(i);
    if (c === 0 || c === 0xFFFF) break;
    nickname += String.fromCharCode(c);
  }
  const speciesName = nickname || `Pokémon #${speciesId}`;
  const level = unshuffled[328] || 1;
  const maxHp = unshuffled.readUInt16LE(330) || 1;
  const currentHp = unshuffled.readUInt16LE(0x8A) || maxHp;

  const spriteUrl = speciesId <= 649
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${speciesId}.gif`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${speciesId}.gif`;

  return {
    speciesId,
    speciesName,
    nickname: nickname || speciesName,
    level,
    curHp: currentHp,
    currentHp,
    maxHp,
    sprite: spriteUrl,
    fallbackSprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`
  };
}

function parseLegendsZASaveFile(nativeFilePath, labelOverride) {
  try {
    if (!fs.existsSync(nativeFilePath)) return null;
    const stat = fs.statSync(nativeFilePath);
    if (stat.size < 2500000 || stat.size > 4000000) return null;

    const buf = fs.readFileSync(nativeFilePath);
    const wanted = new Set([0xe3e89bd1, 0x3aa1a9ad, 0xce3af8f2]);
    const found = new Map();
    let off = 0;
    const endOff = buf.length - 32;

    while (off < endOff && found.size < 3) {
      if (off + 5 > endOff) break;
      const k0 = buf[off] ^ SWISH_XORPAD[off % 127];
      const k1 = buf[off + 1] ^ SWISH_XORPAD[(off + 1) % 127];
      const k2 = buf[off + 2] ^ SWISH_XORPAD[(off + 2) % 127];
      const k3 = buf[off + 3] ^ SWISH_XORPAD[(off + 3) % 127];
      const key = (k0 | (k1 << 8) | (k2 << 16) | (k3 << 24)) >>> 0;
      off += 4;
      const rng = makeSwishRng(key);
      const type = (buf[off] ^ SWISH_XORPAD[off % 127]) ^ rng.nextByte();
      off++;

      let len = 0;
      if (type === 1 || type === 2) {
        len = 0;
      } else if (type === 3 || type === 4) {
        if (off + 4 > endOff) break;
        len = rng.nextInt32(
          buf[off] ^ SWISH_XORPAD[off % 127],
          buf[off + 1] ^ SWISH_XORPAD[(off + 1) % 127],
          buf[off + 2] ^ SWISH_XORPAD[(off + 2) % 127],
          buf[off + 3] ^ SWISH_XORPAD[(off + 3) % 127]
        );
        off += 4;
      } else if (type === 5) {
        if (off + 5 > endOff) break;
        const arrCount = rng.nextInt32(
          buf[off] ^ SWISH_XORPAD[off % 127],
          buf[off + 1] ^ SWISH_XORPAD[(off + 1) % 127],
          buf[off + 2] ^ SWISH_XORPAD[(off + 2) % 127],
          buf[off + 3] ^ SWISH_XORPAD[(off + 3) % 127]
        );
        off += 4;
        const subType = (buf[off] ^ SWISH_XORPAD[off % 127]) ^ rng.nextByte();
        off++;
        len = arrCount * (SWISH_PRIM_SIZES[subType] || 1);
      } else if (SWISH_PRIM_SIZES[type]) {
        len = SWISH_PRIM_SIZES[type];
      } else {
        return null; // Invalid SCBlock type
      }

      if (len < 0 || off + len > endOff) return null;

      if (wanted.has(key)) {
        const data = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
          data[i] = (buf[off + i] ^ SWISH_XORPAD[(off + i) % 127]) ^ rng.nextByte();
        }
        found.set(key, data);
      }
      off += len;
    }

    const myStatus = found.get(0xe3e89bd1);
    const partyBuf = found.get(0x3aa1a9ad);
    if (!myStatus || !partyBuf || partyBuf.length < 2880) return null;

    let trainerName = '';
    for (let i = 0x10; i < 0x10 + 24; i += 2) {
      const c = myStatus.readUInt16LE(i);
      if (c === 0 || c === 0xFFFF) break;
      trainerName += String.fromCharCode(c);
    }
    const tid32 = myStatus.readUInt32LE(0) >>> 0;
    const g8Tid = (tid32 % 1000000).toString().padStart(6, '0');
    const gender = myStatus[0x05] === 1 ? 'F' : 'M';

    let hours = 0, mins = 0;
    const playTimeBuf = found.get(0xce3af8f2);
    if (playTimeBuf && playTimeBuf.length === 8) {
      const totalSec = Math.max(0, Math.floor(playTimeBuf.readDoubleLE(0)));
      hours = Math.floor(totalSec / 3600);
      mins = Math.floor((totalSec % 3600) / 60);
    }

    const party = [];
    for (let s = 0; s < 6; s++) {
      const mon = decryptPA9Pokemon(partyBuf.subarray(s * 480, (s + 1) * 480));
      if (mon) party.push(mon);
    }

    return {
      sourceType: labelOverride || 'Legends Z-A Save (main)',
      sourceFile: labelOverride || path.basename(nativeFilePath),
      trainer: {
        name: trainerName || 'Treinador',
        gender,
        tid: g8Tid,
        hours,
        mins
      },
      party
    };
  } catch (e) {
    console.error('Error parsing Legends Z-A save:', e);
    return null;
  }
}

// ============================================================================
// POKÉMON BRILLIANT DIAMOND / SHINING PEARL (BDSP SaveData.bin - 979,108 bytes)
// ============================================================================
function parseBDSPSaveFile(nativeFilePath, labelOverride) {
  try {
    if (!fs.existsSync(nativeFilePath)) return null;
    const stat = fs.statSync(nativeFilePath);
    if (stat.size < 900000 || stat.size > 1100000) return null;
    const buf = fs.readFileSync(nativeFilePath);

    let trainerName = '';
    const myStatusOff = 0x79bb4;
    if (myStatusOff + 32 < buf.length) {
      for (let i = 0; i < 24; i += 2) {
        const c = buf.readUInt16LE(myStatusOff + i);
        if (c === 0 || c === 0xFFFF) break;
        trainerName += String.fromCharCode(c);
      }
    }
    const tid = myStatusOff + 0x1C < buf.length ? buf.readUInt16LE(myStatusOff + 0x1C) : 0;

    const party = [];
    const partyBase = 0x14098;
    for (let s = 0; s < 6; s++) {
      const off = partyBase + s * 344;
      if (off + 344 > buf.length) break;
      const mon = decryptPA9Pokemon(buf.subarray(off, off + 344));
      if (mon) party.push(mon);
    }
    if (!trainerName && party.length === 0) return null;

    return {
      sourceType: labelOverride || 'BDSP SaveData.bin',
      sourceFile: labelOverride || path.basename(nativeFilePath),
      trainer: {
        name: trainerName || 'Treinador',
        gender: 'M',
        tid: tid || 'Sinnoh',
        hours: 0,
        mins: 15
      },
      party
    };
  } catch (e) {
    console.error('Error parsing BDSP save:', e);
    return null;
  }
}

// In-memory cache keyed by nativeFilePath -> { mtimeMs, size, data }
const SAVE_PARSE_CACHE = new Map();

function parseAnyPokemonSaveCached(candObj, game) {
  const cand = typeof candObj === 'string' ? candObj : candObj.path;
  const label = typeof candObj === 'object' ? candObj.label : null;
  if (!fs.existsSync(cand)) return null;
  let stat;
  try { stat = fs.statSync(cand); } catch { return null; }
  if (stat.size > 16 * 1024 * 1024) return null;
  const cacheKey = `${cand}|${label || ''}`;
  const cached = SAVE_PARSE_CACHE.get(cacheKey);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.data ? JSON.parse(JSON.stringify(cached.data)) : null;
  }

  let parsed = null;
  const lower = cand.toLowerCase();
  if (lower.endsWith('savedata.bin') || (stat.size >= 950000 && stat.size <= 1050000)) {
    parsed = parseBDSPSaveFile(cand, label);
  } else if (lower.endsWith('main') || (stat.size >= 2500000 && stat.size <= 4000000)) {
    parsed = parseLegendsZASaveFile(cand, label);
  } else if (lower.endsWith('.dsv') || (game.platform && game.platform.includes('DS'))) {
    parsed = parseGen4SaveFile(cand) || parseGen3SaveFile(cand);
  } else {
    parsed = parseGen3SaveFile(cand) || parseGen4SaveFile(cand);
  }

  if (parsed) {
    if (label) parsed.sourceFile = label;
    parsed.mtimeMs = stat.mtimeMs;
  }
  SAVE_PARSE_CACHE.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, data: parsed });
  return parsed ? JSON.parse(JSON.stringify(parsed)) : null;
}

function getSaveCandidatesForGame(game) {
  return getSaveLocations(game, runtimeEnvironment, latestConfiguration, latestCatalog);
}

function getGamePokemonSaveData(game) {
  const candidates = getSaveCandidatesForGame(game);
  let bestResult = null;
  const availableSaves = [];

  for (const candObj of candidates) {
    const parsed = parseAnyPokemonSaveCached(candObj, game);
    if (parsed && (parsed.party.length > 0 || parsed.trainer)) {
      parsed.fullPath = toWindowsPath(candObj.path);
      availableSaves.push(parsed);
      if (game.savePath && toNativePath(game.savePath) === candObj.path) {
        bestResult = parsed;
      } else if (!game.savePath && (!bestResult || parsed.mtimeMs > bestResult.mtimeMs)) {
        bestResult = parsed;
      }
    }
  }
  if (!game.savePath && !bestResult && availableSaves.length > 0) {
    bestResult = availableSaves[0];
  }

  if (bestResult) {
    return Object.assign({}, bestResult, {
      alternates: availableSaves.map(s => ({
        sourceFile: s.sourceFile,
        fullPath: s.fullPath,
        trainerName: s.trainer.name,
        partyCount: s.party.length,
        hours: s.trainer.hours,
        mins: s.trainer.mins
      }))
    });
  }
  return null;
}

function computeSaveSignature() {
  try { return progressService.signature(loadGames()); } catch { return ''; }
}

// ============================================================================
// MULTI-SOURCE AUTOMATIC COVER & ARTWORK FETCHER (No API keys needed!)
// Works on ANY PC for Switch, GBA/Retro, and PC/Steam games
// ============================================================================
const artworkService = createArtworkService({ publicDir: PUBLIC_DIR });
async function fetchSmartCover(title, category = 'pc', extra = {}) {
  try { return await artworkService.resolve({ title, category, ...extra }); }
  catch (err) {
    console.warn(`Capa não encontrada para "${title}": ${err.message}`);
    return { cover: '', hero: '' };
  }
}

const DEFAULT_CONFIG = { emulators: {}, discoveryRoots: [] };
let runtimeEnvironment = { userProfile: process.env.USERPROFILE || os.homedir(), appData: process.env.APPDATA || '', localAppData: process.env.LOCALAPPDATA || '', programData: process.env.ProgramData || '', documents: '', startup: '' };
let latestCatalog = [];
let latestConfiguration = DEFAULT_CONFIG;
const progressService = createProgressService({ getEnvironment: () => runtimeEnvironment, getPokemon: getGamePokemonSaveData, getPokemonLocations: getSaveCandidatesForGame });

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('config.json inválido');
    latestConfiguration = { ...saved, emulators: saved.emulators || {}, discoveryRoots: saved.discoveryRoots || [] };
    return latestConfiguration;
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfig(cfg) {
  latestConfiguration = cfg;
  atomicWriteJson(CONFIG_FILE, cfg);
}

function loadGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
  if (!Array.isArray(games)) throw new Error('games.json deve conter uma lista de jogos');
  latestCatalog = games;
  return games;
}

function saveGames(games) {
  latestCatalog = games;
  atomicWriteJson(GAMES_FILE, games);
}

let activeSession = null;
let launchingGames = 0;
function exitForUpdate() {
  setTimeout(() => { server.close(); server.closeAllConnections(); process.exit(0); }, 500);
}
const updater = createUpdater({ root: __dirname, version: APP_VERSION, port: PORT,
  isBusy: () => Boolean(activeSession || launchingGames), onHandoff: exitForUpdate });

function annotateGames(games, config) {
  return games.map(g => {
    let targetValid = true;
    let emuValid = true;
    if (g.type === 'emulator') {
      const emu = config.emulators[g.emulator];
      emuValid = Boolean(emu && pathExists(emu.exe));
      targetValid = pathExists(g.rom);
    } else if (g.type === 'pc') {
      targetValid = pathExists(g.exe);
    }

    // Check if Pokémon or Universal save/character data exists for this game
    const pokemonSave = readerFor(g)?.pokemon ? getGamePokemonSaveData(g) : null;
    const progress = progressService.get(g, { pokemonSave });

    return Object.assign({}, g, {
      installation: g.installation || { status: 'unverified', reason: 'Aguardando verificação da instalação' },
      health: {
        ready: g.installation?.status === 'installed' && targetValid && emuValid,
        targetValid,
        emuValid
      },
      pokemonSave,
      progress
    });
  });
}

function launchGame(game, customEmulatorId) {
  return new Promise((resolve, reject) => {
    (async () => {
    try {
      const config = loadConfig();
      const candidate = { ...game, emulator: customEmulatorId || game.emulator };
      const check = createDiscovery({ ...runtimeEnvironment, existingGames: [] });
      let evidence;
      if (['steam', 'battlenet', 'epic'].includes(game.store) || game.type === 'steam' || String(game.id).startsWith('bnet-')) {
        if (game.installation?.status !== 'installed') throw new Error('Instalação não confirmada. Use Verificar jogos antes de iniciar.');
        evidence = await check.probe(game.installation.executable);
      } else evidence = await check.probe(game.type === 'emulator' ? game.rom : (game.installation?.executable || game.exe));
      if (evidence.status !== 'present') throw new Error(evidence.reason || 'Arquivo do jogo ausente');
      if (candidate.type === 'emulator' && (await check.probe(config.emulators[candidate.emulator]?.exe)).status !== 'present') throw new Error('Emulador ausente ou indisponível');
      const games = loadGames();
      const idx = games.findIndex(g => g.id === game.id);
      if (idx !== -1) {
        games[idx].lastPlayed = Date.now();
        games[idx].playCount = (games[idx].playCount || 0) + 1;
        if (customEmulatorId) {
          games[idx].emulator = customEmulatorId;
        }
        saveGames(games);
      }

      if (game.type === 'steam') {
        const cmd = isWSL
          ? `/mnt/c/Windows/explorer.exe "steam://rungameid/${game.steamAppId}"`
          : `cmd.exe /c start "" "steam://rungameid/${game.steamAppId}"`;
        exec(cmd, () => {
          resolve({ status: 'launched', mode: 'steam', title: game.title });
        });
        return;
      }

      if (game.type === 'emulator') {
        const emuId = customEmulatorId || game.emulator || 'eden';
        const emu = config.emulators[emuId];
        if (!emu) {
          return reject(new Error(`Emulador não configurado: ${emuId}`));
        }
        if (!pathExists(emu.exe)) {
          return reject(new Error(`Executável do emulador não encontrado em: ${emu.exe}. Configure em ⚙️ Emuladores.`));
        }
        if (!pathExists(game.rom)) {
          return reject(new Error(`Arquivo da ROM não encontrado em: ${game.rom}`));
        }

        const args = (emu.argsTemplate || ['{rom}']).map(arg => arg === '{rom}' ? game.rom : arg);
        const exeToRun = toNativePath(emu.exe);
        // For DeSmuME, keep cwd at DeSmuME folder so it finds .\Battery\Pokemon SS (BR).dsv; for GBA keep ROM folder
        const cwd = (emu.category === 'retro' && emu.id !== 'desmume')
          ? path.dirname(toNativePath(game.rom))
          : path.dirname(exeToRun);

        const child = spawn(exeToRun, args, {
          cwd,
          detached: true,
          stdio: 'ignore',
          shell: false
        });

        const startedAt = Date.now();
        activeSession = {
          gameId: game.id,
          title: game.title,
          pid: child.pid,
          startedAt
        };

        child.on('exit', () => {
          const elapsedMins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
          try {
            const curGames = loadGames();
            const gIdx = curGames.findIndex(x => x.id === game.id);
            if (gIdx !== -1) {
              curGames[gIdx].totalPlayMinutes = (curGames[gIdx].totalPlayMinutes || 0) + elapsedMins;
              saveGames(curGames);
            }
          } catch {}
          if (activeSession && activeSession.pid === child.pid) {
            activeSession = null;
          }
        });

        child.unref();
        return resolve({ status: 'launched', mode: 'emulator', emulator: emu.name, title: game.title, pid: child.pid });
      }

      if (game.type === 'pc') {
        if (!pathExists(game.exe)) {
          return reject(new Error(`Executável do jogo não encontrado em: ${game.exe}`));
        }
        const exeToRun = toNativePath(game.exe);
        const cwd = game.cwd ? toNativePath(game.cwd) : path.dirname(exeToRun);
        const args = game.args || [];
        const env = Object.assign({}, process.env, game.env || {});
        if (isWSL && game.env) {
          env.WSLENV = (env.WSLENV ? env.WSLENV + ':' : '') + Object.keys(game.env).join(':');
        }

        const child = spawn(exeToRun, args, {
          cwd,
          env,
          detached: true,
          stdio: 'ignore',
          shell: false
        });

        const startedAt = Date.now();
        activeSession = {
          gameId: game.id,
          title: game.title,
          pid: child.pid,
          startedAt
        };

        child.on('exit', () => {
          const elapsedMins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
          try {
            const curGames = loadGames();
            const gIdx = curGames.findIndex(x => x.id === game.id);
            if (gIdx !== -1) {
              curGames[gIdx].totalPlayMinutes = (curGames[gIdx].totalPlayMinutes || 0) + elapsedMins;
              saveGames(curGames);
            }
          } catch {}
          if (activeSession && activeSession.pid === child.pid) {
            activeSession = null;
          }
        });

        child.unref();
        return resolve({ status: 'launched', mode: 'pc', title: game.title, pid: child.pid });
      }

      reject(new Error('Tipo de jogo desconhecido'));
    } catch (e) {
      reject(e);
    }
    })();
  });
}

function openNativeDialog(mode, filter) {
  return new Promise((resolve) => {
    const windowsRoot = process.env.SystemRoot || process.env.WINDIR;
    const psExe = isWSL ? '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' : windowsRoot ? path.win32.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
    let script = '';
    if (mode === 'folder') {
      script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Selecione a pasta'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }`;
    } else {
      const flt = filter || 'Todos os Arquivos (*.*)|*.*';
      script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = '${flt}'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.FileName }`;
    }

    execFile(psExe, ['-NoProfile', '-STA', '-Command', script], { timeout: 120000 }, (err, stdout) => {
      if (err) return resolve({ path: '' });
      resolve({ path: (stdout || '').trim() });
    });
  });
}

let scanPromise = null;
const scanStatus = { running: false, lastStartedAt: null, lastFinishedAt: null, warnings: [], error: null, coverPending: 0 };
const coverQueue = new Map();
const coverRetry = new Map();
let coverWorkers = 0;
let environmentPromise = null;
function environmentReady() {
  if (!environmentPromise) environmentPromise = createEnvironment().then(env => (runtimeEnvironment = env)).catch(err => { environmentPromise = null; throw err; });
  return environmentPromise;
}
function libraryRevision() {
  try { const st = fs.statSync(GAMES_FILE); return `${st.mtimeMs}:${st.size}`; } catch { return ''; }
}
function scheduleArtwork(games) {
  for (const game of games) {
    if (game.installation?.status !== 'installed' || game.coverLocked || coverRetry.get(game.id) > Date.now()) continue;
    if (game.cover?.startsWith('/artwork/') && pathExists(path.join(PUBLIC_DIR, game.cover.slice(1))) && game.artwork) continue;
    if (!coverQueue.has(game.id)) coverQueue.set(game.id, { ...game });
  }
  scanStatus.coverPending = coverQueue.size + coverWorkers;
  while (coverWorkers < 3 && coverQueue.size) {
    const [id, before] = coverQueue.entries().next().value; coverQueue.delete(id); coverWorkers++;
    artworkService.resolve(before).then(art => {
      const latest = loadGames(), game = latest.find(g => g.id === id);
      if (game && game.installation?.status === 'installed' && !game.coverLocked && game.title === before.title && game.cover === before.cover) {
        Object.assign(game, art); saveGames(latest);
      }
    }).catch(err => {
      coverRetry.set(id, Date.now() + 30 * 60 * 1000);
      console.warn(`Capa pendente: ${before.title}: ${err.message}`);
    }).finally(() => { coverWorkers--; scanStatus.coverPending = coverQueue.size + coverWorkers; scheduleArtwork([]); });
  }
}
async function scanSystemGames() {
  if (scanPromise) return scanPromise;
  scanStatus.running = true; scanStatus.error = null; scanStatus.lastStartedAt = Date.now();
  scanPromise = (async () => {
    const context = await environmentReady();
    const snapshot = loadGames(), config = loadConfig();
    const scanner = createDiscovery({ ...context, existingGames: snapshot });
    const found = await scanner.scan(config);
    const currentConfig = loadConfig();
    for (const [id, emu] of Object.entries(found.emulators)) if (!currentConfig.emulators[id]) currentConfig.emulators[id] = emu;
    if (JSON.stringify(currentConfig) !== JSON.stringify(loadConfig())) saveConfig(currentConfig);
    const result = await reconcileCatalog(loadGames(), snapshot, found.games, currentConfig, scanner.verify);
    // Verification may yield to I/O: overlay the current user fields again before
    // committing, so edits made during that last phase are preserved as well.
    const current = loadGames(), currentById = new Map(current.map(g => [g.id, g]));
    const original = new Map(snapshot.map(g => [g.id, g]));
    const merged = result.games.filter(g => !original.has(g.id) || currentById.has(g.id)).map(g => {
      const live = currentById.get(g.id);
      if (!live) return g;
      const before = original.get(g.id);
      const targetChanged = before && (live.exe !== before.exe || live.rom !== before.rom || live.emulator !== before.emulator);
      return { ...g, ...live, ...(targetChanged ? { installation: { status: 'unverified', reason: 'Caminho alterado durante a busca' } } : { installation: g.installation, installDir: g.installDir, store: g.store || live.store, storeId: g.storeId || live.storeId, exe: g.exe || live.exe, cwd: g.cwd || live.cwd }) };
    });
    for (const game of current) if (!merged.some(g => g.id === game.id)) merged.push(game);
    if (JSON.stringify(current) !== JSON.stringify(merged)) saveGames(merged);
    scanStatus.warnings = found.warnings; scanStatus.lastFinishedAt = Date.now();
    scanStatus.sources = found.sources; scanStatus.visitedDirectories = found.visitedDirectories;
    scanStatus.searchedRoots = found.searchedRoots; scanStatus.directoryLimitReached = found.directoryLimitReached;
    const summary = { addedCount: result.addedCount, addedTitles: result.addedTitles, installed: merged.filter(g => g.installation?.status === 'installed').length, unavailable: merged.filter(g => g.installation?.status !== 'installed').length, warnings: found.warnings, sources: found.sources, visitedDirectories: found.visitedDirectories, searchedRoots: found.searchedRoots, directoryLimitReached: found.directoryLimitReached };
    scheduleArtwork(merged);
    return summary;
  })();
  try { return await scanPromise; }
  catch (err) { scanStatus.error = err.message; throw err; }
  finally { scanStatus.running = false; scanPromise = null; }
}

// A single refresh runs at a time. Apply artwork to the latest catalog so a
// favorite, play count, edit or deletion made during downloads is never lost.
let coverRefresh = null;
let coverRefreshId = null;
async function refreshAllCovers(id) {
  if (coverRefresh) {
    if ((id || null) !== coverRefreshId) throw Object.assign(new Error('Uma atualização de capas já está em andamento'), { statusCode: 409 });
    return coverRefresh;
  }
  coverRefreshId = id || null;
  coverRefresh = (async () => {
    const snapshot = loadGames().filter(g => !id || g.id === id);
    if (id && !snapshot.length) throw Object.assign(new Error('Jogo não encontrado'), { statusCode: 404 });
    const result = { updated: 0, unchanged: 0, skipped: 0, failed: 0, failures: [] };
    const patches = new Map();
    const queue = [...snapshot];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const game = queue.shift();
        if (game.coverLocked) { result.skipped++; continue; }
        try { patches.set(game.id, await artworkService.resolve(game)); }
        catch (err) { result.failed++; result.failures.push({ id: game.id, title: game.title, reason: err.message }); }
      }
    }));
    const games = loadGames();
    for (const game of games) {
      const art = patches.get(game.id);
      const before = snapshot.find(g => g.id === game.id);
      if (!art) continue;
      if (game.coverLocked || game.title !== before.title || game.cover !== before.cover || game.hero !== before.hero) { result.skipped++; continue; }
      if (game.cover === art.cover && game.hero === art.hero && JSON.stringify(game.artwork) === JSON.stringify(art.artwork)) result.unchanged++;
      else { Object.assign(game, art); result.updated++; }
    }
    if (result.updated) saveGames(games);
    return result;
  })();
  try { return await coverRefresh; } finally { coverRefresh = null; coverRefreshId = null; }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function setNoCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= 1024 * 1024) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > 1024 * 1024) return reject(Object.assign(new Error('Requisição acima do limite'), { statusCode: 413 }));
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
        resolve(body);
      } catch { reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 })); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
  setNoCache(res);
  const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  const allowedOrigins = allowedHosts.map(host => `http://${host}`);
  if (!allowedHosts.includes(req.headers.host) ||
      (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Acesso permitido apenas pelo launcher local' }));
  }
  if (req.method === 'POST' && (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0) &&
      !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    res.writeHead(415, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Envie os dados como application/json' }));
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/api/update/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ product: 'NivoDock', version: APP_VERSION, nonce: process.env.NIVODOCK_UPDATE_NONCE || '' }));
  }
  if (updater.isApplying() && req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'O NivoDock está instalando uma atualização. Aguarde a reinicialização.' }));
  }
  if (url.pathname === '/api/update' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(updater.status()));
  }
  if (url.pathname === '/api/update/check' && req.method === 'POST') {
    await readBody(req);
    const status = await updater.check();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(status));
  }
  if (url.pathname === '/api/update/install' && req.method === 'POST') {
    const body = await readBody(req);
    const status = await updater.install(body.version);
    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(status));
  }

  if (url.pathname === '/api/data' && req.method === 'GET') {
    await environmentReady();
    const config = loadConfig();
    const games = annotateGames(loadGames(), config);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      version: APP_VERSION,
      update: updater.status(),
      libraryRevision: libraryRevision(),
      scanStatus,
      discoveryRoots: config.discoveryRoots || [],
      counts: { installed: games.filter(g => g.installation.status === 'installed').length, unavailable: games.filter(g => g.installation.status !== 'installed').length },
      games,
      emulators: config.emulators,
      activeSession,
      libraryRevision: libraryRevision(),
      scanStatus,
      saveSignature: computeSaveSignature()
    }));
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      version: APP_VERSION,
      update: updater.status(),
      activeSession,
      libraryRevision: libraryRevision(),
      scanStatus,
      saveSignature: computeSaveSignature()
    }));
  }

  if (url.pathname === '/api/launch' && req.method === 'POST') {
    launchingGames++;
    try {
      const { id, emulator } = await readBody(req);
      const games = loadGames();
      const game = games.find(g => g.id === id);
      if (!game) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Jogo não encontrado' }));
      }
      const result = await launchGame(game, emulator);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    } finally { launchingGames--; }
  }

  if (url.pathname === '/api/browse' && req.method === 'POST') {
    const { mode, filter } = await readBody(req);
    const result = await openNativeDialog(mode, filter);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (url.pathname === '/api/add-game' && req.method === 'POST') {
    try {
      const payload = await readBody(req);
      const initial = loadGames();
      const before = payload.id ? initial.find(g => g.id === payload.id) : null;
      if (payload.id && !before) throw new Error('Jogo não encontrado');
      const config = loadConfig();
      const category = payload.category || before?.category || config.emulators[payload.emulator]?.category || 'pc';
      let art = {};
      if (!payload.cover && payload.title && (!before || payload.cover === '')) {
        art = await fetchSmartCover(payload.title, category, { steamAppId: before?.steamAppId });
      }
      // Reload after the network request: retain concurrent library changes.
      const games = loadGames();
      const existingIdx = payload.id ? games.findIndex(g => g.id === payload.id) : -1;
      if (payload.id && existingIdx < 0) throw new Error('O jogo foi removido durante a edição');
      const gameObj = buildGame(payload, existingIdx >= 0 ? games[existingIdx] : null, config.emulators, art);
      if (existingIdx >= 0) games[existingIdx] = gameObj;
      else games.unshift(gameObj);
      saveGames(games);
      if (AUTO_VERIFY) setImmediate(() => scanSystemGames().catch(err => console.warn(err.message)));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, game: gameObj }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (url.pathname === '/api/progress/support' && req.method === 'GET') {
    await environmentReady(); loadConfig();
    const games = loadGames();
    const rows = games.map(game => { const p = progressService.get(game); return { gameId: game.id, title: game.title, installed: game.installation?.status === 'installed', reader: p.reader, support: p.support, hasSource: Boolean(p.source) }; });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ schemaVersion: 1, games: rows }));
  }
  if (url.pathname === '/api/progress/select' && req.method === 'POST') {
    const body = await readBody(req); await environmentReady(); loadConfig();
    const games = loadGames(), game = games.find(g => g.id === body.gameId);
    if (!game) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Jogo não encontrado' })); }
    try {
      const selection = progressService.validateSelection(game, body.selection);
      if (selection.mode === 'auto') { delete game.progressSelection; if (readerFor(game)?.pokemon) delete game.savePath; }
      else if (readerFor(game)?.pokemon) { game.savePath = selection.path; delete game.progressSelection; }
      else game.progressSelection = selection;
      saveGames(games);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, progress: progressService.get(game), libraryRevision: libraryRevision() }));
    } catch (err) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ error: err.message })); }
  }

  if (url.pathname === '/api/select-save' && req.method === 'POST') {
    const { gameId, savePath } = await readBody(req);
    const games = loadGames();
    const g = games.find(x => x.id === gameId);
    if (g) {
      g.savePath = savePath;
      saveGames(games);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/api/sync-save' && req.method === 'POST') {
    try {
      const { fromPath, toPath } = await readBody(req);
      const src = toNativePath(fromPath);
      const dst = toNativePath(toPath);
      if (!src || !dst || !fs.existsSync(src)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Arquivo de origem não encontrado' }));
      }
      if (src === dst) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, message: 'Mesmo arquivo' }));
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (fs.existsSync(dst)) {
        fs.copyFileSync(dst, `${dst}.bak`);
      }
      fs.copyFileSync(src, dst);
      SAVE_PARSE_CACHE.clear();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (url.pathname === '/api/backup-save' && req.method === 'POST') {
    try {
      const { gameId, savePath } = await readBody(req);
      const src = toNativePath(savePath);
      if (!src || !fs.existsSync(src)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Arquivo de save não encontrado no disco' }));
      }
      const backupDir = path.join(__dirname, 'backups', (gameId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_'));
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dstFile = path.join(backupDir, `${stamp}_${path.basename(src)}`);
      fs.copyFileSync(src, dstFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, backupPath: toWindowsPath(dstFile) }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (url.pathname === '/api/refresh-covers' && req.method === 'POST') {
    const { id } = await readBody(req);
    const result = await refreshAllCovers(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (url.pathname === '/api/delete-game' && req.method === 'POST') {
    const { id } = await readBody(req);
    const games = loadGames().filter(g => g.id !== id);
    saveGames(games);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/api/save-emulator' && req.method === 'POST') {
    const { id, name, platform, category, exe, argsTemplate, romDirs, extensions } = await readBody(req);
    const config = loadConfig();
    const emuId = id || `emu_${Date.now()}`;
    config.emulators[emuId] = {
      id: emuId,
      name: name || emuId,
      platform: platform || 'Emulador',
      category: category || 'switch',
      exe: exe || '',
      argsTemplate: Array.isArray(argsTemplate) ? argsTemplate : (argsTemplate || '{rom}').split(' ').filter(Boolean),
      romDirs: Array.isArray(romDirs) ? romDirs : (romDirs ? romDirs.split(';').map(s => s.trim()).filter(Boolean) : []),
      extensions: Array.isArray(extensions) ? extensions : (extensions || '.nsp,.xci').split(',').map(s => s.trim())
    };
    saveConfig(config);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, emulators: config.emulators }));
  }

  if (url.pathname === '/api/delete-emulator' && req.method === 'POST') {
    const { id } = await readBody(req);
    const config = loadConfig();
    delete config.emulators[id];
    saveConfig(config);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, emulators: config.emulators }));
  }

  if (url.pathname === '/api/discovery-roots' && req.method === 'POST') {
    const { path: selectedPath, remove } = await readBody(req);
    if (typeof selectedPath !== 'string' || !(path.isAbsolute(selectedPath) || path.win32.isAbsolute(selectedPath))) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Selecione uma pasta absoluta' }));
    }
    if (!remove && !fs.statSync(toNativePath(selectedPath)).isDirectory()) throw new Error('Selecione uma pasta de jogos');
    const config = loadConfig();
    const roots = (config.discoveryRoots || []).filter(root => canonical(root) !== canonical(selectedPath));
    if (!remove) roots.push(selectedPath);
    config.discoveryRoots = roots; saveConfig(config);
    if (AUTO_VERIFY) setImmediate(() => scanSystemGames().catch(err => console.warn(err.message)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ roots }));
  }

  if (url.pathname === '/api/scan' && req.method === 'POST') {
    const result = await scanSystemGames();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (url.pathname === '/api/favorite' && req.method === 'POST') {
    const { id } = await readBody(req);
    const games = loadGames();
    const game = games.find(g => g.id === id);
    if (game) {
      game.favorite = !game.favorite;
      saveGames(games);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, favorite: game ? game.favorite : false }));
  }

  if (url.pathname === '/api/autostart' || url.pathname === '/api/autostart-status') {
    const env = await environmentReady();
    const startup = toNativePath(env.startup || joinSystemPath(env.appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'));
    const autostart = createAutostart(startup, path.win32.join(toWindowsPath(__dirname), 'NivoDock.exe'));
    if (url.pathname === '/api/autostart' && req.method === 'POST') {
      const enabled = autostart.toggle();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ enabled }));
    }
    if (url.pathname === '/api/autostart-status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ enabled: autostart.enabled() }));
    }
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`NivoDock rodando em http://127.0.0.1:${PORT}`);
    setTimeout(() => updater.check(), 5000).unref();
    setInterval(() => updater.check(), 6 * 60 * 60 * 1000).unref();
    if (AUTO_VERIFY) {
      setImmediate(() => scanSystemGames().catch(err => console.error('Verificação de jogos:', err.message)));
      setInterval(() => scanSystemGames().catch(err => console.error('Verificação de jogos:', err.message)), 90000).unref();
    }
  });
}

module.exports = { server, refreshAllCovers, loadGames, saveGames, scanSystemGames, scanStatus };
