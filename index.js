const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const {
  SEASON_LIST,
  ALL_VALID_COMMANDS,
  TESTER_ONLY_COMMANDS
} = require('./core/constants');

const {
  gameData,
  GameState,
  db,
  initDatabase,
  saveUsers
} = require('./core/database');

const {
  isTester,
  canSeeUnreleasedBeta,
  toSmallCaps,
  getRarityIconMap,
  updateUserRank,
  updatePeakRank,
  ensureUser,
  pushClanMail
} = require('./core/helpers');

const commandModules = [
  require('./commmands/admincommands'),
  require('./commmands/clancommands'),
  require('./commmands/corecommands'),
  require('./commmands/eventcommands'),
  require('./commmands/rpgcommands')
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const cooldowns = new Map();

client.once('ready', async () => {
  await initDatabase();
  console.log(`Logged in as ${client.user.tag}! Bot is ready. Loaded ${commandModules.length} command modules.`);

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
          if (rewardCfg) {
            pushClanMail(mId, {
              title: `Clan Season Reward (#${rank})`,
              body: `Your clan **${clanEntry.name}** finished Rank #${rank}! Reward: ${rewardCfg.qty}x ${rewardCfg.rarity} ${sampleChibi.emoji} ${sampleChibi.name}.`,
              category: 'Rewards',
              claimed: false,
              reward: {
                type: 'chibi',
                qty: rewardCfg.qty || 1,
                rarity: rewardCfg.rarity || 'SR',
                name: sampleChibi.name,
                emoji: sampleChibi.emoji
              }
            });
          } else {
            pushClanMail(mId, {
              title: `Clan Season Consolation (#${rank})`,
              body: `Your clan **${clanEntry.name}** finished Rank #${rank}! Reward: 100x 🎲 Dice.`,
              category: 'Rewards',
              claimed: false,
              reward: {
                type: 'dice',
                dice: 100
              }
            });
          }
        }
      }

      db.config.clanSeasonExpires = now + (30 * 24 * 60 * 60 * 1000);
      await saveUsers();
      console.log('Clan season expired! Rewards queued in clan mail.');
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
  let currentPrefix = (db.guildPrefixes && db.guildPrefixes[guildId]) || '+';
  if (/^[a-zA-Z]$/.test(currentPrefix)) {
    currentPrefix = '+';
  }

  if (!message.content.startsWith(currentPrefix)) return;

  const afterPrefix = message.content.slice(currentPrefix.length);
  if (!afterPrefix || afterPrefix.startsWith(' ')) return;

  const args = afterPrefix.trim().split(/ +/);
  let command = args.shift().toLowerCase();
  if (!command) return;

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
    ownersetstatus: 'ownersetstatus',
    oss: 'ownersetstatus',
    tf: 'testerfeatures',
    agb: 'admingivebadges',
    cp: 'cpromote',
    ced: 'ceditdesc'
  };
  if (shortcuts[command]) {
    command = shortcuts[command];
  }

  if (!ALL_VALID_COMMANDS.has(command)) return;

  const userId = message.author.id;

  const isOwner = () => {
    if (!db.config.ownerId) db.config.ownerId = userId;
    return userId === db.config.ownerId;
  };

  if (TESTER_ONLY_COMMANDS.has(command)) {
    if (!isTester(userId)) {
      return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
    }
  }

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

  const restrictedChannels = db.channelRestrictions[guildId] || [];
  const exemptCommands = [
    'enablec', 'disablec', 'prefixchange', 'pc', 'admincommands', 'ac', 'oc',
    'ownercommands', 'ownerresetdata', 'help', 'status', 'fixadmin', 'ownercl',
    'owneradminpermsrem', 'ownersecretpanel', 'event', 'ownerbotmaintenance',
    'adminrestoreall', 'ownersetstatus', 'testerpanel', 'addtester', 'removetester',
    'pubnewupd', 'testerfeatures', 'tf', 'admingivebadges', 'agb',
    'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced'
  ];
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

  if (!user.started && command !== 'help' && command !== 'status') {
    return message.reply(toSmallCaps(`❌ You must type ${currentPrefix}start before using any bot commands!`));
  }

  const isAdmin = () => isOwner() || user.permissions === true;
  const callerHasBetaView = canSeeUnreleasedBeta(userId) || Boolean(db.config.featuresPublished);
  const rarityIconsMap = getRarityIconMap(callerHasBetaView);

  const getDisplayName = async (uId) => {
    const uData = db.users[uId];
    if (uData && uData.customNickname) return uData.customNickname;
    try {
      const fetched = await client.users.fetch(uId);
      if (fetched) return fetched.username;
    } catch {}
    return 'Unknown User';
  };

  const ctx = {
    command,
    args,
    message,
    client,
    userId,
    guildId,
    currentPrefix,
    user,
    currentMs: Date.now(),
    isOwner,
    isAdmin,
    callerHasBetaView,
    rarityIconsMap,
    getDisplayName
  };

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

    for (const mod of commandModules) {
      if (Array.isArray(mod.commands) && mod.commands.includes(command)) {
        const handled = await mod.execute(ctx);
        if (handled) return;
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