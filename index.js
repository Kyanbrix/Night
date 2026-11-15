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

function loadGameData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error('data.json is missing! Please make sure your data.json is in the root directory.');
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

let gameData = loadGameData();

// Ensure user database structure exists alongside game config
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: {}, clans: {}, config: { ownerId: "", globalLuckMultiplier: 1.0 } }, null, 2));
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

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

// Register Slash Commands
const commands = [
  new SlashCommandBuilder().setName('cstart').setDescription('Initialize your Chibi RPG profile'),
  new SlashCommandBuilder().setName('chelp').setDescription('Displays help menu and command categories'),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice to get Chibis')
    .addIntegerOption(opt => opt.setName('quantity').setDescription('Number of dice to roll').setRequired(false))
    .addStringOption(opt => opt.setName('boost').setDescription('Use spray or clover boost').setRequired(false).addChoices(
      { name: 'Spray (Awesome Chibi boost)', value: 'spray' },
      { name: 'Clover (Duplication boost)', value: 'clover' }
    )),
  new SlashCommandBuilder().setName('cdrop').setDescription('Claim your free dice drop every 10 seconds'),
  new SlashCommandBuilder().setName('cinventory').setDescription('Shows your Chibi and Item inventory'),
  new SlashCommandBuilder().setName('cshop').setDescription('Open the Chibi Shop to buy items with dice'),
  new SlashCommandBuilder().setName('collections').setDescription('View your collected Chibis and roll dates'),
  new SlashCommandBuilder().setName('cstats').setDescription('Show stats of your currently equipped Chibi'),
  new SlashCommandBuilder()
    .setName('cequipteam')
    .setDescription('Equip a chibi to a team slot')
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
    .setDescription('Trade chibis or items with another player')
    .addUserOption(opt => opt.setName('target').setDescription('Player to trade with').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-luck-event')
    .setDescription('Admin: Trigger a global luck event multiplier')
    .addNumberOption(opt => opt.setName('multiplier').setDescription('Luck multiplier value').setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-give-item')
    .setDescription('Admin: Give items or dice to a user')
    .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(true))
    .addStringOption(opt => opt.setName('type').setDescription('dice, spray, or clover').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true)),
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

  try {
    if (interaction.commandName === 'cstart') {
      if (user.started) return interaction.reply({ content: '⚠️ You have already started your Chibi RPG journey!', ephemeral: true });
      user.started = true;
      user.dice += 20;
      saveUsers(db);
      return interaction.reply({ content: '🎉 Welcome to Chibi RPG RNG! You have been awarded **20x Dice** 🎲 and your profile is initialized. Use `/chelp` to begin!' });
    }

    if (interaction.commandName === 'chelp') {
      const embed = new EmbedBuilder()
        .setTitle('🌸 Chibi RPG RNG - Help Center')
        .setColor('#ff77aa')
        .setDescription('Explore the categories below to navigate your adventure:')
        .addFields(
          { name: '🎲 Rolling & Drops', value: '`/roll` - Roll for Chibis\n`/cdrop` - Claim free dice every 10s\n`/cshop` - Buy Spray & Clover boosts' },
          { name: '⚔️ RPG & Battling', value: '`/cstats` - Check equipped chibi stats\n`/cequipteam` - Manage team slots & gain EXP\n`/cbattle` - Challenge players' },
          { name: '🎒 Inventory & Profile', value: '`/cinventory` - View items & chibis\n`/collections` - View chibi collection log\n`/cprofile` - View rank, points, and stats\n`/ctrade` - Trade with other players' },
          { name: '🏛️ Clans & Fun', value: '`/cclanlist`, `/cclanjoin`, `/cclaninfo`, `/ccreateclan`\n`/cmeme` - Random meme\n`/ctrivia` - Trivia minigame' }
        )
        .setFooter({ text: 'Chibi RPG RNG Bot • Powered by Railway' });
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'roll') {
      const qty = interaction.options.getInteger('quantity') || 1;
      const boost = interaction.options.getString('boost');

      if (user.dice < qty) {
        return interaction.reply({ content: `❌ You don't have enough dice! You need ${qty} 🎲, but you only have ${user.dice} 🎲.`, ephemeral: true });
      }

      if (boost === 'spray') {
        if (user.inventory.items.spray <= 0) return interaction.reply({ content: '❌ You have no Spray uses left! Buy more in `/cshop`.', ephemeral: true });
        user.inventory.items.spray--;
      } else if (boost === 'clover') {
        if (user.inventory.items.clover <= 0) return interaction.reply({ content: '❌ You have no Clover uses left! Buy more in `/cshop`.', ephemeral: true });
        user.inventory.items.clover--;
      }

      user.dice -= qty;
      let resultsSummary = [];

      for (let i = 0; i < qty; i++) {
        // Roll rarity using weights from data.json
        const totalWeight = gameData.rarities.reduce((sum, r) => sum + r.weight, 0);
        let randW = Math.random() * totalWeight;
        let chosenRarityObj = gameData.rarities[0];
        
        for (let r of gameData.rarities) {
          if (randW < r.weight) {
            chosenRarityObj = r;
            break;
          }
          randW -= r.weight;
        }

        const availableChibis = gameData.chibis.filter(c => c.rarity === chosenRarityObj.key);
        const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];

        // Parse shiny odds string (e.g., "1 in 10K" -> 10000)
        let shinyNum = 10000;
        if (chibiTemplate.shinyOdds.includes('K')) shinyNum = parseFloat(chibiTemplate.shinyOdds) * 1000;
        else if (chibiTemplate.shinyOdds.includes('B')) shinyNum = parseFloat(chibiTemplate.shinyOdds) * 1000000000;
        else if (chibiTemplate.shinyOdds.includes('M')) shinyNum = parseFloat(chibiTemplate.shinyOdds) * 1000000;
        else if (chibiTemplate.shinyOdds.includes('T')) shinyNum = parseFloat(chibiTemplate.shinyOdds) * 1000000000000;

        let isShiny = Math.random() * shinyNum < 1;

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

        if (shinyNum > user.bestRollVal) {
          user.bestRollVal = shinyNum;
          user.bestRoll = chibiTemplate.shinyOdds;
          user.bestChibi = chibiTemplate.emoji;
        }
      }

      saveUsers(db);

      const rarityIconsMap = {};
      gameData.rarities.forEach(r => rarityIconsMap[r.key] = r.emoji);

      const embed = new EmbedBuilder()
        .setTitle('🎲 Chibi Roll Results')
        .setColor('#57f287')
        .setDescription(resultsSummary.map(r => `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON + ' (Shiny!)' : ''} ${r.duplicated ? '(🍀 Duplicated!)' : ''}`).join('\n'))
        .setFooter({ text: `Remaining Dice: ${user.dice} 🎲` });

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cdrop') {
      const now = Date.now();
      if (now - user.lastDrop < 10000) {
        const timeLeft = Math.ceil((10000 - (now - user.lastDrop)) / 1000);
        return interaction.reply({ content: `⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`, ephemeral: true });
      }
      user.lastDrop = now;

      const totalDropWeight = gameData.dropTable.reduce((sum, d) => sum + d.weight, 0);
      let randD = Math.random() * totalDropWeight;
      let chosenDrop = gameData.dropTable[0];
      for (let d of gameData.dropTable) {
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
      const chibiList = user.inventory.chibis.map((c, i) => `${i+1}. ${c.emoji} **${c.name}** (${c.rarity}) ${c.isShiny ? SHINY_ICON : ''} - Lv.${c.level}`).slice(0, 15).join('\n') || 'No chibis collected yet.';
      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
        .setColor('#3498db')
        .addFields(
          { name: '🎲 Dice', value: `${user.dice} 🎲`, inline: true },
          { name: '🧴 Spray', value: `${user.inventory.items.spray} Uses`, inline: true },
          { name: '🍀 Clover', value: `${user.inventory.items.clover} Uses`, inline: true },
          { name: '✨ Chibis (Showing first 15)', value: chibiList }
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
          { name: '🧴 Spray (5 🎲)', value: 'Use this to have the chance to roll Awesome Chibi [30 Uses]' },
          { name: '🍀 Clover (15 🎲)', value: 'Use this to duplicate your Chibi while rolling [50 Uses]' }
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
          await i.update({ content: `✅ Successfully purchased Spray! Current inventory: ${user.inventory.items.spray} Spray uses.`, components: [] });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 15;
          user.inventory.items.clover += 50;
          saveUsers(db);
          await i.update({ content: `✅ Successfully purchased Clover! Current inventory: ${user.inventory.items.clover} Clover uses.`, components: [] });
        }
      });
      return;
    }

    if (interaction.commandName === 'collections') {
      const collectionText = user.inventory.chibis.map(c => `[${c.rarity}] - [${c.name} ${c.emoji}] ${c.isShiny ? SHINY_ICON : ''} (${c.date})`).join('\n') || 'Your collection is empty.';
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
      const maxExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;

      const embed = new EmbedBuilder()
        .setTitle(`${chibi.emoji} ${chibi.name} Stats (${chibi.rarity} ${chibi.isShiny ? SHINY_ICON : ''})`)
        .setColor('#e67e22')
        .addFields(
          { name: '❤️ HP', value: `${statConfig.hp + (chibi.level * statConfig.hpPer)}`, inline: true },
          { name: '🗡️ Attack', value: `${statConfig.atk + (chibi.level * statConfig.atkPer)}`, inline: true },
          { name: '🛡️ Defense', value: `${statConfig.def + (chibi.level * statConfig.defPer)}`, inline: true },
          { name: '📊 Level / EXP', value: `Level ${chibi.level} (${chibi.exp}/${maxExp} EXP)` }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cequipteam') {
      const chibiId = interaction.options.getString('chibi_id');
      const slot = interaction.options.getInteger('slot');
      if (slot < 1 || slot > 3) return interaction.reply({ content: '❌ Slot must be 1, 2, or 3.', ephemeral: true });

      const chibi = user.inventory.chibis.find(c => c.id === chibiId);
      if (!chibi) return interaction.reply({ content: '❌ Chibi ID not found in your inventory.', ephemeral: true });

      user.team[slot - 1] = chibi.id;
      user.equippedChibi = chibi.id;
      saveUsers(db);

      return interaction.reply({ content: `✅ Successfully equipped ${chibi.emoji} **${chibi.name}** to Team Slot ${slot}!` });
    }

    if (interaction.commandName === 'cbattle') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) return interaction.reply({ content: '❌ You cannot battle yourself or a bot!', ephemeral: true });
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel('Accept Battle').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({ content: `<@${opponent.id}>, you have been challenged to a Chibi Battle by <@${userId}>!`, components: [row], fetchReply: true });

      const collector = msg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: 'This battle challenge is not for you!', ephemeral: true });
        if (i.customId === 'accept_battle') {
          const winner = Math.random() > 0.5 ? interaction.user : opponent;
          const loser = winner.id === userId ? opponent : interaction.user;
          db.users[winner.id].points += 150;
          saveUsers(db);
          await i.update({ content: `⚔️ **Battle Complete!** <@${winner.id}> emerged victorious against <@${loser.id}> and won 150 Points!`, components: [] });
        } else {
          await i.update({ content: `❌ <@${opponent.id}> declined the battle challenge.`, components: [] });
        }
      });
      return;
    }

    if (interaction.commandName === 'cmeme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const embed = new EmbedBuilder().setTitle(data.title).setImage(data.url).setColor('#e74c3c').setFooter({ text: `Subreddit: r/${data.subreddit}` });
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
          saveUsers(db);
          m.reply('🎉 Correct! You earned 50 points and 15k coins!');
        } else {
          m.reply(`❌ Incorrect! The correct answer was **${selected.a}**.`);
        }
      });
      return;
    }

    if (interaction.commandName === 'cprofile') {
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${interaction.user.username}'s RPG Profile`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor('#2ecc71')
        .addFields(
          { name: '📊 Level & EXP', value: `Level ${user.userLevel} (${user.userExp}/${gameData.settings.userExpBase} EXP)`, inline: true },
          { name: '🎲 Best Roll', value: `${user.bestRoll} ${user.bestChibi || ''}`, inline: true },
          { name: '🏆 Rank & Points', value: `Rank: ${user.rank} | Points: ${user.points}`, inline: true },
          { name: '🔰 Clan', value: user.clan || 'None', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'cclanlist') {
      const clanNames = Object.keys(db.clans);
      const clanListText = clanNames.map(c => `• **${c}** (Leader: <@${db.clans[c].leader}>, Members: ${db.clans[c].members.length})`).join('\n') || 'No clans available.';
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
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      saveUsers(db);
      return interaction.reply({ content: `✅ Successfully joined clan **${clanName}**!` });
    }

    if (interaction.commandName === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return interaction.reply({ content: '❌ You are not in a clan!', ephemeral: true });
      const clan = db.clans[user.clan];
      const embed = new EmbedBuilder()
        .setTitle(`Clan Info: ${clan.name}`)
        .setColor('#1abc9c')
        .addFields(
          { name: 'Clan Name', value: clan.name, inline: true },
          { name: 'Clan Leader', value: `<@${clan.leader}>`, inline: true },
          { name: 'Total Members', value: `${clan.members.length}`, inline: true }
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
        label: `${c.name} (${c.rarity}) Lv.${c.level}`,
        description: `ID: ${c.id}`,
        value: c.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('trade_chibi_select')
        .setPlaceholder('Choose a Chibi to offer for trade')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const tradeMsg = await interaction.reply({ content: `🤝 Trade initiated between <@${userId}> and <@${target.id}>!\n<@${userId}>, select a Chibi from your inventory below:`, components: [row], fetchReply: true });

      const collector = tradeMsg.createMessageComponentCollector({ time: 30000 });
      collector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: 'This is not your trade offer!', ephemeral: true });
        const selectedChibiId = i.values[0];
        const offeredChibi = user.inventory.chibis.find(c => c.id === selectedChibiId);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_trade').setLabel('Confirm Trade').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cancel_trade').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );

        await i.update({ content: `🤝 <@${userId}> offered **${offeredChibi.emoji} ${offeredChibi.name}** (${offeredChibi.rarity}).\n<@$ {target.id}>, do you accept this trade?`, components: [confirmRow] });
      });
      return;
    }

    if (interaction.commandName.startsWith('admin-')) {
      const ownerId = db.config.ownerId || userId;
      if (userId !== ownerId && !user.permissions) return interaction.reply({ content: '❌ You do not have permission!', ephemeral: true });

      if (interaction.commandName === 'admin-luck-event') {
        const mult = interaction.options.getNumber('multiplier');
        db.config.globalLuckMultiplier = mult;
        saveUsers(db);
        return interaction.reply({ content: `⚡ Global luck event multiplier set to **${mult}x**!` });
      }
      if (interaction.commandName === 'admin-give-item') {
        const target = interaction.options.getUser('target');
        const type = interaction.options.getString('type');
        const amount = interaction.options.getInteger('amount');
        ensureUser(target.id);
        if (type === 'dice') db.users[target.id].dice += amount;
        else if (type === 'spray') db.users[target.id].inventory.items.spray += amount;
        else if (type === 'clover') db.users[target.id].inventory.items.clover += amount;
        saveUsers(db);
        return interaction.reply({ content: `🎁 Admin granted ${amount} ${type} to <@${target.id}>.` });
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