const { PermissionsBitField } = require('discord.js');
const { BADGE_CATALOG, BETA_EMOJIS, CLAN_LOGOS } = require('./constants');
const { gameData, db, saveUsers } = require('./database');

const SHOP_DICE_MAP = {
  zenith: {
    id: 'zenith',
    name: 'Zenith Dice',
    emoji: '<:Zenithdice:1573808579042087044>',
    cost: 1_000_000,
    luckPercent: 1_000,
    restriction: 'cash'
  },
  archangel: {
    id: 'archangel',
    name: 'Archangel Dice',
    emoji: '<:Archangeldice:1573808666040209580>',
    cost: 10_000_000,
    luckPercent: 5_000,
    restriction: 'cash'
  },
  galactic: {
    id: 'galactic',
    name: 'Galactic Dice',
    emoji: '<:Galacticdice:1573808816397750282>',
    cost: 50_000_000,
    luckPercent: 15_000,
    restriction: 'cash'
  },
  inferno: {
    id: 'inferno',
    name: 'Inferno Dice',
    emoji: '<:Infernodice:1573809040322986027>',
    cost: 200_000_000,
    luckPercent: 30_000,
    restriction: 'cash'
  },
  demigod: {
    id: 'demigod',
    name: 'Demigod Dice',
    emoji: '<:Demigoddice:1573809108543340638>',
    cost: 500_000_000,
    luckPercent: 45_000,
    restriction: 'cash'
  },
  rainbow: {
    id: 'rainbow',
    name: 'Rainbow Dice',
    emoji: '<:Rainbowdice:1573809197542285412>',
    cost: 2_000_000_000,
    luckPercent: 60_000,
    restriction: 'cash'
  },
  gradient: {
    id: 'gradient',
    name: 'Gradient Dice',
    emoji: '<:Gardientdice:1573809254891003954>',
    cost: 10_000_000_000,
    luckPercent: 100_000,
    restriction: 'cash'
  },
  hacker: {
    id: 'hacker',
    name: 'Hacker Dice',
    emoji: '<:Hackerdice:1573809319420367028>',
    cost: 25_000_000_000,
    luckPercent: 500_000,
    restriction: 'cash'
  },
  nosleep: {
    id: 'nosleep',
    name: 'NoSleep Dice',
    emoji: '<:Nosleepdice:1573809380569120800>',
    cost: 50_000_000_000,
    luckPercent: 1_000_000,
    restriction: 'cash'
  },
  supporter: {
    id: 'supporter',
    name: 'Supporter Dice',
    emoji: '<:Supporterdice:1573809498299048070>',
    cost: 0,
    luckPercent: 3_500_000,
    restriction: 'supporter'
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch Dice',
    emoji: '<:Glitchdice:1573809577298886836>',
    cost: 500_000_000_000,
    luckPercent: 25_000_000,
    restriction: 'cash'
  },
  developer: {
    id: 'developer',
    name: 'Developer Dice',
    emoji: '<:Developerdice:1573809636543434932>',
    cost: 0,
    luckPercent: 1,
    restriction: 'developer'
  }
};

const WEATHER_EVENT_POOL = [
  {
    id: 'blue_luck',
    name: 'Blue Luck',
    emoji: '<:Blueluck:1573809712041038035>',
    chancePercent: 35,
    luckBonusPercent: 30,
    description: 'A calm azure breeze settles over the roll arena, granting +30% of your current luck.'
  },
  {
    id: 'purple_luck',
    name: 'Purple Luck',
    emoji: '<:Purpleluck:1573809925874786507>',
    chancePercent: 20,
    luckBonusPercent: 50,
    description: 'Violet rift sparks drift across the dice table, granting +50% of your current luck.'
  },
  {
    id: 'yellow_luck',
    name: 'Yellow Luck',
    emoji: '<:Yellowluck:1573809988646735952>',
    chancePercent: 10,
    luckBonusPercent: 70,
    description: 'Golden sunbeams charge the atmosphere with fortune, granting +70% of your current luck.'
  },
  {
    id: 'gradient_luck',
    name: 'Gradient Luck',
    emoji: '<:Gardientlucl:1573810062365827237>',
    chancePercent: 1,
    luckBonusPercent: 100,
    description: 'Prismatic waves surge through the realm, granting +100% of your current luck.'
  },
  {
    id: 'rainbow_luck',
    name: 'Rainbow Luck',
    emoji: '<:Rainbowlucl:1573810125632831498>',
    chancePercent: 0.1,
    luckBonusPercent: 500,
    description: 'A rare celestial rainbow erupts across the sky, granting +500% of your current luck.'
  }
];

const COMPACT_UNITS = [
  { value: 1e60, suffix: 'UVGT' },
  { value: 1e57, suffix: 'TTG' },
  { value: 1e54, suffix: 'Qiund' },
  { value: 1e51, suffix: 'Qaind' },
  { value: 1e48, suffix: 'Spnd' },
  { value: 1e45, suffix: 'Sxnd' },
  { value: 1e42, suffix: 'Suvg' },
  { value: 1e39, suffix: 'Trvg' },
  { value: 1e36, suffix: 'Uvg' },
  { value: 1e33, suffix: 'Rvg' },
  { value: 1e30, suffix: 'No' },
  { value: 1e27, suffix: 'Sp' },
  { value: 1e24, suffix: 'Sx' },
  { value: 1e21, suffix: 'Qi' },
  { value: 1e18, suffix: 'Qa' },
  { value: 1e15, suffix: 'T' },
  { value: 1e12, suffix: 'B' },
  { value: 1e9, suffix: 'M' },
  { value: 1e6, suffix: 'K' }
];

function formatCompactValue(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs < 1_000_000) {
    if (abs >= 1_000) {
      const kVal = abs / 1_000;
      const formattedK = Number.isInteger(kVal) ? String(kVal) : kVal.toFixed(2).replace(/\.?0+$/, '');
      return `${sign}${formattedK}K`;
    }
    return `${sign}${Number.isInteger(abs) ? abs : abs.toFixed(2).replace(/\.?0+$/, '')}`;
  }

  for (const unit of COMPACT_UNITS) {
    if (abs >= unit.value) {
      const scaled = abs / unit.value;
      const formatted = scaled >= 100
        ? scaled.toFixed(0)
        : scaled >= 10
          ? scaled.toFixed(1).replace(/\.0$/, '')
          : scaled.toFixed(2).replace(/\.?0+$/, '');
      return `${sign}${formatted}${unit.suffix}`;
    }
  }

  return `${sign}${Math.floor(abs)}`;
}

function isTester(userId) {
  if (!db.config.ownerId) db.config.ownerId = userId;
  if (userId === db.config.ownerId) return true;
  return Array.isArray(db.config.testers) && db.config.testers.includes(userId);
}

function canSeeUnreleasedBeta(userId) {
  return isTester(userId);
}

function toSmallCaps(str) {
  if (!str) return '';
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
    k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ',
    u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
    A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ', J: 'ᴊ',
    K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ', S: 'ꜱ', T: 'ᴛ',
    U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
  };
  return str.split(/(<a?:\w+:\d+>)/g).map(part => {
    if (part.startsWith('<') && part.endsWith('>')) return part;
    return part.split('').map(char => map[char] || char).join('');
  }).join('');
}

function getRarityIconMap(useBetaEmojis = false) {
  const map = {
    SRR: '<:Newsrr1:1573559263627055164>',
    UTR: '<:Newutr1:1573559322527662090>',
    STR: '<:Str:1573559367339614348>',
    SSRP: useBetaEmojis ? BETA_EMOJIS.RARITIES.SSRP : '<a:Ssrp:1572096279545126985>',
    UMGR: '<:What:1573806040644980917>'
  };
  (gameData.rarities || []).forEach(r => {
    if (map[r.key]) return;
    map[r.key] = (useBetaEmojis && BETA_EMOJIS.RARITIES[r.key]) ? BETA_EMOJIS.RARITIES[r.key] : r.emoji;
  });
  return map;
}

function getEquippedDiceInfo(user) {
  const rawKey = String(user?.equippedDice || user?.activeDice || user?.diceType || 'zenith').toLowerCase();
  return SHOP_DICE_MAP[rawKey] || SHOP_DICE_MAP.zenith;
}

function getActiveWeatherEvent() {
  if (!db.weather || typeof db.weather !== 'object') {
    db.weather = {
      current: null,
      updatedAt: 0,
      nextUpdateAt: Date.now() + 30 * 60 * 1000
    };
  }
  return db.weather.current || null;
}

function rollWeatherEvent(nowMs = Date.now()) {
  const pool = Array.isArray(gameData.weatherEvents) && gameData.weatherEvents.length > 0
    ? gameData.weatherEvents
    : WEATHER_EVENT_POOL;

  const rollVal = Math.random() * 100;
  let cumulative = 0;
  let selected = null;

  for (const ev of pool) {
    const chance = Number(ev.chancePercent) || 0;
    cumulative += chance;
    if (rollVal <= cumulative) {
      selected = ev;
      break;
    }
  }

  if (!db.weather || typeof db.weather !== 'object') {
    db.weather = {};
  }
  db.weather.current = selected ? { ...selected } : null;
  db.weather.updatedAt = nowMs;
  db.weather.nextUpdateAt = nowMs + 30 * 60 * 1000;
  return db.weather.current;
}

function getUserRollLuckPercent(user) {
  const diceInfo = getEquippedDiceInfo(user);
  const baseDiceLuck = Number(diceInfo.luckPercent) || 0;
  const activeWeather = getActiveWeatherEvent();
  const weatherBonusPct = activeWeather ? (Number(activeWeather.luckBonusPercent) || 0) : 0;
  const weatherBonusLuck = baseDiceLuck * (weatherBonusPct / 100);
  const totalLuckPercent = baseDiceLuck + weatherBonusLuck;

  return {
    diceInfo,
    baseDiceLuck,
    activeWeather,
    weatherBonusLuck,
    totalLuckPercent,
    luckMultiplier: 1 + totalLuckPercent / 100
  };
}

function resolveRankByPoints(pts) {
  const p = Number(pts) || 0;
  if (p >= 50500) return '<:Umythic:1573805848696717383>';
  if (p >= 30500) return '<:Legend1:1573805667737804950>';
  if (p >= 20500) return '<:Legend2:1573805583474098306>';
  if (p >= 10000) return '<:Legend3:1573805501240705094>';
  if (p >= 8002) return '<:Infernoo:1573805416964685894>';
  if (p >= 5501) return '<:Obsidian:1573805351487410196>';
  if (p >= 4001) return '<:Archangell:1573805219618357360>';
  if (p >= 2501) return '<:Zenith:1573805173468303461>';
  if (p >= 1000) return '<:Astral:1573804916198088785>';
  return '<:Unranked:1573804757322178772>';
}

function updateUserRank(user) {
  user.rank = resolveRankByPoints(user.points || 0);
}

function updatePeakRank(user) {
  user.highestSeasonRank = resolveRankByPoints(user.highestSeasonPoints || 0);
}

async function evaluateAndSyncUserBadges(targetUserId, targetUserData, guild = null) {
  const badgeSet = new Set();

  const level = Number(targetUserData.userLevel) || 1;
  if (level >= 50) badgeSet.add('lvl50');
  if (level >= 100) badgeSet.add('lvl100');

  const nowDate = new Date();
  const firstPlayedMs = Number(targetUserData.firstPlayedAt) || Date.parse(targetUserData.joinedDate || '') || nowDate.getTime();
  const daysPlayed = Math.floor(Math.max(0, nowDate.getTime() - firstPlayedMs) / (1000 * 60 * 60 * 24));
  if (daysPlayed >= 100) badgeSet.add('100days');

  // Complete all Collections except SSRP or Event chibi
  const eligibleCatalog = new Set(
    (gameData.chibis || [])
      .filter(c => String(c.rarity || '').toUpperCase() !== 'SSRP')
      .map(c => c.name)
  );
  const ownedEligible = new Set(
    (targetUserData.inventory?.chibis || [])
      .filter(c => String(c.rarity || '').toUpperCase() !== 'SSRP')
      .map(c => c.name)
  );
  if (eligibleCatalog.size > 0 && eligibleCatalog.size === ownedEligible.size) {
    badgeSet.add('collections');
  }

  const ownedDiceSet = new Set(Array.isArray(targetUserData.ownedDice) ? targetUserData.ownedDice : []);
  if (ownedDiceSet.has('hacker') || targetUserData.equippedDice === 'hacker') {
    badgeSet.add('hacker');
  }
  if (ownedDiceSet.has('archangel') || targetUserData.equippedDice === 'archangel') {
    badgeSet.add('archangel');
  }

  const rolledUmgr = Boolean(
    targetUserData.rolledUmgr ||
    (targetUserData.inventory?.chibis || []).some(c => String(c.rarity || '').toUpperCase() === 'UMGR')
  );
  if (rolledUmgr) badgeSet.add('what');

  const gamblingEarned = Number(targetUserData.gamblingEarnings || targetUserData.gamblingWon || 0);
  if (gamblingEarned >= 1_000_000_000_000) badgeSet.add('gamblingod');

  if (targetUserData.foughtDev3v3) badgeSet.add('devvsplayer');

  if (targetUserId === db.config.ownerId || isTester(targetUserId)) {
    badgeSet.add('dev');
  }
  if (targetUserData.permissions === true) {
    badgeSet.add('admin');
  }
  if (targetUserData.supporter === true || targetUserData.betaSupporter === true) {
    badgeSet.add('supporter');
  }

  const month = nowDate.getUTCMonth() + 1;
  const year = nowDate.getUTCFullYear();
  if (year === 2026 && (month === 12 || targetUserData.playedXmas2026)) {
    badgeSet.add('xmas2026');
  }
  if (year === 2026 && (month === 10 || targetUserData.playedHalloween2026)) {
    badgeSet.add('halloween2026');
  }

  if (guild) {
    try {
      const member = await guild.members.fetch(targetUserId).catch(() => null);
      if (member) {
        if (member.premiumSinceTimestamp) {
          badgeSet.add('boostinguser');
          badgeSet.add('nitrouser');
        }
        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          badgeSet.add('admin');
        }
        if (
          member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
          member.permissions.has(PermissionsBitField.Flags.ManageMessages)
        ) {
          badgeSet.add('mods');
        }
      }
    } catch {}
  }

  targetUserData.badges = Array.from(badgeSet).filter(k => Boolean(BADGE_CATALOG?.[k]));
  return targetUserData.badges;
}

function isValidProfileBgUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    return (
      /\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(parsed.pathname) ||
      parsed.hostname.includes('giphy.com') || parsed.hostname.includes('tenor.com') ||
      parsed.hostname.includes('discordapp.com') || parsed.hostname.includes('discordapp.net')
    );
  } catch {
    return false;
  }
}

function ensureUser(userId) {
  const now = Date.now();
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      joinedDate: new Date(now).toLocaleDateString(),
      firstPlayedAt: now,
      dice: 10,
      cash: 0,
      equippedDice: 'zenith',
      ownedDice: ['zenith'],
      gamblingEarnings: 0,
      rolledUmgr: false,
      foughtDev3v3: false,
      points: 0,
      rank: '<:Unranked:1573804757322178772>',
      clan: null,
      customNickname: null,
      profileBg: null,
      profileAccentColor: null,
      highestSeasonRank: '<:Unranked:1573804757322178772>',
      highestSeasonPoints: 0,
      inventory: { chibis: [], items: { spray: 0, clover: 0 } },
      team: [null, null, null],
      equippedChibi: null,
      bestRoll: 'None',
      bestRollTier: 0,
      bestRollVal: 0,
      bestChibi: null,
      userLevel: 1,
      userExp: 0,
      lastDrop: 0,
      todayDrops: 0,
      lastDaily: 0,
      streak: 0,
      permissions: false,
      customStatus: null,
      badges: [],
      clanMail: []
    };
    updateUserRank(db.users[userId]);
    saveUsers();
  } else {
    const u = db.users[userId];
    if (!u.joinedDate) u.joinedDate = new Date(now).toLocaleDateString();
    if (!u.firstPlayedAt) {
      const parsedJoined = Date.parse(u.joinedDate);
      u.firstPlayedAt = !Number.isNaN(parsedJoined) && parsedJoined > 0 ? parsedJoined : now;
    }
    if (!u.equippedDice) u.equippedDice = 'zenith';
    if (!Array.isArray(u.ownedDice)) u.ownedDice = [u.equippedDice];
    if (typeof u.gamblingEarnings !== 'number') u.gamblingEarnings = 0;
    if (typeof u.rolledUmgr !== 'boolean') u.rolledUmgr = false;
    if (typeof u.foughtDev3v3 !== 'boolean') u.foughtDev3v3 = false;
    if (!u.bestRoll) u.bestRoll = 'None';
    if (!Array.isArray(u.badges)) u.badges = [];
    if (!Array.isArray(u.clanMail)) u.clanMail = [];
    if (typeof u.profileBg !== 'string') u.profileBg = null;
    if (typeof u.profileAccentColor !== 'number') u.profileAccentColor = null;
    updateUserRank(u);
    updatePeakRank(u);
  }
}

function getClanLogoDisplay(logoId) {
  if (!logoId) return CLAN_LOGOS['1'];
  return CLAN_LOGOS[String(logoId)] || CLAN_LOGOS['1'];
}

function getClanLogoImageUrl(logoId) {
  const emojiStr = getClanLogoDisplay(logoId);
  const match = emojiStr.match(/^<(a)?:\w+:(\d+)>$/);
  if (!match) return 'https://cdn.discordapp.com/emojis/1572057180704604261.gif?size=256';
  const ext = Boolean(match[1]) ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${match[2]}.${ext}?size=256`;
}

function getClanLogoListText() {
  return Object.entries(CLAN_LOGOS).map(([id, emoji]) => `[${id}] - ${emoji}`).join('\n');
}

function getClanMemberRole(clanObj, memberId) {
  if (!clanObj) return 'Member';
  if (clanObj.leader === memberId) return 'Leader';
  if (clanObj.roles && clanObj.roles[memberId]) return clanObj.roles[memberId];
  if (clanObj.viceLeader === memberId) return 'Co-Leader';
  return 'Member';
}

function pushClanMail(userId, mailItem) {
  ensureUser(userId);
  if (!Array.isArray(db.users[userId].clanMail)) db.users[userId].clanMail = [];
  db.users[userId].clanMail.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: mailItem.title || 'Clan Notice',
    body: mailItem.body || '',
    category: mailItem.category || 'Status',
    reward: mailItem.reward || null,
    claimed: Boolean(mailItem.claimed),
    timestamp: Date.now()
  });
  if (db.users[userId].clanMail.length > 25) db.users[userId].clanMail = db.users[userId].clanMail.slice(0, 25);
}

function parseDurationToMs(durationStr) {
  const match = durationStr.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    case 'w': return val * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function formatTimeRemaining(ms) {
  if (ms <= 0) return toSmallCaps('Ended');
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return toSmallCaps(`${days}d ${hours}h`);
  if (hours > 0) return toSmallCaps(`${hours}h ${minutes}m`);
  return toSmallCaps(`${minutes}m`);
}

function formatTimePlayed(startInput, nowMs = Date.now()) {
  let startMs = null;

  if (typeof startInput === 'number' && Number.isFinite(startInput) && startInput > 0) {
    startMs = startInput;
  } else if (typeof startInput === 'string' && startInput.trim()) {
    const parsed = Date.parse(startInput.trim());
    if (!Number.isNaN(parsed) && parsed > 0) {
      startMs = parsed;
    }
  }

  if (!startMs || nowMs <= startMs) {
    return '0s';
  }

  let remSec = Math.floor((nowMs - startMs) / 1000);

  const secInMin = 60;
  const secInHour = 3600;
  const secInDay = 86400;
  const secInWeek = 7 * secInDay;
  const secInMonth = 30 * secInDay;
  const secInYear = 365 * secInDay;

  const years = Math.floor(remSec / secInYear);
  remSec %= secInYear;

  const months = Math.floor(remSec / secInMonth);
  remSec %= secInMonth;

  const weeks = Math.floor(remSec / secInWeek);
  remSec %= secInWeek;

  const days = Math.floor(remSec / secInDay);
  remSec %= secInDay;

  const hours = Math.floor(remSec / secInHour);
  remSec %= secInHour;

  const minutes = Math.floor(remSec / secInMin);
  const seconds = remSec % secInMin;

  const units = [];
  if (years > 0) units.push(`${years}y`);
  if (months > 0) units.push(`${months}mo`);
  if (weeks > 0) units.push(`${weeks}w`);
  if (days > 0) units.push(`${days}d`);
  if (hours > 0) units.push(`${hours}h`);
  if (minutes > 0) units.push(`${minutes}m`);
  units.push(`${seconds}s`);

  return units.join(' ');
}

function addExpAndLevelUp(user, chibi, baseExpAmount) {
  const xpMultiplier = db.config.globalXpMultiplier || 1.0;
  const expAmount = Math.round(baseExpAmount * xpMultiplier);

  user.userExp += expAmount;
  let userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
  while (user.userExp >= userMaxExp) {
    user.userExp -= userMaxExp;
    user.userLevel += 1;
    userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
  }

  if (chibi) {
    chibi.exp += expAmount;
    const baseChibiExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
    const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
    let chibiMaxExp = baseChibiExp + (chibi.level - 1) * perLvl;
    while (chibi.exp >= chibiMaxExp) {
      chibi.exp -= chibiMaxExp;
      chibi.level += 1;
      chibiMaxExp = baseChibiExp + (chibi.level - 1) * perLvl;
    }
  }
  return expAmount;
}

function parseOddsNumber(oddsString) {
  if (!oddsString) return 1;
  const cleanStr = oddsString.replace(/,/g, '').trim();
  const match = cleanStr.match(/(\d+(?:\.\d+)?)([KMBT])?/i);
  if (!match) return 1;
  const numPart = parseFloat(match[1]);
  const unit = match[2] ? match[2].toUpperCase() : '';
  if (unit === 'T') return numPart * 1_000_000_000_000;
  if (unit === 'B') return numPart * 1_000_000_000;
  if (unit === 'M') return numPart * 1_000_000;
  if (unit === 'K') return numPart * 1_000;
  return numPart;
}

module.exports = {
  SHOP_DICE_MAP,
  WEATHER_EVENT_POOL,
  formatCompactValue,
  isTester,
  canSeeUnreleasedBeta,
  toSmallCaps,
  getRarityIconMap,
  getEquippedDiceInfo,
  getActiveWeatherEvent,
  rollWeatherEvent,
  getUserRollLuckPercent,
  resolveRankByPoints,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  isValidProfileBgUrl,
  ensureUser,
  getClanLogoDisplay,
  getClanLogoImageUrl,
  getClanLogoListText,
  getClanMemberRole,
  pushClanMail,
  parseDurationToMs,
  formatTimeRemaining,
  formatTimePlayed,
  addExpAndLevelUp,
  parseOddsNumber
};