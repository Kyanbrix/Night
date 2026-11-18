
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const mongoose = require('mongoose');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = path.join(__dirname, 'data.json');

function loadGameData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error('data.json is missing! Please make sure your data.json is in the root directory.');
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

const gameData = loadGameData();

const GameStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'main_state' },
  users: { type: Object, default: {} },
  clans: { type: Object, default: {} },
  guildPrefixes: { type: Object, default: {} },
  channelRestrictions: { type: Object, default: {} },
  bannedUsers: { type: Object, default: {} },
  tradeHistories: { type: Object, default: {} },
  config: {
    type: Object,
    default: {
      ownerId: '',
      mainGuildId: '',
      globalLuckMultiplier: 1.0,
      luckEventExpires: 0,
      globalXpMultiplier: 1.0,
      xpEventExpires: 0,
      seasonNumber: 1,
      seasonStartedAt: Date.now(),
      seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000),
      clanSeasonExpires: Date.now() + (7 * 24 * 60 * 60 * 1000),
      maintenanceMode: false,
      clanRewards: {
        1: { qty: 5, rarity: 'UTR', chibiEmoji: '🌟' },
        2: { qty: 3, rarity: 'SRR', chibiEmoji: '🔥' },
        3: { qty: 2, rarity: 'SR', chibiEmoji: '⚡' }
      },
      eventActive: true,
      eventCrystals: {},
      eventShop: {
        'cat_event': { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>', cost: 100 },
        'doge_event': { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>', cost: 120 },
        'troll_event': { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>', cost: 200 },
        'frien_event': { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>', cost: 350 },
        'seren_event': { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>', cost: 550 },
        'hellkitty_event': { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>', cost: 650 },
        'mezz_event': { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>', cost: 750 },
        'ruru_event': { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>', cost: 1000 },
        'zoprb_event': { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>', cost: 3000 },
        'kazerb_event': { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>', cost: 4500 },
        'georb_event': { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>', cost: 5000 }
      }
    }
  }
});

const GameState = mongoose.model('GameState', GameStateSchema);

let db = {
  users: {},
  clans: {},
  guildPrefixes: {},
  channelRestrictions: {},
  bannedUsers: {},
  tradeHistories: {},
  config: {
    ownerId: '',
    mainGuildId: '',
    globalLuckMultiplier: 1.0,
    luckEventExpires: 0,
    globalXpMultiplier: 1.0,
    xpEventExpires: 0,
    seasonNumber: 1,
    seasonStartedAt: Date.now(),
    seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000),
    clanSeasonExpires: Date.now() + (7 * 24 * 60 * 60 * 1000),
    maintenanceMode: false,
    clanRewards: {
      1: { qty: 5, rarity: 'UTR', chibiEmoji: '🌟' },
      2: { qty: 3, rarity: 'SRR', chibiEmoji: '🔥' },
      3: { qty: 2, rarity: 'SR', chibiEmoji: '⚡' }
    },
    eventActive: true,
    eventCrystals: {},
    eventShop: {
      'cat_event': { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>', cost: 100 },
      'doge_event': { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>', cost: 120 },
      'troll_event': { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>', cost: 200 },
      'frien_event': { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>', cost: 350 },
      'seren_event': { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>', cost: 550 },
      'hellkitty_event': { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>', cost: 650 },
      'mezz_event': { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>', cost: 750 },
      'ruru_event': { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>', cost: 1000 },
      'zoprb_event': { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>', cost: 3000 },
      'kazerb_event': { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>', cost: 4500 },
      'georb_event': { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>', cost: 5000 }
    }
  }
};

const CLAN_LOGOS = {
  '1': '<a:Clanlogo1:1572057180704604261>',
  '2': '<a:Clanlogo2:1572057251022241913>',
  '3': '<a:Clanlogo3:1572057291400683653>',
  '4': '<a:Clanlogo4:1572057336112226324>',
  '5': '<a:Clanlogo5:1572057406102310923>',
  '6': '<a:Clanlogo6:1572057452864602223>',
  '7': '<a:Clanlogo7:1572057492501037176>',
  '8': '<a:Clanlogo8:1572057529817632828>',
  '9': '<a:Clanlogo9:1572057564135555142>',
  '10': '<a:Clanlogo10:1572057937814495355>',
  '11': '<a:Clanlogo11:1572057971830161408>',
  '12': '<:Cllanlogo12:1572058007532077238>'
};

const EVENT_ICONS = {
  TIPS: '<a:Tips:1572101474329300992>',
  CRYSTAL: '<a:Crystal_event:1572101509288558652>',
  EVENT_BADGE: '<a:Ascending:1572101417144025169>'
};

const EVENT_NPCS = [
  { name: 'Seroko Mabey', icon: '<:Np8:1572106125652795464>' },
  { name: 'Suxt Bebon', icon: '<:Npc7:1572106075807817768>' },
  { name: 'AXF Nurse', icon: '<:Npc6:1572106025929146469>' },
  { name: 'Jest Clumsey', icon: '<:Npc5:1572105934317293758>' },
  { name: 'Yumey Ker', icon: '<:Npc4:1572105897990430760>' },
  { name: 'Riri Zhun', icon: '<:Npc3:1572105865400549458>' },
  { name: 'Pamey Ev', icon: '<:Npc2:1572105768214204528>' },
  { name: 'Oz Wizzard', icon: '<:Npc1:1572105705958412399>' }
];

const EVENT_CHIBIS_POOL = [
  { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>' },
  { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>' },
  { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>' },
  { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>' },
  { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>' },
  { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>' },
  { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>' },
  { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>' },
  { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>' },
  { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>' },
  { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>' }
];

function getClanLogoDisplay(logoId) {
  if (!logoId) return CLAN_LOGOS['1'];
  return CLAN_LOGOS[String(logoId)] || CLAN_LOGOS['1'];
}

function getClanLogoListText() {
  return Object.entries(CLAN_LOGOS)
    .map(([id, emoji]) => `[${id}] - ${emoji}`)
    .join('\n');
}

const SEASON_LIST = {
  1: { name: 'Season 1 - Beta Phrase', start: 'November 1, 2026 - 12:00 AM' },
  2: { name: 'Season 2 - Alpha Xmas', start: 'December 1, 2026 - 12:00 AM' },
  3: { name: 'Season 3 - New Year Begins', start: 'January 1, 2027 - 12:00 AM' },
  4: { name: 'Season 4 - Snowy Flakes', start: 'February 1, 2027 - 12:00 AM' },
  5: { name: 'Season 5 - Chibi Venture', start: 'March 1, 2027 - 12:00 AM' },
  6: { name: 'Season 6 - Hacker Sonata', start: 'April 1, 2027 - 12:00 AM' },
  7: { name: 'Season 7 - Galaxy Reign', start: 'May 1, 2027 - 12:00 AM' },
  8: { name: 'Season 8 - New Era', start: 'June 1, 2027 - 12:00 AM' }
};

async function initDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is missing!');
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully!');

    let state = await GameState.findById('main_state');
    if (!state) {
      state = await GameState.create({ _id: 'main_state', users: {}, clans: {}, guildPrefixes: {}, channelRestrictions: {}, bannedUsers: {}, tradeHistories: {}, config: db.config });
    }
    db.users = state.users || {};
    db.clans = state.clans || {};
    db.guildPrefixes = state.guildPrefixes || {};
    db.channelRestrictions = state.channelRestrictions || {};
    db.bannedUsers = state.bannedUsers || {};
    db.tradeHistories = state.tradeHistories || {};
    db.config = { ...db.config, ...(state.config || {}) };
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
}

async function saveUsers() {
  try {
    let state = await GameState.findById('main_state');
    if (!state) {
      state = new GameState({ _id: 'main_state' });
    }
    state.users = db.users;
    state.clans = db.clans;
    state.guildPrefixes = db.guildPrefixes;
    state.channelRestrictions = db.channelRestrictions;
    state.bannedUsers = db.bannedUsers;
    state.tradeHistories = db.tradeHistories;
    state.config = db.config;
    state.markModified('users');
    state.markModified('clans');
    state.markModified('guildPrefixes');
    state.markModified('channelRestrictions');
    state.markModified('bannedUsers');
    state.markModified('tradeHistories');
    state.markModified('config');
    await state.save();
  } catch (err) {
    console.error('Failed to save data to MongoDB:', err);
  }
}

const SHINY_ICON = '<a:Shinynew:1572053794332872886>';
const RARITY_HIERARCHY = { SSRP: 7, UTR: 6, SRR: 5, SR: 4, R: 3, U: 2, C: 1 };
const cooldowns = new Map();

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

function getRarityIconMap() {
  const map = { SSRP: '<a:Ssrp:1572096279545126985>' };
  gameData.rarities.forEach(r => {
    map[r.key] = r.emoji;
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

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
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
      lastDaily: 0,
      streak: 0,
      permissions: false
    };
    updateUserRank(db.users[userId]);
    saveUsers();
  } else {
    updateUserRank(db.users[userId]);
    updatePeakRank(db.users[userId]);
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

const TRIVIA_BANK = [
  { q: 'What is the powerhouse of the cell? Answer starts with M___', a: ['mitochondria'] },
  { q: 'What programming language is this bot written in? J______', a: ['javascript', 'js'] },
  { q: 'Which planet is known as the Red Planet? M___', a: ['mars'] },
  { q: 'What is the chemical symbol for gold? A_', a: ['au'] },
  { q: 'Who painted the Mona Lisa? L______', a: ['da vinci', 'leonardo da vinci'] },
  { q: 'What is the capital city of Japan? T____', a: ['tokyo'] },
  { q: 'How many continents are there on Earth? S____ / Number', a: ['seven', '7'] },
  { q: 'What gas do plants absorb from the atmosphere? C______ d______', a: ['carbon dioxide'] },
  { q: 'What is the largest mammal in the world? B____ w____', a: ['blue whale'] },
  { q: 'In what year did the Titanic sink? 1___', a: ['1912'] }
];

client.once('ready', async () => {
  await initDatabase();
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);
  
  if (!db.config.mainGuildId && client.guilds.cache.size > 0) {
    const firstGuild = client.guilds.cache.first();
    db.config.mainGuildId = firstGuild.id;
    let state = await GameState.findById('main_state');
    if (state) {
      state.config = db.config;
      state.markModified('config');
      await state.save();
    }
    console.log(`📌 Auto-assigned Main Server: ${firstGuild.name} (${firstGuild.id})`);
  }

  const updateStatus = () => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(toSmallCaps(`+help | Serving ${serverCount} servers`), { type: 0 });
  };
  updateStatus();
  setInterval(updateStatus, 60000);

  setInterval(async () => {
    const now = Date.now();
    if (db.config.seasonExpires && now >= db.config.seasonExpires) {
      for (const uId of Object.keys(db.users)) {
        const u = db.users[uId];
        u.highestSeasonRank = u.rank;
        u.highestSeasonPoints = u.points || 0;
        updatePeakRank(u);
        u.points = 0;
        updateUserRank(u);
      }

      db.config.seasonNumber = (db.config.seasonNumber || 1) + 1;
      db.config.seasonStartedAt = now;
      db.config.seasonExpires = now + (30 * 24 * 60 * 60 * 1000);
      await saveUsers();
      console.log(`Season timer expired! Automatically started Season ${db.config.seasonNumber} and archived user peak records.`);
    }

    if (db.config.clanSeasonExpires && now >= db.config.clanSeasonExpires) {
      const sortedClans = Object.entries(db.clans).map(([name, clan]) => {
        const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        return { name, clan, totalPoints };
      }).sort((a, b) => b.totalPoints - a.totalPoints);

      const rewards = db.config.clanRewards || {};
      for (let idx = 0; idx < sortedClans.length; idx++) {
        const rank = idx + 1;
        const clanEntry = sortedClans[idx];
        const rewardCfg = rewards[rank];
        const sampleChibi = gameData.chibis.find(c => c.rarity === (rewardCfg?.rarity || 'SR')) || gameData.chibis[0];

        for (const mId of clanEntry.clan.members) {
          ensureUser(mId);
          const mUser = db.users[mId];
          if (rewardCfg) {
            const generatedId = new mongoose.Types.ObjectId().toString();
            mUser.inventory.chibis.push({
              id: generatedId,
              chibiId: generatedId,
              name: sampleChibi.name,
              rarity: rewardCfg.rarity,
              emoji: sampleChibi.emoji,
              isShiny: false,
              level: 1,
              exp: 0,
              date: new Date().toLocaleDateString()
            });
          } else {
            mUser.dice += 100;
          }
        }
      }

      db.config.clanSeasonExpires = now + (7 * 24 * 60 * 60 * 1000);
      await saveUsers();
      console.log(`Clan season expired! Rewards distributed automatically.`);
    }
  }, 60000);
});

client.on('guildCreate', async guild => {
  if (!db.config.mainGuildId) {
    db.config.mainGuildId = guild.id;
    let state = await GameState.findById('main_state');
    if (state) {
      state.config = db.config;
      state.markModified('config');
      await state.save();
    }
    console.log(`📌 Main/First Server registered: ${guild.name} (${guild.id})`);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const guildId = message.guild ? message.guild.id : 'DM';
  const currentPrefix = (db.guildPrefixes && db.guildPrefixes[guildId]) || '+';

  // FIX: Strictly require the prefix so regular conversation messages are never interrupted
  if (!message.content.startsWith(currentPrefix)) return;

  const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
  let command = args.shift().toLowerCase();
  const userId = message.author.id;

  const isOwner = () => {
    if (!db.config.ownerId) db.config.ownerId = userId;
    return userId === db.config.ownerId;
  };

  // --- MAINTENANCE MODE CHECK ---
  if (db.config.maintenanceMode && !isOwner()) {
    return message.reply(toSmallCaps('The bot currently under maintenance.'));
  }

  if (db.bannedUsers && db.bannedUsers[userId]) {
    const banInfo = db.bannedUsers[userId];
    if (banInfo.expires === 'permanent' || Date.now() < banInfo.expires) {
      return message.reply(toSmallCaps('❌ You are banned from using bot commands.'));
    } else {
      delete db.bannedUsers[userId];
      await saveUsers();
    }
  }

  const shortcuts = {
    h: 'help',
    r: 'roll',
    p: 'profile',
    inv: 'inventory',
    col: 'collections',
    d: 'drop',
    t: 'trade',
    slot: 'slot',
    pc: 'prefixchange',
    ec: 'enablec',
    dc: 'disablec',
    ac: 'admincommands',
    oc: 'ownercommands',
    ownercommands: 'ownercommands',
    ownerresetdata: 'ownerresetdata',
    cnn: 'customnn',
    ss: 'seasons',
    hss: 'higheststats',
    ownercl: 'ownercl',
    owneradminpermsrem: 'owneradminpermsrem',
    th: 'tradehistory',
    tradehistory: 'tradehistory',
    ccr: 'ccranks',
    ccranks: 'ccranks',
    rar: 'rarities',
    event: 'event',
    eshop: 'eshop',
    es: 'eshop',
    cadventure: 'eadventure',
    ca: 'eadventure',
    eadventure: 'eadventure',
    ea: 'eadventure',
    ecrystal: 'ecrystal',
    ec: 'ecrystal'
  };
  if (shortcuts[command]) {
    command = shortcuts[command];
  }

  const restrictedChannels = db.channelRestrictions[guildId] || [];
  const exemptCommands = ['enablec', 'disablec', 'prefixchange', 'pc', 'admincommands', 'ac', 'oc', 'ownercommands', 'ownerresetdata', 'help', 'status', 'fixadmin', 'ownercl', 'owneradminpermsrem', 'ownersecretpanel', 'event', 'ownerbotmaintenance', 'adminrestoreall'];
  if (restrictedChannels.length > 0 && restrictedChannels.includes(message.channel.id) && !exemptCommands.includes(command)) {
    return;
  }

  const cooldownAmount = 6000;
  const nowTime = Date.now();
  if (!cooldowns.has(userId)) {
    cooldowns.set(userId, new Map());
  }
  const timestamps = cooldowns.get(userId);
  if (timestamps.has(command)) {
    const expirationTime = timestamps.get(command) + cooldownAmount;
    if (nowTime < expirationTime) {
      const timeLeft = (expirationTime - nowTime) / 1000;
      return message.reply(toSmallCaps(`⏳ Please wait ${timeLeft.toFixed(1)} more seconds before using ${currentPrefix}${command} again.`));
    }
  }
  timestamps.set(command, nowTime);
  setTimeout(() => timestamps.delete(command), cooldownAmount);

  ensureUser(userId);
  const user = db.users[userId];
  const rarityIconsMap = getRarityIconMap();

  try {
    const currentMs = Date.now();
    if (db.config.luckEventExpires && currentMs > db.config.luckEventExpires) {
      db.config.globalLuckMultiplier = 1.0;
      db.config.luckEventExpires = 0;
      await saveUsers();
    }
    if (db.config.xpEventExpires && currentMs > db.config.xpEventExpires) {
      db.config.globalXpMultiplier = 1.0;
      db.config.xpEventExpires = 0;
      await saveUsers();
    }

    if (command === 'start') {
      if (user.started) return message.reply(toSmallCaps('⚠️ You have already started your Chibi RPG journey!'));
      user.started = true;
      user.dice += 20;
      if (!db.config.ownerId) db.config.ownerId = userId;
      if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
      updateUserRank(user);
      updatePeakRank(user);
      await saveUsers();
      return message.reply(toSmallCaps('🎉 Welcome to Chibi RPG RNG! You have been awarded 20x Dice 🎲 and your profile is initialized.'));
    }

    if (!user.started && command !== 'help' && command !== 'status') {
      return message.reply(toSmallCaps(`❌ You must type ${currentPrefix}start before using any bot commands!`));
    }

    const isAdmin = () => {
      return isOwner() || user.permissions === true;
    };

    if (command === 'ownercommands' || command === 'oc') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the primary bot owner can access owner commands!'));
      }
      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 👑 Owner Control Center\n\n` +
              `• \`${currentPrefix}ownerbotmaintenance\` — Toggle bot maintenance mode\n` +
              `• \`${currentPrefix}ownerresetdata\` — Wipe all user data and reset everyone\n` +
              `• \`${currentPrefix}ownersecretpanel\` — View secret system statistics\n` +
              `• \`${currentPrefix}owneradminpermsrem\` — Revoke admin permissions from all users\n` +
              `• \`${currentPrefix}ownergivechibi [@user]\` — Gift exclusive SSRP event chibis\n` +
              `• \`${currentPrefix}adminsetclanrewards\` — Configure seasonal clan rewards\n` +
              `• \`${currentPrefix}fixadmin\` — Assign yourself as main owner & server`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'admincommands' || command === 'ac') {
      if (!isAdmin()) {
        return message.reply(toSmallCaps('❌ You do not have administrator permissions to access this panel!'));
      }
      const container = new ContainerBuilder()
        .setAccentColor(0xe74c3c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🛡️ Administrator Operations Panel\n\n` +
              `• \`${currentPrefix}adminrestoreall\` — Restore and sync all user data profiles\n` +
              `• \`${currentPrefix}admingivecrystal [@user] [qty]\` — Grant Event Crystals\n` +
              `• \`${currentPrefix}adminsetlbseason [num]\` — Set active leaderboard season\n` +
              `• \`${currentPrefix}adminresetrank\` — Reset all points and ranks\n` +
              `• \`${currentPrefix}adminban [@user] [duration]\` — Ban user from bot\n` +
              `• \`${currentPrefix}adminluckevent [mult] [time]\` — Set global luck event\n` +
              `• \`${currentPrefix}adminsetxp [mult] [time]\` — Set global XP event\n` +
              `• \`${currentPrefix}admingiveitem [@user] [item] [qty]\` — Grant items or dice\n` +
              `• \`${currentPrefix}adminsetnn [@user] [name]\` — Set custom user nickname\n` +
              `• \`${currentPrefix}adminclearlb\` — Clear leaderboard data\n` +
              `• \`${currentPrefix}admingivepermission [@user]\` — Grant admin rights *(Owner only)*`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ownerbotmaintenance') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can toggle maintenance mode!'));
      }
      db.config.maintenanceMode = !db.config.maintenanceMode;
      await saveUsers();
      const statusText = db.config.maintenanceMode ? 'ENABLED 🔴 (Bot locked for maintenance)' : 'DISABLED 🟢 (Bot is fully operational)';
      return message.reply(toSmallCaps(`🛠️ Maintenance mode successfully updated: ${statusText}`));
    }

    if (command === 'adminrestoreall') {
      if (!isAdmin()) {
        return message.reply(toSmallCaps('❌ Only administrators can restore all user data!'));
      }
      let restoredCount = 0;
      for (const uId of Object.keys(db.users)) {
        ensureUser(uId);
        updateUserRank(db.users[uId]);
        updatePeakRank(db.users[uId]);
        restoredCount++;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`🔄 Successfully restored and synchronized data profiles for all **${restoredCount}** registered users!`));
    }

    if (command === 'ownerresetdata') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can execute data resets!'));
      }

      for (const uId of Object.keys(db.users)) {
        db.users[uId] = {
          started: false,
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
          lastDaily: 0,
          streak: 0,
          permissions: (uId === db.config.ownerId ? true : false)
        };
      }
      db.clans = {};
      db.tradeHistories = {};
      if (db.config.eventCrystals) db.config.eventCrystals = {};
      await saveUsers();

      return message.reply(toSmallCaps('⚠️ OWNER NOTICE: All user data, inventories, teams, and stats have been completely reset! All users must use `-start` again.'));
    }

    if (command === 'event') {
      if (!db.config.eventActive) {
        return message.reply(toSmallCaps('❌ The Beta Event is currently inactive!'));
      }
      const crystals = db.config.eventCrystals?.[userId] || 0;
      const eventDescription = 'Welcome to the official Chibi RPG Beta Event! Embark on thrilling adventures, challenge mysterious wandering NPCs across the realm, battle rival players in the arena, and collect exclusive rare event chibis using event crystals to claim supreme glory and build the ultimate collection!';
      
      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 📦 BETA EVENT HUB & INFORMATION\n\n` +
              `${EVENT_ICONS.TIPS} **DESCRIPTION:**\n${eventDescription}\n\n` +
              `-----------------------------------\n` +
              `🎯 **HOW TO PARTICIPATE:**\n` +
              `• TYPE \`${currentPrefix}eadventure\` (OR \`${currentPrefix}ca\`) TO EXPLORE AND BATTLE WANDERING EVENT NPCS.\n` +
              `• TYPE \`${currentPrefix}battle [@user]\` TO CLASH AGAINST OTHER PLAYERS IN 3v3 ARENA BATTLES.\n` +
              `• TYPE \`${currentPrefix}eshop\` (OR \`${currentPrefix}es\`) TO OPEN THE EVENT SHOP AND TRADE YOUR CRYSTALS.\n\n` +
              `💎 **HOW CAN I EARN CRYSTALS:**\n` +
              `• BATTLING PLAYERS (\`${currentPrefix}battle\`): WINNING REWARDS YOU WITH 10–16 CRYSTALS ${EVENT_ICONS.CRYSTAL}, WHILE LOSING GRANTS 2–8 CRYSTALS.\n` +
              `• ADVENTURE (\`${currentPrefix}eadventure\`): DEFEATING WANDERING NPCS REWARDS YOU WITH 17 CRYSTALS ${EVENT_ICONS.CRYSTAL}, OR 8 CRYSTALS IF DEFEATED.\n` +
              `• TRIVIA (\`${currentPrefix}trivia\`): CORRECT ANSWERS AWARD BONUS POINTS AND XP.\n\n` +
              `🎁 **HOW CAN I CLAIM & EXCHANGE MY REWARD:**\n` +
              `• ACCUMULATE EVENT CRYSTALS AND OPEN THE EVENT SHOP USING \`${currentPrefix}eshop\`.\n\n` +
              `YOUR CRYSTALS: **${crystals}** ${EVENT_ICONS.CRYSTAL}`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ecrystal') {
      const crystals = db.config.eventCrystals?.[userId] || 0;
      return message.reply(toSmallCaps(`💎 You currently have **${crystals}** Event Crystals ${EVENT_ICONS.CRYSTAL}.`));
    }

    if (command === 'eadventure') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      const randomNpc = EVENT_NPCS[Math.floor(Math.random() * EVENT_NPCS.length)];
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_npc_fight').setLabel(toSmallCaps('Fight NPC ⚔️')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline_npc_fight').setLabel(toSmallCaps('Run Away 🏃')).setStyle(ButtonStyle.Secondary)
      );

      const advMsg = await message.reply({
        content: toSmallCaps(`${randomNpc.icon} **${randomNpc.name}**\n\n<@${userId}> You spotted an NPC and they want to fight you! Do you want to accept this challenge? (Expires in 10s)`),
        components: [row]
      });

      const collector = advMsg.createMessageComponentCollector({ time: 10000 });
      let handled = false;

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your adventure encounter!'), ephemeral: true });
        handled = true;

        if (i.customId === 'decline_npc_fight') {
          collector.stop();
          return advMsg.edit({ content: toSmallCaps(`🏃 You fled from ${randomNpc.name}. Safe travels!`), components: [] }).catch(() => {});
        }

        if (i.customId === 'accept_npc_fight') {
          collector.stop();

          const npcAtk = Math.floor(Math.random() * 36) + 10;
          const npcHp = Math.floor(Math.random() * 1329) + 400;
          const npcDef = Math.floor(Math.random() * 66) + 40;
          const npcRandomChibi = EVENT_CHIBIS_POOL[Math.floor(Math.random() * EVENT_CHIBIS_POOL.length)];

          const getTeamChibis = (u) => {
            return (u.team || [null, null, null]).map(id => {
              if (!id) return null;
              return u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
            });
          };

          const userTeam = getTeamChibis(user);
          let userPower = 50;
          userTeam.forEach(c => {
            if (c) {
              const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, atk: 20, def: 10 };
              userPower += (statCfg.hp + c.level * statCfg.hpPer) + (statCfg.atk + c.level * statCfg.atkPer) * 3;
            }
          });

          const npcPower = (npcHp + npcAtk * 3 + npcDef * 2) * (0.85 + Math.random() * 0.3);
          const isUserWinner = userPower >= npcPower;

          let rewardCrystal = 0;
          let npcDropText = '*None*';

          if (isUserWinner) {
            rewardCrystal = 17;
            db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + rewardCrystal;

            if (Math.random() * 100 <= 0.1) {
              const droppedEventChibi = EVENT_CHIBIS_POOL[Math.floor(Math.random() * EVENT_CHIBIS_POOL.length)];
              const generatedId = new mongoose.Types.ObjectId().toString();
              if (!user.inventory.chibis) user.inventory.chibis = [];
              user.inventory.chibis.push({
                id: generatedId,
                chibiId: generatedId,
                name: droppedEventChibi.name,
                rarity: 'SSRP',
                emoji: droppedEventChibi.emoji,
                isShiny: true,
                level: 1,
                exp: 0,
                date: new Date().toLocaleDateString()
              });
              npcDropText = `RECEIVED SHINY ${SHINY_ICON} ${droppedEventChibi.emoji} ${droppedEventChibi.name}`;
            } else {
              npcDropText = 'NO SHINY DROP (0.1% CHANCE)';
            }
          } else {
            rewardCrystal = 8;
            db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + rewardCrystal;
            npcDropText = 'DEFEATED (NO DROP)';
          }

          const awardedExp = addExpAndLevelUp(user, userTeam.find(Boolean), 350);
          await saveUsers();

          const resultContainer = new ContainerBuilder()
            .setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                toSmallCaps(
                  `# ⚔️ ADVENTURE BATTLE RESULT\n\n` +
                  `OPPONENT: ${randomNpc.icon} ${randomNpc.name}\n` +
                  `NPC CHIBI: ${npcRandomChibi.emoji} ${npcRandomChibi.name}\n` +
                  `NPC STATS -> ⚔️ ATK: ${npcAtk} | ❤️ HP: ${npcHp}\n` +
                  `🛡️ DEF: ${npcDef}\n\n` +
                  `${isUserWinner ? '🏆 VICTORY! YOU DEFEATED THE NPC!' : '💔 DEFEATED BY THE NPC!'}\n` +
                  `💎 CRYSTALS EARNED: +${rewardCrystal} ${EVENT_ICONS.CRYSTAL}\n` +
                  `🎁 NPC DROP: ${npcDropText}\n` +
                  `✨ EXP GAINED: +${awardedExp}`
                )
              )
            );

          await advMsg.edit({ content: '', components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) {
          await advMsg.edit({ content: toSmallCaps(`⏳ Encounter with ${randomNpc.name} timed out.`), components: [] }).catch(() => {});
        }
      });
      return;
    }

    if (command === 'eshop') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      const crystals = db.config.eventCrystals?.[userId] || 0;

      const shopItems = Object.values(db.config.eventShop).sort((a, b) => a.cost - b.cost);

      const shopLines = shopItems.map((item, idx) => {
        return toSmallCaps(`**[${idx + 1}]** ${item.emoji} **${item.name}** — **${item.cost.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`);
      }).join('\n');

      const options = shopItems.map((item, idx) => ({
        label: `${item.name} (${item.cost} Crystals)`.slice(0, 100),
        value: item.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('eshop_buy_select')
        .setPlaceholder(toSmallCaps('Select an event chibi to purchase'))
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 💎 Beta Event Crystal Shop\n\n` +
              `Your Crystal Balance: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n` +
              `*Select from the dropdown menu below to exchange your crystals for exclusive SSRP event chibis!*:\n\n`
            ) + shopLines
          )
        );

      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
      
      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your eshop session!'), ephemeral: true });

        if (i.customId === 'eshop_buy_select') {
          const selectedId = i.values[0];
          const item = db.config.eventShop[selectedId];
          const userCrystals = db.config.eventCrystals?.[userId] || 0;

          if (!item) return i.followUp({ content: toSmallCaps('❌ Item not found!'), ephemeral: true });
          if (userCrystals < item.cost) {
            return i.followUp({ content: toSmallCaps(`❌ You need **${item.cost}** ${EVENT_ICONS.CRYSTAL}, but you only have **${userCrystals}** ${EVENT_ICONS.CRYSTAL}!`), ephemeral: true });
          }

          db.config.eventCrystals[userId] -= item.cost;
          const generatedId = new mongoose.Types.ObjectId().toString();
          if (!user.inventory.chibis) user.inventory.chibis = [];

          user.inventory.chibis.push({
            id: generatedId,
            chibiId: generatedId,
            name: item.name,
            rarity: 'SSRP',
            emoji: item.emoji,
            isShiny: false,
            level: 1,
            exp: 0,
            date: new Date().toLocaleDateString()
          });

          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased ${item.emoji} **${item.name}**! It has been added directly to your collections with the Event badge ${EVENT_ICONS.EVENT_BADGE}.`), ephemeral: true });
        }
      });
      return;
    }

    if (command === 'rarities') {
      const raritiesInfo =
        `${rarityIconsMap['SSRP'] || '🌟'} **Super Special Rare Plus (SSRP - Beta Event)**\n` +
        `• Cat Event: Normal 1 in 500B | Shiny 1 in 1Qa\n` +
        `• Doge Event: Normal 1 in 1T | Shiny 1 in 20Qa\n` +
        `• Troll Event: Normal 1 in 30T | Shiny 1 in 50Qa\n` +
        `• Frien Event: Normal 1 in 100T | Shiny 1 in 300Qa\n` +
        `• Seren Event: Normal 1 in 500T | Shiny 1 in 750Qa\n` +
        `• Hellkitty Event: Normal 1 in 5Qa | Shiny 1 in 15Qi\n` +
        `• Mezz Event: Normal 1 in 75Qa | Shiny 1 in 500Qi\n` +
        `• Ruru Event: Normal 1 in 250Qa | Shiny 1 in 10Sx\n` +
        `• Zoprb Event: Normal 1 in 1Qi | Shiny 1 in 100Sx\n` +
        `• Kazerb Event: Normal 1 in 500Qi | Shiny 1 in 50Sp\n` +
        `• Georb Event: Normal 1 in 10Sp | Shiny 1 in 50No\n\n` +
        `${rarityIconsMap['C'] || '📦'} **Common (C)**\n` +
        `• Normal Drop Rate: 20% (~1 in 2) | Shiny Drop Rate: 1%\n\n` +
        `${rarityIconsMap['U'] || '📦'} **Uncommon (U)**\n` +
        `• Normal Drop Rate: 12% | Shiny Drop Rate: 0.10%\n\n` +
        `${rarityIconsMap['R'] || '📦'} **Rare (R)**\n` +
        `• Normal Drop Rate: 7% | Shiny Drop Rate: 0.5%\n\n` +
        `${rarityIconsMap['SR'] || '📦'} **Super Rare (SR)**\n` +
        `• Normal Drop Rate: 1% | Shiny Drop Rate: 0.1%\n\n` +
        `${rarityIconsMap['SRR'] || '📦'} **Super Rare Rare (SRR)**\n` +
        `• Normal Drop Rate: 0.10% | Shiny Drop Rate: 0.0010%\n\n` +
        `${rarityIconsMap['UTR'] || '📦'} **Ultra Rare (UTR)**\n` +
        `• Normal Drop Rate: 0.001% | Shiny Drop Rate: 0.0001%`;

      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps('# 📊 Chibi Rarities & Drop Rates\n\n') + raritiesInfo
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'customnn') {
      const newNickname = args.join(' ');
      if (!newNickname) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}customnn [nickname] (Max 12 characters)`));
      }
      if (newNickname.length > 12) {
        return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
      }

      user.customNickname = newNickname;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated your custom nickname to ${newNickname}!`));
    }

    const getDisplayName = async (uId) => {
      const uData = db.users[uId];
      if (uData && uData.customNickname) return uData.customNickname;
      try {
        const fetched = await client.users.fetch(uId);
        if (fetched) return fetched.username;
      } catch {}
      return 'Unknown User';
    };

    if (command === 'seasons') {
      const currentSeasonNum = db.config.seasonNumber || 1;
      const currentSeasonData = SEASON_LIST[currentSeasonNum] || { name: `Season ${currentSeasonNum}`, start: 'Active' };
      const timeRemainingMs = Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now());
      const seasonTimerStr = formatTimeRemaining(timeRemainingMs);

      const seasonLines = Object.entries(SEASON_LIST).map(([num, s]) => {
        const activeMarker = parseInt(num) === currentSeasonNum ? ' 🟢 (Active)' : '';
        return toSmallCaps(`• ${s.name}${activeMarker}\n  Begin In: ${s.start}`);
      }).join('\n\n');

      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 📅 Chibi RPG Seasons\n\n` +
              `Current Active: ${currentSeasonData.name}\n` +
              `Time Until Reset: ${seasonTimerStr}\n\n` +
              `-----------------------------------\n\n`
            ) + seasonLines
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'higheststats') {
      updatePeakRank(user);
      const peakRank = user.highestSeasonRank || '<:unranked:1571314276071907519>';
      const peakPoints = user.highestSeasonPoints || 0;
      const displayName = user.customNickname || message.author.username;

      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🏆 ${displayName}'s Highest Stats (Last Season)\n\n` +
              `Highest Rank Icon: `
            ) + `${peakRank}` +
            toSmallCaps(
              `\nHighest Points Reached: ${peakPoints.toLocaleString()} Points\n\n` +
              `*Stats snapshotted from previous competitive season.*`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'help') {
      const helpText =
        toSmallCaps('🎲 **Rolling, Drops & Games**\n') +
        `\`${currentPrefix}roll [qty] [boost]\` (${currentPrefix}r) — Roll Chibis\n` +
        `\`${currentPrefix}drop\` (${currentPrefix}d) — Claim free dice every 10s\n` +
        `\`${currentPrefix}slot [bet]\` — Play Chibi Slot Machine 🎰\n` +
        `\`${currentPrefix}shop\` — Buy Spray & Clover boosts\n` +
        `\`${currentPrefix}rarities\` (${currentPrefix}rar) — View Chibi drop rates\n\n` +
        toSmallCaps('🌟 **Beta Event System**\n') +
        `\`${currentPrefix}event\` — View Beta Event Hub\n` +
        `\`${currentPrefix}eadventure\` (${currentPrefix}ca) — Explore & Battle NPCs for Crystals\n` +
        `\`${currentPrefix}eshop\` (${currentPrefix}es) — Open Event Crystal Shop\n` +
        `\`${currentPrefix}ecrystal\` (${currentPrefix}ec) — Check Crystal balance\n\n` +
        toSmallCaps('🎁 **Rewards & Economy**\n') +
        `\`${currentPrefix}daily\` — Claim daily streak rewards (x5 🎲)\n` +
        `\`${currentPrefix}points\` — Check points & rank badge\n` +
        `\`${currentPrefix}rank\` / \`${currentPrefix}ranks\` — View leaderboards\n` +
        `\`${currentPrefix}ccranks\` (${currentPrefix}ccr) — Clan Leaderboard\n` +
        `\`${currentPrefix}customnn\` (${currentPrefix}cnn) — Set custom nickname\n` +
        `\`${currentPrefix}seasons\` (${currentPrefix}ss) — Season schedules\n` +
        `\`${currentPrefix}higheststats\` (${currentPrefix}hss) — Peak season stats\n` +
        `\`${currentPrefix}tradehistory\` (${currentPrefix}th) — View trade logs\n\n` +
        toSmallCaps('⚔️ **RPG & Battling**\n') +
        `\`${currentPrefix}cstats\` — Inspect team card\n` +
        `\`${currentPrefix}equipteam [id] [slot]\` — Manage team (1-3)\n` +
        `\`${currentPrefix}battle [@user]\` — 3v3 Arena Clash\n\n` +
        toSmallCaps('🎒 **Inventory & Profile**\n') +
        `\`${currentPrefix}inventory\` (${currentPrefix}inv) — Items bag\n` +
        `\`${currentPrefix}collections\` (${currentPrefix}col) — Chibi binder\n` +
        `\`${currentPrefix}profile\` (${currentPrefix}p) [@user] — User profile\n` +
        `\`${currentPrefix}trade\` (${currentPrefix}t) [@user] — 2-Player Trade\n\n` +
        toSmallCaps('🏛️ **Clans & Server**\n') +
        `\`${currentPrefix}clanlist\` — View clans\n` +
        `\`${currentPrefix}cclaninfo\` — Clan details & info\n` +
        `\`${currentPrefix}ccreateclan\` / \`${currentPrefix}cclanjoin\` / \`${currentPrefix}clanleave\` / \`${currentPrefix}clanrename\`\n` +
        `\`${currentPrefix}prefixchange\` / \`${currentPrefix}enablec\` / \`${currentPrefix}disablec\``;

      const container = new ContainerBuilder()
        .setAccentColor(0xff77aa)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps('# 🌸 Chibi RPG RNG — Help Center\nExplore the categories below:'))
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(helpText)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'status') {
      const ping = client.ws.ping;
      const uptimeSec = Math.floor(client.uptime / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;

      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              '# 🤖 Bot System Status & Info\n\n' +
              `📶 Latency / Ping: ${ping}ms\n` +
              `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
              `🌐 Connected Servers: ${client.guilds.cache.size} Servers\n` +
              `💻 Runtime: Node.js (Discord.js v14 - Components V2)\n` +
              `⚙️ Status: 🟢 Online & Operational (MongoDB Connected)`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'slot') {
      const bet = parseInt(args[0]);
      if (isNaN(bet) || bet <= 0) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}slot [bet_amount] (e.g. ${currentPrefix}slot 5)`));
      }
      if (user.dice < bet) {
        return message.reply(toSmallCaps(`❌ You don't have enough dice! You have ${user.dice} 🎲, but your bet is ${bet} 🎲.`));
      }

      user.dice -= bet;
      await saveUsers();

      let availableChibiEmojis = ['📦', '✨', '⭐', '🌟', '💎', '🔥', '💖'];
      if (user.inventory && user.inventory.chibis && user.inventory.chibis.length > 0) {
        availableChibiEmojis = Array.from(new Set(user.inventory.chibis.map(c => c.emoji || '📦')));
      }

      const getRandomChibiSymbol = () => availableChibiEmojis[Math.floor(Math.random() * availableChibiEmojis.length)];

      const slotMsg = await message.reply({
        content: toSmallCaps(`🎰 Spinning Chibi Slot Machine for ${bet} 🎲...\n| 🔄 | 🔄 | 🔄 |`),
      });

      for (let step = 0; step < 3; step++) {
        await new Promise(resolve => setTimeout(resolve, 600));
        const s1 = getRandomChibiSymbol();
        const s2 = getRandomChibiSymbol();
        const s3 = getRandomChibiSymbol();
        await slotMsg.edit({
          content: toSmallCaps(`🎰 Spinning...\n| ${s1} | ${s2} | ${s3} |`),
        }).catch(() => {});
      }

      await new Promise(resolve => setTimeout(resolve, 800));
      const final1 = getRandomChibiSymbol();
      const final2 = getRandomChibiSymbol();
      const final3 = getRandomChibiSymbol();

      let payoutMultiplier = 0;
      let pointsWon = 0;
      let resultText = '';

      if (final1 === final2 && final2 === final3) {
        payoutMultiplier = 10;
        pointsWon = 25;
        resultText = toSmallCaps(`🎉 CHIBI JACKPOT! TRIPLE MATCH (${final1})! (+10x Dice, +${pointsWon} Points!) 🎉`);
      } else if (final1 === final2 || final2 === final3 || final1 === final3) {
        payoutMultiplier = 2;
        pointsWon = 10;
        resultText = toSmallCaps(`✨ Partial Chibi Match! (+2x Dice, +${pointsWon} Points!) ✨`);
      } else {
        payoutMultiplier = 0;
        pointsWon = 0;
        resultText = toSmallCaps('❌ No matching chibis! Better luck next time!');
      }

      const winnings = Math.round(bet * payoutMultiplier);
      user.dice += winnings;
      user.points += pointsWon;
      updateUserRank(user);
      await saveUsers();

      const container = new ContainerBuilder()
        .setAccentColor(payoutMultiplier > 0 ? 0xf1c40f : 0xe74c3c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🎰 Chibi Slot Machine Results\n\n` +
              `| ${final1} | ${final2} | ${final3} |\n\n` +
              `${resultText}\n` +
              `💰 Dice Payout: +${winnings} 🎲 | 🏆 Points Gained: +${pointsWon} Pts\n` +
              `🎲 Total Dice: ${user.dice} | 🏆 Total Points: ${user.points}`
            )
          )
        );

      return slotMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (command === 'daily') {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const fortyEightHours = 48 * 60 * 60 * 1000;

      if (currentMs - user.lastDaily < twentyFourHours) {
        const remainingTime = Math.ceil((twentyFourHours - (currentMs - user.lastDaily)) / 1000 / 60);
        return message.reply(toSmallCaps(`⏳ You have already claimed your daily reward! Please wait another ${remainingTime} minutes.`));
      }

      if (!user.lastDaily || currentMs - user.lastDaily > fortyEightHours) {
        user.streak = 1;
      } else {
        user.streak = (user.streak || 0) + 1;
      }

      user.lastDaily = currentMs;

      let multiplier = 1;
      if (user.streak >= 100) multiplier = 5;
      else if (user.streak >= 50) multiplier = 3;
      else if (user.streak >= 10) multiplier = 2;

      const rewardDice = 1 * multiplier;
      user.dice += rewardDice;
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(`🎁 Daily Reward Claimed!\n🔥 Streak: ${user.streak} Days\n🎲 Reward: +${rewardDice}x Dice (x${multiplier} multiplier active! Total: ${user.dice} 🎲)`));
    }

    if (command === 'roll') {
      const qty = Math.min(parseInt(args[0]) || 1, gameData.settings.maxRollQuantity);
      const boost = args[1] ? args[1].toLowerCase() : null;

      if (qty < 1) return message.reply(toSmallCaps('❌ Quantity must be at least 1.'));
      if (user.dice < qty) {
        return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`));
      }

      if (!user.inventory.items) {
        user.inventory.items = { spray: 0, clover: 0 };
      }

      if (boost === 'spray') {
        if ((user.inventory.items.spray || 0) <= 0) return message.reply(toSmallCaps(`❌ No Spray uses left! Buy more in ${currentPrefix}shop.`));
        user.inventory.items.spray--;
      } else if (boost === 'clover') {
        if ((user.inventory.items.clover || 0) <= 0) return message.reply(toSmallCaps(`❌ No Clover uses left! Buy more in ${currentPrefix}shop.`));
        user.inventory.items.clover--;
      }

      user.dice -= qty;
      const resultsSummary = [];
      let activeLuckMultiplier = db.config.globalLuckMultiplier || 1.0;
      if (boost === 'spray') activeLuckMultiplier *= 1.5;

      let totalExpGained = 0;
      const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (user.team[0] || user.equippedChibi));

      for (let i = 0; i < qty; i++) {
        const baseRarityChances = {
          C: { normal: 20, shiny: 1 },
          U: { normal: 12, shiny: 0.10 },
          R: { normal: 7, shiny: 0.5 },
          SR: { normal: 1, shiny: 0.1 },
          SRR: { normal: 0.10, shiny: 0.0010 },
          UTR: { normal: 0.001, shiny: 0.0001 }
        };

        const adjustedRarities = gameData.rarities.map(r => {
          const cfg = baseRarityChances[r.key] || { normal: r.weight, shiny: 0.1 };
          let normW = cfg.normal;
          let shinyW = cfg.shiny;
          if (r.key !== 'C') {
            normW *= activeLuckMultiplier;
            shinyW *= activeLuckMultiplier;
          }
          return { ...r, normW, shinyW };
        });

        const totalWeight = adjustedRarities.reduce((sum, r) => sum + r.normW, 0);
        let randW = Math.random() * totalWeight;
        let chosenRarityObj = adjustedRarities[0];

        for (const r of adjustedRarities) {
          if (randW < r.normW) {
            chosenRarityObj = r;
            break;
          }
          randW -= r.normW;
        }

        const availableChibis = gameData.chibis.filter(c => c.rarity === chosenRarityObj.key);
        const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];

        const normalVal = parseOddsNumber(chibiTemplate.odds);
        const targetShinyChance = (baseRarityChances[chosenRarityObj.key]?.shiny || 0.1) * (activeLuckMultiplier > 1 ? activeLuckMultiplier : 1);
        const isShiny = Math.random() * 100 < targetShinyChance;

        const pushChibi = () => {
          const generatedId = new mongoose.Types.ObjectId().toString();
          const newEntry = {
            id: generatedId,
            chibiId: generatedId,
            name: chibiTemplate.name,
            rarity: chibiTemplate.rarity,
            emoji: chibiTemplate.emoji,
            isShiny,
            level: 1,
            exp: 0,
            date: new Date().toLocaleDateString()
          };
          user.inventory.chibis.push(newEntry);
          return generatedId;
        };

        pushChibi();
        resultsSummary.push({ chibi: chibiTemplate, isShiny });

        if (boost === 'clover' && Math.random() < 0.5) {
          pushChibi();
          resultsSummary.push({ chibi: chibiTemplate, isShiny, duplicated: true });
        }

        const baseExpRoll = isShiny ? Math.floor(Math.random() * 251) + 50 : Math.floor(Math.random() * 141) + 10;
        totalExpGained += addExpAndLevelUp(user, primaryChibi, baseExpRoll);

        const currentTier = RARITY_HIERARCHY[chibiTemplate.rarity] || 1;
        const savedTier = user.bestRollTier || 0;
        const currentRollVal = isShiny ? (normalVal * 10) : normalVal;
        const savedRollVal = user.bestRollVal || 0;

        if (currentTier > savedTier || (currentTier === savedTier && currentRollVal > savedRollVal)) {
          user.bestRollTier = currentTier;
          user.bestRollVal = currentRollVal;
          user.bestRoll = chibiTemplate.shinyOdds || chibiTemplate.odds;
          user.bestChibi = `${rarityIconsMap[chibiTemplate.rarity]} ${chibiTemplate.emoji} ${chibiTemplate.name} ${isShiny ? SHINY_ICON : ''}`;
        }
      }

      updateUserRank(user);
      await saveUsers();

      const luckNotice = activeLuckMultiplier > 1.0 ? toSmallCaps(`\n⚡ Active Luck Boost: ${activeLuckMultiplier}x`) : '';
      const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps('# 🎲 Chibi Roll Results\n\n') +
            resultsSummary
              .map(
                r =>
                  `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${
                    r.duplicated ? '(🍀 Duplicated!)' : ''
                  }`
              )
              .join('\n') +
            toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!`) + luckNotice +
            toSmallCaps(`\n🎲 Remaining Dice: ${user.dice}`)
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'drop') {
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      if (currentMs - user.lastDrop < cooldownMs) {
        const timeLeft = Math.ceil((cooldownMs - (currentMs - user.lastDrop)) / 1000);
        return message.reply(toSmallCaps(`⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`));
      }
      user.lastDrop = currentMs;

      const totalDropWeight = gameData.dropTable.reduce((sum, d) => sum + d.weight, 0);
      let randD = Math.random() * totalDropWeight;
      let chosenDrop = gameData.dropTable[0];
      for (const d of gameData.dropTable) {
        if (randD < d.weight) {
          chosenDrop = d;
          break;
        }
        randD -= d.weight;
      }

      user.dice += chosenDrop.dice;
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** 🎲! Total dice: ${user.dice}`));
    }

    if (command === 'inventory') {
      if (!user.inventory.items) {
        user.inventory.items = { spray: 0, clover: 0 };
      }
      const sprays = user.inventory.items.spray || 0;
      const clovers = user.inventory.items.clover || 0;
      const displayName = user.customNickname || message.author.username;

      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🎒 ${displayName}'s Inventory\n\n` +
              `🎲 Dice: ${user.dice || 0}\n` +
              `🧴 Spray Boosts: ${sprays} Uses\n` +
              `🍀 Clover Boosts: ${clovers} Uses\n\n` +
              `*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
            )
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'collections') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply(toSmallCaps(`📖 Your collection is empty! Use ${currentPrefix}roll to summon chibis.`));
      }

      let sortBy = 'rarity';
      let currentPage = 0;
      const itemsPerPage = 10;

      const getGroupedEntries = () => {
        const grouped = {};
        user.inventory.chibis.forEach(c => {
          const key = `${c.rarity}_${c.name}_${c.isShiny ? 'shiny' : 'normal'}`;
          const uniqueId = c.chibiId || c.id;
          if (!grouped[key]) {
            grouped[key] = {
              rarity: c.rarity,
              emoji: c.emoji || '✨',
              name: c.name,
              isShiny: c.isShiny,
              date: c.date || 'Unknown Date',
              count: 0,
              firstId: uniqueId ? uniqueId.slice(-6) : 'unknown'
            };
          }
          grouped[key].count++;
        });

        let entries = Object.values(grouped);
        const rarityRank = { SSRP: 1, UTR: 2, SRR: 3, SR: 4, R: 5, U: 6, C: 7 };

        if (sortBy === 'rarity') {
          entries.sort((a, b) => (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99));
        } else if (sortBy === 'alpha') {
          entries.sort((a, b) => a.name.localeCompare(b.name));
        }
        return entries;
      };

      const renderColContainer = (page) => {
        const entries = getGroupedEntries();
        const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
        if (page >= totalPages) page = totalPages - 1;

        const start = page * itemsPerPage;
        const pageItems = entries.slice(start, start + itemsPerPage);
        const formatted = pageItems
          .map((e, idx) => {
            const isEventItem = e.rarity === 'SSRP';
            const badgeIcon = isEventItem ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
            const shinyIconPart = e.isShiny ? ` ${SHINY_ICON}` : '';
            return `**${start + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}**${shinyIconPart}${badgeIcon}`;
          })
          .join('\n') || toSmallCaps('Collection page empty.');

        const displayName = user.customNickname || message.author.username;
        const container = new ContainerBuilder()
          .setAccentColor(0x9b59b6)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 📖 ${displayName}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\n` +
                `Sort: ${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}\n\n`
              ) + formatted +
              toSmallCaps(`\n\n*Unique Types: ${new Set(user.inventory.chibis.map(c => c.name)).size} | Total Owned: ${user.inventory.chibis.length}*`)
            )
          );
        return { container, totalPages };
      };

      const getColRows = (page, totalPages) => {
        return [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sort_rarity').setLabel(toSmallCaps('Order by Rarity')).setStyle(sortBy === 'rarity' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sort_alpha').setLabel(toSmallCaps('Order Alphabetical')).setStyle(sortBy === 'alpha' ? ButtonStyle.Success : ButtonStyle.Secondary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('col_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('col_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
          )
        ];
      };

      const initialRender = renderColContainer(currentPage);
      const colMsg = await message.reply({
        components: [initialRender.container, ...getColRows(currentPage, initialRender.totalPages)],
        flags: MessageFlags.IsComponentsV2
      });

      const colCollector = colMsg.createMessageComponentCollector({ time: 120000 });
      colCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your collection session!'), ephemeral: true });

        if (i.customId === 'sort_rarity') {
          sortBy = 'rarity';
          currentPage = 0;
        } else if (i.customId === 'sort_alpha') {
          sortBy = 'alpha';
          currentPage = 0;
        } else if (i.customId === 'col_prev' && currentPage > 0) {
          currentPage--;
        } else if (i.customId === 'col_next') {
          currentPage++;
        }

        const updated = renderColContainer(currentPage);
        await colMsg.edit({
          components: [updated.container, ...getColRows(currentPage, updated.totalPages)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return;
    }

    if (command === 'shop') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_spray').setLabel(toSmallCaps('Buy Spray (5 🎲)')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('buy_clover').setLabel(toSmallCaps('Buy Clover (15 🎲)')).setStyle(ButtonStyle.Success)
      );
      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              '# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n' +
              '🧴 Spray (5 🎲): Use this for Awesome Chibi boost [30 Uses]\n' +
              '🍀 Clover (15 🎲): Use this to duplicate Chibis while rolling [50 Uses]'
            )
          )
        );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });
        
        if (!user.inventory.items) {
          user.inventory.items = { spray: 0, clover: 0 };
        }

        if (i.customId === 'buy_spray') {
          if (user.dice < 5) {
            return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
          }
          user.dice -= 5;
          user.inventory.items.spray += 30;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`), ephemeral: true });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) {
            return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
          }
          user.dice -= 15;
          user.inventory.items.clover += 50;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover}`), ephemeral: true });
        }
      });
      return;
    }

    if (command === 'cstats') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply(toSmallCaps('❌ You have no chibis in your inventory!'));
      }

      const teamSlots = user.team || [null, null, null];
      const teamLines = teamSlots.map((chibiId, index) => {
        if (!chibiId) {
          return toSmallCaps(`**[${index + 1}]** *Empty Slot* (Use ${currentPrefix}equipteam [id] ${index + 1})`);
        }
        const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
        if (!chibi) {
          return toSmallCaps(`**[${index + 1}]** *Chibi missing from inventory*`);
        }

        const statConfig = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
        const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
        const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
        const defVal = statConfig.def + chibi.level * statConfig.defPer;

        const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
        const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
        const maxExp = baseExp + (chibi.level - 1) * perLvl;
        const shortId = (chibi.chibiId || chibi.id).slice(-6);

        const isEventItem = chibi.rarity === 'SSRP';
        const badgeIcon = isEventItem ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
        const shinyIconPart = chibi.isShiny ? ` ${SHINY_ICON}` : '';

        return (
          `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity] || '🌟'} ${chibi.emoji} **${chibi.name}**${shinyIconPart}${badgeIcon}\n` +
          `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
          `❤️ HP: \`${hpVal}\` | 🛡️ DEF: \`${defVal}\` | 🗡️ ATK: \`${atkVal}\`\n`
        );
      });

      const displayName = user.customNickname || message.author.username;
      const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 📜 ${displayName}'s Team Card\n\n`) +
            teamLines.join('\n') +
            toSmallCaps(`\n\n*Tip: Use ${currentPrefix}equipteam [id] [1-3] to assign chibis to your team slots!*`)
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'rank') {
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`🏆 Your current rank icon: `) + `${user.rank}`);
    }
    
    if (command === 'points') {
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`💰 Your current points balance is: **${user.points}** (Rank: `) + `${user.rank}` + `)`);
    }

    if (command === 'ranks') {
      const allSortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => {
          updateUserRank(uData);
          return { uId, ...uData };
        })
        .sort((a, b) => b.points - a.points);

      const itemsPerPage = 10;
      let currentPage = 0;
      const totalPages = Math.max(1, Math.ceil(allSortedUsers.length / itemsPerPage));

      const timeRemainingMs = Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now());
      const seasonTimerStr = formatTimeRemaining(timeRemainingMs);
      const seasonNum = db.config.seasonNumber || 1;

      const userGlobalIndex = allSortedUsers.findIndex(u => u.uId === userId);
      const userRankPos = userGlobalIndex !== -1 ? userGlobalIndex + 1 : 'Unranked';
      const userPointsDisplay = user.points || 0;
      const userRankIcon = user.rank || '<:unranked:1571314276071907519>';

      const buildRanksPageContent = async (page) => {
        const start = page * itemsPerPage;
        const pageUsers = allSortedUsers.slice(start, start + itemsPerPage);

        const lines = await Promise.all(pageUsers.map(async (u, idx) => {
          const username = await getDisplayName(u.uId);
          let clanInfo = '';
          if (u.clan && db.clans[u.clan]) {
            const clanObj = db.clans[u.clan];
            const cleanClanName = u.clan.replace(/\*/g, '');
            const logoEmoji = getClanLogoDisplay(clanObj.logoId);
            clanInfo = ` | ${logoEmoji} ${cleanClanName}`.trim();
          }
          return toSmallCaps(`**${start + idx + 1}.** **${username}** — Rank: `) + `${u.rank}` + toSmallCaps(` | Points: **${u.points.toLocaleString()}**`) + clanInfo;
        }));

        return lines.join('\n') || toSmallCaps('No players on the leaderboard yet.');
      };

      const getRanksRow = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
      };

      const renderRanksContainer = async (page) => {
        const pageBody = await buildRanksPageContent(page);
        return new ContainerBuilder()
          .setAccentColor(0xf1c40f)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 🏆 Chibi Global Leaderboard Season ${seasonNum}\n` +
                `End Season: ${seasonTimerStr}\n\n` +
                `(Page ${page + 1}/${totalPages})\n\n`
              ) +
              pageBody +
              toSmallCaps(
                `\n\n-----------------------------------\n` +
                `👤 Your Rank: #${userRankPos} | Rank: `
              ) + `${userRankIcon}` + toSmallCaps(` | Points: ${userPointsDisplay.toLocaleString()}`)
            )
          );
      };

      const initialContainer = await renderRanksContainer(currentPage);
      const ranksMsg = await message.reply({
        components: [initialContainer, getRanksRow(currentPage)],
        flags: MessageFlags.IsComponentsV2
      });

      const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
      ranksCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });

        if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;

        const updatedContainer = await renderRanksContainer(currentPage);
        await ranksMsg.edit({
          components: [updatedContainer, getRanksRow(currentPage)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return;
    }

    if (command === 'ccranks') {
      const clanEntries = Object.entries(db.clans).map(([name, clan]) => {
        const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        return { name, clan, totalPoints };
      }).sort((a, b) => b.totalPoints - a.totalPoints);

      const timeRemainingMs = Math.max(0, (db.config.clanSeasonExpires || Date.now()) - Date.now());
      const clanTimerStr = formatTimeRemaining(timeRemainingMs);

      const rewards = db.config.clanRewards || {};
      const formatReward = (rNum) => {
        const rw = rewards[rNum];
        if (!rw) return '100x 🎲 Dice (Consolation)';
        const rIcon = rarityIconsMap[rw.rarity] || '📦';
        const sampleChibi = gameData.chibis.find(c => c.rarity === rw.rarity) || gameData.chibis[0];
        const chibiEmoji = sampleChibi ? sampleChibi.emoji : rw.chibiEmoji;
        return `${rw.qty} ${rIcon} ${chibiEmoji}`;
      };

      const top10Clans = clanEntries.slice(0, 10);
      const top10Lines = await Promise.all(top10Clans.map(async (c, idx) => {
        const leaderName = await getDisplayName(c.clan.leader);
        const cleanName = c.name.replace(/\*/g, '');
        const logoEmoji = getClanLogoDisplay(c.clan.logoId);
        return toSmallCaps(`**${idx + 1}.** ${logoEmoji} ${cleanName} | Leader: **${leaderName}** | Points: **${c.totalPoints.toLocaleString()}**`);
      }));

      let userClanLine = toSmallCaps('You are not currently in a clan.');
      if (user.clan && db.clans[user.clan]) {
        const uClanObj = db.clans[user.clan];
        const uClanRankIdx = clanEntries.findIndex(c => c.name === user.clan);
        const uClanRank = uClanRankIdx !== -1 ? `#${uClanRankIdx + 1}` : 'Unranked';
        const uClanPoints = uClanObj.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        const leaderName = await getDisplayName(uClanObj.leader);
        const cleanName = user.clan.replace(/\*/g, '');
        const logoEmoji = getClanLogoDisplay(uClanObj.logoId);
        userClanLine = toSmallCaps(`${uClanRank}. ${logoEmoji} ${cleanName} | Leader: **${leaderName}** | Members: ${uClanObj.members.length} | Points: **${uClanPoints.toLocaleString()}**`);
      }

      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🏛️ Top 10 Global Clan Leaderboard\n` +
              `Ends: ${clanTimerStr}\n\n` +
              `**Clan Rewards:**\n` +
              `1st: ${formatReward(1)}\n` +
              `2nd: ${formatReward(2)}\n` +
              `3rd: ${formatReward(3)}\n\n` +
              `-----------------------------------\n\n`
            ) + (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
            toSmallCaps(`\n\n-----------------------------------\n**Your Clan Status:**\n`) + userClanLine
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'equipteam') {
      const chibiIdArg = args[0];
      const slot = parseInt(args[1]);
      if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}equipteam [chibi_id or short id] [slot 1-3]\nExample: ${currentPrefix}equipteam a1b2c3 1`));
      }

      const chibi = user.inventory.chibis.find(c => {
        const uId = c.chibiId || c.id;
        return uId === chibiIdArg || uId.endsWith(chibiIdArg);
      });

      if (!chibi) return message.reply(toSmallCaps(`❌ Chibi ID not found in your inventory! Check ${currentPrefix}collections for correct IDs.`));

      const chibiUniqueId = chibi.chibiId || chibi.id;
      const wasEmpty = !user.team[slot - 1];
      user.team[slot - 1] = chibiUniqueId;
      if (slot === 1) user.equippedChibi = chibiUniqueId;

      let expMsg = '';
      if (wasEmpty) {
        const awardedExp = addExpAndLevelUp(user, chibi, 250);
        expMsg = toSmallCaps(`\n✨ Team slot bonus: +${awardedExp} EXP awarded to you and **${chibi.name}**!`);
      }
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(`✅ Successfully equipped `) + `${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''}` + toSmallCaps(` to Team Slot ${slot}!${expMsg}`));
    }

    if (command === 'battle') {
      const opponent = message.mentions.users.first();
      if (!opponent || opponent.bot || opponent.id === userId) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}battle [@user] (You cannot battle yourself or a bot)`));
      }
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel(toSmallCaps('Accept Clash')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
      );

      const battleMsg = await message.reply({
        content: toSmallCaps(`⚔️ <@${opponent.id}>, you have been challenged to a 3v3 Chibi Team Clash by <@${userId}>! (Accept within 5 seconds)`),
        components: [row]
      });

      const collector = battleMsg.createMessageComponentCollector({ time: 5000 });
      let handled = false;

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== opponent.id) return i.followUp({ content: toSmallCaps('This battle challenge is not for you!'), ephemeral: true });
        handled = true;
        
        if (i.customId === 'accept_battle') {
          const p1User = user;
          const p2User = db.users[opponent.id];

          const getTeamChibis = (u) => {
            return (u.team || [null, null, null]).map(id => {
              if (!id) return null;
              return u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
            });
          };

          const p1Team = getTeamChibis(p1User);
          const p2Team = getTeamChibis(p2User);

          const getTeamCombatStats = (team) => {
            let totalPower = 50;
            const detailed = team.map(c => {
              if (!c) return { hp: 0, atk: 0, def: 0 };
              const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
              const hp = statCfg.hp + c.level * statCfg.hpPer;
              const atk = statCfg.atk + c.level * statCfg.atkPer;
              const def = statCfg.def + c.level * statCfg.defPer;
              totalPower += hp + atk * 3 + def * 2;
              return { hp, atk, def };
            });
            return { totalPower, detailed };
          };

          const p1Stats = getTeamCombatStats(p1Team);
          const p2Stats = getTeamCombatStats(p2Team);

          const p1Power = p1Stats.totalPower * (0.85 + Math.random() * 0.3);
          const p2Power = p2Stats.totalPower * (0.85 + Math.random() * 0.3);

          const isP1Winner = p1Power >= p2Power;
          const winner = isP1Winner ? message.author : opponent;

          const winUser = isP1Winner ? p1User : p2User;
          const loseUser = isP1Winner ? p2User : p1User;
          const winTeam = isP1Winner ? p1Team : p2Team;

          const getBattlePoints = (pts) => {
            if (pts >= 8002) return { win: Math.floor(Math.random() * 31) + 120, lose: 75 };
            if (pts >= 5501) return { win: Math.floor(Math.random() * 31) + 90, lose: 50 };
            if (pts >= 4001) return { win: Math.floor(Math.random() * 31) + 70, lose: 30 };
            if (pts >= 2501) return { win: Math.floor(Math.random() * 31) + 50, lose: 20 };
            if (pts >= 1000) return { win: Math.floor(Math.random() * 21) + 20, lose: 10 };
            return { win: Math.floor(Math.random() * 11) + 10, lose: 5 };
          };

          const winReward = getBattlePoints(winUser.points);
          const losePenalty = getBattlePoints(loseUser.points);

          winUser.points += winReward.win;
          loseUser.points = Math.max(0, loseUser.points - losePenalty.lose);

          const p1CrystalWin = Math.floor(Math.random() * 7) + 10;
          const p1CrystalLose = Math.floor(Math.random() * 7) + 2;
          const p2CrystalWin = Math.floor(Math.random() * 7) + 10;
          const p2CrystalLose = Math.floor(Math.random() * 7) + 2;

          if (!db.config.eventCrystals) db.config.eventCrystals = {};
          db.config.eventCrystals[winUser === p1User ? userId : opponent.id] = (db.config.eventCrystals[winUser === p1User ? userId : opponent.id] || 0) + (winUser === p1User ? p1CrystalWin : p2CrystalWin);
          db.config.eventCrystals[loseUser === p1User ? userId : opponent.id] = (db.config.eventCrystals[loseUser === p1User ? userId : opponent.id] || 0) + (loseUser === p1User ? p1CrystalLose : p2CrystalLose);

          const totalExpWon = addExpAndLevelUp(winUser, winTeam.find(Boolean), 400);

          updateUserRank(p1User);
          updateUserRank(p2User);
          await saveUsers();

          const p1Name = user.customNickname || message.author.username;
          const p2Name = db.users[opponent.id].customNickname || opponent.username;

          const renderTeamLineWithStats = (team, isWinnerTeam) => {
            return team.map((c, idx) => {
              if (!c) return toSmallCaps(`**[${idx + 1}]** *Empty Slot*`);
              const rIcon = rarityIconsMap[c.rarity] || '📦';
              const sIcon = c.isShiny ? SHINY_ICON : '';
              const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
              const hp = statCfg.hp + c.level * statCfg.hpPer;
              const atk = statCfg.atk + c.level * statCfg.atkPer;
              const def = statCfg.def + c.level * statCfg.defPer;
              const remainingHp = isWinnerTeam ? hp : 0;
              return toSmallCaps(`**[${idx + 1}]** `) + `${rIcon}` + ` ${c.emoji} **${c.name}** ${sIcon}` + toSmallCaps(` (Lvl ${c.level}) — ❤️ HP: \`${remainingHp}\` | 🗡️ ATK: \`${atk}\` | 🛡️ DEF: \`${def}\``);
            }).join('\n');
          };

          const container = new ContainerBuilder()
            .setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                toSmallCaps(
                  `# ⚔️ 3v3 Chibi Arena Clash Result\n\n` +
                  `🏆 Winner: <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n` +
                  `🛡️ ${p1Name}'s Team Lineup:\n`
                ) + renderTeamLineWithStats(p1Team, isP1Winner) +
                toSmallCaps(`\n\n🛡️ ${p2Name}'s Team Lineup:\n`) + renderTeamLineWithStats(p2Team, !isP1Winner) +
                toSmallCaps(`\n\n📊 Match Rewards: ✨ Victor earned +${winReward.win} Points, +${totalExpWon} EXP & Crystals! 💔 Loser lost -${losePenalty.lose} Points.`)
              )
            );

          await battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } else {
          await battleMsg.edit({ content: toSmallCaps(`❌ <@${opponent.id}> declined the 3v3 arena clash.`), components: [] }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) {
          await battleMsg.edit({ content: toSmallCaps(`⏳ Arena clash request timed out (5s elapsed) and was automatically cancelled.`), components: [] }).catch(() => {});
        }
      });
      return;
    }

    if (command === 'meme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const container = new ContainerBuilder()
        .setAccentColor(0xe74c3c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# ${data.title}\n*(r/${data.subreddit})*`))
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`));

      const filter = m => m.author.id === userId;
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

      collector.on('collect', async m => {
        const userAnswer = m.content.toLowerCase().trim();
        const isCorrect = selected.a.some(ans => userAnswer.includes(ans));

        if (isCorrect) {
          const awardedPoints = Math.floor(Math.random() * 4) + 17;
          user.points += awardedPoints;
          const awardedExp = addExpAndLevelUp(user, null, 450);
          
          const triviaCrystals = Math.floor(Math.random() * 6) + 5;
          if (!db.config.eventCrystals) db.config.eventCrystals = {};
          db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + triviaCrystals;

          updateUserRank(user);
          await saveUsers();
          m.reply(toSmallCaps(`🎉 Correct! You earned +${awardedPoints} Points, +${awardedExp} EXP & +${triviaCrystals} Event Crystals ${EVENT_ICONS.CRYSTAL}!`));
        } else {
          m.reply(toSmallCaps(`❌ Incorrect! The correct answer was **${selected.a[0]}**.`));
        }
      });
      return;
    }

    // --- ENHANCED DASHBOARD STYLE PROFILE COMMAND WITH USER AVATAR (FIXED THUMBNAIL BUILDER setURL) ---
    if (command === 'profile') {
      const targetUserMention = message.mentions.users.first();
      const targetUserId = targetUserMention ? targetUserMention.id : userId;
      ensureUser(targetUserId);
      const targetUserData = db.users[targetUserId];
      updateUserRank(targetUserData);

      if (targetUserData.inventory && targetUserData.inventory.chibis && targetUserData.inventory.chibis.length > 0) {
        let highestChibi = null;
        let highestTier = 0;
        let highestVal = 0;

        for (const c of targetUserData.inventory.chibis) {
          const tier = RARITY_HIERARCHY[c.rarity] || 1;
          const allChibisPool = [...(gameData.chibis || []), ...(gameData.eventChibis || [])];
          const template = allChibisPool.find(t => t.name === c.name && t.rarity === c.rarity);
          const oddsStr = template ? (c.isShiny ? template.shinyOdds : template.odds) : '1 in 1';
          const val = parseOddsNumber(oddsStr);

          if (tier > highestTier || (tier === highestTier && val > highestVal)) {
            highestTier = tier;
            highestVal = val;
            highestChibi = { chibi: c, oddsStr };
          }
        }

        if (highestChibi && (
          targetUserData.bestRoll === '1 in 1' ||
          highestTier > (targetUserData.bestRollTier || 0) ||
          (highestTier === (targetUserData.bestRollTier || 0) && highestVal > (targetUserData.bestRollVal || 0))
        )) {
          targetUserData.bestRollTier = highestTier;
          targetUserData.bestRollVal = highestVal;
          targetUserData.bestRoll = highestChibi.oddsStr;
          targetUserData.bestChibi = `${rarityIconsMap[highestChibi.chibi.rarity] || '🌟'} ${highestChibi.chibi.emoji} ${highestChibi.chibi.isShiny ? SHINY_ICON : ''}`;
          await saveUsers();
        }
      }

      const rarityCounts = { SSRP: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
      if (targetUserData.inventory && targetUserData.inventory.chibis) {
        targetUserData.inventory.chibis.forEach(c => {
          if (rarityCounts[c.rarity] !== undefined) {
            rarityCounts[c.rarity]++;
          }
        });
      }

      const totalChibis = targetUserData.inventory.chibis.length;
      const targetUserMaxExp = gameData.settings.userExpBase + (targetUserData.userLevel - 1) * gameData.settings.userExpPerLevel;
      const targetMember = targetUserMention || message.author;
      const avatarUrl = targetMember.displayAvatarURL({ extension: 'png', size: 256 });

      const allSortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => ({ uId, points: uData.points || 0 }))
        .sort((a, b) => b.points - a.points);
      const globalIndex = allSortedUsers.findIndex(u => u.uId === targetUserId);
      const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';

      const displayName = targetUserData.customNickname || targetMember.username;

      let clanDisplayStr = 'None';
      if (targetUserData.clan && db.clans[targetUserData.clan]) {
        const cObj = db.clans[targetUserData.clan];
        const cleanName = targetUserData.clan.replace(/\*/g, '');
        const logoEmoji = getClanLogoDisplay(cObj.logoId);
        clanDisplayStr = `${logoEmoji} ${cleanName}`;
      }

      const bestRollIconPart = targetUserData.bestChibi ? targetUserData.bestChibi : toSmallCaps('None');
      const bestRollOddsPart = targetUserData.bestRoll && targetUserData.bestRoll !== 'None' ? `\`(${targetUserData.bestRoll})\`` : '';

      const joinedDateStr = targetMember.joinedAt ? targetMember.joinedAt.toLocaleDateString() : (targetMember.createdAt ? targetMember.createdAt.toLocaleDateString() : 'N/A');

      const profileHeader = toSmallCaps(`👤 **! ${displayName}**\n@${targetMember.username}  •  Joined ${joinedDateStr}\n\n`);
      
      const statsSection = toSmallCaps(
        `## 📊 STATS\n` +
        `DROPS: **${totalChibis}**                 TODAY'S DROPS: **0 / 200**          DICE: **${targetUserData.dice} 🎲**\n` +
        `POINTS: **${targetUserData.points.toLocaleString()}**            GLOBAL RANK: **${leaderboardPos}**       STREAK: **${targetUserData.streak || 0}D**\n` +
        `LEVEL: **${targetUserData.userLevel}** (${targetUserData.userExp}/${targetUserMaxExp})   CLAN: **${clanDisplayStr}**\n\n`
      );

      const collectionSection = toSmallCaps(
        `## 📦 COLLECTION RARITY BREAKDOWN\n` +
        `${rarityIconsMap['SSRP'] || '🌟'} SSRP: **${rarityCounts.SSRP}**         ` +
        `${rarityIconsMap['UTR'] || '📦'} UTR: **${rarityCounts.UTR}**         ` +
        `${rarityIconsMap['SRR'] || '📦'} SRR: **${rarityCounts.SRR}**\n` +
        `${rarityIconsMap['SR'] || '📦'} SR: **${rarityCounts.SR}**           ` +
        `${rarityIconsMap['R'] || '📦'} R: **${rarityCounts.R}**             ` +
        `${rarityIconsMap['U'] || '📦'} U: **${rarityCounts.U}**\n` +
        `${rarityIconsMap['C'] || '📦'} C: **${rarityCounts.C}**\n\n` +
        `🎲 **BEST ROLL:** ${bestRollIconPart} ${bestRollOddsPart}`
      );

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(profileHeader + statsSection + collectionSection)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl)
        );

      const container = new ContainerBuilder()
        .setAccentColor(0x36393f)
        .addSectionComponents(section);

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'clanlist') {
      const clanNames = Object.keys(db.clans);
      if (clanNames.length === 0) {
        return message.reply(toSmallCaps('🏛️ There are currently no clans available.'));
      }

      let sortBy = 'points';

      const getSortedClanEntries = async () => {
        const entries = await Promise.all(clanNames.map(async name => {
          const clan = db.clans[name];
          const leaderName = await getDisplayName(clan.leader);
          const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
          const memberCount = clan.members.length;

          return { name, leaderName, totalPoints, memberCount, logoId: clan.logoId || '1' };
        }));

        if (sortBy === 'points') {
          entries.sort((a, b) => b.totalPoints - a.totalPoints);
        } else {
          entries.sort((a, b) => b.memberCount - a.memberCount);
        }
        return entries;
      };

      const renderClanContainer = async () => {
        const sortedEntries = await getSortedClanEntries();
        const clanListText = sortedEntries.map((c, idx) => {
          const cleanName = c.name.replace(/\*/g, '');
          const logoEmoji = getClanLogoDisplay(c.logoId);
          return toSmallCaps(`${idx + 1}. ${logoEmoji} ${cleanName} | Leader: ${c.leaderName} | Points: 🏆 ${c.totalPoints.toLocaleString()} | Members: 👥 ${c.memberCount}`);
        }).join('\n');

        return new ContainerBuilder()
          .setAccentColor(0x34495e)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 🏛️ Available Clans\n\n` +
                `Sorted by: ${sortBy === 'points' ? 'Total Points' : 'Member Count'}\n\n`
              ) + clanListText
            )
          );
      };

      const getClanRows = () => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sort_points').setLabel(toSmallCaps('Sort by Points 🏆')).setStyle(sortBy === 'points' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('sort_members').setLabel(toSmallCaps('Sort by Members 👥')).setStyle(sortBy === 'members' ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
      };

      const initialContainer = await renderClanContainer();
      const clanMsg = await message.reply({
        components: [initialContainer, getClanRows()],
        flags: MessageFlags.IsComponentsV2
      });

      const clanCollector = clanMsg.createMessageComponentCollector({ time: 120000 });
      clanCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your clan list session!'), ephemeral: true });

        if (i.customId === 'sort_points') sortBy = 'points';
        if (i.customId === 'sort_members') sortBy = 'members';

        const updatedContainer = await renderClanContainer();
        await clanMsg.edit({
          components: [updatedContainer, getClanRows()],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return;
    }

    if (command === 'ccreateclan') {
      const clanName = args[0]?.replace(/\*/g, '');
      const logoArg = args[1];

      if (!clanName || !logoArg) {
        return message.reply(toSmallCaps(
          `❌ Usage: ${currentPrefix}ccreateclan [ClanName] [Logo ID 1-12]\n\n` +
          `Available Clan Logos:\n` + getClanLogoListText()
        ));
      }

      if (!CLAN_LOGOS[logoArg]) {
        return message.reply(toSmallCaps(
          `❌ Invalid Logo ID! Please pick a number from 1 to 12 (ID 13+ is invalid).\n\n` +
          `Available Clan Logos:\n` + getClanLogoListText()
        ));
      }

      if (clanName.length > 12) {
        return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      }
      if (db.clans[clanName]) return message.reply(toSmallCaps('❌ A clan with this name already exists!'));

      const clanCreationCost = 100;
      if (user.dice < clanCreationCost) {
        return message.reply(toSmallCaps(`❌ You do not have enough dice to create a clan! You need **${clanCreationCost} 🎲 Dice**, but you only have **${user.dice} 🎲**.`));
      }

      user.dice -= clanCreationCost;
      db.clans[clanName] = {
        name: clanName,
        leader: userId,
        viceLeader: null,
        members: [userId],
        logoId: logoArg,
        renameCount: 0
      };
      user.clan = clanName;
      updateUserRank(user);
      await saveUsers();

      const chosenLogoEmoji = getClanLogoDisplay(logoArg);
      return message.reply(toSmallCaps(`✅ Successfully created and joined clan ${chosenLogoEmoji} **${clanName}**! (Cost: ${clanCreationCost} 🎲 Dice)`));
    }

    if (command === 'cclanjoin') {
      const clanName = args.join(' ').replace(/\*/g, '');
      if (!db.clans[clanName]) return message.reply(toSmallCaps('❌ Clan does not exist!'));
      if (db.clans[clanName].members.includes(userId)) return message.reply(toSmallCaps('⚠️ You are already in this clan!'));
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully joined clan ${clanName}!`));
    }

    if (command === 'clanleave') {
      if (!user.clan || !db.clans[user.clan]) {
        return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      }

      const clanName = user.clan;
      const clanObj = db.clans[clanName];

      if (clanObj.leader === userId && clanObj.members.length > 1) {
        return message.reply(toSmallCaps('❌ As the clan leader, you must transfer leadership or disband the clan before leaving!'));
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_leave').setLabel(toSmallCaps('Confirm Leave')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_leave').setLabel(toSmallCaps('Cancel')).setStyle(ButtonStyle.Secondary)
      );

      const leaveMsg = await message.reply({
        content: toSmallCaps(`⚠️ Are you sure you want to leave your clan **${clanName}**?`),
        components: [confirmRow]
      });

      const leaveCollector = leaveMsg.createMessageComponentCollector({ time: 15000 });
      leaveCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your confirmation!'), ephemeral: true });

        if (i.customId === 'confirm_leave') {
          leaveCollector.stop();
          const targetClan = db.clans[clanName];
          if (targetClan) {
            targetClan.members = targetClan.members.filter(id => id !== userId);
            if (targetClan.members.length === 0) {
              delete db.clans[clanName];
            }
          }
          user.clan = null;
          await saveUsers();
          return leaveMsg.edit({ content: toSmallCaps(`✅ Successfully left the clan **${clanName}**.`), components: [] }).catch(() => {});
        } else {
          leaveCollector.stop();
          return leaveMsg.edit({ content: toSmallCaps(`❌ Clan leave request cancelled.`), components: [] }).catch(() => {});
        }
      });
      return;
    }

    if (command === 'clanrename') {
      if (!user.clan || !db.clans[user.clan]) {
        return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      }

      const clanObj = db.clans[user.clan];
      if (clanObj.leader !== userId) {
        return message.reply(toSmallCaps('❌ Only the clan leader can rename or change the clan logo!'));
      }

      const currentRenameCount = clanObj.renameCount || 0;
      if (currentRenameCount >= 3) {
        return message.reply(toSmallCaps('❌ Your clan has already reached the maximum limit of 3 renames/logo updates!'));
      }

      const newNameArg = args[0]?.replace(/\*/g, '');
      const newLogoArg = args[1];

      if (!newNameArg || !newLogoArg) {
        return message.reply(toSmallCaps(
          `❌ Usage: ${currentPrefix}clanrename [NewClanName] [Logo ID 1-12]\n` +
          `*(Renames left: ${3 - currentRenameCount}/3)*\n\n` +
          `Available Clan Logos:\n` + getClanLogoListText()
        ));
      }

      if (!CLAN_LOGOS[newLogoArg]) {
        return message.reply(toSmallCaps(
          `❌ Invalid Logo ID! Please pick a number from 1 to 12 (ID 13+ is invalid).\n\n` +
          `Available Clan Logos:\n` + getClanLogoListText()
        ));
      }

      if (newNameArg.length > 12) {
        return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      }
      if (db.clans[newNameArg] && newNameArg !== user.clan) {
        return message.reply(toSmallCaps('❌ A clan with this name already exists!'));
      }

      const oldName = user.clan;
      db.clans[newNameArg] = {
        ...clanObj,
        name: newNameArg,
        logoId: newLogoArg,
        renameCount: currentRenameCount + 1
      };

      if (oldName !== newNameArg) {
        delete db.clans[oldName];
      }

      for (const mId of db.clans[newNameArg].members) {
        if (db.users[mId]) {
          db.users[mId].clan = newNameArg;
        }
      }

      await saveUsers();
      const chosenLogoEmoji = getClanLogoDisplay(newLogoArg);
      return message.reply(toSmallCaps(
        `✅ Successfully updated clan! Name: **${newNameArg}**, Logo: ${chosenLogoEmoji}\n` +
        `*(Renames/Updates used: ${currentRenameCount + 1}/3)*`
      ));
    }

    if (command === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clan = db.clans[user.clan];
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      const cleanClanName = clan.name.replace(/\*/g, '');
      const logoEmoji = getClanLogoDisplay(clan.logoId);

      const memberLines = await Promise.all(
        clan.members.map(async (mId, idx) => {
          const mUser = db.users[mId];
          if (mUser) updateUserRank(mUser);
          const mUsername = await getDisplayName(mId);
          const role = mId === clan.leader ? 'Leader' : mId === clan.viceLeader ? 'Vice-Leader' : 'Member';
          return toSmallCaps(`${idx + 1}. ${mUsername} [${role}] `) + `${mUser?.rank || '<:unranked:1571314276071907519>'}` + toSmallCaps(` | Points: ${mUser?.points || 0}`);
        })
      );

      const leaderName = await getDisplayName(clan.leader);
      const remainingRenames = 3 - (clan.renameCount || 0);

      const container = new ContainerBuilder()
        .setAccentColor(0x1abc9c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# CLAN: ${cleanClanName}   `) + `${logoEmoji}\n\n` +
            toSmallCaps(
              `LEADER: ${leaderName}\n` +
              `TOTAL POINTS: ${totalPoints.toLocaleString()}\n` +
              `RENAME USES LEFT: ${remainingRenames}/3\n\n` +
              `MEMBERS:\n`
            ) + memberLines.join('\n')
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'tradehistory') {
      if (!db.tradeHistories[userId] || db.tradeHistories[userId].length === 0) {
        return message.reply(toSmallCaps('📜 You have no recorded trade history yet.'));
      }

      const logs = db.tradeHistories[userId].slice(-10).reverse();
      const historyLines = await Promise.all(logs.map(async (entry, index) => {
        const partnerName = await getDisplayName(entry.partnerId);
        const dateStr = new Date(entry.timestamp).toLocaleString();
        return toSmallCaps(`**${index + 1}.** Partner: **${partnerName}**\n   Date: ${dateStr}`);
      }));

      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 📜 Your Recent Trade History\n\n`) + historyLines.join('\n\n')
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'trade') {
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === userId) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}trade [@user]`));
      }
      ensureUser(target.id);

      const acceptRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('trade_accept').setLabel(toSmallCaps('Accept Trade')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('trade_decline').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
      );

      const reqMsg = await message.reply({
        content: toSmallCaps(`🤝 <@${target.id}>, you have been invited to trade by <@${userId}>! (Accept within 15 seconds)`),
        components: [acceptRow]
      });

      const collector = reqMsg.createMessageComponentCollector({ time: 15000 });

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

        if (i.user.id !== target.id) {
          return i.followUp({ content: toSmallCaps('This trade invitation is not for you!'), ephemeral: true });
        }

        if (i.customId === 'trade_decline') {
          collector.stop();
          return reqMsg.edit({ content: toSmallCaps(`❌ Trade invitation declined by <@${target.id}>.`), components: [] }).catch(() => {});
        }

        if (i.customId === 'trade_accept') {
          collector.stop();

          const p1Offer = { dice: 0, chibi: null };
          const p2Offer = { dice: 0, chibi: null };

          const getEmbed = () => {
            const getOfferText = (offer) => {
              let parts = [];
              if (offer.dice > 0) parts.push(`**${offer.dice} 🎲 Dice**`);
              if (offer.chibi) parts.push(`${rarityIconsMap[offer.chibi.rarity]} ${offer.chibi.emoji} **${offer.chibi.name}** (Lv.${offer.chibi.level})`);
              return parts.length > 0 ? parts.join(' + ') : '*Empty*';
            };

            const p1Txt = getOfferText(p1Offer);
            const p2Txt = getOfferText(p2Offer);
            
            return {
              color: 0xf1c40f,
              title: toSmallCaps('🤝 Active Trade Session'),
              description: toSmallCaps(
                `<@${userId}> Offers:\n${p1Txt}\n\n` +
                `------------------\n\n` +
                `<@${target.id}> Offers:\n${p2Txt}`
              )
            };
          };

          const tradeRows = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('trade_offer_dice').setLabel(toSmallCaps('Offer Dice [Qty] 🎲')).setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('trade_offer_chibi').setLabel(toSmallCaps('Offer Chibi 🐾')).setStyle(ButtonStyle.Success)
            ),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('trade_confirm').setLabel(toSmallCaps('Confirm Trade ✅')).setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('trade_cancel').setLabel(toSmallCaps('Cancel ❌')).setStyle(ButtonStyle.Danger)
            )
          ];

          await reqMsg.edit({
            content: '',
            embeds: [getEmbed()],
            components: tradeRows
          }).catch(() => {});

          const tradeCollector = reqMsg.createMessageComponentCollector({ time: 60000 });

          tradeCollector.on('collect', async ti => {
            if (!ti.deferred && !ti.replied) await ti.deferUpdate().catch(() => {});

            const isP1 = ti.user.id === userId;
            const isP2 = ti.user.id === target.id;
            const currentOffer = isP1 ? p1Offer : p2Offer;

            if (!isP1 && !isP2) {
              return ti.followUp({ content: toSmallCaps('Not your trade session!'), ephemeral: true });
            }

            if (ti.customId === 'trade_cancel') {
              tradeCollector.stop();
              return reqMsg.edit({ content: toSmallCaps(`❌ Trade cancelled by <@${ti.user.id}>.`), embeds: [], components: [] }).catch(() => {});
            }

            if (ti.customId === 'trade_offer_dice') {
              await ti.followUp({ content: toSmallCaps(`🎲 Type the amount of Dice you want to offer in chat (e.g. 50):`), ephemeral: true });
              const msgs = await ti.channel.awaitMessages({ filter: m => m.author.id === ti.user.id, max: 1, time: 20000 }).catch(() => null);
              const m = msgs?.first();
              if (!m) return;
              
              const amt = parseInt(m.content);
              const uObj = db.users[ti.user.id];
              await m.delete().catch(() => {});

              if (isNaN(amt) || amt <= 0) {
                return ti.followUp({ content: toSmallCaps('❌ Invalid dice amount!'), ephemeral: true });
              }
              if (uObj.dice < amt) {
                return ti.followUp({ content: toSmallCaps(`❌ You don't have enough dice! You have ${uObj.dice} 🎲.`), ephemeral: true });
              }

              currentOffer.dice = amt;
              return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
            }

            if (ti.customId === 'trade_offer_chibi') {
              const uObj = db.users[ti.user.id];
              if (!uObj.inventory.chibis || uObj.inventory.chibis.length === 0) {
                return ti.followUp({ content: toSmallCaps('❌ You have no chibis in your inventory to offer!'), ephemeral: true });
              }

              const options = uObj.inventory.chibis.slice(0, 25).map(c => ({
                label: `${c.name} (${c.rarity}) Lv.${c.level}`.slice(0, 100),
                value: c.chibiId || c.id
              }));

              const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId('trade_select_chibi')
                  .setPlaceholder(toSmallCaps('Select a Chibi to offer'))
                  .addOptions(options)
              );

              await ti.followUp({
                content: toSmallCaps('Choose a chibi from your inventory below:'),
                components: [menuRow],
                ephemeral: true
              });

              const selectFilter = int => int.user.id === ti.user.id && int.customId === 'trade_select_chibi';
              const selection = await ti.channel.awaitMessageComponent({ filter: selectFilter, time: 25000 }).catch(() => null);
              
              if (!selection) return;
              if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

              const chosenId = selection.values[0];
              const chosenChibi = uObj.inventory.chibis.find(c => (c.chibiId || c.id) === chosenId);

              if (chosenChibi) {
                currentOffer.chibi = chosenChibi;
                return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
              }
              return;
            }

            if (ti.customId === 'trade_confirm') {
              const u1 = db.users[userId];
              const u2 = db.users[target.id];

              const p1HasSomething = p1Offer.dice > 0 || p1Offer.chibi !== null;
              const p2HasSomething = p2Offer.dice > 0 || p2Offer.chibi !== null;

              if (!p1HasSomething || !p2HasSomething) {
                return ti.followUp({ content: toSmallCaps('❌ Both players must offer at least something (dice or chibi) before confirming!'), ephemeral: true });
              }

              if (u1.dice < p1Offer.dice || u2.dice < p2Offer.dice) {
                return ti.followUp({ content: toSmallCaps('❌ One of the players no longer has enough dice for this trade!'), ephemeral: true });
              }

              if (p1Offer.dice > 0) {
                u1.dice -= p1Offer.dice;
                u2.dice += p1Offer.dice;
              }
              if (p1Offer.chibi) {
                const idx = u1.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p1Offer.chibi.chibiId || p1Offer.chibi.id));
                if (idx !== -1) {
                  const [transferred] = u1.inventory.chibis.splice(idx, 1);
                  u2.inventory.chibis.push(transferred);
                }
              }

              if (p2Offer.dice > 0) {
                u2.dice -= p2Offer.dice;
                u1.dice += p2Offer.dice;
              }
              if (p2Offer.chibi) {
                const idx = u2.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p2Offer.chibi.chibiId || p2Offer.chibi.id));
                if (idx !== -1) {
                  const [transferred] = u2.inventory.chibis.splice(idx, 1);
                  u1.inventory.chibis.push(transferred);
                }
              }

              if (!db.tradeHistories[userId]) db.tradeHistories[userId] = [];
              if (!db.tradeHistories[target.id]) db.tradeHistories[target.id] = [];
              const tradeTimestamp = Date.now();
              db.tradeHistories[userId].push({ partnerId: target.id, timestamp: tradeTimestamp });
              db.tradeHistories[target.id].push({ partnerId: userId, timestamp: tradeTimestamp });

              updateUserRank(u1);
              updateUserRank(u2);
              await saveUsers();
              tradeCollector.stop();

              return reqMsg.edit({
                content: toSmallCaps(`✅ Trade successfully completed between <@${userId}> and <@${target.id}>!`),
                embeds: [getEmbed()],
                components: []
              }).catch(() => {});
            }
          });
        }
      });
      return;
    }

    const checkAdminMainServer = (msg) => {
      if (!msg.guild) return false;
      if (!db.config.ownerId) db.config.ownerId = userId;
      if (!db.config.mainGuildId) db.config.mainGuildId = msg.guild.id;

      const isUserOwner = userId === db.config.ownerId || user.permissions === true;
      const isMainServer = msg.guild.id === db.config.mainGuildId;

      return isUserOwner && isMainServer;
    };

    if (command === 'fixadmin') {
      db.config.ownerId = userId;
      if (message.guild) {
        db.config.mainGuildId = message.guild.id;
      }
      user.permissions = true;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin override successful! You are now set as the Bot Owner & Admin, and this server (${message.guild ? message.guild.name : 'DM'}) is locked as the Main Server.`));
    }

    if (command === 'ownersecretpanel') {
      if (!isOwner()) {
        return;
      }

      const container = new ContainerBuilder()
        .setAccentColor(0xe74c3c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🕵️‍♂️ Secret Owner Control Panel\n\n` +
              `Welcome, Supreme Master. Here are your hidden master controls:\n` +
              `• Total Registered Users: ${Object.keys(db.users).length}\n` +
              `• Total Active Clans: ${Object.keys(db.clans).length}\n` +
              `• Connected Guilds: ${client.guilds.cache.size}\n\n` +
              `Use your designated admin/owner commands safely.`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    }

    if (command === 'ownergivechibi') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can use this command!'));
      }
      const target = message.mentions.users.first();
      const rarityArg = args[1]?.toUpperCase();

      if (!target || !rarityArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownergivechibi [@user] [rarity] (e.g. ${currentPrefix}ownergivechibi @user SSRP)`));
      }
      ensureUser(target.id);

      const eligibleChibis = EVENT_CHIBIS_POOL;
      const options = eligibleChibis.map((c, idx) => ({
        label: `${c.name} (${c.rarity})`.slice(0, 100),
        value: c.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('owner_give_chibi_select')
        .setPlaceholder(toSmallCaps('Select chibi to give'))
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const promptMsg = await message.reply({
        content: toSmallCaps(`🎁 Select which event chibi to gift to <@${target.id}>:`),
        components: [row]
      });

      const selectFilter = int => int.user.id === userId && int.customId === 'owner_give_chibi_select';
      const selection = await message.channel.awaitMessageComponent({ filter: selectFilter, time: 25000 }).catch(() => null);

      if (!selection) return promptMsg.edit({ content: toSmallCaps('❌ Chibi giveaway timed out.'), components: [] }).catch(() => {});
      if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

      const chosenId = selection.values[0];
      const template = EVENT_CHIBIS_POOL.find(c => c.id === chosenId);
      const generatedId = new mongoose.Types.ObjectId().toString();

      if (!db.users[target.id].inventory.chibis) db.users[target.id].inventory.chibis = [];
      db.users[target.id].inventory.chibis.push({
        id: generatedId,
        chibiId: generatedId,
        name: template.name,
        rarity: 'SSRP',
        emoji: template.emoji,
        isShiny: false,
        level: 1,
        exp: 0,
        date: new Date().toLocaleDateString()
      });
      await saveUsers();

      return promptMsg.edit({
        content: toSmallCaps(`✅ Successfully gifted ${template.emoji} **${template.name}** (SSRP) to <@${target.id}>!`),
        components: []
      }).catch(() => {});
    }

    if (command === 'adminsetclanrewards') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can configure clan rewards!'));
      }
      const rankPos = parseInt(args[0]);
      const qty = parseInt(args[1]);
      const rarity = args[2]?.toUpperCase();
      const emoji = args[3];

      if (![1, 2, 3].includes(rankPos) || isNaN(qty) || !rarity || !emoji) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetclanrewards [1|2|3] [qty] [rarity] [Emoji]\nExample: ${currentPrefix}adminsetclanrewards 1 5 UTR 🌟`));
      }

      if (!db.config.clanRewards) db.config.clanRewards = {};
      db.config.clanRewards[rankPos] = { qty, rarity, chibiEmoji: emoji };
      await saveUsers();

      return message.reply(toSmallCaps(`✅ Successfully updated Rank ${rankPos} clan reward to ${qty}x ${rarity} (${emoji})!`));
    }

    if (command === 'owneradminpermsrem') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can execute this command!'));
      }

      let count = 0;
      for (const uId of Object.keys(db.users)) {
        if (db.users[uId].permissions === true && uId !== db.config.ownerId) {
          db.users[uId].permissions = false;
          count++;
        }
      }
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Successfully removed admin permissions from all ${count} authorized users.`));
    }

    if (command === 'prefixchange') {
      if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You must have Administrator permissions to change the bot prefix for this server.'));
      }

      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 5) {
        return message.reply(toSmallCaps(`❌ Please provide a valid prefix (max 5 characters). Usage: ${currentPrefix}prefixchange [new_prefix]`));
      }

      db.guildPrefixes[guildId] = newPrefix;
      await saveUsers();

      return message.reply(toSmallCaps(`✅ Successfully updated server prefix to \`${newPrefix}\`! Use ${newPrefix}help for commands.`));
    }

    if (command === 'enablec') {
      if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You must have Administrator permissions to manage channel restrictions.'));
      }

      if (!db.channelRestrictions[guildId]) db.channelRestrictions[guildId] = [];
      const index = db.channelRestrictions[guildId].indexOf(message.channel.id);
      if (index !== -1) {
        db.channelRestrictions[guildId].splice(index, 1);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`✅ Chibi bot commands are now enabled in <#${message.channel.id}>.`));
    }

    if (command === 'disablec') {
      if (!message.guild) return message.reply(toSmallCaps('❌ This command can only be used inside a server.'));
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You must have Administrator permissions to manage channel restrictions.'));
      }

      if (!db.channelRestrictions[guildId]) db.channelRestrictions[guildId] = [];
      if (!db.channelRestrictions[guildId].includes(message.channel.id)) {
        db.channelRestrictions[guildId].push(message.channel.id);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`❌ Chibi bot commands are now disabled in <#${message.channel.id}>.`));
    }

    if (command === 'removeadminperms') {
      if (!isOwner()) {
        return message.reply(toSmallCaps('❌ Only the bot owner can remove admin permissions!'));
      }
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removeadminperms [@user]`));
      ensureUser(target.id);
      db.users[target.id].permissions = false;
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin permissions successfully removed from <@${target.id}>.`));
    }

    if (command.startsWith('admin')) {
      if (!checkAdminMainServer(message)) {
        return message.reply('You cannot use this Admin power in your own server, you must in the main server to run this.');
      }

      if (command === 'admingivecrystal') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivecrystal [@user] [amount]`));
        }
        ensureUser(target.id);
        if (!db.config.eventCrystals) db.config.eventCrystals = {};
        db.config.eventCrystals[target.id] = (db.config.eventCrystals[target.id] || 0) + amount;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully granted ${amount.toLocaleString()} Event Crystals ${EVENT_ICONS.CRYSTAL} to <@${target.id}>.`));
      }

      if (command === 'adminsetlbseason') {
        const seasonNum = parseInt(args[0]);
        if (isNaN(seasonNum) || seasonNum < 1) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlbseason [season_number]`));
        }
        db.config.seasonNumber = seasonNum;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Leaderboard season successfully set to Season ${seasonNum}!`));
      }

      if (command === 'adminresetrank') {
        for (const uId of Object.keys(db.users)) {
          db.users[uId].points = 0;
          updateUserRank(db.users[uId]);
        }
        await saveUsers();
        return message.reply(toSmallCaps('🛡️ Successfully reset all user ranks and points! Leaderboard season remains active.'));
      }

      if (command === 'adminsetnn') {
        if (!isAdmin()) {
          return message.reply(toSmallCaps('❌ Only administrators can use this command!'));
        }
        const target = message.mentions.users.first();
        const newNN = args.slice(1).join(' ');
        if (!target || !newNN) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetnn [@user] [nickname]`));
        }
        if (!db.users[target.id] || !db.users[target.id].started) {
          return message.reply(toSmallCaps('❌ User does not have Chibi RNG data or has not started yet!'));
        }
        if (newNN.length > 12) {
          return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
        }

        db.users[target.id].customNickname = newNN;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin successfully set custom nickname for <@${target.id}> to ${newNN}!`));
      }

      if (command === 'adminban') {
        const target = message.mentions.users.first();
        const durationArg = args[1]?.toLowerCase();
        if (!target || !durationArg) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminban [@user] [duration or permanent] (e.g. 1d, 2h, permanent)`));
        }

        let banExpires = 'permanent';
        if (durationArg !== 'permanent') {
          const ms = parseDurationToMs(durationArg);
          if (!ms) return message.reply(toSmallCaps('❌ Invalid duration format! Use e.g. `1d`, `12h`, `30m`, or `permanent`.'));
          banExpires = Date.now() + ms;
        }

        db.bannedUsers[target.id] = { expires: banExpires, bannedAt: Date.now() };
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully banned <@${target.id}> from bot commands (${durationArg}).`));
      }

      if (command === 'adminclearlb') {
        if (!isAdmin()) {
          return message.reply(toSmallCaps('❌ Only administrators can clear the leaderboard!'));
        }

        for (const uId of Object.keys(db.users)) {
          db.users[uId].points = 0;
          db.users[uId].highestSeasonPoints = 0;
          db.users[uId].customNickname = null;
          updateUserRank(db.users[uId]);
        }
        await saveUsers();
        return message.reply(toSmallCaps('⚠️ Admin Warning: All names, ranks, and points in the leaderboard have been completely cleared!'));
      }

      if (command === 'adminluckevent') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminluckevent [multiplier] [duration] (e.g. ${currentPrefix}adminluckevent 2.0 30m)`));
        }

        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        await saveUsers();

        return message.reply(toSmallCaps(`⚡ Global Luck Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
      }

      if (command === 'adminsetxp') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetxp [multiplier] [duration] (e.g. ${currentPrefix}adminsetxp 1.5 1h)`));
        }

        db.config.globalXpMultiplier = mult;
        db.config.xpEventExpires = Date.now() + durationMs;
        await saveUsers();

        return message.reply(toSmallCaps(`✨ Global XP Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
      }

      if (command === 'admingiveitem') {
        const target = message.mentions.users.first();
        const itemType = args[1]?.toLowerCase();
        const quantity = parseInt(args[2]);

        if (!target || !['dice', 'spray', 'clover'].includes(itemType) || isNaN(quantity)) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingiveitem [@user] [dice|spray|clover] [quantity]`));
        }
        ensureUser(target.id);

        if (!db.users[target.id].inventory.items) {
          db.users[target.id].inventory.items = { spray: 0, clover: 0 };
        }

        if (itemType === 'dice') db.users[target.id].dice += quantity;
        else if (itemType === 'spray') db.users[target.id].inventory.items.spray += quantity;
        else if (itemType === 'clover') db.users[target.id].inventory.items.clover += quantity;
        
        updateUserRank(db.users[target.id]);
        await saveUsers();

        return message.reply(toSmallCaps(`🎁 Admin granted ${quantity}x ${itemType} to <@${target.id}>.`));
      }

      if (command === 'adminsetrank') {
        const target = message.mentions.users.first();
        const newRank = args.slice(1).join(' ');
        if (!target || !newRank) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetrank [@user] [rank title]`));
        ensureUser(target.id);
        db.users[target.id].rank = newRank;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin updated rank icon for <@${target.id}>.`));
      }

      if (command === 'adminsetpoints') {
        const target = message.mentions.users.first();
        const pts = parseInt(args[1]);
        if (!target || isNaN(pts)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetpoints [@user] [points]`));
        ensureUser(target.id);
        db.users[target.id].points = pts;
        updateUserRank(db.users[target.id]);
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin set points for <@${target.id}> to **${pts}** (Rank icon auto-updated).`));
      }

      if (command === 'admingivepermission') {
        if (!isOwner()) {
          return message.reply(toSmallCaps('❌ Only the bot owner can assign admin permissions!'));
        }
        const target = message.mentions.users.first();
        if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivepermission [@user]`));
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin permissions granted to <@${target.id}>.`));
      }

      if (command === 'adminsetlevel') {
        const target = message.mentions.users.first();
        const lvl = parseInt(args[1]);
        if (!target || isNaN(lvl) || lvl < 1) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlevel [@user] [level]`));
        }
        ensureUser(target.id);
        db.users[target.id].userLevel = lvl;
        db.users[target.id].userExp = 0;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin set user level for <@${target.id}> to Level ${lvl}.`));
      }
    }
  } catch (err) {
    console.error(err);
    message.reply(toSmallCaps('❌ An error occurred while executing this command.'));
  }
});

initDatabase().then(() => {
  client.login(process.env.DISCORD_TOKEN);
});