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

// Load or initialize JSON DB
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { users: {}, clans: {}, config: { ownerId: "", globalLuckMultiplier: 1.0 } };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let db = loadData();

// --- CONFIG & CONSTANTS ---
const CHIBIS = {
  // C (40%)
  Pampam: { name: 'Pampam', rarity: 'C', emoji: '<:pampam:1571309970425651280>', weight: 40, normalRate: 30, shinyRate: 10000 },
  Maisa: { name: 'Maisa', rarity: 'C', emoji: '<:maisa:1571310872662642728>', weight: 40, normalRate: 150, shinyRate: 25000 },
  Powey: { name: 'Powey', rarity: 'C', emoji: '<:powey:1571311363895328838>', weight: 40, normalRate: 400, shinyRate: 150000 },
  Frey: { name: 'Frey', rarity: 'C', emoji: '<:frey:1571309910673592380>', weight: 40, normalRate: 1000, shinyRate: 500000 },

  // U (25%)
  Mer: { name: 'Mer', rarity: 'U', emoji: '<:mer:1571309847293460510>', weight: 25, normalRate: 7000, shinyRate: 5000000 },
  Betty: { name: 'Betty', rarity: 'U', emoji: '<:betty:1571310808049127565>', weight: 25, normalRate: 10000, shinyRate: 15000000 },
  Tina: { name: 'Tina', rarity: 'U', emoji: '<:tina:1571310933505085540>', weight: 25, normalRate: 13000, shinyRate: 25000000 },
  Ley: { name: 'Ley', rarity: 'U', emoji: '<:ley:1571311143757291592>', weight: 25, normalRate: 20000, shinyRate: 50000000 },

  // R (10%)
  Kazuto: { name: 'Kazuto', rarity: 'R', emoji: '<:kazuto:1571309601872412843>', weight: 10, normalRate: 50000, shinyRate: 80000000 },
  Ellie: { name: 'Ellie', rarity: 'R', emoji: '<:ellie:1571310327746793532>', weight: 10, normalRate: 100000, shinyRate: 150000000 },
  Kriz: { name: 'Kriz', rarity: 'R', emoji: '<:kriz:1571310094048694292>', weight: 10, normalRate: 150000, shinyRate: 300000000 },
  Hajime: { name: 'Hajime', rarity: 'R', emoji: '<:hajime:1571310497066782951>', weight: 10, normalRate: 300000, shinyRate: 500000000 },

  // SR (3%)
  Pem: { name: 'Pem', rarity: 'SR', emoji: '<:pem:1571310654713896990>', weight: 3, normalRate: 500000, shinyRate: 1000000000 },
  Al_Mezu: { name: 'Al_Mezu', rarity: 'SR', emoji: '<:al_mezu:1571309748970717285>', weight: 3, normalRate: 750000, shinyRate: 3000000000 },
  Ev_Kazuto: { name: 'Ev_Kazuto', rarity: 'SR', emoji: '<:ev_kazuto:1571309671468241059>', weight: 3, normalRate: 1000000, shinyRate: 10000000000 },

  // SRR (0.005%)
  Miku: { name: 'Miku', rarity: 'SRR', emoji: '<:miku:1571310441307705446>', weight: 0.005, normalRate: 1000000, shinyRate: 30000000000 },
  Cute_Lily: { name: 'Cute_Lily', rarity: 'SRR', emoji: '<:cute_lily:1571311234131824740>', weight: 0.005, normalRate: 10000000, shinyRate: 50000000000 },
  Angry_Angela: { name: 'Angry_Angela', rarity: 'SRR', emoji: '<:angry_angela:1571310235182698598>', weight: 0.005, normalRate: 50000000, shinyRate: 100000000000 },

  // UTR (0.0001%)
  Nyxzin: { name: 'Nyxzin', rarity: 'UTR', emoji: '<:nyxzin:1571311098114609202>', weight: 0.0001, normalRate: 50000000000, shinyRate: 50000000000000 },
  Nyrin: { name: 'Nyrin', rarity: 'UTR', emoji: '<:nyrin:1571310593544032459>', weight: 0.0001, normalRate: 1000000000, shinyRate: 100000000000000 }
};

const RARITY_ICONS = {
  C: '<:common:1571309159679262720>',
  U: '<:uncommon:1571309216000377015>',
  R: '<:rare:1571309272854171708>',
  SR: '<:sr:1571309375895769159>',
  SRR: '<:srr:1571309440614006975>',
  UTR: '<:utr:1571309497547358218>'
};

const SHINY_ICON = '<:shiny:1571311476239630517>';

// Helper to initialize user profile
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
    saveData(db);
  }
}

// --- COMMAND REGISTRATION ---
const commands = [
  new SlashCommandBuilder().setName('cstart').setDescription('Initialize your Chibi RPG profile'),
  new SlashCommandBuilder().setName('chelp').setDescription('Displays help menu and command categories'),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice to get Chibis')
    .addIntegerOption(opt => opt.setName('quantity').setDescription('Number of dice to roll').setRequired(false)),
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
  // Admin Commands
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

// --- MIDDLEWARE CHECKER ---
function checkStarted(interaction) {
  ensureUser(interaction.user.id);
  const user = db.users[interaction.user.id];
  if (!user.started && interaction.commandName !== 'cstart' && interaction.commandName !== 'chelp') {
    interaction.reply({ content: '❌ You must type `/cstart` before using any bot commands!', ephemeral: true });
    return false;
  }
  return true;
}

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!checkStarted(interaction)) return;
  const userId = interaction.user.id;
  const user = db.users[userId];

  try {
    // 1. /cstart
    if (interaction.commandName === 'cstart') {
      if (user.started) {
        return interaction.reply({ content: '⚠️ You have already started your Chibi RPG journey!', ephemeral: true });
      }
      user.started = true;
      user.dice += 20; // welcome gift
      saveData(db);
      return interaction.reply({ content: '🎉 Welcome to Chibi RPG RNG! You have been awarded **20x Dice** 🎲 and your profile is initialized. Use `/chelp` to begin!', ephemeral: false });
    }

    // 2. /chelp
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

    // 3. /roll
    if (interaction.commandName === 'roll') {
      const qty = interaction.options.getInteger('quantity') || 1;
      if (user.dice < qty) {
        return interaction.reply({ content: `❌ You don't have enough dice! You need ${qty} 🎲, but you only have ${user.dice} 🎲. Use \`/cdrop\` to get more!`, ephemeral: true });
      }
      user.dice -= qty;

      let resultsSummary = [];
      for (let i = 0; i < qty; i++) {
        // Roll rarity based on drop rates
        const rNum = Math.random() * 100;
        let chosenRarity = 'C';
        if (rNum <= 0.00001) chosenRarity = 'UTR';
        else if (rNum <= 0.005) chosenRarity = 'SRR';
        else if (rNum <= 3) chosenRarity = 'SR';
        else if (rNum <= 10) chosenRarity = 'R';
        else if (rNum <= 25) chosenRarity = 'U';
        else chosenRarity = 'C';

        // Filter chibis by rarity
        const availableChibis = Object.values(CHIBIS).filter(c => c.rarity === chosenRarity);
        const chibiTemplate = availableChibis[Math.floor(Math.random() * availableChibis.length)];

        // Check Shiny & Spray/Clover buffs
        let isShiny = Math.random() * chibiTemplate.shinyRate < 1;
        resultsSummary.push({ chibi: chibiTemplate, isShiny, date: new Date().toLocaleDateString() });

        // Save to collection/inventory
        user.inventory.chibis.push({
          id: Math.random().toString(36.substring(2, 9)),
          name: chibiTemplate.name,
          rarity: chosenRarity,
          emoji: chibiTemplate.emoji,
          isShiny,
          level: 1,
          exp: 0,
          date: new Date().toLocaleDateString()
        });

        // Track best roll
        if (chibiTemplate.shinyRate > user.bestRollVal) {
          user.bestRollVal = chibiTemplate.shinyRate;
          user.bestRoll = `1 in ${chibiTemplate.shinyRate.toLocaleString()}`;
          user.bestChibi = chibiTemplate.emoji;
        }
      }

      saveData(db);

      const embed = new EmbedBuilder()
        .setTitle('🎲 Chibi Roll Results')
        .setColor('#57f287')
        .setDescription(resultsSummary.map(r => `${RARITY_ICONS[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON + ' (Shiny!)' : ''} [${r.chibi.rarity}]`).join('\n'))
        .setFooter({ text: `Remaining Dice: ${user.dice} 🎲` });

      return interaction.reply({ embeds: [embed] });
    }

    // 4. /cdrop
    if (interaction.commandName === 'cdrop') {
      const now = Date.now();
      if (now - user.lastDrop < 10000) {
        const timeLeft = Math.ceil((10000 - (now - user.lastDrop)) / 1000);
        return interaction.reply({ content: `⏳ Please wait ${timeLeft} more seconds before claiming your next Chibi Drop!`, ephemeral: true });
      }
      user.lastDrop = now;

      // Drop chances
      const dNum = Math.random() * 100;
      let rewardDice = 1;
      let dropName = '😔 Normal Drop';
      if (dNum <= 0.001) { rewardDice = 50; dropName = '☠️ Extreme Drop'; }
      else if (dNum <= 1) { rewardDice = 10; dropName = '🍀 Legendary Drop'; }
      else if (dNum <= 3) { rewardDice = 5; dropName = '💎 Epic Drop'; }
      else if (dNum <= 10) { rewardDice = 3; dropName = '🎉 Rare Drop'; }

      user.dice += rewardDice;
      saveData(db);

      return interaction.reply({ content: `${dropName}! You received **${rewardDice}x Dice** 🎲! Total dice: ${user.dice}` });
    }

    // 5. /cinventory
    if (interaction.commandName === 'cinventory') {
      const chibiList = user.inventory.chibis.map((c, i) => `${i+1}. ${c.emoji} **${c.name}** (${c.rarity}) ${c.isShiny ? SHINY_ICON : ''} - Lv.${c.level}`).slice(0, 15).join('\n') || 'No chibis collected yet.';
      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
        .setColor('#3498db')
        .addFields(
          { name: '🎲 Dice', value: `${user.dice} 🎲`, inline: true },
          { name: '🧴 Spray', value: `${user.inventory.items.spray} 🧴`, inline: true },
          { name: '🍀 Clover', value: `${user.inventory.items.clover} 🍀`, inline: true },
          { name: '✨ Chibis (Showing first 15)', value: chibiList }
        );
      return interaction.reply({ embeds: [embed] });
    }

    // 6. /cshop
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
          saveData(db);
          await i.update({ content: `✅ Successfully purchased Spray! Current inventory: ${user.inventory.items.spray} Spray uses.`, components: [] });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.reply({ content: '❌ Not enough dice!', ephemeral: true });
          user.dice -= 15;
          user.inventory.items.clover += 50;
          saveData(db);
          await i.update({ content: `✅ Successfully purchased Clover! Current inventory: ${user.inventory.items.clover} Clover uses.`, components: [] });
        }
      });
      return;
    }

    // 7. /collections
    if (interaction.commandName === 'collections') {
      const collectionText = user.inventory.chibis.map(c => `[${c.rarity}] - [${c.name} ${c.emoji}] ${c.isShiny ? SHINY_ICON : ''} (${c.date})`).join('\n') || 'Your collection is empty.';
      const embed = new EmbedBuilder()
        .setTitle(`📖 ${interaction.user.username}'s Chibi Collection`)
        .setColor('#9b59b6')
        .setDescription(collectionText.length > 4000 ? collectionText.substring(0, 3996) + '...' : collectionText);
      return interaction.reply({ embeds: [embed] });
    }

    // 8. /cstats
    if (interaction.commandName === 'cstats') {
      if (!user.equippedChibi) {
        return interaction.reply({ content: '❌ You do not have a chibi equipped! Use `/cequipteam` first.', ephemeral: true });
      }
      const chibi = user.inventory.chibis.find(c => c.id === user.equippedChibi);
      if (!chibi) return interaction.reply({ content: '❌ Equipped chibi not found in inventory.', ephemeral: true });

      // Base stats calculation
      let hp = 120, atk = 6, def = 3;
      if (chibi.rarity === 'U') { hp = 150; atk = 9; def = 5; }
      if (chibi.rarity === 'R') { hp = 180; atk = 12; def = 7; }
      if (chibi.rarity === 'SR') { hp = 210; atk = 21; def = 13; }
      if (chibi.rarity === 'SRR') { hp = 270; atk = 26; def = 18; }
      if (chibi.rarity === 'UTR') { hp = 350; atk = 55; def = 30; }

      if (chibi.isShiny) {
        hp *= 1.5; atk *= 2; def *= 2;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${chibi.emoji} ${chibi.name} Stats (${chibi.rarity} ${chibi.isShiny ? SHINY_ICON : ''})`)
        .setColor('#e67e22')
        .addFields(
          { name: '❤️ HP', value: `${hp + (chibi.level * 4)}`, inline: true },
          { name: '🗡️ Attack', value: `${atk + (chibi.level * 2)}`, inline: true },
          { name: '🛡️ Defense', value: `${def + (chibi.level * 1)}`, inline: true },
          { name: '📊 Level / EXP', value: `Level ${chibi.level} (${chibi.exp}/1500 EXP)` }
        );
      return interaction.reply({ embeds: [embed] });
    }

    // 9. /cequipteam
    if (interaction.commandName === 'cequipteam') {
      const chibiId = interaction.options.getString('chibi_id');
      const slot = interaction.options.getInteger('slot');
      if (slot < 1 || slot > 3) return interaction.reply({ content: '❌ Slot must be 1, 2, or 3.', ephemeral: true });

      const chibi = user.inventory.chibis.find(c => c.id === chibiId);
      if (!chibi) return interaction.reply({ content: '❌ Chibi ID not found in your inventory.', ephemeral: true });

      user.team[slot - 1] = chibi.id;
      user.equippedChibi = chibi.id; // set active equipped
      saveData(db);

      return interaction.reply({ content: `✅ Successfully equipped ${chibi.emoji} **${chibi.name}** to Team Slot ${slot}! Active stats linked.` });
    }

    // 10. /cbattle
    if (interaction.commandName === 'cbattle') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) {
        return interaction.reply({ content: '❌ You cannot battle yourself or a bot!', ephemeral: true });
      }
      ensureUser(opponent.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_battle').setLabel('Accept Battle').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decl_battle').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({ content: `<@${opponent.id}>, you have been challenged to a Chibi Battle by <@${userId}>!`, components: [row], fetchReply: true });

      const collector = msg.createMessageComponentCollector({ time: 20000 });
      collector.on('collect', async i => {
        if (i.user.id !== opponent.id) return i.reply({ content: 'This battle challenge is not for you!', ephemeral: true });
        if (i.customId === 'accept_battle') {
          const winner = Math.random() > 0.5 ? interaction.user : opponent;
          const loser = winner.id === userId ? opponent : interaction.user;
          db.users[winner.id].points += 150;
          saveData(db);
          await i.update({ content: `⚔️ **Battle Complete!** <@${winner.id}> emerged victorious against <@${loser.id}> and won 150 Points!`, components: [] });
        } else {
          await i.update({ content: `❌ <@${opponent.id}> declined the battle challenge.`, components: [] });
        }
      });
      return;
    }

    // 11. /cmeme
    if (interaction.commandName === 'cmeme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setImage(data.url)
        .setColor('#e74c3c')
        .setFooter({ text: `Subreddit: r/${data.subreddit}` });
      return interaction.reply({ embeds: [embed] });
    }

    // 12. /ctrivia
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
          saveData(db);
          m.reply('🎉 Correct! You earned 50 points!');
        } else {
          m.reply(`❌ Incorrect! The correct answer was **${selected.a}**.`);
        }
      });
      return;
    }

    // 13. /cprofile
    if (interaction.commandName === 'cprofile') {
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${interaction.user.username}'s RPG Profile`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor('#2ecc71')
        .addFields(
          { name: '📊 Level & EXP', value: `Level ${user.userLevel} (${user.userExp}/2,000 EXP)`, inline: true },
          { name: '🎲 Best Roll', value: `${user.bestRoll} ${user.bestChibi || ''}`, inline: true },
          { name: '🏆 Rank & Points', value: `Rank: ${user.rank} | Points: ${user.points}`, inline: true },
          { name: '🔰 Clan', value: user.clan || 'None', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    // 14. Clan Commands
    if (interaction.commandName === 'cclanlist') {
      const clanNames = Object.keys(db.clans);
      const clanListText = clanNames.map(c => `• **${c}** (Leader: <@${db.clans[c].leader}>, Members: ${db.clans[c].members.length})`).join('\n') || 'No clans available.';
      const embed = new EmbedBuilder().setTitle('🏛️ Available Clans').setDescription(clanListText).setColor('#34495e');
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ccreateclan') {
      const clanName = interaction.options.getString('clan_name');
      if (db.clans[clanName]) return interaction.reply({ content: '❌ Clan already exists!', ephemeral: true });
      db.clans[clanName] = {
        name: clanName,
        leader: userId,
        viceLeader: null,
        members: [userId]
      };
      user.clan = clanName;
      saveData(db);
      return interaction.reply({ content: `✅ Successfully created and joined clan **${clanName}**!` });
    }

    if (interaction.commandName === 'cclanjoin') {
      const clanName = interaction.options.getString('clan_name');
      if (!db.clans[clanName]) return interaction.reply({ content: '❌ Clan does not exist!', ephemeral: true });
      db.clans[clanName].members.push(userId);
      user.clan = clanName;
      saveData(db);
      return interaction.reply({ content: `✅ Successfully joined clan **${clanName}**!` });
    }

    if (interaction.commandName === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return interaction.reply({ content: '❌ You are not in a clan!', ephemeral: true });
      const clan = db.clans[user.clan];
      const leaderUser = await client.users.fetch(clan.leader).catch(() => ({ username: 'Unknown' }));
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

    // 15. /ctrade
    if (interaction.commandName === 'ctrade') {
      const target = interaction.options.getUser('target');
      if (target.bot || target.id === userId) return interaction.reply({ content: '❌ Invalid trade target.', ephemeral: true });
      return interaction.reply({ content: `🤝 Trade session requested with <@${target.id}>. Feature active!` });
    }

    // 16. Admin Commands
    if (interaction.commandName.startsWith('admin-')) {
      const ownerId = db.config.ownerId || userId; // auto set first user as owner if not set
      if (userId !== ownerId && !user.permissions) {
        return interaction.reply({ content: '❌ You do not have permission to use admin commands!', ephemeral: true });
      }

      if (interaction.commandName === 'admin-luck-event') {
        const mult = interaction.options.getNumber('multiplier');
        db.config.globalLuckMultiplier = mult;
        saveData(db);
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
        saveData(db);
        return interaction.reply({ content: `🎁 Admin granted ${amount} ${type} to <@${target.id}>.` });
      }

      if (interaction.commandName === 'admin-give-permission') {
        const target = interaction.options.getUser('target');
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        saveData(db);
        return interaction.reply({ content: `🛡️ Admin permissions granted to <@${target.id}>.` });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while executing this command.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);