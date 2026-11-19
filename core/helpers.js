
const { PermissionsBitField } = require('discord.js');
const {
  BADGE_CATALOG,
  BETA_EMOJIS,
  CLAN_LOGOS
} = require('./constants');
const { gameData, db, saveUsers } = require('./database');

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

  const parts = str.split(/(<a?:\w+:\d+>)/g);
  return parts.map(part => {
    if (part.startsWith('<') && part.endsWith('>')) {
      return part;
    }
    return part.split('').map(char => map[char] || char).join('');
  }).join('');
}

function getRarityIconMap(useBetaEmojis = false) {
  const map = { SSRP: useBetaEmojis ? BETA_EMOJIS.RARITIES.SSRP : '<a:Ssrp:1572096279545126985>' };
  (gameData.rarities || []).forEach(r => {
    if (useBetaEmojis && BETA_EMOJIS.RARITIES[r.key]) {
      map[r.key] = BETA_EMOJIS.RARITIES[r.key];
    } else {
      map[r.key] = r.emoji;
    }
  });
  return map;
}

function updateUserRank(user) {
  const pts = user.points || 0;
  if (pts >= 8002) {
    user.rank = '<:Inferno:1571314769741357117>';
  } else if (pts >= 5501) {
    user.rank = '<:Obsidian:1571314669732237533>';
  } else if (pts >= 4001) {
    user.rank = '<:Archangel:1571314592993247282>';
  } else if (pts >= 2501) {
    user.rank = '<:Zenith:1571314408875884714>';
  } else if (pts >= 1000) {
    user.rank = '<:Astral:1571314353796284496>';
  } else {
    user.rank = '<:unranked:1571314276071907519>';
  }
}

function updatePeakRank(user) {
  const pts = user.highestSeasonPoints || 0;
  if (pts >= 8002) {
    user.highestSeasonRank = '<:Inferno:1571314769741357117>';
  } else if (pts >= 5501) {
    user.highestSeasonRank = '<:Obsidian:1571314669732237533>';
  } else if (pts >= 4001) {
    user.highestSeasonRank = '<:Archangel:1571314592993247282>';
  } else if (pts >= 2501) {
    user.highestSeasonRank = '<:Zenith:1571314408875884714>';
  } else if (pts >= 1000) {
    user.highestSeasonRank = '<:Astral:1571314353796284496>';
  } else {
    user.highestSeasonRank = '<:unranked:1571314276071907519>';
  }
}

async function evaluateAndSyncUserBadges(targetUserId, targetUserData, guild = null) {
  if (!Array.isArray(targetUserData.badges)) {
    targetUserData.badges = [];
  }

  const badgeSet = new Set(targetUserData.badges);

  if ((targetUserData.userLevel || 1) >= 100) {
    badgeSet.add('lvl100');
  }

  const allUniqueCatalogChibis = new Set((gameData.chibis || []).map(c => c.name));
  const ownedUniqueChibis = new Set((targetUserData.inventory?.chibis || []).map(c => c.name));
  if (allUniqueCatalogChibis.size > 0 && allUniqueCatalogChibis.size === ownedUniqueChibis.size) {
    badgeSet.add('collections');
  }

  if (targetUserId === db.config.ownerId) {
    badgeSet.add('developer');
    badgeSet.add('staff');
  }

  if (targetUserData.permissions === true) {
    badgeSet.add('staff');
  }

  if (Array.isArray(db.config.testers) && db.config.testers.includes(targetUserId)) {
    badgeSet.add('support');
  }

  const nowDate = new Date();
  const month = nowDate.getUTCMonth() + 1;
  const year = nowDate.getUTCFullYear();
  if (year === 2026 && month === 12) {
    badgeSet.add('xmas2026');
  }
  if (year === 2026 && month === 10) {
    badgeSet.add('halloween2026');
  }

  if (guild) {
    try {
      const member = await guild.members.fetch(targetUserId).catch(() => null);
      if (member) {
        if (member.premiumSinceTimestamp) {
          badgeSet.add('booster');
          badgeSet.add('nitro');
        }
        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          badgeSet.add('staff');
        }
        if (member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          badgeSet.add('moderator');
        }
      }
    } catch {}
  }

  targetUserData.badges = Array.from(badgeSet).filter(k => Boolean(BADGE_CATALOG[k]));
  return targetUserData.badges;
}

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      joinedDate: new Date().toLocaleDateString(),
      dice: 10,
      points: 0,
      rank: '<:unranked:1571314276071907519>',
      clan: null,
      customNickname: null,
      highestSeasonRank: '<:unranked:1571314276071907519>',
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
    if (!db.users[userId].joinedDate) {
      db.users[userId].joinedDate = new Date().toLocaleDateString();
    }
    if (!Array.isArray(db.users[userId].badges)) {
      db.users[userId].badges = [];
    }
    if (!Array.isArray(db.users[userId].clanMail)) {
      db.users[userId].clanMail = [];
    }
    updateUserRank(db.users[userId]);
    updatePeakRank(db.users[userId]);
  }
}

function getClanLogoDisplay(logoId) {
  if (!logoId) return CLAN_LOGOS['1'];
  return CLAN_LOGOS[String(logoId)] || CLAN_LOGOS['1'];
}

function getClanLogoImageUrl(logoId) {
  const emojiStr = getClanLogoDisplay(logoId);
  const match = emojiStr.match(/^<(a)?:\w+:(\d+)>$/);
  if (!match) {
    return 'https://cdn.discordapp.com/emojis/1572057180704604261.gif?size=256';
  }
  const isAnimated = Boolean(match[1]);
  const id = match[2];
  const ext = isAnimated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=256`;
}

function getClanLogoListText() {
  return Object.entries(CLAN_LOGOS)
    .map(([id, emoji]) => `[${id}] - ${emoji}`)
    .join('\n');
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
  if (!Array.isArray(db.users[userId].clanMail)) {
    db.users[userId].clanMail = [];
  }
  db.users[userId].clanMail.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: mailItem.title || 'Clan Notice',
    body: mailItem.body || '',
    category: mailItem.category || 'Status',
    reward: mailItem.reward || null,
    claimed: Boolean(mailItem.claimed),
    timestamp: Date.now()
  });
  if (db.users[userId].clanMail.length > 25) {
    db.users[userId].clanMail = db.users[userId].clanMail.slice(0, 25);
  }
}

function parseDurationToMs(durationStr) {
  const match = durationStr.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
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
  isTester,
  canSeeUnreleasedBeta,
  toSmallCaps,
  getRarityIconMap,
  updateUserRank,
  updatePeakRank,
  evaluateAndSyncUserBadges,
  ensureUser,
  getClanLogoDisplay,
  getClanLogoImageUrl,
  getClanLogoListText,
  getClanMemberRole,
  pushClanMail,
  parseDurationToMs,
  formatTimeRemaining,
  addExpAndLevelUp,
  parseOddsNumber
};