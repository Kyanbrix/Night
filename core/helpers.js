const mongoose = require('mongoose');
const {
  BADGE_CATALOG,
  TESTER_IDS,
  UNRELEASED_BETA_VIEWERS,
  RANK_TIERS,
  RANKS_LIST,
  CLAN_LOGOS,
  RARITY_HIERARCHY
} = require('./constants');
const { gameData, db, User, GameState, saveUsers } = require('./database');

const PROFILE_BG_PRESETS = {
  neon: {
    label: 'Neon Anime Night',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/3o7abB06u9bNzA8lu8/giphy.gif'
  },
  sakura: {
    label: 'Sakura Rain',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/l0HlBO7eyXzSZkJri/giphy.gif'
  },
  galaxy: {
    label: 'Celestial Galaxy',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/26uf2YTgF5upVT9ng/giphy.gif'
  },
  cyber: {
    label: 'Cyber Grid',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGZ5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/xT9IgG50Fb7Mi0prBC/giphy.gif'
  },
  cafe: {
    label: 'Cozy Cafe',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmZ5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/l3q2K5jinAlChoCLS/giphy.gif'
  }
};

function isTester(userId) {
  if (!userId) return false;
  const idStr = String(userId);
  if (TESTER_IDS.has(idStr)) return true;
  if (Array.isArray(db.config?.betaTesters) && db.config.betaTesters.includes(idStr)) return true;
  if (db.users?.[idStr]?.isBetaTester === true) return true;
  return false;
}

function canSeeUnreleasedBeta(userId) {
  if (!userId) return false;
  return isTester(userId) || UNRELEASED_BETA_VIEWERS.has(String(userId));
}

function hasSupporterAndNitroBadge(userObj, syncedBadgeKeys = []) {
  const rawList = [
    ...(Array.isArray(syncedBadgeKeys) ? syncedBadgeKeys : []),
    ...(Array.isArray(userObj?.badges) ? userObj.badges : [])
  ];

  const normalized = new Set(
    rawList.map(k => String(k || '').trim().toLowerCase())
  );

  const hasSupporter =
    normalized.has('supporter') ||
    normalized.has('beta_supporter') ||
    normalized.has('server_supporter');

  const hasNitro =
    normalized.has('nitro') ||
    normalized.has('discord_nitro') ||
    normalized.has('nitro_booster');

  return hasSupporter && hasNitro;
}

function parseProfileBgInput(rawInput) {
  if (!rawInput) return null;
  const trimmed = String(rawInput).trim();
  const lower = trimmed.toLowerCase();

  if (PROFILE_BG_PRESETS[lower]) {
    return {
      type: 'preset',
      key: lower,
      label: PROFILE_BG_PRESETS[lower].label,
      url: PROFILE_BG_PRESETS[lower].url
    };
  }

  try {
    const parsed = new URL(trimmed);
    const cleanPath = parsed.pathname.toLowerCase();
    const isHttps = parsed.protocol === 'https:';
    const isGif = cleanPath.endsWith('.gif') || parsed.searchParams.get('format') === 'gif';
    if (isHttps && isGif) {
      return {
        type: 'url',
        key: 'custom',
        label: 'Custom GIF',
        url: parsed.toString()
      };
    }
  } catch {}

  return null;
}

function toSmallCaps(str) {
  if (!str) return '';
  const smallCapsMap = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
    A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
    J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
    S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
  };
  return str.split('').map(ch => smallCapsMap[ch] || ch).join('');
}

function getRarityIconMap(useBetaView = false) {
  const map = {};
  if (gameData && Array.isArray(gameData.rarities)) {
    for (const r of gameData.rarities) {
      map[r.key] = r.icon || '📦';
    }
  }
  if (!map['SSRP']) map['SSRP'] = '🌟';
  if (useBetaView) {
    map['C'] = '<:c_badge:1572796342185341008>';
    map['U'] = '<:u_badge:1572796348732784824>';
    map['R'] = '<:r_badge:1572796356013895721>';
    map['SR'] = '<:sr_badge:1572796362834223144>';
    map['UTR'] = '<:utr_badge:1572796370001809468>';
    map['SSRP'] = '<:ssrp_badge:1572796376536334438>';
  }
  return map;
}

function updateUserRank(userObj) {
  if (!userObj) return;
  const pts = userObj.points || 0;
  let assignedTier = RANK_TIERS[RANK_TIERS.length - 1];
  for (const tier of RANK_TIERS) {
    if (pts >= tier.minPoints) {
      assignedTier = tier;
      break;
    }
  }
  userObj.rank = assignedTier.icon;
  userObj.rankName = assignedTier.name;
}

function updatePeakRank(userObj) {
  if (!userObj) return;
  const currentPts = userObj.points || 0;
  const currentTierIdx = RANKS_LIST.findIndex(r => r.icon === userObj.rank);
  const highestTierIdx = RANKS_LIST.findIndex(r => r.icon === userObj.highestSeasonRank);

  if (!userObj.highestSeasonRank || (currentTierIdx !== -1 && (highestTierIdx === -1 || currentTierIdx > highestTierIdx))) {
    userObj.highestSeasonRank = userObj.rank || '<:unranked:1571314276071907519>';
  }
  if (currentPts > (userObj.highestSeasonPoints || 0)) {
    userObj.highestSeasonPoints = currentPts;
  }
}

async function evaluateAndSyncUserBadges(userId, userObj, guild = null) {
  if (!userObj) return [];
  if (!Array.isArray(userObj.badges)) userObj.badges = [];
  const badgeSet = new Set(userObj.badges);

  if (guild && BADGE_CATALOG.supporter?.roleId) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && member.roles?.cache?.has(BADGE_CATALOG.supporter.roleId)) {
        badgeSet.add('supporter');
      }
    } catch {}
  }

  userObj.badges = Array.from(badgeSet);
  return userObj.badges;
}

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      joinedDate: null,
      dice: 0,
      points: 0,
      streak: 0,
      lastDaily: 0,
      lastDrop: 0,
      todayDrops: 0,
      rank: '<:unranked:1571314276071907519>',
      rankName: 'Unranked',
      highestSeasonRank: '<:unranked:1571314276071907519>',
      highestSeasonPoints: 0,
      customNickname: null,
      customStatus: null,
      profileBg: null,
      clan: null,
      userLevel: 1,
      userExp: 0,
      equippedChibi: null,
      team: [null, null, null],
      bestRoll: '1 in 1',
      bestRollTier: 0,
      bestRollVal: 0,
      bestChibi: null,
      badges: [],
      clanMail: [],
      inventory: {
        items: { spray: 0, clover: 0 },
        chibis: []
      }
    };
  } else {
    if (db.users[userId].profileBg === undefined) db.users[userId].profileBg = null;
    if (!Array.isArray(db.users[userId].badges)) db.users[userId].badges = [];
    if (!Array.isArray(db.users[userId].clanMail)) db.users[userId].clanMail = [];
    if (!db.users[userId].inventory) db.users[userId].inventory = { items: { spray: 0, clover: 0 }, chibis: [] };
    if (!db.users[userId].inventory.items) db.users[userId].inventory.items = { spray: 0, clover: 0 };
    if (!Array.isArray(db.users[userId].inventory.chibis)) db.users[userId].inventory.chibis = [];
    if (!Array.isArray(db.users[userId].team)) db.users[userId].team = [null, null, null];
  }
  return db.users[userId];
}

function getClanLogoDisplay(logoId) {
  if (!logoId) return '🛡️';
  const found = CLAN_LOGOS.find(l => l.id === logoId);
  return found ? found.emoji : '🛡️';
}

function formatTimeRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function addExpAndLevelUp(userObj, chibiObj, rawExp) {
  const xpMult = db.config.globalXpMultiplier || 1.0;
  const gained = Math.max(1, Math.round(rawExp * xpMult));

  userObj.userExp = (userObj.userExp || 0) + gained;
  const baseExp = gameData.settings.userExpBase || 100;
  const perLevel = gameData.settings.userExpPerLevel || 50;
  userObj.userLevel = userObj.userLevel || 1;

  while (userObj.userExp >= baseExp + (userObj.userLevel - 1) * perLevel) {
    userObj.userExp -= baseExp + (userObj.userLevel - 1) * perLevel;
    userObj.userLevel++;
  }

  if (chibiObj) {
    chibiObj.exp = (chibiObj.exp || 0) + gained;
    chibiObj.level = chibiObj.level || 1;
    while (chibiObj.exp >= 100 + (chibiObj.level - 1) * 50) {
      chibiObj.exp -= 100 + (chibiObj.level - 1) * 50;
      chibiObj.level++;
    }
  }

  return gained;
}

function parseOddsNumber(oddsStr) {
  if (!oddsStr || typeof oddsStr !== 'string') return 1;
  const cleaned = oddsStr.replace(/1\s*in\s*/i, '').trim().toUpperCase();
  const suffixes = {
    K: 1e3,
    M: 1e6,
    B: 1e9,
    T: 1e12,
    QA: 1e15,
    QI: 1e18,
    SX: 1e21,
    SP: 1e24,
    OC: 1e27,
    NO: 1e30
  };
  const match = cleaned.match(/^([\d,.]+)\s*([A-Z]*)$/);
  if (!match) return parseFloat(cleaned.replace(/,/g, '')) || 1;
  const num = parseFloat(match[1].replace(/,/g, '')) || 1;
  const mult = suffixes[match[2]] || 1;
  return num * mult;
}

function pushClanMail(userId, mailItem) {
  ensureUser(userId);
  const entry = {
    id: new mongoose.Types.ObjectId().toString(),
    title: mailItem.title || 'Clan Notice',
    body: mailItem.body || '',
    category: mailItem.category || 'General',
    timestamp: Date.now(),
    claimed: Boolean(mailItem.claimed),
    reward: mailItem.reward || null
  };
  db.users[userId].clanMail.push(entry);
  return entry;
}

module.exports = {
  PROFILE_BG_PRESETS,
  isTester,
  canSeeUnreleasedBeta,
  hasSupporterAndNitroBadge,
  parseProfileBgInput,
  toSmallCaps,
  getRarityIconMap,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  ensureUser,
  getClanLogoDisplay,
  formatTimeRemaining,
  addExpAndLevelUp,
  parseOddsNumber,
  pushClanMail
};