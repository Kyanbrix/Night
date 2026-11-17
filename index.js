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

// MongoDB Schema & Model for Global Game State
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
      clanRewards: {
        1: { qty: 5, rarity: 'UTR', chibiEmoji: '🌟' },
        2: { qty: 3, rarity: 'SRR', chibiEmoji: '🔥' },
        3: { qty: 2, rarity: 'SR', chibiEmoji: '⚡' }
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
    clanRewards: {
      1: { qty: 5, rarity: 'UTR', chibiEmoji: '🌟' },
      2: { qty: 3, rarity: 'SRR', chibiEmoji: '🔥' },
      3: { qty: 2, rarity: 'SR', chibiEmoji: '⚡' }
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

const TIPS_EMOJI = '<a:Tips:1572101474329300992>';
const CRYSTAL_EMOJI = '<a:Crystal_event:1572101509288558652>';
const EVENT_ICON = '<a:Ascending:1572101417144025169>';
const SHINY_ICON = '<a:Shinynew:1572053794332872886>';

const NPC_LIST = [
  { name: 'Seroko Mabey', icon: '<:Np8:1572106125652795464>' },
  { name: 'Suxt Bebon', icon: '<:Npc7:1572106075807817768>' },
  { name: 'AXF Nurse', icon: '<:Npc6:1572106025929146469>' },
  { name: 'Jest Clumsey', icon: '<:Npc5:1572105934317293758>' },
  { name: 'Yumey Ker', icon: '<:Npc4:1572105897990430760>' },
  { name: 'Riri Zhun', icon: '<:Npc3:1572105865400549458>' },
  { name: 'Pamey Ev', icon: '<:Npc2:1572105768214204528>' },
  { name: 'Oz Wizzard', icon: '<:Npc1:1572105705958412399>' }
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
  const map = {};
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
      crystals: 0,
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
    if (db.users[userId].crystals === undefined) db.users[userId].crystals = 0;
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
  const match = cleanStr.match(/(\d+(?:\.\d+)?)([KMBTQSiNoSp]*)/i);
  if (!match) return 1;
  const numPart = parseFloat(match[1]);
  const unit = match[2] ? match[2].toUpperCase() : '';
  if (unit.includes('NO')) return numPart * 1e30;
  if (unit.includes('SP')) return numPart * 1e27;
  if (unit.includes('SX')) return numPart * 1e24;
  if (unit.includes('QI')) return numPart * 1e18;
  if (unit.includes('QA')) return numPart * 1e15;
  if (unit.includes('T')) return numPart * 1e12;
  if (unit.includes('B')) return numPart * 1e9;
  if (unit.includes('M')) return numPart * 1e6;
  if (unit.includes('K')) return numPart * 1e3;
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
  }

  const updateStatus = () => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(toSmallCaps(`+help | Serving ${serverCount} servers`), { type: 0 });
  };
  updateStatus();
  setInterval(updateStatus, 60000);
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
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const guildId = message.guild ? message.guild.id : 'DM';
  const currentPrefix = (db.guildPrefixes && db.guildPrefixes[guildId]) || '+';

  if (!message.content.startsWith(currentPrefix)) return;

  const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
  let command = args.shift().toLowerCase();
  const userId = message.author.id;

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
    cnn: 'customnn',
    ss: 'seasons',
    hss: 'higheststats',
    ownercl: 'ownercl',
    owneradminpermsrem: 'owneradminpermsrem',
    th: 'tradehistory',
    ccr: 'ccranks',
    rar: 'rarities',
    ecrystal: 'ecrystal',
    eadventure: 'cadventure',
    cadventure: 'cadventure',
    ca: 'cadventure',
    eshop: 'eshop',
    es: 'eshop'
  };
  if (shortcuts[command]) {
    command = shortcuts[command];
  }

  const restrictedChannels = db.channelRestrictions[guildId] || [];
  const exemptCommands = ['enablec', 'disablec', 'prefixchange', 'pc', 'admincommands', 'ac', 'help', 'status', 'fixadmin', 'ownercl', 'owneradminpermsrem', 'ownersecretpanel', 'admingivecrystal', 'ownergivechibi'];
  if (restrictedChannels.length > 0 && restrictedChannels.includes(message.channel.id) && !exemptCommands.includes(command)) {
    return;
  }

  const cooldownAmount = 4000;
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
  const getDisplayName = async (uId) => {
    const uData = db.users[uId];
    if (uData && uData.customNickname) return uData.customNickname;
    try {
      const fetched = await client.users.fetch(uId);
      if (fetched) return fetched.username;
    } catch {}
    return 'Unknown User';
  };

  try {
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

    // EVENT COMMAND (+event)
    if (command === 'event') {
      const eventInfo = 
        `${TIPS_EMOJI} **Beta Event Hub & Information**\n\n` +
        `**Description:**\nWelcome to the official Chibi RPG Beta Event! Embark on thrilling adventures, challenge mysterious wandering NPCs across the realm, battle rival players in the arena, and collect exclusive rare event chibis using event crystals to claim supreme glory and build the ultimate collection!\n\n` +
        `**How to Participate:**\n` +
        `• Type \`+cadventure\` (or \`+ca\`) to explore and battle wandering event NPCs.\n` +
        `• Type \`+battle [@user]\` to clash against other players in 3v3 arena battles.\n` +
        `• Type \`+eshop\` (or \`+es\`) to open the Event Shop and trade your crystals.\n\n` +
        `**How Can I Earn Crystals:**\n` +
        `• Battling players (\`+battle\`): Winning rewards you with 10–16 Crystals ${CRYSTAL_EMOJI}, while losing grants 2–8 Crystals.\n` +
        `• Adventure (\`+cadventure\`): Defeating wandering NPCs rewards you with 17 Crystals ${CRYSTAL_EMOJI}, or 8 Crystals if defeated.\n` +
        `• Trivia (\`+trivia\`): Correct answers award bonus points and XP.\n\n` +
        `**How Can I Claim & Exchange My Reward:**\n` +
        `• Accumulate event crystals and open the Event Shop using \`+eshop\`.\n` +
        `• Select your desired SSRP event chibi by its ID to instantly exchange crystals for it.\n` +
        `• Purchased event chibis are permanently marked with ${EVENT_ICON} and stored safely in your collections!`;

      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(eventInfo))
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // CRYSTAL CHECK COMMAND (+ecrystal / +ec)
    if (command === 'ecrystal') {
      const targetUser = message.mentions.users.first() || message.author;
      ensureUser(targetUser.id);
      const targetData = db.users[targetUser.id];
      const displayName = targetData.customNickname || targetUser.username;

      const container = new ContainerBuilder()
        .setAccentColor(0x00bcd4)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 💎 Event Crystals Balance\n\n` +
              `User: **${displayName}**\n` +
              `Balance: **${(targetData.crystals || 0).toLocaleString()}** ${CRYSTAL_EMOJI}\n\n` +
              `*Participate in +cadventure and +battle to earn more crystals!*`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // EVENT SHOP COMMAND (+eshop / +es)
    if (command === 'eshop') {
      const eventChibis = gameData.eventChibis || [];
      eventChibis.sort((a, b) => a.cost - b.cost);

      const shopLines = eventChibis.map(c => {
        return toSmallCaps(`\`[${c.id}]\` ${c.emoji} — **${c.cost.toLocaleString()}** ${CRYSTAL_EMOJI} *(Odds: ${c.odds} / Shiny: ${c.shinyOdds})*`);
      }).join('\n');

      const selectOptions = eventChibis.map(c => ({
        label: `Buy ${c.name} (${c.cost} Crystals)`.slice(0, 100),
        value: `buy_event_${c.id}`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('event_shop_menu')
          .setPlaceholder(toSmallCaps('Select an Event Chibi to purchase'))
          .addOptions(selectOptions)
      );

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🛍️ Beta Event Shop\n\n` +
              `Your Crystals: **${(user.crystals || 0).toLocaleString()}** ${CRYSTAL_EMOJI}\n` +
              `Select an item below to exchange crystals for exclusive SSRP event chibis marked with ${EVENT_ICON}!\n\n` +
              `-----------------------------------\n\n`
            ) + shopLines
          )
        );

      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });

        const selectedVal = i.values[0];
        const chibiId = selectedVal.replace('buy_event_', '');
        const targetChibi = eventChibis.find(c => c.id === chibiId);

        if (!targetChibi) return i.followUp({ content: toSmallCaps('❌ Invalid event chibi selected.'), ephemeral: true });

        if (user.crystals < targetChibi.cost) {
          return i.followUp({ content: toSmallCaps(`❌ You don't have enough crystals! You need **${targetChibi.cost}** ${CRYSTAL_EMOJI}, but you have **${user.crystals}** ${CRYSTAL_EMOJI}.`), ephemeral: true });
        }

        user.crystals -= targetChibi.cost;
        const generatedId = new mongoose.Types.ObjectId().toString();
        const purchasedEntry = {
          id: generatedId,
          chibiId: generatedId,
          name: `${targetChibi.name} ${EVENT_ICON}`,
          rarity: 'SSRP',
          emoji: targetChibi.emoji,
          isShiny: false,
          level: 1,
          exp: 0,
          date: new Date().toLocaleDateString()
        };

        user.inventory.chibis.push(purchasedEntry);
        await saveUsers();

        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased ${targetChibi.emoji} **${targetChibi.name}** for **${targetChibi.cost}** ${CRYSTAL_EMOJI}! Added to your collections.`), ephemeral: true });
      });
      return;
    }

    // CADVENTURE COMMAND (+cadventure / +ca / +eadventure)
    if (command === 'cadventure') {
      const randomNpc = NPC_LIST[Math.floor(Math.random() * NPC_LIST.length)];
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fight_npc').setLabel(toSmallCaps('⚔️ Fight NPC')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline_npc').setLabel(toSmallCaps('🚪 Decline')).setStyle(ButtonStyle.Danger)
      );

      const advMsg = await message.reply({
        content: toSmallCaps(`${randomNpc.icon} **${randomNpc.name}**\n\n<@${userId}> You spotted an NPC and they want to fight you, do you want to accept this challenge?`),
        components: [row]
      });

      const collector = advMsg.createMessageComponentCollector({ time: 10000 });
      let handled = false;

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('This adventure encounter is not for you!'), ephemeral: true });
        handled = true;

        if (i.customId === 'fight_npc') {
          const npcAtk = Math.floor(Math.random() * 36) + 10; // 10 - 45
          const npcHp = Math.floor(Math.random() * 1329) + 400; // 400 - 1728
          const npcDef = Math.floor(Math.random() * 66) + 40; // 40 - 105

          const eventChibisPool = gameData.eventChibis || [];
          const randomEventChibi = eventChibisPool[Math.floor(Math.random() * eventChibisPool.length)] || { name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>' };

          const getTeamCombatPower = (u) => {
            let power = 50;
            const teamSlots = u.team || [null, null, null];
            teamSlots.forEach(id => {
              if (!id) return;
              const chibi = u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
              if (!chibi) return;
              const statCfg = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, atk: 20, def: 10, hpPer: 10, atkPer: 2, defPer: 1 };
              const hp = statCfg.hp + chibi.level * statCfg.hpPer;
              const atk = statCfg.atk + chibi.level * statCfg.atkPer;
              const def = statCfg.def + chibi.level * statCfg.defPer;
              power += hp + atk * 3 + def * 2;
            });
            return power;
          };

          const userPower = getTeamCombatPower(user) * (0.85 + Math.random() * 0.3);
          const npcPower = (npcHp + npcAtk * 3 + npcDef * 2) * (0.85 + Math.random() * 0.3);

          const isUserWinner = userPower >= npcPower;

          let rewardCrystal = 0;
          let dropText = '';

          if (isUserWinner) {
            rewardCrystal = 17;
            user.crystals = (user.crystals || 0) + rewardCrystal;

            // 0.1% chance for shiny event chibi, or normal event chibi
            const isShinyDrop = Math.random() * 100 <= 0.1;
            const generatedId = new mongoose.Types.ObjectId().toString();
            const droppedChibi = {
              id: generatedId,
              chibiId: generatedId,
              name: `${randomEventChibi.name} ${EVENT_ICON}`,
              rarity: 'SSRP',
              emoji: randomEventChibi.emoji,
              isShiny: isShinyDrop,
              level: 1,
              exp: 0,
              date: new Date().toLocaleDateString()
            };
            user.inventory.chibis.push(droppedChibi);
            dropText = `\n🎁 **NPC Drop:** Received ${randomEventChibi.emoji} **${randomEventChibi.name}** ${isShinyDrop ? `${SHINY_ICON} (Shiny Event Drop!)` : ''} ${EVENT_ICON}!`;
          } else {
            rewardCrystal = 8;
            user.crystals = (user.crystals || 0) + rewardCrystal;
          }

          await saveUsers();

          const container = new ContainerBuilder()
            .setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                toSmallCaps(
                  `# ⚔️ Adventure Battle Result\n\n` +
                  `Opponent: ${randomNpc.icon} **${randomNpc.name}**\n` +
                  `NPC Chibi: ${randomEventChibi.emoji} **${randomEventChibi.name}**\n` +
                  `NPC Stats ➔ ⚔️ ATK: \`${npcAtk}\` | ❤️ HP: \`${npcHp}\` | 🛡️ DEF: \`${npcDef}\`\n\n` +
                  `${isUserWinner ? '🏆 **Victory! You defeated the NPC!**' : '💔 **Defeat! The NPC overpowered you!**'}\n` +
                  `💎 Crystals Earned: **+${rewardCrystal}** ${CRYSTAL_EMOJI}` +
                  dropText
                )
              )
            );

          return advMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } else {
          return advMsg.edit({ content: toSmallCaps(`🚪 You successfully avoided the wandering NPC encounter.`), components: [] }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) {
          await advMsg.edit({ content: toSmallCaps(`⏳ Adventure encounter timed out and the NPC disappeared.`), components: [] }).catch(() => {});
        }
      });
      return;
    }

    // STANDARD COMMAND FOOTER APPEND HELPER
    const originalReply = message.reply.bind(message);
    // We can append the event reminder to text messages or containers where appropriate, or keep clean.

    if (command === 'help') {
      const helpText =
        toSmallCaps('🎲 **Rolling, Drops & Games**\n') +
        `\`${currentPrefix}roll [qty] [boost]\` (${currentPrefix}r) — Roll Chibis\n` +
        `\`${currentPrefix}drop\` (${currentPrefix}d) — Claim free dice every 10s\n` +
        `\`${currentPrefix}slot [bet]\` — Play Chibi Slot Machine 🎰\n` +
        `\`${currentPrefix}shop\` — Buy Spray & Clover boosts\n` +
        `\`${currentPrefix}rarities\` (${currentPrefix}rar) — View Chibi drop rates\n\n` +
        toSmallCaps('🎁 **Rewards, Events & Economy**\n') +
        `\`${currentPrefix}event\` — Beta Event Hub & Info\n` +
        `\`${currentPrefix}ecrystal\` (${currentPrefix}ec) — Check Crystals ${CRYSTAL_EMOJI}\n` +
        `\`${currentPrefix}eshop\` (${currentPrefix}es) — Event Chibi Shop\n` +
        `\`${currentPrefix}cadventure\` (${currentPrefix}ca) — Adventure & Battle NPCs\n` +
        `\`${currentPrefix}daily\` — Claim daily streak rewards\n` +
        `\`${currentPrefix}points\` — Check points & rank badge\n` +
        `\`${currentPrefix}rank\` — View leaderboards\n\n` +
        toSmallCaps('⚔️ **RPG & Battling**\n') +
        `\`${currentPrefix}cstats\` — Inspect team card\n` +
        `\`${currentPrefix}equipteam [id] [slot]\` — Manage team (1-3)\n` +
        `\`${currentPrefix}battle [@user]\` — 3v3 Arena Clash\n\n` +
        toSmallCaps('🎒 **Inventory & Collections**\n') +
        `\`${currentPrefix}inventory\` (${currentPrefix}inv) — Items bag\n` +
        `\`${currentPrefix}collections\` (${currentPrefix}col) — Chibi binder\n` +
        `\`${currentPrefix}profile\` (${currentPrefix}p) [@user] — User profile`;

      const container = new ContainerBuilder()
        .setAccentColor(0xff77aa)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps('# 🌸 Chibi RPG RNG — Help Center\nExplore categories below:'))
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
              `⚙️ Status: 🟢 Online & Operational (Beta Event Active)`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'rarities') {
      const raritiesInfo =
        `${rarityIconsMap['C'] || '📦'} **Common (C)** — Drop Rate: 50%\n` +
        `${rarityIconsMap['U'] || '📦'} **Uncommon (U)** — Drop Rate: 35%\n` +
        `${rarityIconsMap['R'] || '📦'} **Rare (R)** — Drop Rate: 15%\n` +
        `${rarityIconsMap['SR'] || '📦'} **Super Rare (SR)** — Drop Rate: 1%\n` +
        `${rarityIconsMap['SRR'] || '📦'} **Super Super Rare (SRR)** — Drop Rate: 0.1%\n` +
        `${rarityIconsMap['UTR'] || '📦'} **Ultra Rare (UTR)** — Drop Rate: 0.01%\n` +
        `${rarityIconsMap['SSRP'] || '📦'} **Super Ultra Rare (SSRP)** — Event Exclusive`;

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
      if (!newNickname) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}customnn [nickname] (Max 12 characters)`));
      if (newNickname.length > 12) return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));

      user.customNickname = newNickname;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated your custom nickname to ${newNickname}!`));
    }

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

    if (command === 'slot') {
      const bet = parseInt(args[0]);
      if (isNaN(bet) || bet <= 0) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}slot [bet_amount]`));
      if (user.dice < bet) return message.reply(toSmallCaps(`❌ You don't have enough dice! You have ${user.dice} 🎲.`));

      user.dice -= bet;
      await saveUsers();

      let availableChibiEmojis = ['📦', '✨', '⭐', '🌟', '💎', '🔥', '💖'];
      if (user.inventory && user.inventory.chibis && user.inventory.chibis.length > 0) {
        availableChibiEmojis = Array.from(new Set(user.inventory.chibis.map(c => c.emoji || '📦')));
      }

      const getRandomSymbol = () => availableChibiEmojis[Math.floor(Math.random() * availableChibiEmojis.length)];
      const slotMsg = await message.reply({ content: toSmallCaps(`🎰 Spinning Chibi Slot Machine...\n| 🔄 | 🔄 | 🔄 |`) });

      await new Promise(resolve => setTimeout(resolve, 600));
      const final1 = getRandomSymbol();
      const final2 = getRandomSymbol();
      const final3 = getRandomSymbol();

      let payoutMultiplier = 0;
      let pointsWon = 0;
      let resultText = '';

      if (final1 === final2 && final2 === final3) {
        payoutMultiplier = 10;
        pointsWon = 25;
        resultText = toSmallCaps(`🎉 CHIBI JACKPOT! TRIPLE MATCH (${final1})! (+10x Dice, +${pointsWon} Points!)`);
      } else if (final1 === final2 || final2 === final3 || final1 === final3) {
        payoutMultiplier = 2;
        pointsWon = 10;
        resultText = toSmallCaps(`✨ Partial Chibi Match! (+2x Dice, +${pointsWon} Points!)`);
      } else {
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
              `💰 Dice Payout: +${winnings} 🎲 | 🏆 Points: +${pointsWon} Pts\n` +
              `🎲 Total Dice: ${user.dice}`
            )
          )
        );

      return slotMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (command === 'daily') {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const currentMs = Date.now();

      if (currentMs - user.lastDaily < twentyFourHours) {
        const remainingTime = Math.ceil((twentyFourHours - (currentMs - user.lastDaily)) / 1000 / 60);
        return message.reply(toSmallCaps(`⏳ Please wait another ${remainingTime} minutes to claim your daily reward.`));
      }

      user.streak = (user.streak || 0) + 1;
      user.lastDaily = currentMs;
      user.dice += 5;
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(`🎁 Daily Reward Claimed!\n🔥 Streak: ${user.streak} Days\n🎲 Reward: +5x Dice (Total: ${user.dice} 🎲)`));
    }

    if (command === 'roll') {
      const qty = Math.min(parseInt(args[0]) || 1, gameData.settings.maxRollQuantity);
      if (user.dice < qty) return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`));

      user.dice -= qty;
      const resultsSummary = [];
      let totalExpGained = 0;
      const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (user.team[0] || user.equippedChibi));

      for (let i = 0; i < qty; i++) {
        const raritiesList = gameData.rarities.filter(r => r.key !== 'SSRP');
        const totalWeight = raritiesList.reduce((sum, r) => sum + r.weight, 0);
        let randW = Math.random() * totalWeight;
        let chosenRarity = raritiesList[0];

        for (const r of raritiesList) {
          if (randW < r.weight) {
            chosenRarity = r;
            break;
          }
          randW -= r.weight;
        }

        const availableChibis = gameData.chibis.filter(c => c.rarity === chosenRarity.key);
        const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];
        const isShiny = Math.random() * 100 < 0.00001;

        const generatedId = new mongoose.Types.ObjectId().toString();
        user.inventory.chibis.push({
          id: generatedId,
          chibiId: generatedId,
          name: chibiTemplate.name,
          rarity: chibiTemplate.rarity,
          emoji: chibiTemplate.emoji,
          isShiny,
          level: 1,
          exp: 0,
          date: new Date().toLocaleDateString()
        });

        resultsSummary.push({ chibi: chibiTemplate, isShiny });
        totalExpGained += addExpAndLevelUp(user, primaryChibi, isShiny ? 250 : 50);
      }

      updateUserRank(user);
      await saveUsers();

      const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps('# 🎲 Chibi Roll Results\n\n') +
            resultsSummary.map(r => `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''}`).join('\n') +
            toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!\n🎲 Remaining Dice: ${user.dice}`)
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'drop') {
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      const currentMs = Date.now();
      if (currentMs - user.lastDrop < cooldownMs) {
        const timeLeft = Math.ceil((cooldownMs - (currentMs - user.lastDrop)) / 1000);
        return message.reply(toSmallCaps(`⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`));
      }
      user.lastDrop = currentMs;

      const dropItem = gameData.dropTable[Math.floor(Math.random() * gameData.dropTable.length)];
      user.dice += dropItem.dice;
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(`${dropItem.emoji} ${dropItem.name}! You received **${dropItem.dice}x Dice** 🎲! Total dice: ${user.dice}`));
    }

    if (command === 'inventory') {
      const displayName = user.customNickname || message.author.username;
      const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 🎒 ${displayName}'s Inventory\n\n` +
              `🎲 Dice: ${user.dice || 0}\n` +
              `💎 Crystals: ${user.crystals || 0} ${CRYSTAL_EMOJI}\n\n` +
              `*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
            )
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'collections') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply(toSmallCaps(`📖 Your collection is empty! Use ${currentPrefix}roll or ${currentPrefix}eshop.`));
      }

      let currentPage = 0;
      const itemsPerPage = 10;
      const totalPages = Math.max(1, Math.ceil(user.inventory.chibis.length / itemsPerPage));

      const renderCol = (page) => {
        const start = page * itemsPerPage;
        const pageItems = user.inventory.chibis.slice(start, start + itemsPerPage);
        const formatted = pageItems.map((c, idx) => {
          const shortId = (c.chibiId || c.id).slice(-6);
          const shinyPart = c.isShiny ? ` ${SHINY_ICON}` : '';
          return `**${start + idx + 1}.** \`[${shortId}]\` ${rarityIconsMap[c.rarity] || '📦'} ${c.emoji} **${c.name}**${shinyPart} (Lvl ${c.level})`;
        }).join('\n');

        const displayName = user.customNickname || message.author.username;
        return new ContainerBuilder()
          .setAccentColor(0x9b59b6)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(
                `# 📖 ${displayName}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\n`
              ) + formatted +
              toSmallCaps(`\n\n*Total Chibis Owned: ${user.inventory.chibis.length}*`)
            )
          );
      };

      const getRows = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('col_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('col_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
      };

      const colMsg = await message.reply({
        components: [renderCol(currentPage), getRows(currentPage)],
        flags: MessageFlags.IsComponentsV2
      });

      const collector = colMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your session!'), ephemeral: true });

        if (i.customId === 'col_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'col_next' && currentPage < totalPages - 1) currentPage++;

        await colMsg.edit({
          components: [renderCol(currentPage), getRows(currentPage)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      });
      return;
    }

    if (command === 'cstats') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply(toSmallCaps('❌ You have no chibis in your inventory!'));
      }

      const teamSlots = user.team || [null, null, null];
      const teamLines = teamSlots.map((chibiId, index) => {
        if (!chibiId) return toSmallCaps(`**[${index + 1}]** *Empty Slot*`);
        const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
        if (!chibi) return toSmallCaps(`**[${index + 1}]** *Chibi missing*`);

        const statConfig = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, atk: 20, def: 10, hpPer: 10, atkPer: 2, defPer: 1 };
        const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
        const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
        const defVal = statConfig.def + chibi.level * statConfig.defPer;

        return `**[${index + 1}]** ${rarityIconsMap[chibi.rarity]} ${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''}\nLvl ${chibi.level} | ❤️ HP: \`${hpVal}\` | 🛡️ DEF: \`${defVal}\` | 🗡️ ATK: \`${atkVal}\``;
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 📜 Team Card\n\n`) + teamLines.join('\n\n')
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'rank' || command === 'ranks') {
      const allSortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => ({ uId, ...uData }))
        .sort((a, b) => (b.points || 0) - (a.points || 0));

      const topLines = await Promise.all(allSortedUsers.slice(0, 10).map(async (u, idx) => {
        const name = await getDisplayName(u.uId);
        return toSmallCaps(`**${idx + 1}.** ${name} — Points: **${(u.points || 0).toLocaleString()}** | Crystals: ${(u.crystals || 0).toLocaleString()} ${CRYSTAL_EMOJI}`);
      }));

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 🏆 Global Leaderboard\n\n`) + (topLines.join('\n') || toSmallCaps('No players yet.'))
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'equipteam') {
      const chibiIdArg = args[0];
      const slot = parseInt(args[1]);
      if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}equipteam [chibi_id] [slot 1-3]`));
      }

      const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiIdArg || (c.chibiId || c.id).endsWith(chibiIdArg));
      if (!chibi) return message.reply(toSmallCaps(`❌ Chibi ID not found!`));

      user.team[slot - 1] = chibi.chibiId || chibi.id;
      if (slot === 1) user.equippedChibi = chibi.chibiId || chibi.id;
      await saveUsers();

      return message.reply(toSmallCaps(`✅ Successfully equipped ${chibi.emoji} **${chibi.name}** to Team Slot ${slot}!`));
    }

    if (command === 'battle') {
      const opponent = message.mentions.users.first();
      if (!opponent || opponent.bot || opponent.id === userId) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}battle [@user]`));
      }
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel(toSmallCaps('Accept Clash')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
      );

      const battleMsg = await message.reply({
        content: toSmallCaps(`⚔️ <@${opponent.id}>, you have been challenged to a 3v3 Arena Clash by <@${userId}>!`),
        components: [row]
      });

      const collector = battleMsg.createMessageComponentCollector({ time: 10000 });
      let handled = false;

      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== opponent.id) return i.followUp({ content: toSmallCaps('Not your challenge!'), ephemeral: true });
        handled = true;

        if (i.customId === 'accept_battle') {
          const p1User = user;
          const p2User = db.users[opponent.id];

          const isP1Win = Math.random() >= 0.5;
          const winnerUser = isP1Win ? p1User : p2User;
          const loserUser = isP1Win ? p2User : p1User;

          const winCrystals = Math.floor(Math.random() * 7) + 10; // 10 - 16
          const loseCrystals = Math.floor(Math.random() * 7) + 2; // 2 - 8

          winnerUser.crystals = (winnerUser.crystals || 0) + winCrystals;
          loserUser.crystals = (loserUser.crystals || 0) + loseCrystals;

          winnerUser.points = (winnerUser.points || 0) + 50;
          await saveUsers();

          const container = new ContainerBuilder()
            .setAccentColor(0xf1c40f)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                toSmallCaps(
                  `# ⚔️ Arena Clash Results\n\n` +
                  `🏆 Winner: <@${isP1Win ? userId : opponent.id}>\n` +
                  `💎 Winner Crystal Reward: **+${winCrystals}** ${CRYSTAL_EMOJI}\n` +
                  `💎 Loser Crystal Reward: **+${loseCrystals}** ${CRYSTAL_EMOJI}`
                )
              )
            );

          return battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } else {
          return battleMsg.edit({ content: toSmallCaps(`❌ Battle challenge declined.`), components: [] }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) await battleMsg.edit({ content: toSmallCaps(`⏳ Battle challenge timed out.`), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type answer in 15 seconds!)*`));

      const filter = m => m.author.id === userId;
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

      collector.on('collect', async m => {
        const userAnswer = m.content.toLowerCase().trim();
        const isCorrect = selected.a.some(ans => userAnswer.includes(ans));

        if (isCorrect) {
          user.crystals = (user.crystals || 0) + 5;
          user.points += 20;
          await saveUsers();
          m.reply(toSmallCaps(`🎉 Correct! Earned +20 Points and +5 ${CRYSTAL_EMOJI} Crystals!`));
        } else {
          m.reply(toSmallCaps(`❌ Incorrect! Answer was **${selected.a[0]}**.`));
        }
      });
      return;
    }

    if (command === 'profile') {
      const targetUser = message.mentions.users.first() || message.author;
      ensureUser(targetUser.id);
      const targetData = db.users[targetUser.id];
      const displayName = targetData.customNickname || targetUser.username;

      const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# ${displayName}\n\n` +
              `📊 Level ${targetData.userLevel}\n` +
              `🏆 Points: ${(targetData.points || 0).toLocaleString()}\n` +
              `💎 Crystals: ${(targetData.crystals || 0).toLocaleString()} ${CRYSTAL_EMOJI}\n` +
              `🎲 Dice: ${targetData.dice || 0}`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const isOwner = () => userId === (db.config.ownerId || userId) || user.permissions === true;

    // ADMIN COMMAND: +admingivecrystal @user [amount]
    if (command === 'admingivecrystal') {
      if (!isOwner() && !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(toSmallCaps('❌ You do not have permission to use this command!'));
      }
      const target = message.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivecrystal [@user] [amount]`));

      ensureUser(target.id);
      db.users[target.id].crystals = (db.users[target.id].crystals || 0) + amount;
      await saveUsers();

      return message.reply(toSmallCaps(`🎁 Granted **${amount}** ${CRYSTAL_EMOJI} Crystals to <@${target.id}>!`));
    }

    // OWNER COMMAND: +ownergivechibi @user [id or rarity]
    if (command === 'ownergivechibi') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can use this command!'));
      const target = message.mentions.users.first();
      const chibiIdArg = args[1];

      if (!target || !chibiIdArg) {
        const eventChibisList = (gameData.eventChibis || []).map(c => `\`[${c.id}]\` ${c.emoji} ${c.name}`).join('\n');
        return message.reply(toSmallCaps(
          `❌ Usage: ${currentPrefix}ownergivechibi [@user] [Event Chibi ID 1-11]\n\nAvailable Event Chibis:\n` + eventChibisList
        ));
      }

      ensureUser(target.id);
      const targetData = db.users[target.id];
      const eventChibi = (gameData.eventChibis || []).find(c => c.id === chibiIdArg);

      if (!eventChibi) return message.reply(toSmallCaps('❌ Invalid Event Chibi ID!'));

      const generatedId = new mongoose.Types.ObjectId().toString();
      targetData.inventory.chibis.push({
        id: generatedId,
        chibiId: generatedId,
        name: `${eventChibi.name} ${EVENT_ICON}`,
        rarity: 'SSRP',
        emoji: eventChibi.emoji,
        isShiny: false,
        level: 1,
        exp: 0,
        date: new Date().toLocaleDateString()
      });

      await saveUsers();

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(
              `# 👑 Owner Chibi Gifted\n\n` +
              `Successfully awarded ${eventChibi.emoji} **${eventChibi.name}** ${EVENT_ICON} to <@${target.id}>!`
            )
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // Append Event footer to general command responses if needed
    // Done!
  } catch (err) {
    console.error(err);
    message.reply(toSmallCaps('❌ An error occurred while executing this command.'));
  }
});

initDatabase().then(() => {
  client.login(process.env.DISCORD_TOKEN);
});