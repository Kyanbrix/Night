
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
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
      JSON.stringify({ users: {}, clans: {}, config: { ownerId: '', globalLuckMultiplier: 1.0, luckEventExpires: 0 } }, null, 2)
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

// Parse time strings like 30s, 5m, 2h, 1d, 1w
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

function addExpAndLevelUp(user, chibi, expAmount) {
  user.userExp += expAmount;
  let userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
  while (user.userExp >= userMaxExp) {
    user.userExp -= userMaxExp;
    user.userLevel += 1;
    userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
  }

  if (chibi) {
    chibi.exp += expAmount;
    const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
    const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
    let chibiMaxExp = baseExp + (chibi.level - 1) * perLvl;

    while (chibi.exp >= chibiMaxExp) {
      chibi.exp -= chibiMaxExp;
      chibi.level += 1;
      chibiMaxExp = baseExp + (chibi.level - 1) * perLvl;
    }
  }
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

// Register Slash Commands
const commands = [
  new SlashCommandBuilder().setName('cstart').setDescription('Initialize your Chibi RPG profile'),
  new SlashCommandBuilder().setName('chelp').setDescription('Displays help menu and command categories'),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice to get Chibis')
    .addIntegerOption(opt => opt.setName('quantity').setDescription('Number of dice to roll').setRequired(false))
    .addStringOption(opt =>
      opt
        .setName('boost')
        .setDescription('Use spray or clover boost')
        .setRequired(false)
        .addChoices(
          { name: 'Spray (Awesome Chibi boost)', value: 'spray' },
          { name: 'Clover (Duplication boost)', value: 'clover' }
        )
    ),
  new SlashCommandBuilder().setName('cdrop').setDescription('Claim your free dice drop every 10 seconds'),
  new SlashCommandBuilder().setName('cinventory').setDescription('Shows your Chibi and Item inventory'),
  new SlashCommandBuilder().setName('cshop').setDescription('Open the Chibi Shop to buy items with dice'),
  new SlashCommandBuilder().setName('collections').setDescription('View your collected Chibis and roll dates'),
  new SlashCommandBuilder().setName('cstats').setDescription('Show stats of your currently equipped Chibi'),
  new SlashCommandBuilder().setName('crank').setDescription('Show your current rank'),
  new SlashCommandBuilder().setName('cpoints').setDescription('Show your current points balance'),
  new SlashCommandBuilder().setName('cranks').setDescription('Show the global leaderboard of user ranks & points'),
  new SlashCommandBuilder()
    .setName('cequipteam')
    .setDescription('Equip a chibi to a team slot and gain EXP')
    .addStringOption(opt => opt.setName('chibi_id').setDescription('The unique ID of the chibi').setRequired(true))
    .addIntegerOption(opt => opt.setName('slot').setDescription('Slot number (1, 2, or 3)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('cbattle')
    .setDescription('Battle another player using your chibi team')
    .addUserOption(opt => opt.setName('opponent').setDescription('Player to battle').setRequired(true)),
  new SlashCommandBuilder().setName('cmeme').setDescription('Generate a random meme from the web'),
  new SlashCommandBuilder().setName('ctrivia').setDescription('Answer a fill-in-the-blank trivia question'),
  new SlashCommandBuilder().setName('cprofile').setDescription('View your RPG user profile & rank'),
  new SlashCommandBuilder().setName('cclanlist').setDescription('List available clans to join'),
  new SlashCommandBuilder()
    .setName('cclanjoin')
    .setDescription('Join an existing clan')
    .addStringOption(opt => opt.setName('clan_name').setDescription('Name of the clan').setRequired(true)),
  new SlashCommandBuilder().setName('cclaninfo').setDescription('View info about your current clan'),
  new SlashCommandBuilder()
    .setName('ccreateclan')
    .setDescription('Create a new clan')
    .addStringOption(opt => opt.setName('clan_name').setDescription('Name of your new clan').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ctrade')
    .setDescription('Trade chibis with another player')
    .addUserOption(opt => opt.setName('target').setDescription('Player to trade with').setRequired(true)),
  // Admin Commands
  new SlashCommandBuilder()
    .setName('admin-luck-event')
    .setDescription('Admin: Trigger a timed global luck event multiplier')
    .addNumberOption(opt => opt.setName('multiplier').setDescription('Luck multiplier value (e.g. 2.0)').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration time (e.g. 30s, 10m, 2h, 1d)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-give-item')
    .setDescription('Admin: Give items, dice, or spray/clover to a user')
    .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(true))
    .addStringOption(opt =>
      opt
        .setName('item')
        .setDescription('Item type')
        .setRequired(true)
        .addChoices(
          { name: 'Dice 🎲', value: 'dice' },
          { name: 'Spray 🧴', value: 'spray' },
          { name: 'Clover 🍀', value: 'clover' }
        )
    )
    .addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity to give').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-set-rank')
    .setDescription('Admin: Set a user rank')
    .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(true))
    .addStringOption(opt => opt.setName('rank').setDescription('New rank title').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-set-points')
    .setDescription('Admin: Set user points')
    .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(true))
    .addIntegerOption(opt => opt.setName('points').setDescription('Points amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-give-permission')
    .setDescription('Admin: Grant admin power to a user')
    .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully registered application slash commands.');
  } catch (error) {
    console.error(error);
  }
});

function checkStarted(interaction) {
  ensureUser(interaction.user.id);
  const user = db.users[interaction.user.id];
  if (!user.started && interaction.commandName !== 'cstart' && interaction.commandName !== 'chelp') {
    interaction.reply({ content: '❌ You must type `/cstart` before using any bot commands!', ephemeral: true });
    return false;
  }
  return true;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!checkStarted(interaction)) return;

  const userId = interaction.user.id;
  const user = db.users[userId];
  const rarityIconsMap = getRarityIconMap();

  try {
    // Check if timed luck event expired
    if (db.config.luckEventExpires && Date.now() > db.config.luckEventExpires) {
      db.config.globalLuckMultiplier = 1.0;
      db.config.luckEventExpires = 0;
      saveUsers(db);
    }

    if (interaction.commandName === 'cstart') {
      if (user.started) return interaction.reply({ content: '⚠️ You have already started your Chibi RPG journey!', ephemeral: true });
      user.started = true;
      user.dice += 20;
      if (!db.config.ownerId) db.config.ownerId = userId;
      saveUsers(db);
      return interaction.reply({ content: '🎉 Welcome to Chibi RPG RNG! You have been awarded **20x Dice** 🎲 and your profile is initialized.' });
    }

    if (interaction.commandName === 'chelp') {
      const embed = new EmbedBuilder()
        .setTitle('🌸 Chibi RPG RNG - Help Center')
        .setColor('#ff77aa')
        .setDescription('Explore the categories below to navigate your adventure:')
        .addFields(
          { name: '🎲 Rolling & Drops', value: '`/roll` - Roll for Chibis\n`/cdrop` - Claim free dice every 10s\n`/cshop` - Buy Spray & Clover boosts' },
          { name: '⚔️ RPG & Battling', value: '`/cstats` - Check equipped chibi stats\n`/cequipteam` - Manage team slots & gain EXP\n`/cbattle` - Challenge players' },
          { name: '🎒 Inventory & Profile', value: '`/cinventory`, `/collections`\n`/cprofile`, `/crank`, `/cpoints`, `/cranks`\n`/ctrade` - Trade with other players' },
          { name: '🏛️ Clans & Fun', value: '`/cclanlist`, `/cclanjoin`, `/cclaninfo`, `/ccreateclan`\n`/cmeme`, `/ctrivia`' }
        )
        .setFooter({ text: `Powered by Railway` });
      return interaction.reply({ embeds: [embed] });
    }

    // Roll Command (Integrated with Active Luck Boosts)
    if (interaction.commandName === 'roll') {
      const qty = Math.min(interaction.options.getInteger('quantity') || 1, gameData.settings.maxRollQuantity);
      const boost = interaction.options.getString('boost');

      if (qty < 1) return interaction.reply({ content: '❌ Quantity must be at least 1.', ephemeral: true });
      if (user.dice < qty) {
        return interaction.reply({ content: `❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`, ephemeral: true });
      }

      if (boost === 'spray') {
        if (user.inventory.items.spray <= 0) return interaction.reply({ content: '❌ No Spray uses left! Buy more in `/cshop`.', ephemeral: true });
        user.inventory.items.spray--;
      } else if (boost === 'clover') {
        if (user.inventory.items.clover <= 0) return interaction.reply({ content: '❌ No Clover uses left! Buy more in `/cshop`.', ephemeral: true });
        user.inventory.items.clover--;
      }

      user.dice -= qty;
      const resultsSummary = [];

      // Calculate effective luck multiplier (Global Event multiplier * Spray boost)
      let activeLuckMultiplier = db.config.globalLuckMultiplier || 1.0;
      if (boost === 'spray') activeLuckMultiplier *= 1.5;

      for (let i = 0; i < qty; i++) {
        const adjustedRarities = gameData.rarities.map(r => {
          let w = r.weight;
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
        let shinyVal = parseOddsNumber(chibiTemplate.shinyOdds);
        
        // Luck event / boost makes shiny rolls easier (divides required threshold)
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

        const currentRollVal = isShiny ? shinyVal : normalVal;
        if (currentRollVal > user.bestRollVal) {
          user.bestRollVal = currentRollVal;
          user.bestRoll = chibiTemplate.shinyOdds;
          user.bestChibi = `${isShiny ? SHINY_ICON + ' ' : ''}${chibiTemplate.emoji} ${chibiTemplate.name}`;
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
                `${rarityIconsMap[r.chibi.rarity]} ${r.isShiny ? SHINY_ICON + ' ' : ''}${r.chibi.emoji} **${r.chibi.name}** ${
                  r.duplicated ? '(🍀 Duplicated!)' : ''
                }`
            )
            .join('\n') + luckNotice
        )
        .setFooter({ text: `Remaining Dice: ${user.dice} 🎲` });

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cdrop') {
      const now = Date.now();
      const cooldownMs = gameData.settings.dropCooldownSeconds * 1000;
      if (now - user.lastDrop < cooldownMs) {
        const timeLeft = Math.ceil((cooldownMs - (now - user.lastDrop)) / 1000);
        return interaction.reply({ content: `⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`, ephemeral: true });
      }
      user.lastDrop = now;

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

      return interaction.reply({ content: `${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** 🎲! Total dice: ${user.dice}` });
    }

    if (interaction.commandName === 'cinventory') {
      const chibiList =
        user.inventory.chibis
          .map(
            (c, i) =>
              `${i + 1}. \`[${c.id}]\` ${rarityIconsMap[c.rarity]} ${c.isShiny ? SHINY_ICON + ' ' : ''}${c.emoji} **${c.name}** - Lv.${c.level}`
          )
          .slice(0, 15)
          .join('\n') || 'No chibis collected yet.';

      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
        .setColor('#3498db')
        .addFields(
          { name: '🎲 Dice', value: `${user.dice} 🎲`, inline: true },
          { name: '🧴 Spray', value: `${user.inventory.items.spray} Uses`, inline: true },
          { name: '🍀 Clover', value: `${user.inventory.items.clover} Uses`, inline: true },
          { name: '✨ Chibis', value: chibiList }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cshop') {
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
      const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      const collector = response.createMessageComponentCollector({ time: 30000 });
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

    if (interaction.commandName === 'collections') {
      const collectionText =
        user.inventory.chibis
          .map(c => `${rarityIconsMap[c.rarity]} - ${c.isShiny ? SHINY_ICON + ' ' : ''}${c.emoji} ${c.name} (${c.date})`)
          .join('\n') || 'Your collection is empty.';
      const embed = new EmbedBuilder()
        .setTitle(`📖 ${interaction.user.username}'s Chibi Collection`)
        .setColor('#9b59b6')
        .setDescription(collectionText.length > 4000 ? collectionText.substring(0, 3996) + '...' : collectionText);
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cstats') {
      if (!user.equippedChibi) return interaction.reply({ content: '❌ You do not have a chibi equipped! Use `/cequipteam` first.', ephemeral: true });
      const chibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);
      if (!chibi) return interaction.reply({ content: '❌ Equipped chibi not found in inventory.', ephemeral: true });

      const statConfig = gameData.stats[chibi.rarity][chibi.isShiny ? 'shiny' : 'normal'];
      const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
      const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
      const maxExp = baseExp + (chibi.level - 1) * perLvl;

      const embed = new EmbedBuilder()
        .setTitle(`${rarityIconsMap[chibi.rarity]} ${chibi.isShiny ? SHINY_ICON + ' ' : ''}${chibi.emoji} ${chibi.name} Stats`)
        .setColor('#e67e22')
        .addFields(
          { name: '❤️ HP', value: `${statConfig.hp + chibi.level * statConfig.hpPer}`, inline: true },
          { name: '🗡️ Attack', value: `${statConfig.atk + chibi.level * statConfig.atkPer}`, inline: true },
          { name: '🛡️ Defense', value: `${statConfig.def + chibi.level * statConfig.defPer}`, inline: true },
          { name: '📊 Level / EXP', value: `Level ${chibi.level} (${chibi.exp}/${maxExp} EXP)` }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'crank') {
      return interaction.reply({ content: `🏆 Your current rank is: **${user.rank}**` });
    }

    if (interaction.commandName === 'cpoints') {
      return interaction.reply({ content: `💰 Your current points balance is: **${user.points}**` });
    }

    // Leaderboard /cranks
    if (interaction.commandName === 'cranks') {
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
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cequipteam') {
      const chibiId = interaction.options.getString('chibi_id');
      const slot = interaction.options.getInteger('slot');
      if (slot < 1 || slot > 3) return interaction.reply({ content: '❌ Slot must be 1, 2, or 3.', ephemeral: true });

      const chibi = user.inventory.chibis.find(c => c.id === chibiId);
      if (!chibi) return interaction.reply({ content: '❌ Chibi ID not found in your inventory.', ephemeral: true });

      const wasEmpty = !user.team[slot - 1];
      user.team[slot - 1] = chibi.id;
      user.equippedChibi = chibi.id;

      let expMsg = '';
      if (wasEmpty) {
        addExpAndLevelUp(user, chibi, 250);
        expMsg = `\n✨ Team slot bonus: **+250 EXP** awarded to you and **${chibi.name}**!`;
      }
      saveUsers(db);

      return interaction.reply({
        content: `✅ Successfully equipped ${chibi.isShiny ? SHINY_ICON + ' ' : ''}${chibi.emoji} **${chibi.name}** to Team Slot ${slot}!${expMsg}`
      });
    }

    if (interaction.commandName === 'cbattle') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) return interaction.reply({ content: '❌ You cannot battle yourself or a bot!', ephemeral: true });
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel('Accept Battle').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        content: `<@${opponent.id}>, you have been challenged to a Chibi Battle by <@${userId}>!`,
        components: [row],
        fetchReply: true
      });

      const collector = msg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: 'This battle challenge is not for you!', ephemeral: true });
        if (i.customId === 'accept_battle') {
          const challengerChibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);
          const opponentUser = db.users[opponent.id];
          const opponentChibi = opponentUser.inventory.chibis.find(c => c.id === opponentUser.equippedChibi);

          const p1Power = calculateChibiCombatPower(challengerChibi) * (0.85 + Math.random() * 0.3);
          const p2Power = calculateChibiCombatPower(opponentChibi) * (0.85 + Math.random() * 0.3);

          const winner = p1Power >= p2Power ? interaction.user : opponent;
          const loser = winner.id === userId ? opponent : interaction.user;
          const winUser = db.users[winner.id];
          const winChibi = winUser.inventory.chibis.find(c => c.id === winUser.equippedChibi);

          winUser.points += 150;
          addExpAndLevelUp(winUser, winChibi, 300);
          saveUsers(db);

          await i.update({
            content: `⚔️ **Battle Complete!** <@${winner.id}> won against <@${loser.id}> and earned **+150 Points** & **+300 EXP**!`,
            components: []
          });
        } else {
          await i.update({ content: `❌ <@${opponent.id}> declined the battle challenge.`, components: [] });
        }
      });
      return;
    }

    if (interaction.commandName === 'cmeme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const embed = new EmbedBuilder().setTitle(data.title).setImage(data.url).setColor('#e74c3c').setFooter({ text: `r/${data.subreddit}` });
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ctrivia') {
      const triviaList = [
        { q: 'What is the powerhouse of the cell? Answer starts with M___', a: 'mitochondria' },
        { q: 'What programming language is this bot written in? J______', a: 'javascript' },
        { q: 'Which planet is known as the Red Planet? M___', a: 'mars' }
      ];
      const selected = triviaList[Math.floor(Math.random() * triviaList.length)];
      await interaction.reply({ content: `🧩 **Trivia Challenge:**\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*` });

      const filter = m => m.author.id === userId;
      const collector = interaction.channel.createMessageCollector({ filter, time: 15000, max: 1 });

      collector.on('collect', m => {
        if (m.content.toLowerCase().includes(selected.a)) {
          user.points += 50;
          addExpAndLevelUp(user, null, 100);
          saveUsers(db);
          m.reply('🎉 Correct! You earned **+50 Points** and **+100 EXP**!');
        } else {
          m.reply(`❌ Incorrect! The correct answer was **${selected.a}**.`);
        }
      });
      return;
    }

    if (interaction.commandName === 'cprofile') {
      const userMaxExp = gameData.settings.userExpBase + (user.userLevel - 1) * gameData.settings.userExpPerLevel;
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${interaction.user.username}'s RPG Profile`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor('#2ecc71')
        .addFields(
          { name: '📊 Level & EXP', value: `Level ${user.userLevel} (${user.userExp}/${userMaxExp} EXP)`, inline: true },
          { name: '🎲 Best Roll', value: `${user.bestRoll} ${user.bestChibi ? `(${user.bestChibi})` : ''}`, inline: true },
          { name: '🏆 Rank & Points', value: `Rank: ${user.rank} | Points: ${user.points}`, inline: true },
          { name: '🔰 Clan', value: user.clan || 'None', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cclanlist') {
      const clanNames = Object.keys(db.clans);
      const clanListText =
        clanNames.map(c => `• **${c}** (Leader: <@${db.clans[c].leader}>, Members: ${db.clans[c].members.length})`).join('\n') ||
        'No clans available.';
      const embed = new EmbedBuilder().setTitle('🏛️ Available Clans').setDescription(clanListText).setColor('#34495e');
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ccreateclan') {
      const clanName = interaction.options.getString('clan_name');
      if (db.clans[clanName]) return interaction.reply({ content: '❌ Clan already exists!', ephemeral: true });
      db.clans[clanName] = { name: clanName, leader: userId, viceLeader: null, members: [userId] };
      user.clan = clanName;
      saveUsers(db);
      return interaction.reply({ content: `✅ Successfully created and joined clan **${clanName}**!` });
    }

    if (interaction.commandName === 'cclanjoin') {
      const clanName = interaction.options.getString('clan_name');
      if (!db.clans[clanName]) return interaction.reply({ content: '❌ Clan does not exist!', ephemeral: true });
      if (db.clans[clanName].members.includes(userId)) return interaction.reply({ content: '⚠️ You are already in this clan!', ephemeral: true });
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      saveUsers(db);
      return interaction.reply({ content: `✅ Successfully joined clan **${clanName}**!` });
    }

    if (interaction.commandName === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return interaction.reply({ content: '❌ You are not in a clan!', ephemeral: true });
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
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ctrade') {
      const target = interaction.options.getUser('target');
      if (target.bot || target.id === userId) return interaction.reply({ content: '❌ Invalid trade target.', ephemeral: true });
      ensureUser(target.id);

      if (user.inventory.chibis.length === 0) {
        return interaction.reply({ content: '❌ You have no chibis in your inventory to trade!', ephemeral: true });
      }

      const options = user.inventory.chibis.slice(0, 25).map(c => ({
        label: `${c.isShiny ? '✨ ' : ''}${c.name} (${c.rarity}) Lv.${c.level}`,
        description: `ID: ${c.id}`,
        value: c.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('trade_chibi_select')
        .setPlaceholder('Choose a Chibi to offer for trade')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const tradeMsg = await interaction.reply({
        content: `🤝 Trade initiated between <@${userId}> and <@${target.id}>!\n<@${userId}>, select a Chibi from your inventory below:`,
        components: [row],
        fetchReply: true
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
            content: `🤝 <@${userId}> offered **${offeredChibi.isShiny ? SHINY_ICON + ' ' : ''}${offeredChibi.emoji} ${offeredChibi.name}** (${
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
              content: `✅ **Trade Complete!** ${transferredChibi.isShiny ? SHINY_ICON + ' ' : ''}${transferredChibi.emoji} **${
                transferredChibi.name
              }** transferred to <@${target.id}>!`,
              components: []
            });
          }
        }
      });
      return;
    }

    // 17. Admin Commands (With Timed Luck Events & Item Quantities)
    if (interaction.commandName.startsWith('admin-')) {
      const ownerId = db.config.ownerId || userId;
      if (userId !== ownerId && !user.permissions) {
        return interaction.reply({ content: '❌ You do not have permission to use admin commands!', ephemeral: true });
      }

      // /admin-luck-event (multiplier, duration e.g. 30m, 2h)
      if (interaction.commandName === 'admin-luck-event') {
        const mult = interaction.options.getNumber('multiplier');
        const durationStr = interaction.options.getString('duration');
        const durationMs = parseDurationToMs(durationStr);

        if (!durationMs) {
          return interaction.reply({ content: '❌ Invalid duration format! Use format like `30s`, `15m`, `2h`, `1d`, or `1w`.', ephemeral: true });
        }

        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        saveUsers(db);

        return interaction.reply({ content: `⚡ **Global Luck Event Activated!** Multiplier set to **${mult}x** for **${durationStr}**!` });
      }

      // /admin-give-item (target, item, quantity)
      if (interaction.commandName === 'admin-give-item') {
        const target = interaction.options.getUser('target');
        const itemType = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity');
        ensureUser(target.id);

        if (itemType === 'dice') {
          db.users[target.id].dice += quantity;
        } else if (itemType === 'spray') {
          db.users[target.id].inventory.items.spray += quantity;
        } else if (itemType === 'clover') {
          db.users[target.id].inventory.items.clover += quantity;
        }
        saveUsers(db);

        return interaction.reply({ content: `🎁 Admin granted **${quantity}x** ${itemType} to <@${target.id}>.` });
      }

      if (interaction.commandName === 'admin-set-rank') {
        const target = interaction.options.getUser('target');
        const newRank = interaction.options.getString('rank');
        ensureUser(target.id);
        db.users[target.id].rank = newRank;
        saveUsers(db);
        return interaction.reply({ content: `🛡️ Admin updated rank for <@${target.id}> to **${newRank}**.` });
      }

      if (interaction.commandName === 'admin-set-points') {
        const target = interaction.options.getUser('target');
        const pts = interaction.options.getInteger('points');
        ensureUser(target.id);
        db.users[target.id].points = pts;
        saveUsers(db);
        return interaction.reply({ content: `🛡️ Admin set points for <@${target.id}> to **${pts}**.` });
      }

      if (interaction.commandName === 'admin-give-permission') {
        const target = interaction.options.getUser('target');
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        saveUsers(db);
        return interaction.reply({ content: `🛡️ Admin permissions granted to <@${target.id}>.` });
      }
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);