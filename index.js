const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');

function loadGameData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error('data.json is missing! Please make sure your data.json is in the root directory.');
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify({
        users: {},
        clans: {},
        config: {
          ownerId: '',
          globalLuckMultiplier: 1.0,
          luckEventExpires: 0,
          globalXpMultiplier: 1.0,
          xpEventExpires: 0
        }
      }, null, 2)
    );
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

const gameData = loadGameData();
let db = loadUsers();

const SHINY_ICON = '<:shiny:1571311476239630517>';

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      started: false,
      dice: 10,
      points: 0,
      rank: 'Novice',
      clan: null,
      inventory: { chibis: [], items: { spray: 0, clover: 0 } },
      team: [null, null, null],
      equippedChibi: null,
      bestRoll: 'None',
      bestRollVal: 0,
      bestChibi: null,
      userLevel: 1,
      userExp: 0,
      lastDrop: 0,
      lastDaily: 0,
      streak: 0,
      permissions: false
    };
    saveUsers(db);
  }
}

function getRarityIconMap() {
  const map = {};
  gameData.rarities.forEach(r => {
    map[r.key] = r.emoji;
  });
  return map;
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
  const numPart = parseFloat(oddsString.replace(/[^0-9.]/g, '')) || 1;
  if (oddsString.includes('T')) return numPart * 1_000_000_000_000;
  if (oddsString.includes('B')) return numPart * 1_000_000_000;
  if (oddsString.includes('M')) return numPart * 1_000_000;
  if (oddsString.includes('K')) return numPart * 1_000;
  return numPart;
}

// 100+ Trivia Questions Bank
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
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);
  
  const updateStatus = () => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`+help | Serving ${serverCount} servers`, { type: 0 });
  };
  updateStatus();
  setInterval(updateStatus, 60000);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('+')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;

  ensureUser(userId);
  const user = db.users[userId];
  const rarityIconsMap = getRarityIconMap();

  try {
    const now = Date.now();
    if (db.config.luckEventExpires && now > db.config.luckEventExpires) {
      db.config.globalLuckMultiplier = 1.0;
      db.config.luckEventExpires = 0;
      saveUsers(db);
    }
    if (db.config.xpEventExpires && now > db.config.xpEventExpires) {
      db.config.globalXpMultiplier = 1.0;
      db.config.xpEventExpires = 0;
      saveUsers(db);
    }

    if (command === 'start') {
      if (user.started) return message.reply('⚠️ You have already started your Chibi RPG journey!');
      user.started = true;
      user.dice += 20;
      if (!db.config.ownerId) db.config.ownerId = userId;
      saveUsers(db);
      return message.reply('🎉 Welcome to Chibi RPG RNG! You have been awarded **20x Dice** 🎲 and your profile is initialized.');
    }

    if (!user.started && command !== 'help' && command !== 'status') {
      return message.reply('❌ You must type `+start` before using any bot commands!');
    }

    // +help
    if (command === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🌸 Chibi RPG RNG - Help Center')
        .setColor('#ff77aa')
        .setDescription('Explore the categories below to navigate your adventure:')
        .addFields(
          { name: '🎲 Rolling & Drops', value: '`+roll [qty] [boost]` - Roll Chibis\n`+drop` - Claim free dice every 10s\n`+shop` - Buy Spray & Clover boosts' },
          { name: '🎁 Rewards & Economy', value: '`+daily` - Claim daily streak rewards\n`+points` - Check points\n`+rank` / `+ranks` - View ranks & leaderboards' },
          { name: '⚔️ RPG & Battling', value: '`+stats` - Check equipped chibi stats\n`+equipteam [id] [slot]` - Manage team & gain EXP\n`+battle [@user]` - Challenge players' },
          { name: '🎒 Inventory & Profile', value: '`+inventory`, `+collections`\n`+profile`, `+status` - Bot info & ping\n`+trade [@user]` - Trade chibis' },
          { name: '🏛️ Clans & Fun', value: '`+clanlist`, `+cclanjoin`, `+cclaninfo`, `+ccreateclan`\n`+meme`, `+trivia`' }
        )
        .setFooter({ text: `Playing +help • Serving ${client.guilds.cache.size} Servers` });
      return message.reply({ embeds: [embed] });
    }

    // +status (Bot Ping, Status, Language Details)
    if (command === 'status') {
      const ping = client.ws.ping;
      const uptimeSec = Math.floor(client.uptime / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;

      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot System Status & Info')
        .setColor('#3498db')
        .addFields(
          { name: '📶 Latency / Ping', value: `${ping}ms`, inline: true },
          { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
          { name: '🌐 Connected Servers', value: `${client.guilds.cache.size} Servers`, inline: true },
          { name: '💻 Programming Language', value: 'Node.js (JavaScript - Discord.js v14)', inline: true },
          { name: '⚙️ Status', value: '🟢 Online & Operational', inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.username}` });
      return message.reply({ embeds: [embed] });
    }

    // +daily (Streak rewards: 5 streak = 5x dice, 50 = 10x, 100 = 20x, non-stackable)
    if (command === 'daily') {
      const nowTime = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (nowTime - user.lastDaily < twentyFourHours) {
        const remainingTime = Math.ceil((twentyFourHours - (nowTime - user.lastDaily)) / 1000 / 60);
        return message.reply(`⏳ You have already claimed your daily reward! Please wait another **${remainingTime} minutes**.`);
      }

      // Check streak (if more than 48 hours passed, reset streak, else increment)
      const fortyEightHours = 48 * 60 * 60 * 1000;
      if (user.lastDaily && nowTime - user.lastDaily > fortyEightHours) {
        user.streak = 1;
      } else {
        user.streak = (user.streak || 0) + 1;
      }

      user.lastDaily = nowTime;

      // Milestone rewards (non-stackable)
      let rewardDice = 0;
      if (user.streak >= 100) rewardDice = 20;
      else if (user.streak >= 50) rewardDice = 10;
      else if (user.streak >= 5) rewardDice = 5;

      user.dice += rewardDice;
      saveUsers(db);

      return message.reply(`🎁 **Daily Reward Claimed!**\n🔥 Streak: **${user.streak} Days**\n🎲 Reward: **+${rewardDice}x Dice** (Total: ${user.dice} 🎲)`);
    }

    // +roll (Nerfed chances: SRR 0.01%, UTR 0.001%, Shiny 0.0010%)
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
      const equippedChibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);

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
        // Nerfed Shiny chance: 0.0010% base (1 in 100,000)
        let shinyVal = 100000;
        shinyVal = Math.max(1, Math.round(shinyVal / activeLuckMultiplier));
        const isShiny = Math.random() * shinyVal < 1;

        const pushChibi = () => {
          user.inventory.chibis.push({
            id: Math.random().toString(36).substring(2, 9),
            name: chibiTemplate.name,
            rarity: chibiTemplate.rarity,
            emoji: chibiTemplate.emoji,
            isShiny,
            level: 1,
            exp: 0,
            date: new Date().toLocaleDateString()
          });
        };

        pushChibi();
        resultsSummary.push({ chibi: chibiTemplate, isShiny });

        if (boost === 'clover' && Math.random() < 0.5) {
          pushChibi();
          resultsSummary.push({ chibi: chibiTemplate, isShiny, duplicated: true });
        }

        const baseExpRoll = isShiny ? Math.floor(Math.random() * 251) + 50 : Math.floor(Math.random() * 141) + 10;
        totalExpGained += addExpAndLevelUp(user, equippedChibi, baseExpRoll);

        const currentRollVal = isShiny ? shinyVal : normalVal;
        if (currentRollVal > user.bestRollVal) {
          user.bestRollVal = currentRollVal;
          user.bestRoll = chibiTemplate.shinyOdds;
          user.bestChibi = `${rarityIconsMap[chibiTemplate.rarity]} ${chibiTemplate.emoji} ${chibiTemplate.name} ${isShiny ? SHINY_ICON : ''}`;
        }
      }

      saveUsers(db);

      const luckNotice = activeLuckMultiplier > 1.0 ? `\n⚡ *Active Luck Boost: ${activeLuckMultiplier}x*` : '';
      const embed = new EmbedBuilder()
        .setTitle('🎲 Chibi Roll Results')
        .setColor('#57f287')
        .setDescription(
          resultsSummary
            .map(
              r =>
                `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${
                  r.duplicated ? '(🍀 Duplicated!)' : ''
                }`
            )
            .join('\n') + `\n✨ Gained **+${totalExpGained} EXP**!` + luckNotice
        )
        .setFooter({ text: `Remaining Dice: ${user.dice} 🎲` });

      return message.reply({ embeds: [embed] });
    }

    // +drop
    if (command === 'drop') {
      const dropNow = Date.now();
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      if (dropNow - user.lastDrop < cooldownMs) {
        const timeLeft = Math.ceil((cooldownMs - (dropNow - user.lastDrop)) / 1000);
        return message.reply(`⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`);
      }
      user.lastDrop = dropNow;

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
      saveUsers(db);

      return message.reply(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** 🎲! Total dice: ${user.dice}`);
    }

    // +inventory
    if (command === 'inventory') {
      const chibiList =
        user.inventory.chibis
          .map(
            (c, i) =>
              `${i + 1}. \`[${c.id}]\` ${rarityIconsMap[c.rarity]} ${c.emoji} **${c.name}** ${c.isShiny ? SHINY_ICON : ''} - Lv.${c.level}`
          )
          .slice(0, 15)
          .join('\n') || 'No chibis collected yet.';

      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${message.author.username}'s Inventory`)
        .setColor('#3498db')
        .addFields(
          { name: '🎲 Dice', value: `${user.dice} 🎲`, inline: true },
          { name: '🧴 Spray', value: `${user.inventory.items.spray} Uses`, inline: true },
          { name: '🍀 Clover', value: `${user.inventory.items.clover} Uses`, inline: true },
          { name: '✨ Chibis', value: chibiList }
        );
      return message.reply({ embeds: [embed] });
    }

    // +shop
    if (command === 'shop') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_spray').setLabel('Buy Spray (5 🎲)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('buy_clover').setLabel('Buy Clover (15 🎲)').setStyle(ButtonStyle.Success)
      );
      const embed = new EmbedBuilder()
        .setTitle('🛒 Chibi Shop')
        .setColor('#f1c40f')
        .setDescription('Boost your rolling potential with shop items!')
        .addFields(
          { name: '🧴 Spray (5 🎲)', value: 'Use this for Awesome Chibi boost [30 Uses]' },
          { name: '🍀 Clover (15 🎲)', value: 'Use this to duplicate Chibis while rolling [50 Uses]' }
        );
      const shopMsg = await message.reply({ embeds: [embed], components: [row] });

      const collector = shopMsg.createMessageComponentCollector({ time: 30000 });
      collector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'Not your shop session!', ephemeral: true });
        if (i.customId === 'buy_spray') {
          if (user.dice < 5) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 5;
          user.inventory.items.spray += 30;
          saveUsers(db);
          await i.update({ content: `✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`, components: [] });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 15;
          user.inventory.items.clover += 50;
          saveUsers(db);
          await i.update({ content: `✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover}`, components: [] });
        }
      });
      return;
    }

    // +collections (Clean format without "-" & "()", with quantity, and order buttons)
    if (command === 'collections') {
      const getFormattedCollection = (sortBy = 'rarity') => {
        const grouped = {};
        user.inventory.chibis.forEach(c => {
          const key = `${c.rarity}_${c.name}_${c.isShiny ? 'shiny' : 'normal'}`;
          if (!grouped[key]) {
            grouped[key] = {
              rarity: c.rarity,
              emoji: c.emoji,
              name: c.name,
              isShiny: c.isShiny,
              date: c.date,
              count: 0
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

        return entries
          .map(e => `${e.count}x ${rarityIconsMap[e.rarity]} ${e.emoji} ${e.name} ${e.isShiny ? SHINY_ICON : ''} ${e.date}`)
          .join('\n') || 'Your collection is empty.';
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sort_rarity').setLabel('Order by Rarity').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sort_alpha').setLabel('Order Alphabetical').setStyle(ButtonStyle.Secondary)
      );

      const embed = new EmbedBuilder()
        .setTitle(`📖 ${message.author.username}'s Chibi Collection`)
        .setColor('#9b59b6')
        .setDescription(getFormattedCollection('rarity'));

      const colMsg = await message.reply({ embeds: [embed], components: [row] });
      const collector = colMsg.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'Not your collection session!', ephemeral: true });
        const sortType = i.customId === 'sort_alpha' ? 'alpha' : 'rarity';
        const updatedDesc = getFormattedCollection(sortType);
        const newEmbed = EmbedBuilder.from(embed).setDescription(updatedDesc.length > 4000 ? updatedDesc.substring(0, 3996) + '...' : updatedDesc);
        await i.update({ embeds: [newEmbed], components: [row] });
      });
      return;
    }

    // +stats
    if (command === 'stats') {
      if (!user.equippedChibi) return message.reply('❌ You do not have a chibi equipped! Use `+equipteam` first.');
      const chibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);
      if (!chibi) return message.reply('❌ Equipped chibi not found in inventory.');

      const statConfig = gameData.stats[chibi.rarity][chibi.isShiny ? 'shiny' : 'normal'];
      const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
      const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
      const maxExp = baseExp + (chibi.level - 1) * perLvl;

      const embed = new EmbedBuilder()
        .setTitle(`${rarityIconsMap[chibi.rarity]} ${chibi.emoji} ${chibi.name} ${chibi.isShiny ? SHINY_ICON : ''} Stats`)
        .setColor('#e67e22')
        .addFields(
          { name: '❤️ HP', value: `${statConfig.hp + chibi.level * statConfig.hpPer}`, inline: true },
          { name: '🗡️ Attack', value: `${statConfig.atk + chibi.level * statConfig.atkPer}`, inline: true },
          { name: '🛡️ Defense', value: `${statConfig.def + chibi.level * statConfig.defPer}`, inline: true },
          { name: '📊 Level / EXP', value: `Level ${chibi.level} (${chibi.exp}/${maxExp} EXP)` }
        );
      return message.reply({ embeds: [embed] });
    }

    if (command === 'rank') return message.reply(`🏆 Your current rank is: **${user.rank}**`);
    if (command === 'points') return message.reply(`💰 Your current points balance is: **${user.points}**`);

    if (command === 'ranks') {
      const sortedUsers = Object.entries(db.users)
        .map(([uId, uData]) => ({ uId, ...uData }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);

      const leaderboardText =
        sortedUsers
          .map(
            (u, idx) =>
              `**${idx + 1}.** <@${u.uId}> — Rank: **${u.rank}** | Points: **${u.points.toLocaleString()}** | Level: ${u.userLevel}`
          )
          .join('\n') || 'No players on the leaderboard yet.';

      const embed = new EmbedBuilder()
        .setTitle('🏆 Global Ranks & Points Leaderboard')
        .setColor('#f1c40f')
        .setDescription(leaderboardText);
      return message.reply({ embeds: [embed] });
    }

    if (command === 'equipteam') {
      const chibiId = args[0];
      const slot = parseInt(args[1]);
      if (!chibiId || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply('❌ Usage: `+equipteam [chibi_id] [slot 1-3]`');
      }

      const chibi = user.inventory.chibis.find(c => c.id === chibiId);
      if (!chibi) return message.reply('❌ Chibi ID not found in your inventory.');

      const wasEmpty = !user.team[slot - 1];
      user.team[slot - 1] = chibi.id;
      user.equippedChibi = chibi.id;

      let expMsg = '';
      if (wasEmpty) {
        const awardedExp = addExpAndLevelUp(user, chibi, 250);
        expMsg = `\n✨ Team slot bonus: **+${awardedExp} EXP** awarded to you and **${chibi.name}**!`;
      }
      saveUsers(db);

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
        new ButtonBuilder().setCustomId('accept_battle').setLabel('Accept Battle').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const battleMsg = await message.reply({
        content: `<@${opponent.id}>, you have been challenged to a Chibi Battle by <@${userId}>!`,
        components: [row]
      });

      const collector = battleMsg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: 'This battle challenge is not for you!', ephemeral: true });
        if (i.customId === 'accept_battle') {
          const challengerChibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);
          const opponentUser = db.users[opponent.id];
          const opponentChibi = opponentUser.inventory.chibis.find(c => c.id === opponentUser.equippedChibi);

          const p1Power = calculateChibiCombatPower(challengerChibi) * (0.85 + Math.random() * 0.3);
          const p2Power = calculateChibiCombatPower(opponentChibi) * (0.85 + Math.random() * 0.3);

          const winner = p1Power >= p2Power ? message.author : opponent;
          const loser = winner.id === userId ? opponent : message.author;

          const winUser = db.users[winner.id];
          const winChibi = winUser.inventory.chibis.find(c => c.id === winUser.equippedChibi);
          const loseUser = db.users[loser.id];
          const loseChibi = loseUser.inventory.chibis.find(c => c.id === loseUser.equippedChibi);

          winUser.points += 150;
          const winExpBase = Math.floor(Math.random() * 201) + 300;
          const loseExpBase = Math.floor(Math.random() * 201) + 100;

          const actualWinExp = addExpAndLevelUp(winUser, winChibi, winExpBase);
          const actualLoseExp = addExpAndLevelUp(loseUser, loseChibi, loseExpBase);
          saveUsers(db);

          await i.update({
            content: `⚔️ **Battle Complete!** <@${winner.id}> won against <@${loser.id}> and earned **+150 Points** & **+${actualWinExp} EXP**! (<@${loser.id}> received **+${actualLoseExp} EXP** consolation).`,
            components: []
          });
        } else {
          await i.update({ content: `❌ <@${opponent.id}> declined the battle challenge.`, components: [] });
        }
      });
      return;
    }

    if (command === 'meme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const embed = new EmbedBuilder().setTitle(data.title).setImage(data.url).setColor('#e74c3c').setFooter({ text: `r/${data.subreddit}` });
      return message.reply({ embeds: [embed] });
    }

    // +trivia (Uses the expanded 100+ question bank)
    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(`🧩 **Trivia Challenge:**\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`);

      const filter = m => m.author.id === userId;
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

      collector.on('collect', m => {
        if (m.content.toLowerCase().includes(selected.a)) {
          user.points += 50;
          const awardedExp = addExpAndLevelUp(user, null, 100);
          saveUsers(db);
          m.reply(`🎉 Correct! You earned **+50 Points** and **+${awardedExp} EXP**!`);
        } else {
          m.reply(`❌ Incorrect! The correct answer was **${selected.a}**.`);
        }
      });
      return;
    }

    if (command === 'profile') {
      const userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${message.author.username}'s RPG Profile`)
        .setThumbnail(message.author.displayAvatarURL())
        .setColor('#2ecc71')
        .addFields(
          { name: '📊 Level & EXP', value: `Level ${user.userLevel} (${user.userExp}/${userMaxExp} EXP)`, inline: true },
          { name: '🎲 Best Roll', value: `${user.bestRoll} ${user.bestChibi ? user.bestChibi : ''}`, inline: true },
          { name: '🏆 Rank & Points', value: `Rank: ${user.rank} | Points: ${user.points}`, inline: true },
          { name: '🔰 Clan', value: user.clan || 'None', inline: true }
        );
      return message.reply({ embeds: [embed] });
    }

    if (command === 'clanlist') {
      const clanNames = Object.keys(db.clans);
      const clanListText =
        clanNames.map(c => `• **${c}** (Leader: <@${db.clans[c].leader}>, Members: ${db.clans[c].members.length})`).join('\n') ||
        'No clans available.';
      const embed = new EmbedBuilder().setTitle('🏛️ Available Clans').setDescription(clanListText).setColor('#34495e');
      return message.reply({ embeds: [embed] });
    }

    if (command === 'ccreateclan') {
      const clanName = args.join(' ');
      if (!clanName) return message.reply('❌ Please specify a clan name.');
      if (db.clans[clanName]) return message.reply('❌ Clan already exists!');
      db.clans[clanName] = { name: clanName, leader: userId, viceLeader: null, members: [userId] };
      user.clan = clanName;
      saveUsers(db);
      return message.reply(`✅ Successfully created and joined clan **${clanName}**!`);
    }

    if (command === 'cclanjoin') {
      const clanName = args.join(' ');
      if (!db.clans[clanName]) return message.reply('❌ Clan does not exist!');
      if (db.clans[clanName].members.includes(userId)) return message.reply('⚠️ You are already in this clan!');
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      saveUsers(db);
      return message.reply(`✅ Successfully joined clan **${clanName}**!`);
    }

    if (command === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return message.reply('❌ You are not in a clan!');
      const clan = db.clans[user.clan];
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);

      const memberLines = await Promise.all(
        clan.members.map(async (mId, idx) => {
          const mUser = db.users[mId];
          const role = mId === clan.leader ? 'Leader' : mId === clan.viceLeader ? 'Vice-Leader' : 'Member';
          return `${idx + 1}. <@${mId}> ${role} ${mUser?.rank || 'Novice'} ${mUser?.points || 0} ${mUser?.bestRoll || 'None'}`;
        })
      );

      const embed = new EmbedBuilder()
        .setTitle(`🔰 Clan Information`)
        .setColor('#1abc9c')
        .setDescription(
          `**Clan Name:** ${clan.name}\n**Leader:** <@${clan.leader}>\n**Total Points:** ${totalPoints}\n\n**Members:**\n${memberLines.join('\n')}`
        );
      return message.reply({ embeds: [embed] });
    }

    if (command === 'trade') {
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === userId) return message.reply('❌ Usage: `+trade [@user]`');
      ensureUser(target.id);

      if (user.inventory.chibis.length === 0) {
        return message.reply('❌ You have no chibis in your inventory to trade!');
      }

      const options = user.inventory.chibis.slice(0, 25).map(c => ({
        label: `${c.name} (${c.rarity}) Lv.${c.level} ${c.isShiny ? '✨' : ''}`,
        description: `ID: ${c.id}`,
        value: c.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('trade_chibi_select')
        .setPlaceholder('Choose a Chibi to offer for trade')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const tradeMsg = await message.reply({
        content: `🤝 Trade initiated between <@${userId}> and <@${target.id}>!\n<@${userId}>, select a Chibi from your inventory below:`,
        components: [row]
      });

      let selectedChibiId = null;
      const collector = tradeMsg.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async i => {
        if (i.isStringSelectMenu() && i.customId === 'trade_chibi_select') {
          if (i.user.id !== userId) return i.reply({ content: 'This is not your trade offer!', ephemeral: true });
          selectedChibiId = i.values[0];
          const offeredChibi = user.inventory.chibis.find(c => c.id === selectedChibiId);

          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_trade').setLabel('Confirm Trade').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_trade').setLabel('Cancel').setStyle(ButtonStyle.Danger)
          );

          await i.update({
            content: `🤝 <@${userId}> offered **${offeredChibi.emoji} ${offeredChibi.name} ${offeredChibi.isShiny ? SHINY_ICON : ''}** (${
              offeredChibi.rarity
            }).\n<@${target.id}>, click Confirm Trade to accept!`,
            components: [confirmRow]
          });
        } else if (i.isButton()) {
          if (i.customId === 'cancel_trade') {
            if (i.user.id !== userId && i.user.id !== target.id) {
              return i.reply({ content: 'You are not part of this trade!', ephemeral: true });
            }
            collector.stop();
            return i.update({ content: '❌ Trade cancelled.', components: [] });
          }

          if (i.customId === 'confirm_trade') {
            if (i.user.id !== target.id) {
              return i.reply({ content: `Only <@${target.id}> can accept this trade!`, ephemeral: true });
            }
            const chibiIndex = user.inventory.chibis.findIndex(c => c.id === selectedChibiId);
            if (chibiIndex === -1) {
              collector.stop();
              return i.update({ content: '❌ Trade failed: Chibi is no longer in sender inventory.', components: [] });
            }

            const [transferredChibi] = user.inventory.chibis.splice(chibiIndex, 1);
            if (user.equippedChibi === transferredChibi.id) user.equippedChibi = null;
            user.team = user.team.map(slotId => (slotId === transferredChibi.id ? null : slotId));

            db.users[target.id].inventory.chibis.push(transferredChibi);
            saveUsers(db);
            collector.stop();

            return i.update({
              content: `✅ **Trade Complete!** ${transferredChibi.emoji} **${transferredChibi.name}** ${
                transferredChibi.isShiny ? SHINY_ICON : ''
              } transferred to <@${target.id}>!`,
              components: []
            });
          }
        }
      });
      return;
    }

    // Admin Commands
    if (command.startsWith('admin-')) {
      const ownerId = db.config.ownerId || userId;
      if (userId !== ownerId && !user.permissions) {
        return message.reply('❌ You do not have permission to use admin commands!');
      }

      if (command === 'admin-luck-event') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply('❌ Usage: `+admin-luck-event [multiplier] [duration]` (e.g. `+admin-luck-event 2.0 30m`)');
        }

        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        saveUsers(db);

        return message.reply(`⚡ **Global Luck Event Activated!** Multiplier set to **${mult}x** for **${durationStr}**!`);
      }

      if (command === 'admin-set-xp') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);

        if (isNaN(mult) || !durationMs) {
          return message.reply('❌ Usage: `+admin-set-xp [multiplier] [duration]` (e.g. `+admin-set-xp 1.5 1h`)');
        }

        db.config.globalXpMultiplier = mult;
        db.config.xpEventExpires = Date.now() + durationMs;
        saveUsers(db);

        return message.reply(`✨ **Global XP Event Activated!** Multiplier set to **${mult}x** for **${durationStr}**!`);
      }

      if (command === 'admin-give-item') {
        const target = message.mentions.users.first();
        const itemType = args[1]?.toLowerCase();
        const quantity = parseInt(args[2]);

        if (!target || !['dice', 'spray', 'clover'].includes(itemType) || isNaN(quantity)) {
          return message.reply('❌ Usage: `+admin-give-item [@user] [dice|spray|clover] [quantity]`');
        }
        ensureUser(target.id);

        if (itemType === 'dice') db.users[target.id].dice += quantity;
        else if (itemType === 'spray') db.users[target.id].inventory.items.spray += quantity;
        else if (itemType === 'clover') db.users[target.id].inventory.items.clover += quantity;
        saveUsers(db);

        return message.reply(`🎁 Admin granted **${quantity}x** ${itemType} to <@${target.id}>.`);
      }

      if (command === 'admin-set-rank') {
        const target = message.mentions.users.first();
        const newRank = args.slice(1).join(' ');
        if (!target || !newRank) return message.reply('❌ Usage: `+admin-set-rank [@user] [rank title]`');
        ensureUser(target.id);
        db.users[target.id].rank = newRank;
        saveUsers(db);
        return message.reply(`🛡️ Admin updated rank for <@${target.id}> to **${newRank}**.`);
      }

      if (command === 'admin-set-points') {
        const target = message.mentions.users.first();
        const pts = parseInt(args[1]);
        if (!target || isNaN(pts)) return message.reply('❌ Usage: `+admin-set-points [@user] [points]`');
        ensureUser(target.id);
        db.users[target.id].points = pts;
        saveUsers(db);
        return message.reply(`🛡️ Admin set points for <@${target.id}> to **${pts}**.`);
      }

      if (command === 'admin-give-permission') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Usage: `+admin-give-permission [@user]`');
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        saveUsers(db);
        return message.reply(`🛡️ Admin permissions granted to <@${target.id}>.`);
      }
    }
  } catch (err) {
    console.error(err);
    message.reply('❌ An error occurred while executing this command.');
  }
});

client.login(process.env.DISCORD_TOKEN);