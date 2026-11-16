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
  MessageFlags
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
  config: {
    type: Object,
    default: {
      ownerId: '',
      globalLuckMultiplier: 1.0,
      luckEventExpires: 0,
      globalXpMultiplier: 1.0,
      xpEventExpires: 0,
      seasonNumber: 1,
      seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000)
    }
  }
});

const GameState = mongoose.model('GameState', GameStateSchema);

let db = {
  users: {},
  clans: {},
  config: {
    ownerId: '',
    globalLuckMultiplier: 1.0,
    luckEventExpires: 0,
    globalXpMultiplier: 1.0,
    xpEventExpires: 0,
    seasonNumber: 1,
    seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000)
  }
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
      state = await GameState.create({ _id: 'main_state', users: {}, clans: {}, config: db.config });
    }
    db.users = state.users || {};
    db.clans = state.clans || {};
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
    state.config = db.config;
    state.markModified('users');
    state.markModified('clans');
    state.markModified('config');
    await state.save();
  } catch (err) {
    console.error('Failed to save data to MongoDB:', err);
  }
}

const SHINY_ICON = '<:shiny:1571311476239630517>';
const RARITY_HIERARCHY = { UTR: 6, SRR: 5, SR: 4, R: 3, U: 2, C: 1 };
const cooldowns = new Map();

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

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      dice: 10,
      points: 0,
      rank: '<:unranked:1571314276071907519>',
      clan: null,
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
  if (ms <= 0) return 'Ended';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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

function calculateChibiCombatPower(chibi) {
  if (!chibi) return 50;
  const statConfig = gameData.stats[chibi.rarity][chibi.isShiny ? 'shiny' : 'normal'];
  const hp = statConfig.hp + chibi.level * statConfig.hpPer;
  const atk = statConfig.atk + chibi.level * statConfig.atkPer;
  const def = statConfig.def + chibi.level * statConfig.defPer;
  return hp + atk * 3 + def * 2;
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
  { q: 'What is the powerhouse of the cell? Answer starts with M___', a: 'mitochondria' },
  { q: 'What programming language is this bot written in? J______', a: 'javascript' },
  { q: 'Which planet is known as the Red Planet? M___', a: 'mars' },
  { q: 'What is the chemical symbol for gold? A_', a: 'au' },
  { q: 'Who painted the Mona Lisa? L______', a: 'da vinci' },
  { q: 'What is the capital city of Japan? T____', a: 'tokyo' },
  { q: 'How many continents are there on Earth? S____', a: 'seven' },
  { q: 'What gas do plants absorb from the atmosphere? C______ d______', a: 'carbon dioxide' },
  { q: 'What is the largest mammal in the world? B____ w____', a: 'blue whale' },
  { q: 'In what year did the Titanic sink? 1___', a: '1912' },
  { q: 'What is the hardest natural substance on Earth? D______', a: 'diamond' },
  { q: 'Which element has the atomic number 1? H_______', a: 'hydrogen' },
  { q: 'What is the freezing point of water in Celsius? _ degrees', a: '0' },
  { q: 'What is the largest planet in our solar system? J______', a: 'jupiter' },
  { q: 'What currency is used in Japan? Y___', a: 'yen' },
  { q: 'Who wrote "Romeo and Juliet"? W______ S________', a: 'william shakespeare' },
  { q: 'What is the fastest land animal? C______', a: 'cheetah' },
  { q: 'Which ocean is the largest? P______ O____', a: 'pacific ocean' },
  { q: 'What is the capital of France? P____', a: 'paris' },
  { q: 'How many bones are in the adult human body? ___', a: '206' },
  { q: 'What is the main ingredient in guacamole? A_______', a: 'avocado' },
  { q: 'Which country is home to the kangaroo? A________', a: 'australia' },
  { q: 'What does CPU stand for? C______ p______ u___', a: 'central processing unit' },
  { q: 'What is the speed of light approximately in km/s? ~______', a: '300000' },
  { q: 'Who discovered penicillin? A______ F______', a: 'alexander fleming' },
  { q: 'What is the national sport of Canada? L______', a: 'lacrosse' },
  { q: 'What is the capital of Italy? R___', a: 'rome' },
  { q: 'Which instrument has 88 keys? P____', a: 'piano' },
  { q: 'What is the smallest prime number? _', a: '2' },
  { q: 'What company developed Minecraft? M_____', a: 'mojang' },
  { q: 'What is the tallest mountain in the world? M____ E______', a: 'mount everest' },
  { q: 'Which superhero is known as the Dark Knight? B_____-____', a: 'batman' },
  { q: 'What is the main language spoken in Brazil? P__________', a: 'portuguese' },
  { q: 'What is the boiling point of water in Fahrenheit? ___ degrees', a: '212' },
  { q: 'What is the rarest blood type? __ negative', a: 'ab negative' },
  { q: 'Who painted "The Starry Night"? V___ G___', a: 'van gogh' },
  { q: 'What is the currency of the United Kingdom? P____', a: 'pound' },
  { q: 'Which gas makes up the majority of Earths atmosphere? N_______', a: 'nitrogen' },
  { q: 'What is the capital of Egypt? C___', a: 'cairo' },
  { q: 'How many players are on a standard soccer team on the field? __', a: '11' },
  { q: 'What is the chemical symbol for iron? F_', a: 'fe' },
  { q: 'Which planet is closest to the sun? M_______', a: 'mercury' },
  { q: 'What is the longest river in the world? N___ R____', a: 'nile river' },
  { q: 'Who wrote the Harry Potter series? J_ K_ R______', a: 'j. k. rowling' },
  { q: 'What is the capital of Australia? C________', a: 'canberra' },
  { q: 'What is the square root of 144? __', a: '12' },
  { q: 'Which country invented tea? C____', a: 'china' },
  { q: 'What is the capital of Spain? M______', a: 'madrid' },
  { q: 'What do bees collect and use to make honey? N______', a: 'nectar' },
  { q: 'What is the smallest country in the world? V_____ C___', a: 'vatican city' },
  { q: 'What year did World War II end? 1___', a: '1945' },
  { q: 'Which element is diamond made of? C_____', a: 'carbon' },
  { q: 'What is the capital of Germany? B______', a: 'berlin' },
  { q: 'What is the chemical formula for water? H__O', a: 'h2o' },
  { q: 'Who was the first person to walk on the moon? N___ A______', a: 'neil armstrong' },
  { q: 'What is the capital of South Korea? S____', a: 'seoul' },
  { q: 'Which continent is the Sahara Desert located in? A_____', a: 'africa' },
  { q: 'What is the national flower of Japan? C________', a: 'cherry blossom' },
  { q: 'What is the capital of Canada? O______', a: 'ottawa' },
  { q: 'How many colors are in a rainbow? _', a: 'seven' },
  { q: 'What is the capital of India? N__ D____', a: 'new delhi' },
  { q: 'Which metal is liquid at room temperature? M______', a: 'mercury' },
  { q: 'What is the capital of Russia? M______', a: 'moscow' },
  { q: 'Who invented the telephone? A_____ G_____ B____', a: 'alexander graham bell' },
  { q: 'What is the capital of Mexico? M______ C___', a: 'mexico city' },
  { q: 'Which animal is known as the Ship of the Desert? C____', a: 'camel' },
  { q: 'What is the capital of Argentina? B_____ A_____', a: 'buenos aires' },
  { q: 'What is the largest state in the US by area? A_____', a: 'alaska' },
  { q: 'What is the capital of Greece? A____', a: 'athens' },
  { q: 'Which bird is universally recognized as a symbol of peace? D___', a: 'dove' },
  { q: 'What is the capital of Thailand? B______', a: 'bangkok' },
  { q: 'How many legs does a spider have? _', a: 'eight' },
  { q: 'What is the capital of China? B______', a: 'beijing' },
  { q: 'Which gas is most abundant in the sun? H_______', a: 'hydrogen' },
  { q: 'What is the capital of Brazil? B________', a: 'brasilia' },
  { q: 'What is the name of our galaxy? M____ W___', a: 'milky way' },
  { q: 'What is the capital of Ireland? D______', a: 'dublin' },
  { q: 'Who painted the Sistine Chapel ceiling? M_________', a: 'michelangelo' },
  { q: 'What is the capital of Turkey? A____', a: 'ankara' },
  { q: 'What is the primary color of a school bus? Y_____', a: 'yellow' },
  { q: 'What is the capital of Sweden? S________', a: 'stockholm' },
  { q: 'Which mammal can fly? B__', a: 'bat' },
  { q: 'What is the capital of Norway? O___', a: 'oslo' },
  { q: 'What is the tallest building in the world? B____ K______', a: 'burj khalifa' },
  { q: 'What is the capital of Portugal? L_____', a: 'lisbon' },
  { q: 'Which ocean is off the coast of California? P______', a: 'pacific' },
  { q: 'What is the capital of Switzerland? B___', a: 'bern' },
  { q: 'What is the main ingredient in bread? F____', a: 'flour' },
  { q: 'What is the capital of New Zealand? W_________', a: 'wellington' },
  { q: 'Which planet has the most moons? S______', a: 'saturn' },
  { q: 'What is the capital of Poland? W______', a: 'warsaw' },
  { q: 'How many days are in a leap year? ___', a: '366' },
  { q: 'What is the capital of Denmark? C__________', a: 'copenhagen' },
  { q: 'What is the chemical symbol for silver? A_', a: 'ag' },
  { q: 'What is the capital of Finland? H_______', a: 'helsinki' },
  { q: 'Which animal is known for changing its colors? C__________', a: 'chameleon' },
  { q: 'What is the capital of Austria? V______', a: 'vienna' },
  { q: 'What is the largest desert in the world? A__________ D_____', a: 'antarctic desert' },
  { q: 'What is the capital of Belgium? B_______', a: 'brussels' },
  { q: 'Who wrote "The Odyssey"? H____', a: 'homer' }
];

client.once('ready', async () => {
  await initDatabase();
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);
  
  const updateStatus = () => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`+help | Serving ${serverCount} servers`, { type: 0 });
  };
  updateStatus();
  setInterval(updateStatus, 60000);

  // Background interval check for automatic season expiration & point/rank resets
  setInterval(async () => {
    const now = Date.now();
    if (db.config.seasonExpires && now >= db.config.seasonExpires) {
      db.config.seasonNumber = (db.config.seasonNumber || 1) + 1;
      db.config.seasonExpires = now + (30 * 24 * 60 * 60 * 1000);

      for (const uId of Object.keys(db.users)) {
        db.users[uId].points = 0;
        updateUserRank(db.users[uId]);
      }
      await saveUsers();
      console.log(`Season timer expired! Automatically started Season ${db.config.seasonNumber} and reset all user points/ranks.`);
    }
  }, 60000);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('+')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  let command = args.shift().toLowerCase();
  const userId = message.author.id;

  const shortcuts = {
    h: 'help',
    r: 'roll',
    p: 'profile',
    inv: 'inventory',
    col: 'collections',
    d: 'drop',
    t: 'trade'
  };
  if (shortcuts[command]) {
    command = shortcuts[command];
  }

  // 5-Second Rate Limiting Check
  const cooldownAmount = 5000;
  const nowTime = Date.now();
  if (!cooldowns.has(userId)) {
    cooldowns.set(userId, new Map());
  }
  const timestamps = cooldowns.get(userId);
  if (timestamps.has(command)) {
    const expirationTime = timestamps.get(command) + cooldownAmount;
    if (nowTime < expirationTime) {
      const timeLeft = (expirationTime - nowTime) / 1000;
      return message.reply(`⏳ Please wait **${timeLeft.toFixed(1)} more seconds** before using \`+${command}\` again.`);
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
      if (user.started) return message.reply('⚠️ You have already started your Chibi RPG journey!');
      user.started = true;
      user.dice += 20;
      if (!db.config.ownerId) db.config.ownerId = userId;
      updateUserRank(user);
      await saveUsers();
      return message.reply('🎉 Welcome to Chibi RPG RNG! You have been awarded **20x Dice** 🎲 and your profile is initialized.');
    }

    if (!user.started && command !== 'help' && command !== 'status') {
      return message.reply('❌ You must type `+start` before using any bot commands!');
    }

    // +help
    if (command === 'help') {
      const container = new ContainerBuilder()
        .setAccentColor(0xff77aa)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('# 🌸 Chibi RPG RNG - Help Center\nExplore the categories below to navigate your adventure:')
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '**🎲 Rolling & Drops**\n`+roll [qty] [boost]` (`+r`) - Roll Chibis\n`+drop` (`+d`) - Claim free dice every 10s\n`+shop` - Buy Spray & Clover boosts\n\n' +
            '**🎁 Rewards & Economy**\n`+daily` - Claim daily streak rewards (Scales up to x5 🎲)\n`+points` - Check points & rank icon badge\n`+rank` / `+ranks` - View rank icons & leaderboards\n\n' +
            '**⚔️ RPG & Battling**\n`+cstats` - Inspect your full 3-Slot Team card\n`+equipteam [chibi_id] [slot]` - Manage team (1-3)\n`+battle [@user]` - 3v3 Arena Clash with tiered points\n\n' +
            '**🎒 Inventory & Profile**\n`+inventory` (`+inv`), `+collections` (`+col`)\n`+profile` (`+p`), `+status` - Bot info & ping\n`+trade` (`+t`) [@user] - Interactive 2-Player Trade\n\n' +
            '**🏛️ Clans & Fun**\n`+clanlist`, `+ccreateclan (Cost: 100 🎲)`, `+cclanjoin`, `+cclaninfo`\n`+meme`, `+trivia`'
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +status
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
            '# 🤖 Bot System Status & Info\n\n' +
            `📶 **Latency / Ping:** ${ping}ms\n` +
            `⏱️ **Uptime:** ${hours}h ${minutes}m ${seconds}s\n` +
            `🌐 **Connected Servers:** ${client.guilds.cache.size} Servers\n` +
            `💻 **Runtime:** Node.js (Discord.js v14 - Components V2)\n` +
            `⚙️ **Status:** 🟢 Online & Operational (MongoDB Connected)`
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +daily
    if (command === 'daily') {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const fortyEightHours = 48 * 60 * 60 * 1000;

      if (currentMs - user.lastDaily < twentyFourHours) {
        const remainingTime = Math.ceil((twentyFourHours - (currentMs - user.lastDaily)) / 1000 / 60);
        return message.reply(`⏳ You have already claimed your daily reward! Please wait another **${remainingTime} minutes**.`);
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

      return message.reply(`🎁 **Daily Reward Claimed!**\n🔥 Streak: **${user.streak} Days**\n🎲 Reward: **+${rewardDice}x Dice** (x${multiplier} multiplier active! Total: ${user.dice} 🎲)`);
    }

    // +roll
    if (command === 'roll') {
      const qty = Math.min(parseInt(args[0]) || 1, gameData.settings.maxRollQuantity);
      const boost = args[1] ? args[1].toLowerCase() : null;

      if (qty < 1) return message.reply('❌ Quantity must be at least 1.');
      if (user.dice < qty) {
        return message.reply(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`);
      }

      if (boost === 'spray') {
        if (user.inventory.items.spray <= 0) return message.reply('❌ No Spray uses left! Buy more in `+shop`.');
        user.inventory.items.spray--;
      } else if (boost === 'clover') {
        if (user.inventory.items.clover <= 0) return message.reply('❌ No Clover uses left! Buy more in `+shop`.');
        user.inventory.items.clover--;
      }

      user.dice -= qty;
      const resultsSummary = [];
      let activeLuckMultiplier = db.config.globalLuckMultiplier || 1.0;
      if (boost === 'spray') activeLuckMultiplier *= 1.5;

      let totalExpGained = 0;
      const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (user.team[0] || user.equippedChibi));

      for (let i = 0; i < qty; i++) {
        const customWeights = { C: 40, U: 25, R: 10, SR: 3, SRR: 0.01, UTR: 0.001 };
        const adjustedRarities = gameData.rarities.map(r => {
          let w = customWeights[r.key] !== undefined ? customWeights[r.key] : r.weight;
          if (r.key !== 'C') w *= activeLuckMultiplier;
          return { ...r, adjustedWeight: w };
        });

        const totalWeight = adjustedRarities.reduce((sum, r) => sum + r.adjustedWeight, 0);
        let randW = Math.random() * totalWeight;
        let chosenRarityObj = adjustedRarities[0];

        for (const r of adjustedRarities) {
          if (randW < r.adjustedWeight) {
            chosenRarityObj = r;
            break;
          }
          randW -= r.adjustedWeight;
        }

        const availableChibis = gameData.chibis.filter(c => c.rarity === chosenRarityObj.key);
        const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];

        const normalVal = parseOddsNumber(chibiTemplate.odds);
        let shinyVal = 100000;
        shinyVal = Math.max(1, Math.round(shinyVal / activeLuckMultiplier));
        const isShiny = Math.random() * shinyVal < 1;

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

      const luckNotice = activeLuckMultiplier > 1.0 ? `\n⚡ *Active Luck Boost: ${activeLuckMultiplier}x*` : '';
      const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '# 🎲 Chibi Roll Results\n\n' +
            resultsSummary
              .map(
                r =>
                  `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${
                    r.duplicated ? '(🍀 Duplicated!)' : ''
                  }`
              )
              .join('\n') +
            `\n\n✨ Gained **+${totalExpGained} EXP**!` + luckNotice +
            `\n🎲 Remaining Dice: ${user.dice}`
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +drop
    if (command === 'drop') {
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      if (currentMs - user.lastDrop < cooldownMs) {
        const timeLeft = Math.ceil((cooldownMs - (currentMs - user.lastDrop)) / 1000);
        return message.reply(`⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`);
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

      return message.reply(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** 🎲! Total dice: ${user.dice}`);
    }

    // +inventory (Paginated with Next & Previous buttons)
    if (command === 'inventory') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply('🎒 Your chibi inventory is empty! Use `+roll` to summon chibis.');
      }

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
            count: 0,
            firstId: uniqueId ? uniqueId.slice(-6) : 'unknown'
          };
        }
        grouped[key].count++;
      });

      const entries = Object.values(grouped);
      const rarityRank = { UTR: 1, SRR: 2, SR: 3, R: 4, U: 5, C: 6 };
      entries.sort((a, b) => (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99));

      const itemsPerPage = 10;
      let currentPage = 0;
      const totalPages = Math.ceil(entries.length / itemsPerPage);

      const getInventoryPage = (page) => {
        const start = page * itemsPerPage;
        const pageItems = entries.slice(start, start + itemsPerPage);
        return pageItems
          .map((e, idx) => `**${start + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}** ${e.isShiny ? SHINY_ICON : ''}`)
          .join('\n') || 'Inventory page empty.';
      };

      const getInventoryRow = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('inv_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('inv_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
      };

      const renderInvContainer = (page) => {
        return new ContainerBuilder()
          .setAccentColor(0x3498db)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🎒 ${message.author.username}'s Inventory (Page ${page + 1}/${totalPages})\n\n` +
              `🎲 **Dice:** ${user.dice || 0} | 🧴 **Spray:** ${user.inventory.items?.spray || 0} | 🍀 **Clover:** ${user.inventory.items?.clover || 0}\n\n` +
              `✨ **Chibis:**\n${getInventoryPage(page)}\n\n` +
              `*Total Chibis Owned: ${user.inventory.chibis.length}*`
            )
          );
      };

      const invMsg = await message.reply({
        components: [renderInvContainer(currentPage), getInventoryRow(currentPage)],
        flags: MessageFlags.IsComponentsV2
      });

      const invCollector = invMsg.createMessageComponentCollector({ time: 120000 });
      invCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'Not your inventory session!', ephemeral: true });

        if (i.customId === 'inv_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'inv_next' && currentPage < totalPages - 1) currentPage++;

        await i.update({
          components: [renderInvContainer(currentPage), getInventoryRow(currentPage)],
          flags: MessageFlags.IsComponentsV2
        });
      });
      return;
    }

    // +collections (Paginated with Next & Previous buttons + Sort Toggle)
    if (command === 'collections') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply('📖 Your collection is empty! Use `+roll` to summon chibis.');
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
        const rarityRank = { UTR: 1, SRR: 2, SR: 3, R: 4, U: 5, C: 6 };

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
          .map((e, idx) => `**${start + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}** ${e.isShiny ? SHINY_ICON : ''}`)
          .join('\n') || 'Collection page empty.';

        const container = new ContainerBuilder()
          .setAccentColor(0x9b59b6)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 📖 ${message.author.username}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\n` +
              `Sort: **${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}**\n\n` +
              formatted +
              `\n\n*Unique Types: ${new Set(user.inventory.chibis.map(c => c.name)).size} | Total Owned: ${user.inventory.chibis.length}*`
            )
          );
        return { container, totalPages };
      };

      const getColRows = (page, totalPages) => {
        return [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sort_rarity').setLabel('Order by Rarity').setStyle(sortBy === 'rarity' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sort_alpha').setLabel('Order Alphabetical').setStyle(sortBy === 'alpha' ? ButtonStyle.Success : ButtonStyle.Secondary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('col_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('col_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
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
        if (i.user.id !== userId) return i.reply({ content: 'Not your collection session!', ephemeral: true });

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
        await i.update({
          components: [updated.container, ...getColRows(currentPage, updated.totalPages)],
          flags: MessageFlags.IsComponentsV2
        });
      });
      return;
    }

    // +shop
    if (command === 'shop') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_spray').setLabel('Buy Spray (5 🎲)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('buy_clover').setLabel('Buy Clover (15 🎲)').setStyle(ButtonStyle.Success)
      );
      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n' +
            '🧴 **Spray (5 🎲):** Use this for Awesome Chibi boost [30 Uses]\n' +
            '🍀 **Clover (15 🎲):** Use this to duplicate Chibis while rolling [50 Uses]'
          )
        );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 30000 });
      collector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'Not your shop session!', ephemeral: true });
        if (i.customId === 'buy_spray') {
          if (user.dice < 5) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 5;
          user.inventory.items.spray += 30;
          updateUserRank(user);
          await saveUsers();
          await i.update({ content: `✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`, components: [], flags: MessageFlags.IsComponentsV2 });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 15;
          user.inventory.items.clover += 50;
          updateUserRank(user);
          await saveUsers();
          await i.update({ content: `✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover}`, components: [], flags: MessageFlags.IsComponentsV2 });
        }
      });
      return;
    }

    // +cstats
    if (command === 'cstats') {
      if (!user.inventory || !user.inventory.chibis || user.inventory.chibis.length === 0) {
        return message.reply('❌ You have no chibis in your inventory!');
      }

      const teamSlots = user.team || [null, null, null];
      const teamLines = teamSlots.map((chibiId, index) => {
        if (!chibiId) {
          return `**[${index + 1}]** *Empty Slot* (Use \`+equipteam [id] ${index + 1}\`)`;
        }
        const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
        if (!chibi) {
          return `**[${index + 1}]** *Chibi missing from inventory*`;
        }

        const statConfig = gameData.stats[chibi.rarity][chibi.isShiny ? 'shiny' : 'normal'];
        const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
        const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
        const defVal = statConfig.def + chibi.level * statConfig.defPer;

        const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
        const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
        const maxExp = baseExp + (chibi.level - 1) * perLvl;
        const shortId = (chibi.chibiId || chibi.id).slice(-6);

        return (
          `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity]} ${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''}\n` +
          `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
          `❤️ HP: \`${hpVal}\` | 🛡️ DEF: \`${defVal}\` | 🗡️ ATK: \`${atkVal}\`\n`
        );
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 📜 ${message.author.username}'s Team Card\n\n` +
            teamLines.join('\n') +
            '\n\n*Tip: Use +equipteam [id] [1-3] to assign chibis to your team slots!*'
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'rank') {
      updateUserRank(user);
      await saveUsers();
      return message.reply(`🏆 Your current rank icon: ${user.rank}`);
    }
    
    if (command === 'points') {
      updateUserRank(user);
      await saveUsers();
      return message.reply(`💰 Your current points balance is: **${user.points}** (Rank: ${user.rank})`);
    }

    // +ranks (Paginated leaderboard with Top 50 cap, season timer, compact box user footer, and no levels)
    if (command === 'ranks') {
      const allSortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => {
          updateUserRank(uData);
          return { uId, ...uData };
        })
        .sort((a, b) => b.points - a.points);

      const itemsPerPage = 50;
      let currentPage = 0;
      const totalPages = Math.max(1, Math.ceil(allSortedUsers.length / itemsPerPage));

      const timeRemainingMs = Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now());
      const seasonTimerStr = formatTimeRemaining(timeRemainingMs);
      const seasonNum = db.config.seasonNumber || 1;

      // Find user rank position globally
      const userGlobalIndex = allSortedUsers.findIndex(u => u.uId === userId);
      const userRankPos = userGlobalIndex !== -1 ? userGlobalIndex + 1 : 'Unranked';
      const userPointsDisplay = user.points || 0;
      const userRankIcon = user.rank || '<:unranked:1571314276071907519>';

      const getRanksPage = (page) => {
        const start = page * itemsPerPage;
        const pageUsers = allSortedUsers.slice(start, start + itemsPerPage);
        return pageUsers
          .map((u, idx) => `**${start + idx + 1}.** <@${u.uId}> — Rank: ${u.rank} | Points: **${u.points.toLocaleString()}**`)
          .join('\n') || 'No players on the leaderboard yet.';
      };

      const getRanksRow = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rank_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('rank_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
      };

      const renderRanksContainer = (page) => {
        return new ContainerBuilder()
          .setAccentColor(0xf1c40f)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🏆 Chibi Global Leaderboard Season ${seasonNum}\n` +
              `End Season: **${seasonTimerStr}**\n\n` +
              `**(Page ${page + 1}/${totalPages})**\n\n` +
              getRanksPage(page) +
              `\n\n\`-----------------------------------\`\n` +
              `👤 \`Your Rank: #${userRankPos}\` | Rank: ${userRankIcon} | \`Points: ${userPointsDisplay.toLocaleString()}\``
            )
          );
      };

      const ranksMsg = await message.reply({
        components: [renderRanksContainer(currentPage), getRanksRow(currentPage)],
        flags: MessageFlags.IsComponentsV2
      });

      const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
      ranksCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'Not your leaderboard session!', ephemeral: true });

        if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;

        await i.update({
          components: [renderRanksContainer(currentPage), getRanksRow(currentPage)],
          flags: MessageFlags.IsComponentsV2
        });
      });
      return;
    }

    // +equipteam
    if (command === 'equipteam') {
      const chibiIdArg = args[0];
      const slot = parseInt(args[1]);
      if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply('❌ Usage: `+equipteam [chibi_id or short id] [slot 1-3]`\nExample: `+equipteam a1b2c3 1`');
      }

      const chibi = user.inventory.chibis.find(c => {
        const uId = c.chibiId || c.id;
        return uId === chibiIdArg || uId.endsWith(chibiIdArg);
      });

      if (!chibi) return message.reply('❌ Chibi ID not found in your inventory! Check `+inventory` for correct IDs.');

      const chibiUniqueId = chibi.chibiId || chibi.id;
      const wasEmpty = !user.team[slot - 1];
      user.team[slot - 1] = chibiUniqueId;
      if (slot === 1) user.equippedChibi = chibiUniqueId;

      let expMsg = '';
      if (wasEmpty) {
        const awardedExp = addExpAndLevelUp(user, chibi, 250);
        expMsg = `\n✨ Team slot bonus: **+${awardedExp} EXP** awarded to you and **${chibi.name}**!`;
      }
      updateUserRank(user);
      await saveUsers();

      return message.reply(`✅ Successfully equipped ${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''} to Team Slot ${slot}!${expMsg}`);
    }

    // +battle
    if (command === 'battle') {
      const opponent = message.mentions.users.first();
      if (!opponent || opponent.bot || opponent.id === userId) {
        return message.reply('❌ Usage: `+battle [@user]` (You cannot battle yourself or a bot)');
      }
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel('Accept Clash').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const battleMsg = await message.reply({
        content: `⚔️ <@${opponent.id}>, you have been challenged to a 3v3 Chibi Team Clash by <@${userId}>!`,
        components: [row]
      });

      const collector = battleMsg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: 'This battle challenge is not for you!', ephemeral: true });
        
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

          const getTeamPower = (team) => {
            return team.reduce((acc, c) => acc + calculateChibiCombatPower(c), 50);
          };

          const p1Power = getTeamPower(p1Team) * (0.85 + Math.random() * 0.3);
          const p2Power = getTeamPower(p2Team) * (0.85 + Math.random() * 0.3);

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

          const totalExpWon = addExpAndLevelUp(winUser, winTeam.find(Boolean), 400);

          updateUserRank(p1User);
          updateUserRank(p2User);
          await saveUsers();

          const renderTeamLines = (team) => {
            return team.map((c, idx) => {
              if (!c) return `**[${idx + 1}]** *Empty Slot*`;
              const rIcon = rarityIconsMap[c.rarity] || '📦';
              const sIcon = c.isShiny ? SHINY_ICON : '';
              const statCfg = gameData.stats[c.rarity][c.isShiny ? 'shiny' : 'normal'];
              const hp = statCfg.hp + c.level * statCfg.hpPer;
              return `**[${idx + 1}]** ${rIcon} ${c.emoji} **${c.name}** ${sIcon} (Lvl ${c.level}) — ❤️ HP: \`${hp}\``;
            }).join('\n');
          };

          const container = new ContainerBuilder()
            .setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# ⚔️ 3v3 Chibi Arena Clash Result\n\n` +
                `🏆 **Winner:** <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n` +
                `🛡️ **${message.author.username}'s Team Lineup:**\n${renderTeamLines(p1Team)}\n\n` +
                `🛡️ **${opponent.username}'s Team Lineup:**\n${renderTeamLines(p2Team)}\n\n` +
                `📊 **Match Rewards:** ✨ Victor earned **+${winReward.win} Points** & **+${totalExpWon} EXP**! 💔 Loser lost **-${losePenalty.lose} Points**.`
              )
            );

          await i.update({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
          await i.update({ content: `❌ <@${opponent.id}> declined the 3v3 arena clash.`, components: [] });
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
          new TextDisplayBuilder().setContent(`# ${data.title}\n*(r/${data.subreddit})*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +trivia
    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(`🧩 **Trivia Challenge:**\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`);

      const filter = m => m.author.id === userId;
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

      collector.on('collect', async m => {
        if (m.content.toLowerCase().includes(selected.a)) {
          user.points += 50;
          const awardedExp = addExpAndLevelUp(user, null, 100);
          updateUserRank(user);
          await saveUsers();
          m.reply(`🎉 Correct! You earned **+50 Points** and **+${awardedExp} EXP**!`);
        } else {
          m.reply(`❌ Incorrect! The correct answer was **${selected.a}**.`);
        }
      });
      return;
    }

    // +profile (Reworked with icon-only best roll/rank, odds display beside chibi, separated rank/points fields, and box framing without dividers or avatar button)
    if (command === 'profile') {
      updateUserRank(user);

      if (user.inventory && user.inventory.chibis && user.inventory.chibis.length > 0) {
        let highestChibi = null;
        let highestTier = 0;
        let highestVal = 0;

        for (const c of user.inventory.chibis) {
          const tier = RARITY_HIERARCHY[c.rarity] || 1;
          const template = gameData.chibis.find(t => t.name === c.name && t.rarity === c.rarity);
          const oddsStr = template ? (c.isShiny ? template.shinyOdds : template.odds) : '1 in 1';
          const val = parseOddsNumber(oddsStr);

          if (tier > highestTier || (tier === highestTier && val > highestVal)) {
            highestTier = tier;
            highestVal = val;
            highestChibi = { chibi: c, oddsStr };
          }
        }

        if (highestChibi && (highestTier > (user.bestRollTier || 0) || (highestTier === (user.bestRollTier || 0) && highestVal > (user.bestRollVal || 0)))) {
          user.bestRollTier = highestTier;
          user.bestRollVal = highestVal;
          user.bestRoll = highestChibi.oddsStr;
          user.bestChibi = `${rarityIconsMap[highestChibi.chibi.rarity]} ${highestChibi.chibi.emoji} ${highestChibi.chibi.isShiny ? SHINY_ICON : ''}`;
          await saveUsers();
        }
      }

      const userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;

      // Calculate global leaderboard position
      const allSortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => ({ uId, points: uData.points || 0 }))
        .sort((a, b) => b.points - a.points);
      const globalIndex = allSortedUsers.findIndex(u => u.uId === userId);
      const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';

      // Format best roll icon display with odds beside it
      const bestRollIconPart = user.bestChibi ? user.bestChibi : 'None';
      const bestRollOddsPart = user.bestRoll && user.bestRoll !== 'None' ? `\`(${user.bestRoll})\`` : '';

      const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# ${message.author.username}\n\n` +
            `📊 \`Level ${user.userLevel} (${user.userExp}/${userMaxExp} EXP)\`\n` +
            `🎲 ${bestRollIconPart} ${bestRollOddsPart}\n` +
            `⚜️ ${user.rank}\n` +
            `🏆 \`${user.points.toLocaleString()} Points\`\n` +
            `🌍 \`Rank ${leaderboardPos}\`\n` +
            `🔰 \`Clan: ${user.clan || 'None'}\``
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'clanlist') {
      const clanNames = Object.keys(db.clans);
      const clanListText =
        clanNames.map(c => `• **${c}** (Leader: <@${db.clans[c].leader}>, Members: ${db.clans[c].members.length})`).join('\n') ||
        'No clans available.';
      const container = new ContainerBuilder()
        .setAccentColor(0x34495e)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏛️ Available Clans\n\n${clanListText}`));
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +ccreateclan (Requires 100 Dice fee)
    if (command === 'ccreateclan') {
      const clanName = args.join(' ');
      if (!clanName) return message.reply('❌ Please specify a clan name. Usage: `+ccreateclan [ClanName]`');
      if (db.clans[clanName]) return message.reply('❌ A clan with this name already exists!');

      const clanCreationCost = 100;
      if (user.dice < clanCreationCost) {
        return message.reply(`❌ You do not have enough dice to create a clan! You need **${clanCreationCost} 🎲 Dice**, but you only have **${user.dice} 🎲**.`);
      }

      user.dice -= clanCreationCost;
      db.clans[clanName] = { name: clanName, leader: userId, viceLeader: null, members: [userId] };
      user.clan = clanName;
      updateUserRank(user);
      await saveUsers();

      return message.reply(`✅ Successfully created and joined clan **${clanName}** for **${clanCreationCost} 🎲 Dice**! (Remaining: ${user.dice} 🎲)`);
    }

    if (command === 'cclanjoin') {
      const clanName = args.join(' ');
      if (!db.clans[clanName]) return message.reply('❌ Clan does not exist!');
      if (db.clans[clanName].members.includes(userId)) return message.reply('⚠️ You are already in this clan!');
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      await saveUsers();
      return message.reply(`✅ Successfully joined clan **${clanName}**!`);
    }

    if (command === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return message.reply('❌ You are not in a clan!');
      const clan = db.clans[user.clan];
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);

      const memberLines = await Promise.all(
        clan.members.map(async (mId, idx) => {
          const mUser = db.users[mId];
          if (mUser) updateUserRank(mUser);
          const role = mId === clan.leader ? 'Leader' : mId === clan.viceLeader ? 'Vice-Leader' : 'Member';
          return `${idx + 1}. <@${mId}> ${role} ${mUser?.rank || '<:unranked:1571314276071907519>'} ${mUser?.points || 0} ${mUser?.bestRoll || 'None'}`;
        })
      );

      const container = new ContainerBuilder()
        .setAccentColor(0x1abc9c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🔰 Clan Information: ${clan.name}\n` +
            `**Leader:** <@${clan.leader}>\n` +
            `**Total Points:** ${totalPoints}\n\n` +
            `**Members:**\n${memberLines.join('\n')}`
          )
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // +trade
    if (command === 'trade') {
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === userId) return message.reply('❌ Usage: `+trade [@user]`');
      ensureUser(target.id);

      const targetUser = db.users[target.id];
      updateUserRank(user);
      updateUserRank(targetUser);

      const acceptRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_trade_req').setLabel('Accept Trade').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_trade_req').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const reqMsg = await message.reply({
        content: `🤝 <@${target.id}>, you have been invited to trade by <@${userId}>!`,
        components: [acceptRow]
      });

      const reqCollector = reqMsg.createMessageComponentCollector({ time: 60000 });

      reqCollector.on('collect', async i => {
        if (i.user.id !== target.id) return i.reply({ content: 'This trade invitation is not for you!', ephemeral: true });

        if (i.customId === 'cancel_trade_req') {
          reqCollector.stop();
          return i.update({ content: `❌ Trade invitation declined by <@${target.id}>.`, components: [] });
        }

        if (i.customId === 'accept_trade_req') {
          reqCollector.stop();

          let p1OfferType = null;
          let p1OfferData = null;
          let p2OfferType = null;
          let p2OfferData = null;

          const renderTradeUI = () => {
            const p1Display = p1OfferData 
              ? (p1OfferType === 'chibi' ? `${p1OfferData.emoji} **${p1OfferData.name}** \`[${(p1OfferData.chibiId || p1OfferData.id).slice(-6)}]\`` : `**${p1OfferData}x 🎲 Dice**`)
              : '*No offer yet*';

            const p2Display = p2OfferData 
              ? (p2OfferType === 'chibi' ? `${p2OfferData.emoji} **${p2OfferData.name}** \`[${(p2OfferData.chibiId || p2OfferData.id).slice(-6)}]\`` : `**${p2OfferData}x 🎲 Dice**`)
              : '*No offer yet*';

            return new ContainerBuilder()
              .setAccentColor(0xf1c40f)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `# 🤝 Secure Trade Session\n\n` +
                  `<@${userId}> ${user.rank}\n` +
                  `|------------|\n` +
                  `${p1Display}\n` +
                  `|------------|\n` +
                  `${p2Display}\n` +
                  `|------------|\n` +
                  `<@${target.id}> ${targetUser.rank}`
                )
              );
          };

          const actionRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('p1_offer').setLabel(`${message.author.username}'s Offer`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('p2_offer').setLabel(`${target.username}'s Offer`).setStyle(ButtonStyle.Success)
          );

          const actionRow2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_trade').setLabel('Confirm & Complete').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('cancel_session').setLabel('Cancel Trade').setStyle(ButtonStyle.Danger)
          );

          await i.update({
            content: `🤝 **Trade Session Active!** Both players, submit your offers below:`,
            components: [renderTradeUI(), actionRow1, actionRow2],
            flags: MessageFlags.IsComponentsV2
          });

          const sessionCollector = reqMsg.createMessageComponentCollector({ time: 300000 });

          sessionCollector.on('collect', async si => {
            if (si.customId === 'cancel_session') {
              if (si.user.id !== userId && si.user.id !== target.id) {
                return si.reply({ content: 'You are not part of this trade session!', ephemeral: true });
              }
              sessionCollector.stop();
              return si.update({ content: `❌ Trade session was cancelled by <@${si.user.id}>.`, components: [], flags: MessageFlags.IsComponentsV2 });
            }

            if (si.customId === 'p1_offer' || si.customId === 'p2_offer') {
              const activeId = si.customId === 'p1_offer' ? userId : target.id;
              if (si.user.id !== activeId) {
                return si.reply({ content: `That is not your offer button!`, ephemeral: true });
              }

              const typeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('choose_chibi').setLabel('Trade Chibi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('choose_dice').setLabel('Trade Dice 🎲').setStyle(ButtonStyle.Success)
              );

              await si.reply({ content: `What would you like to offer?`, components: [typeRow], ephemeral: true });

              const typeInteraction = await si.channel.awaitMessageComponent({
                filter: int => int.user.id === activeId,
                time: 30000
              }).catch(() => null);

              if (!typeInteraction) return;

              if (typeInteraction.customId === 'choose_dice') {
                await typeInteraction.update({ content: `🎲 Type the amount of Dice you wish to offer in chat (e.g. \`50\`):`, components: [] });
                
                const chatFilter = m => m.author.id === activeId;
                const collectedMessages = await si.channel.awaitMessages({ filter: chatFilter, max: 1, time: 30000 }).catch(() => null);

                const collected = collectedMessages?.first();
                if (!collected) {
                  return si.followUp({ content: '⏳ Dice offer timed out. Please try again.', ephemeral: true });
                }

                const amt = parseInt(collected.content);
                const activeUserObj = db.users[activeId];

                if (isNaN(amt) || amt <= 0 || activeUserObj.dice < amt) {
                  await collected.delete().catch(() => {});
                  return si.followUp({ content: `❌ Invalid amount or insufficient dice! You have ${activeUserObj.dice} 🎲.`, ephemeral: true });
                }

                if (activeId === userId) {
                  p1OfferType = 'dice';
                  p1OfferData = amt;
                } else {
                  p2OfferType = 'dice';
                  p2OfferData = amt;
                }

                await collected.delete().catch(() => {});
                await reqMsg.edit({ components: [renderTradeUI(), actionRow1, actionRow2], flags: MessageFlags.IsComponentsV2 });

              } else if (typeInteraction.customId === 'choose_chibi') {
                const activeUserObj = db.users[activeId];
                if (!activeUserObj.inventory.chibis || activeUserObj.inventory.chibis.length === 0) {
                  return typeInteraction.update({ content: '❌ You have no chibis to trade!', components: [] });
                }

                const options = activeUserObj.inventory.chibis.slice(0, 25).map(c => {
                  const uId = c.chibiId || c.id;
                  return {
                    label: `${c.name} (${c.rarity}) Lv.${c.level} ${c.isShiny ? '✨' : ''}`,
                    description: `ID: ${uId.slice(-6)}`,
                    value: uId
                  };
                });

                const menu = new StringSelectMenuBuilder()
                  .setCustomId('select_chibi_trade')
                  .setPlaceholder('Select a Chibi to offer')
                  .addOptions(options);

                const menuRow = new ActionRowBuilder().addComponents(menu);
                await typeInteraction.update({ content: 'Select your chibi offer:', components: [menuRow] });

                const menuInteraction = await typeInteraction.channel.awaitMessageComponent({
                  filter: int => int.user.id === activeId && int.isStringSelectMenu(),
                  time: 30000
                }).catch(() => null);

                if (!menuInteraction) return;

                const chosenId = menuInteraction.values[0];
                const chibiObj = activeUserObj.inventory.chibis.find(c => (c.chibiId || c.id) === chosenId);

                if (activeId === userId) {
                  p1OfferType = 'chibi';
                  p1OfferData = chibiObj;
                } else {
                  p2OfferType = 'chibi';
                  p2OfferData = chibiObj;
                }

                await menuInteraction.update({ content: `✅ Chibi offer registered: **${chibiObj.name}**`, components: [] });
                await reqMsg.edit({ components: [renderTradeUI(), actionRow1, actionRow2], flags: MessageFlags.IsComponentsV2 });
              }

            } else if (si.customId === 'confirm_trade') {
              if (si.user.id !== userId && si.user.id !== target.id) {
                return si.reply({ content: 'You are not part of this trade session!', ephemeral: true });
              }

              if (!p1OfferData || !p2OfferData) {
                return si.reply({ content: '❌ Both players must submit an offer before confirming!', ephemeral: true });
              }

              const p1Obj = db.users[userId];
              const p2Obj = db.users[target.id];

              if (p1OfferType === 'dice') {
                if (p1Obj.dice < p1OfferData) return si.reply({ content: '❌ Player 1 no longer has enough dice!', ephemeral: true });
                p1Obj.dice -= p1OfferData;
                p2Obj.dice += p1OfferData;
              } else {
                const idx = p1Obj.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p1OfferData.chibiId || p1OfferData.id));
                if (idx === -1) return si.reply({ content: '❌ Player 1 no longer has the offered chibi!', ephemeral: true });
                const [transferred] = p1Obj.inventory.chibis.splice(idx, 1);
                p2Obj.inventory.chibis.push(transferred);
              }

              if (p2OfferType === 'dice') {
                if (p2Obj.dice < p2OfferData) return si.reply({ content: '❌ Player 2 no longer has enough dice!', ephemeral: true });
                p2Obj.dice -= p2OfferData;
                p1Obj.dice += p2OfferData;
              } else {
                const idx = p2Obj.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p2OfferData.chibiId || p2OfferData.id));
                if (idx === -1) return si.reply({ content: '❌ Player 2 no longer has the offered chibi!', ephemeral: true });
                const [transferred] = p2Obj.inventory.chibis.splice(idx, 1);
                p1Obj.inventory.chibis.push(transferred);
              }

              updateUserRank(p1Obj);
              updateUserRank(p2Obj);
              await saveUsers();
              sessionCollector.stop();

              return si.update({
                content: `✅ **Trade Successfully Completed Between <@${userId}> and <@${target.id}>!**`,
                components: [renderTradeUI()],
                flags: MessageFlags.IsComponentsV2
              });
            }
          });
        }
      });
      return;
    }

    // Admin Commands
    if (command.startsWith('admin')) {
      const ownerId = db.config.ownerId || userId;
      if (userId !== ownerId && !user.permissions) {
        return message.reply('❌ You do not have permission to use admin commands!');
      }

      if (command === 'adminluckevent') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply('❌ Usage: `+adminluckevent [multiplier] [duration]` (e.g. `+adminluckevent 2.0 30m`)');
        }

        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        await saveUsers();

        return message.reply(`⚡ **Global Luck Event Activated!** Multiplier set to **${mult}x** for **${durationStr}**!`);
      }

      if (command === 'adminsetxp') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply('❌ Usage: `+adminsetxp [multiplier] [duration]` (e.g. `+adminsetxp 1.5 1h`)');
        }

        db.config.globalXpMultiplier = mult;
        db.config.xpEventExpires = Date.now() + durationMs;
        await saveUsers();

        return message.reply(`✨ **Global XP Event Activated!** Multiplier set to **${mult}x** for **${durationStr}**!`);
      }

      if (command === 'admingiveitem') {
        const target = message.mentions.users.first();
        const itemType = args[1]?.toLowerCase();
        const quantity = parseInt(args[2]);

        if (!target || !['dice', 'spray', 'clover'].includes(itemType) || isNaN(quantity)) {
          return message.reply('❌ Usage: `+admingiveitem [@user] [dice|spray|clover] [quantity]`');
        }
        ensureUser(target.id);

        if (itemType === 'dice') db.users[target.id].dice += quantity;
        else if (itemType === 'spray') db.users[target.id].inventory.items.spray += quantity;
        else if (itemType === 'clover') db.users[target.id].inventory.items.clover += quantity;
        
        updateUserRank(db.users[target.id]);
        await saveUsers();

        return message.reply(`🎁 Admin granted **${quantity}x** ${itemType} to <@${target.id}>.`);
      }

      if (command === 'adminsetrank') {
        const target = message.mentions.users.first();
        const newRank = args.slice(1).join(' ');
        if (!target || !newRank) return message.reply('❌ Usage: `+adminsetrank [@user] [rank title]`');
        ensureUser(target.id);
        db.users[target.id].rank = newRank;
        await saveUsers();
        return message.reply(`🛡️ Admin updated rank icon for <@${target.id}>.`);
      }

      if (command === 'adminsetpoints') {
        const target = message.mentions.users.first();
        const pts = parseInt(args[1]);
        if (!target || isNaN(pts)) return message.reply('❌ Usage: `+adminsetpoints [@user] [points]`');
        ensureUser(target.id);
        db.users[target.id].points = pts;
        updateUserRank(db.users[target.id]);
        await saveUsers();
        return message.reply(`🛡️ Admin set points for <@${target.id}> to **${pts}** (Rank icon auto-updated).`);
      }

      if (command === 'admingivepermission') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Usage: `+admingivepermission [@user]`');
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        await saveUsers();
        return message.reply(`🛡️ Admin permissions granted to <@${target.id}>.`);
      }

      if (command === 'adminsetlevel') {
        const target = message.mentions.users.first();
        const lvl = parseInt(args[1]);
        if (!target || isNaN(lvl) || lvl < 1) {
          return message.reply('❌ Usage: `+adminsetlevel [@user] [level]` (e.g. `+adminsetlevel @User 15`)');
        }
        ensureUser(target.id);
        db.users[target.id].userLevel = lvl;
        db.users[target.id].userExp = 0;
        await saveUsers();
        return message.reply(`🛡️ Admin set user level for <@${target.id}> to **Level ${lvl}**.`);
      }

      if (command === 'adminresetranks') {
        db.config.seasonNumber = (db.config.seasonNumber || 1) + 1;
        db.config.seasonExpires = Date.now() + (30 * 24 * 60 * 60 * 1000);

        for (const uId of Object.keys(db.users)) {
          db.users[uId].points = 0;
          updateUserRank(db.users[uId]);
        }
        await saveUsers();
        return message.reply(`🛡️ **Season Reset Successful!** All player points and ranks have been reset. Welcome to **Season ${db.config.seasonNumber}**! ⚔️`);
      }

      if (command === 'adminsetlbtime') {
        const durationStr = args[0];
        const durationMs = parseDurationToMs(durationStr);
        if (!durationMs) {
          return message.reply('❌ Usage: `+adminsetlbtime [duration]` (e.g. `+adminsetlbtime 30d` or `+adminsetlbtime 2w`)');
        }

        db.config.seasonExpires = Date.now() + durationMs;
        await saveUsers();
        return message.reply(`🛡️ Leaderboard season end timer successfully updated to expire in **${durationStr}**!`);
      }
    }
  } catch (err) {
    console.error(err);
    message.reply('❌ An error occurred while executing this command.');
  }
});

// Initialize Database connection then start bot
initDatabase().then(() => {
  client.login(process.env.DISCORD_TOKEN);
});