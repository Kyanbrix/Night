const mongoose = require('mongoose');
const constants = require('./constants');
const { gameData, db, saveUsers } = require('./database');

const BADGE_CATALOG = constants.BADGE_CATALOG || {};
const TESTER_IDS = constants.TESTER_IDS || new Set();
const UNRELEASED_BETA_VIEWERS = constants.UNRELEASED_BETA_VIEWERS || new Set();
const CLAN_LOGOS = constants.CLAN_LOGOS || {};
const RARITY_HIERARCHY = constants.RARITY_HIERARCHY || {
  SSRP: 7,
  UTR: 6,
  SRR: 5,
  SR: 4,
  R: 3,
  U: 2,
  C: 1
};

const DEFAULT_RANK_TIERS = [
  { name: 'Mythic', icon: '👑', minPoints: 10000 },
  { name: 'Legend', icon: '🔥', minPoints: 5000 },
  { name: 'Master', icon: '💎', minPoints: 2500 },
  { name: 'Diamond', icon: '💠', minPoints: 1000 },
  { name: 'Gold', icon: '🥇', minPoints: 500 },
  { name: 'Silver', icon: '🥈', minPoints: 200 },
  { name: 'Bronze', icon: '🥉', minPoints: 50 },
  { name: 'Unranked', icon: '<:unranked:1571314276071907519>', minPoints: 0 }
];

const RANK_TIERS =
  Array.isArray(constants.RANK_TIERS) && constants.RANK_TIERS.length > 0
    ? constants.RANK_TIERS
    : DEFAULT_RANK_TIERS;

const RANKS_LIST =
  Array.isArray(constants.RANKS_LIST) && constants.RANKS_LIST.length > 0
    ? constants.RANKS_LIST
    : [...RANK_TIERS].reverse();

const PROFILE_BG_PRESETS = {
  neon: {
    label: 'Neon Anime Night',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/3o7abB06u9bNzA8lu8/giphy.gif'
  },
  sakura: {
    label: 'Sakura Rain',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/l0HlBO7eyXzSZkJri/giphy.gif'
  },
  galaxy: {
    label: 'Celestial Galaxy',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2Z5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/26uf2YTgF5upVT9ng/giphy.gif'
  },
  cyber: {
    label: 'Cyber Grid',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGZ5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/xT9IgG50Fb7Mi0prBC/giphy.gif'
  },
  cafe: {
    label: 'Cozy Cafe',
    url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmZ5d3J4c2h4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4cnh4/l3q2K5jinAlChoCLS/giphy.gif'
  }
};

function isTester(userId) {
  if (!userId) return false;
  const idStr = String(userId);
  if (TESTER_IDS && typeof TESTER_IDS.has === 'function' && TESTER_IDS.has(idStr)) {
    return true;
  }
  if (Array.isArray(db?.config?.betaTesters) && db.config.betaTesters.map(String).includes(idStr)) {
    return true;
  }
  if (db?.users?.[idStr]?.isBetaTester === true) {
    return true;
  }
  return false;
}

function canSeeUnreleasedBeta(userId) {
  if (!userId) return false;
  if (isTester(userId)) return true;
  if (
    UNRELEASED_BETA_VIEWERS &&
    typeof UNRELEASED_BETA_VIEWERS.has === 'function' &&
    UNRELEASED_BETA_VIEWERS.has(String(userId))
  ) {
    return true;
  }
  return false;
}

function hasSupporterAndNitroBadge(userObj, syncedBadgeKeys = []) {
  const rawList = [
    ...(Array.isArray(syncedBadgeKeys) ? syncedBadgeKeys : []),
    ...(Array.isArray(userObj?.badges) ? userObj.badges : [])
  ];

  const normalized = new Set(
    rawList.map(k => String(k || '').trim().toLowerCase()).filter(Boolean)
  );

  const hasSupporter =
    normalized.has('support') ||
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
  } catch {
    return null;
  }

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
  return String(str).split('').map(ch => smallCapsMap[ch] || ch).join('');
}

function getRarityIconMap(useBetaView = false) {
  const map = {};
  if (gameData && Array.isArray(gameData.rarities)) {
    for (const r of gameData.rarities) {
      if (r && r.key) map[r.key] = r.icon || '📦';
    }
  }
  if (!map['SSRP']) map['SSRP'] = '🌟';
  if (useBetaView) {
    map['C'] = '<:Newcommon:1572758041843998902>';
    map['U'] = '<:Newuncommon:1572758105412997210>';
    map['R'] = '<:Newrare:1572759318510571560>';
    map['SR'] = '<:NewSR:1572759359258107996>';
    map['UTR'] = '<:NewUTR:1572759426266566699>';
    map['SSRP'] = '<a:NewSSRP:1572759498198745248>';
  }
  return map;
}

function updateUserRank(userObj) {
  if (!userObj) return;
  const pts = Number(userObj.points) || 0;
  let assignedTier = RANK_TIERS[RANK_TIERS.length - 1];
  for (const tier of RANK_TIERS) {
    if (pts >= (Number(tier.minPoints) || 0)) {
      assignedTier = tier;
      break;
    }
  }
  if (assignedTier) {
    userObj.rank = assignedTier.icon;
    userObj.rankName = assignedTier.name;
  }
}

function updatePeakRank(userObj) {
  if (!userObj) return;
  const currentPts = Number(userObj.points) || 0;
  const currentTierIdx = RANKS_LIST.findIndex(r => r.icon === userObj.rank);
  const highestTierIdx = RANKS_LIST.findIndex(r => r.icon === userObj.highestSeasonRank);

  if (
    !userObj.highestSeasonRank ||
    (currentTierIdx !== -1 && (highestTierIdx === -1 || currentTierIdx > highestTierIdx))
  ) {
    userObj.highestSeasonRank = userObj.rank || '<:unranked:1571314276071907519>';
  }
  if (currentPts > (Number(userObj.highestSeasonPoints) || 0)) {
    userObj.highestSeasonPoints = currentPts;
  }
}

async function evaluateAndSyncUserBadges(userId, userObj, guild = null) {
  if (!userObj) return [];
  if (!Array.isArray(userObj.badges)) userObj.badges = [];
  const badgeSet = new Set(userObj.badges);

  const supporterBadge = BADGE_CATALOG.support || BADGE_CATALOG.supporter;
  if (guild && supporterBadge?.roleId) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && member.roles?.cache?.has(supporterBadge.roleId)) {
        badgeSet.add(BADGE_CATALOG.support ? 'support' : 'supporter');
      }
    } catch {}
  }

  userObj.badges = Array.from(badgeSet);
  return userObj.badges;
}

function ensureUser(userId) {
  if (!db.users) db.users = {};
  const idStr = String(userId);
  if (!db.users[idStr]) {
    db.users[idStr] = {
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
    if (db.users[idStr].profileBg === undefined) db.users[idStr].profileBg = null;
    if (!Array.isArray(db.users[idStr].badges)) db.users[idStr].badges = [];
    if (!Array.isArray(db.users[idStr].clanMail)) db.users[idStr].clanMail = [];
    if (!db.users[idStr].inventory) {
      db.users[idStr].inventory = { items: { spray: 0, clover: 0 }, chibis: [] };
    }
    if (!db.users[idStr].inventory.items) {
      db.users[idStr].inventory.items = { spray: 0, clover: 0 };
    }
    if (!Array.isArray(db.users[idStr].inventory.chibis)) {
      db.users[idStr].inventory.chibis = [];
    }
    if (!Array.isArray(db.users[idStr].team)) {
      db.users[idStr].team = [null, null, null];
    }
  }
  return db.users[idStr];
}

function getClanLogoDisplay(logoId) {
  if (!logoId) return '🛡️';
  if (Array.isArray(CLAN_LOGOS)) {
    const foundArr = CLAN_LOGOS.find(l => l && l.id === logoId);
    return foundArr?.emoji || '🛡️';
  }
  return CLAN_LOGOS[String(logoId)] || '🛡️';
}

function formatTimeRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function addExpAndLevelUp(userObj, chibiObj, rawExp) {
  const xpMult = Number(db?.config?.globalXpMultiplier) || 1.0;
  const gained = Math.max(1, Math.round((Number(rawExp) || 0) * xpMult));

  userObj.userExp = (Number(userObj.userExp) || 0) + gained;
  const baseExp = Number(gameData?.settings?.userExpBase) || 100;
  const perLevel = Number(gameData?.settings?.userExpPerLevel) || 50;
  userObj.userLevel = Number(userObj.userLevel) || 1;

  while (userObj.userExp >= baseExp + (userObj.userLevel - 1) * perLevel) {
    userObj.userExp -= baseExp + (userObj.userLevel - 1) * perLevel;
    userObj.userLevel++;
  }

  if (chibiObj) {
    chibiObj.exp = (Number(chibiObj.exp) || 0) + gained;
    chibiObj.level = Number(chibiObj.level) || 1;
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

function pushClanMail(userId, mailItem = {}) {
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
  db.users[String(userId)].clanMail.push(entry);
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