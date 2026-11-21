const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder,
  AttachmentBuilder, MessageFlags, PermissionsBitField
} = require('discord.js');
const fetch = require('node-fetch');
const mongoose = require('mongoose');

const {
  BADGE_CATALOG, BETA_EMOJIS, CLAN_ROLE_HIERARCHY, CLAN_LOGOS, EVENT_ICONS, EVENT_NPCS,
  EVENT_CHIBIS_POOL, SEASON_LIST, TRIVIA_BANK, SHINY_ICON, RARITY_HIERARCHY, ALL_VALID_COMMANDS,
  TESTER_ONLY_COMMANDS
} = require('./core/constants');
const { gameData, GameState, db, initDatabase, saveUsers } = require('./core/database');
const {
  isTester, canSeeUnreleasedBeta, toSmallCaps, getRarityIconMap, updateUserRank, updatePeakRank,
  evaluateAndSyncUserBadges, ensureUser, getClanLogoDisplay, getClanLogoImageUrl,
  getClanLogoListText, getClanMemberRole, pushClanMail, parseDurationToMs, formatTimeRemaining,
  addExpAndLevelUp, parseOddsNumber
} = require('./core/helpers');
const { renderProfileCard, THEME_PALETTES, hasSupporterOrNitro } = require('./core/profilecard');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
  ]
});
const cooldowns = new Map();

client.once('ready', async () => {
  await initDatabase();
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);

  if (!db.config.mainGuildId && client.guilds.cache.size > 0) {
    const firstGuild = client.guilds.cache.first();
    db.config.mainGuildId = firstGuild.id;
    const state = await GameState.findById('main_state');
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
                type: 'chibi', qty: rewardCfg.qty || 1, rarity: rewardCfg.rarity || 'SR',
                name: sampleChibi.name, emoji: sampleChibi.emoji
              }
            });
          } else {
            pushClanMail(mId, {
              title: `Clan Season Consolation (#${rank})`,
              body: `Your clan **${clanEntry.name}** finished Rank #${rank}! Reward: 100x 🎲 Dice.`,
              category: 'Rewards',
              claimed: false,
              reward: { type: 'dice', dice: 100 }
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
    const state = await GameState.findById('main_state');
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
  if (/^[a-zA-Z]$/.test(currentPrefix)) currentPrefix = '+';

  if (!message.content.startsWith(currentPrefix)) return;
  const afterPrefix = message.content.slice(currentPrefix.length);
  if (!afterPrefix || afterPrefix.startsWith(' ')) return;

  const args = afterPrefix.trim().split(/ +/);
  let command = args.shift().toLowerCase();
  if (!command) return;

  const shortcuts = {
    h: 'help', r: 'roll', p: 'profile', inv: 'inventory', col: 'collections', d: 'drop', t: 'trade',
    slot: 'slot', pc: 'prefixchange', ec: 'enablec', dc: 'disablec', ac: 'admincommands',
    oc: 'ownercommands', ownercommands: 'ownercommands', ownerresetdata: 'ownerresetdata',
    cnn: 'customnn', ss: 'seasons', hss: 'higheststats', ownercl: 'ownercl',
    owneradminpermsrem: 'owneradminpermsrem', th: 'tradehistory', tradehistory: 'tradehistory',
    ccr: 'ccranks', ccranks: 'ccranks', rar: 'rarities', event: 'event', eshop: 'eshop',
    es: 'eshop', cadventure: 'eadventure', ca: 'eadventure', eadventure: 'eadventure', ea: 'eadventure',
    ecrystal: 'ecrystal', ownersetstatus: 'ownersetstatus', oss: 'ownersetstatus',
    tf: 'testerfeatures', agb: 'admingivebadges', cp: 'cpromote', ced: 'ceditdesc'
  };
  if (shortcuts[command]) command = shortcuts[command];
  if (!ALL_VALID_COMMANDS.has(command)) return;

  const userId = message.author.id;
  const isOwner = () => {
    if (!db.config.ownerId) db.config.ownerId = userId;
    return userId === db.config.ownerId;
  };

  if (TESTER_ONLY_COMMANDS.has(command) && !isTester(userId)) {
    return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
  }
  if (db.config.maintenanceMode && !isOwner()) {
    return message.reply(toSmallCaps('The bot currently under maintenance.'));
  }
  if (db.bannedUsers && db.bannedUsers[userId]) {
    const banInfo = db.bannedUsers[userId];
    if (banInfo.expires === 'permanent' || Date.now() < banInfo.expires) {
      return message.reply(toSmallCaps('❌ You are banned from using bot commands.'));
    }
    delete db.bannedUsers[userId];
    await saveUsers();
  }

  const restrictedChannels = db.channelRestrictions[guildId] || [];
  const exemptCommands = [
    'enablec', 'disablec', 'prefixchange', 'pc', 'admincommands', 'ac', 'oc', 'ownercommands',
    'ownerresetdata', 'help', 'status', 'fixadmin', 'ownercl', 'owneradminpermsrem',
    'ownersecretpanel', 'event', 'ownerbotmaintenance', 'adminrestoreall', 'ownersetstatus',
    'testerpanel', 'addtester', 'removetester', 'pubnewupd', 'testerfeatures', 'tf',
    'admingivebadges', 'agb', 'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced'
  ];
  if (restrictedChannels.length > 0 && restrictedChannels.includes(message.channel.id) && !exemptCommands.includes(command)) {
    return;
  }

  const cooldownAmount = 6000;
  const nowTime = Date.now();
  if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
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

  const buildProfileAttachmentForUser = async (targetUId, targetMemberObj, syncedBadgesList) => {
    ensureUser(targetUId);
    const tData = db.users[targetUId];
    updateUserRank(tData);

    const allSortedUsers = Object.entries(db.users)
      .map(([uId, uData]) => ({ uId, points: uData.points || 0 }))
      .sort((a, b) => b.points - a.points);
    const globalIndex = allSortedUsers.findIndex(u => u.uId === targetUId);
    const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';
    const joinedDateStr = tData.joinedDate || 'N/A';
    const displayName = tData.customNickname || targetMemberObj?.username || 'Player';

    const rarityCounts = { SSRP: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
    if (tData.inventory && tData.inventory.chibis) {
      tData.inventory.chibis.forEach(c => {
        if (rarityCounts[c.rarity] !== undefined) rarityCounts[c.rarity]++;
      });
    }

    const canUsePerk = hasSupporterOrNitro(tData, syncedBadgesList);
    const activeThemeKey = canUsePerk && tData.profileBgTheme && THEME_PALETTES[tData.profileBgTheme]
      ? tData.profileBgTheme
      : 'crystal';

    const cardBuffer = await renderProfileCard({
      targetUserData: {
        ...tData,
        profileBg: null,
        clanLogoId: tData.clan && db.clans[tData.clan]
          ? db.clans[tData.clan].logoId
          : null
      },
      targetMember: targetMemberObj,
      displayName,
      joinedDateStr,
      leaderboardPos,
      syncedBadges: syncedBadgesList,
      rarityCounts,
      rarityIconsMap: getRarityIconMap(false),
      betaEmojis: BETA_EMOJIS,
      useBetaStyle: Boolean(callerHasBetaView),
      themeKey: activeThemeKey,
      customBgUrl: tData.customBg || null
    });

    return new AttachmentBuilder(cardBuffer, { name: 'profile-card.png' });
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

    if (command === 'start') {
      if (user.started) return message.reply(toSmallCaps('⚠️ You have already started your Chibi RPG journey!'));

      if (isTester(userId)) {
        const startRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('beta_start_journey_btn').setEmoji('1572796405033214043')
            .setLabel(toSmallCaps('Start Journey')).setStyle(ButtonStyle.Success)
        );
        const startPromptMsg = await message.reply({
          content: toSmallCaps(`${BETA_EMOJIS.START_BTN} **Welcome to Chibi RPG RNG!**\nPress the Start button below to initialize your profile and claim your starter bundle.`),
          components: [startRow]
        });

        const startCollector = startPromptMsg.createMessageComponentCollector({ time: 30000, max: 1 });
        let pressed = false;

        startCollector.on('collect', async i => {
          if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
          if (i.user.id !== userId) {
            return i.followUp({ content: toSmallCaps('❌ Only the command user can press this Start button!'), ephemeral: true });
          }
          pressed = true;
          user.started = true;
          user.joinedDate = new Date().toLocaleDateString();
          user.dice += 50;
          if (!db.config.ownerId) db.config.ownerId = userId;
          if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
          updateUserRank(user);
          updatePeakRank(user);
          await evaluateAndSyncUserBadges(userId, user, message.guild);
          await saveUsers();

          await startPromptMsg.edit({
            content: toSmallCaps(`🎉 **Journey Initialized!** You have been awarded **x50 Dice** ${BETA_EMOJIS.DICE} and your Chibi RPG profile is now active.`),
            components: []
          }).catch(() => {});
        });

        startCollector.on('end', async () => {
          if (!pressed && !user.started) {
            await startPromptMsg.edit({
              content: toSmallCaps(`⏳ Start button expired. Type \`${currentPrefix}start\` again to begin.`),
              components: []
            }).catch(() => {});
          }
        });
        return;
      }

      user.started = true;
      user.joinedDate = new Date().toLocaleDateString();
      user.dice += 20;
      if (!db.config.ownerId) db.config.ownerId = userId;
      if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
      updateUserRank(user);
      updatePeakRank(user);
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();
      return message.reply(toSmallCaps('🎉 Welcome to Chibi RPG RNG! You have been awarded 20x Dice 🎲 and your profile is initialized.'));
    }

    if (!user.started && command !== 'help' && command !== 'status') {
      return message.reply(toSmallCaps(`❌ You must type ${currentPrefix}start before using any bot commands!`));
    }

    const isAdmin = () => isOwner() || user.permissions === true;

    if (command === 'addtester') {
      if (!isOwner() && !user.permissions) return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}addtester [@user]`));
      ensureUser(target.id);
      if (!db.config.testers) db.config.testers = [];
      if (!db.config.testers.includes(target.id)) {
        db.config.testers.push(target.id);
        db.config.pendingUpdatesCount = (db.config.pendingUpdatesCount || 0) + 1;
        await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`✅ Successfully added <@${target.id}> to the Beta Tester roster!`));
    }

    if (command === 'removetester') {
      if (!isOwner() && !user.permissions) return message.reply(toSmallCaps('❌ Only bot owners or admins can manage testers!'));
      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}removetester [@user]`));
      if (db.config.testers) {
        db.config.testers = db.config.testers.filter(id => id !== target.id);
        await saveUsers();
      }
      return message.reply(toSmallCaps(`❌ Successfully removed <@${target.id}> from the Beta Tester roster.`));
    }

    if (command === 'testerpanel') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ You do not have access to the tester panel.'));
      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🧪 Exclusive Beta Tester Panel\n\n` +
          `Welcome to the testing grounds! Here are your active preview controls & sandbox tools:\n` +
          `• \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — View all features active on beta users\n` +
          `• \`${currentPrefix}testerfeature\` — Test unreleased experimental mechanics\n` +
          `• \`${currentPrefix}profile\` (\`${currentPrefix}p\`) — Revamped Beta Profile + Badges System\n` +
          `• \`${currentPrefix}cpromote\` (\`${currentPrefix}cp\`) / \`${currentPrefix}kick\` / \`${currentPrefix}cannounce\` / \`${currentPrefix}cmail\` / \`${currentPrefix}ceditdesc\` — Beta Clan Suite\n` +
          `• Status: **TESTER BUILD ACTIVE** 🔬\n\n` +
          `*Thank you for helping test and refine Chibi RPG features before public release!*`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'testerfeatures') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🧪 Active Beta Tester Features List\n\n` +
          `1. **Revamped Beta Profile (\`${currentPrefix}p\` / \`${currentPrefix}profile\`)**\n` +
          `   • Clean User Status (Dice, Cash = 0, Streak, Level), Rank Stats, Badges & Collections Rarities\n` +
          `2. **Revamped Leaderboards (\`${currentPrefix}ranks\` & \`${currentPrefix}ccranks\` / \`${currentPrefix}ccr\`)**\n` +
          `   • Clean Global & Clan leaderboards with season end timers & automatic clan rewards\n` +
          `3. **Beta Clan Commands (\`${currentPrefix}cclaninfo\`, \`${currentPrefix}cpromote\`/\`${currentPrefix}cp\`, \`${currentPrefix}kick\`, \`${currentPrefix}cannounce\`, \`${currentPrefix}cmail\`, \`${currentPrefix}ceditdesc\`)**\n` +
          `   • Role hierarchy (Co-Leader, Officer, Deputy), member kicks, clan announcements, description & mail inbox\n` +
          `4. **Interactive Start Button (\`${currentPrefix}start\`)**\n` +
          `   • Pressable ${BETA_EMOJIS.START_BTN} Start button awarding **x50 Dice**\n` +
          `5. **Badge System & Owner Grant (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)**\n` +
          `   • Discord & Event/Stats badges with automatic requirement unlocks`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'admingivebadges') {
      if (!isOwner() && !user.permissions) return message.reply(toSmallCaps('❌ Only the bot owner or admins can use this command!'));
      const target = message.mentions.users.first();
      const badgeKeyArg = args[1] ? args[1].toLowerCase() : null;

      if (!target || !badgeKeyArg) {
        const discordLines = Object.values(BADGE_CATALOG).filter(b => b.category === 'Discord Category')
          .map(b => `${b.icon} **\`${b.key}\`** — ${b.description}`).join('\n');
        const eventLines = Object.values(BADGE_CATALOG).filter(b => b.category === 'Event & Stats Category')
          .map(b => `${b.icon} **\`${b.key}\`** — ${b.description}`).join('\n');

        const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# 🏅 Available Badges Catalog (\`${currentPrefix}admingivebadges\` / \`${currentPrefix}agb\`)\n\n**Usage:** \`${currentPrefix}admingivebadges [@user] [badge_key]\`\n\n**Discord Category:**\n`) +
            discordLines + toSmallCaps('\n\n**Event & Stats Category:**\n') + eventLines
          )
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const badgeDef = BADGE_CATALOG[badgeKeyArg];
      if (!badgeDef) {
        return message.reply(toSmallCaps(`❌ Unknown badge key \`${badgeKeyArg}\`! Type \`${currentPrefix}agb\` with no arguments to see all valid badge keys.`));
      }

      ensureUser(target.id);
      const targetData = db.users[target.id];
      if (!Array.isArray(targetData.badges)) targetData.badges = [];

      let actionText = '';
      if (targetData.badges.includes(badgeDef.key)) {
        targetData.badges = targetData.badges.filter(k => k !== badgeDef.key);
        actionText = `Removed ${badgeDef.icon} **${badgeDef.name}** from <@${target.id}>.`;
      } else {
        targetData.badges.push(badgeDef.key);
        actionText = `Granted ${badgeDef.icon} **${badgeDef.name}** to <@${target.id}>!`;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`✅ ${actionText}`));
    }

    if (command === 'pubnewupd') {
      if (!isOwner() && !user.permissions) return message.reply(toSmallCaps('❌ Only the bot owner or admins can publish updates!'));
      const pendingCount = db.config.pendingUpdatesCount || 0;
      if (db.config.featuresPublished === true && pendingCount === 0) {
        return message.reply(toSmallCaps('ℹ️ There is no new code or updates to publish right now. Everything is already fully up-to-date and live for public production!'));
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pubnewupd_confirm_yes').setLabel(toSmallCaps('Yes')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pubnewupd_confirm_no').setLabel(toSmallCaps('No')).setStyle(ButtonStyle.Danger)
      );
      const confirmMsg = await message.reply({
        content: toSmallCaps('⚠️ **Publish Confirmation**\nAre you sure you want to publish new updates to public production?'),
        components: [confirmRow]
      });

      const pubCollector = confirmMsg.createMessageComponentCollector({ time: 20000, max: 1 });
      let decided = false;

      pubCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command sender can confirm publishing updates!'), ephemeral: true });
        }
        decided = true;
        if (i.customId === 'pubnewupd_confirm_no') {
          await confirmMsg.edit({ content: toSmallCaps('❌ Update publishing cancelled. Unreleased features remain exclusive to beta testers.'), components: [] }).catch(() => {});
          return;
        }
        if (i.customId === 'pubnewupd_confirm_yes') {
          db.config.featuresPublished = true;
          db.config.pendingUpdatesCount = 0;
          await saveUsers();
          const container = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(toSmallCaps(
              `# 🚀 New Updates Published Successfully!\n\n` +
              `All recent tester features and updates have been automatically pushed to public production.\n` +
              `• Status: **LIVE FOR ALL USERS** 🟢\n` +
              `• Published by: <@${userId}>`
            ))
          );
          await confirmMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      });

      pubCollector.on('end', async () => {
        if (!decided) await confirmMsg.edit({ content: toSmallCaps('⏳ Publish confirmation timed out.'), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'testerfeature') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ Restricted to testers.'));
      return message.reply(toSmallCaps('🧪 Experimental Sandbox Feature: Working as intended!'));
    }

    if (command === 'ownercommands' || command === 'oc') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the primary bot owner can access owner commands!'));
      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 👑 Owner Control Center\n\n` +
          `• \`${currentPrefix}ownerbotmaintenance\` — Toggle bot maintenance mode\n` +
          `• \`${currentPrefix}ownersetstatus [@user] [status]\` — Set custom user game/activity status\n` +
          `• \`${currentPrefix}addtester [@user]\` — Add beta tester\n` +
          `• \`${currentPrefix}removetester [@user]\` — Remove beta tester\n` +
          `• \`${currentPrefix}testerpanel\` — Open beta tester panel\n` +
          `• \`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — List beta features\n` +
          `• \`${currentPrefix}admingivebadges [@user] [key]\` (\`${currentPrefix}agb\`) — Manage user badges\n` +
          `• \`${currentPrefix}pubnewupd\` — Publish new updates to public production\n` +
          `• \`${currentPrefix}ownerresetdata\` — Wipe all user data and reset everyone\n` +
          `• \`${currentPrefix}ownersecretpanel\` — View secret system statistics\n` +
          `• \`${currentPrefix}owneradminpermsrem\` — Revoke admin permissions from all users\n` +
          `• \`${currentPrefix}ownergivechibi [@user]\` — Gift exclusive SSRP event chibis\n` +
          `• \`${currentPrefix}adminsetclanrewards\` — Configure seasonal clan rewards\n` +
          `• \`${currentPrefix}fixadmin\` — Assign yourself as main owner & server`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'admincommands' || command === 'ac') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ You do not have administrator permissions to access this panel!'));
      const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🛡️ Administrator Operations Panel\n\n` +
          `• \`${currentPrefix}adminrestoreall\` — Restore and sync all user data profiles\n` +
          `• \`${currentPrefix}admingivebadges [@user] [key]\` (\`${currentPrefix}agb\`) — View/grant/remove badges\n` +
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
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'ownerbotmaintenance') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can toggle maintenance mode!'));
      db.config.maintenanceMode = !db.config.maintenanceMode;
      await saveUsers();
      const statusText = db.config.maintenanceMode ? 'ENABLED 🔴 (Bot locked for maintenance)' : 'DISABLED 🟢 (Bot is fully operational)';
      return message.reply(toSmallCaps(`🛠️ Maintenance mode successfully updated: ${statusText}`));
    }

    if (command === 'ownersetstatus') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can use ownersetstatus!'));
      const target = message.mentions.users.first();
      const statusText = args.slice(1).join(' ');
      if (!target || !statusText) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownersetstatus [@user] [status text]\nExample: ${currentPrefix}ownersetstatus @user VALORANT`));
      }
      ensureUser(target.id);
      db.users[target.id].customStatus = { text: statusText, timestamp: Date.now() };
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully set custom status for <@${target.id}> to **${statusText}**!`));
    }

    if (command === 'adminrestoreall') {
      if (!isAdmin()) return message.reply(toSmallCaps('❌ Only administrators can restore all user data!'));
      let restoredCount = 0;
      for (const uId of Object.keys(db.users)) {
        ensureUser(uId);
        updateUserRank(db.users[uId]);
        updatePeakRank(db.users[uId]);
        await evaluateAndSyncUserBadges(uId, db.users[uId], message.guild);
        restoredCount++;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`🔄 Successfully restored and synchronized data profiles for all **${restoredCount}** registered users!`));
    }

    if (command === 'ownerresetdata') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can execute data resets!'));
      for (const uId of Object.keys(db.users)) {
        db.users[uId] = {
          started: false, joinedDate: new Date().toLocaleDateString(), dice: 10, points: 0,
          rank: '<:unranked:1571314276071907519>', clan: null, customNickname: null,
          highestSeasonRank: '<:unranked:1571314276071907519>', highestSeasonPoints: 0,
          inventory: { chibis: [], items: { spray: 0, clover: 0 } }, team: [null, null, null],
          equippedChibi: null, bestRoll: 'None', bestRollTier: 0, bestRollVal: 0, bestChibi: null,
          userLevel: 1, userExp: 0, lastDrop: 0, todayDrops: 0, lastDaily: 0, streak: 0,
          permissions: (uId === db.config.ownerId ? true : false), customStatus: null, badges: [], clanMail: [],
          customBg: null, profileBg: null, profileBgTheme: 'crystal'
        };
      }
      db.clans = {};
      db.tradeHistories = {};
      if (db.config.eventCrystals) db.config.eventCrystals = {};
      await saveUsers();
      return message.reply(toSmallCaps('⚠️ OWNER NOTICE: All user data, inventories, teams, and stats have been completely reset! All users must use `+start` again.'));
    }

    if (command === 'event') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ The Beta Event is currently inactive!'));
      const crystals = db.config.eventCrystals?.[userId] || 0;
      const eventDescription = 'Welcome to the official Chibi RPG Beta Event! Embark on thrilling adventures, challenge mysterious wandering NPCs across the realm, battle rival players in the arena, and collect exclusive rare event chibis using event crystals to claim supreme glory and build the ultimate collection!';

      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
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
        ))
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

          const getTeamChibis = (u) => (u.team || [null, null, null]).map(id => {
            if (!id) return null;
            return u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
          });

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

          if (!db.config.eventCrystals) db.config.eventCrystals = {};

          if (isUserWinner) {
            rewardCrystal = 17;
            db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + rewardCrystal;
            if (Math.random() * 100 <= 0.1) {
              const droppedEventChibi = EVENT_CHIBIS_POOL[Math.floor(Math.random() * EVENT_CHIBIS_POOL.length)];
              const generatedId = new mongoose.Types.ObjectId().toString();
              if (!user.inventory.chibis) user.inventory.chibis = [];
              user.inventory.chibis.push({
                id: generatedId, chibiId: generatedId, name: droppedEventChibi.name, rarity: 'SSRP',
                emoji: droppedEventChibi.emoji, isShiny: true, level: 1, exp: 0, date: new Date().toLocaleDateString()
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
          await evaluateAndSyncUserBadges(userId, user, message.guild);
          await saveUsers();

          const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
          const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '⚔️';
          const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

          const resultContainer = new ContainerBuilder().setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(toSmallCaps(
              `# ⚔️ ADVENTURE BATTLE RESULT\n\n` +
              `OPPONENT: ${randomNpc.icon} ${randomNpc.name}\n` +
              `NPC CHIBI: ${npcRandomChibi.emoji} ${npcRandomChibi.name}\n` +
              `NPC STATS -> ${atkIcon} ATK: ${npcAtk} | ${hpIcon} HP: ${npcHp}\n` +
              `${defIcon} DEF: ${npcDef}\n\n` +
              `${isUserWinner ? '🏆 VICTORY! YOU DEFEATED THE NPC!' : '💔 DEFEATED BY THE NPC!'}\n` +
              `💎 CRYSTALS EARNED: +${rewardCrystal} ${EVENT_ICONS.CRYSTAL}\n` +
              `🎁 NPC DROP: ${npcDropText}\n` +
              `✨ EXP GAINED: +${awardedExp}`
            ))
          );
          await advMsg.edit({ content: '', components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) await advMsg.edit({ content: toSmallCaps(`⏳ Encounter with ${randomNpc.name} timed out.`), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'eshop') {
      if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
      const crystals = db.config.eventCrystals?.[userId] || 0;
      const shopItems = Object.values(db.config.eventShop).sort((a, b) => a.cost - b.cost);
      const shopLines = shopItems.map((item, idx) =>
        toSmallCaps(`**[${idx + 1}]** ${item.emoji} **${item.name}** — **${item.cost.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`)
      ).join('\n');

      const selectMenu = new StringSelectMenuBuilder().setCustomId('eshop_buy_select')
        .setPlaceholder(toSmallCaps('Select an event chibi to purchase'))
        .addOptions(shopItems.map(item => ({ label: `${item.name} (${item.cost} Crystals)`.slice(0, 100), value: item.id })));
      const row = new ActionRowBuilder().addComponents(selectMenu);

      const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 💎 Beta Event Crystal Shop\n\nYour Crystal Balance: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n*Select from the dropdown menu below to exchange your crystals for exclusive SSRP event chibis!*:\n\n`) +
          shopLines
        )
      );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your eshop session!'), ephemeral: true });

        if (i.customId === 'eshop_buy_select') {
          const item = db.config.eventShop[i.values[0]];
          const userCrystals = db.config.eventCrystals?.[userId] || 0;
          if (!item) return i.followUp({ content: toSmallCaps('❌ Item not found!'), ephemeral: true });
          if (userCrystals < item.cost) {
            return i.followUp({ content: toSmallCaps(`❌ You need **${item.cost}** ${EVENT_ICONS.CRYSTAL}, but you only have **${userCrystals}** ${EVENT_ICONS.CRYSTAL}!`), ephemeral: true });
          }

          if (!db.config.eventCrystals) db.config.eventCrystals = {};
          db.config.eventCrystals[userId] -= item.cost;
          const generatedId = new mongoose.Types.ObjectId().toString();
          if (!user.inventory.chibis) user.inventory.chibis = [];
          user.inventory.chibis.push({
            id: generatedId, chibiId: generatedId, name: item.name, rarity: 'SSRP',
            emoji: item.emoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
          });
          await evaluateAndSyncUserBadges(userId, user, message.guild);
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
        `${rarityIconsMap['C'] || '📦'} **Common (C)**\n• Normal Drop Rate: 20% (~1 in 2) | Shiny Drop Rate: 1%\n\n` +
        `${rarityIconsMap['U'] || '📦'} **Uncommon (U)**\n• Normal Drop Rate: 12% | Shiny Drop Rate: 0.10%\n\n` +
        `${rarityIconsMap['R'] || '📦'} **Rare (R)**\n• Normal Drop Rate: 7% | Shiny Drop Rate: 0.5%\n\n` +
        `${rarityIconsMap['SR'] || '📦'} **Super Rare (SR)**\n• Normal Drop Rate: 1% | Shiny Drop Rate: 0.1%\n\n` +
        `${rarityIconsMap['SRR'] || '📦'} **Super Rare Rare (SRR)**\n• Normal Drop Rate: 0.10% | Shiny Drop Rate: 0.0010%\n\n` +
        `${rarityIconsMap['UTR'] || '📦'} **Ultra Rare (UTR)**\n• Normal Drop Rate: 0.001% | Shiny Drop Rate: 0.0001%`;

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps('# 📊 Chibi Rarities & Drop Rates\n\n') + raritiesInfo)
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

    if (command === 'profilebg') {
      if (!Array.isArray(user.badges)) user.badges = [];
      const syncedBadges = await evaluateAndSyncUserBadges(userId, user, message.guild);
      const canUseBgPerk = hasSupporterOrNitro(user, syncedBadges);

      const input = args.join(' ').trim();
      if (!input) {
        const currentTheme = user.profileBgTheme && THEME_PALETTES[user.profileBgTheme] ? user.profileBgTheme : 'crystal';
        const availableThemes = Object.keys(THEME_PALETTES).map(k => `\`${k}\``).join(', ');
        return message.reply(toSmallCaps(
          `🎨 **Profile Background Customizer (Supporter & Nitro Perk)**\n` +
          `Current Theme: **${currentTheme}** | Status: ${canUseBgPerk ? '✅ Unlocked' : '🔒 Locked (Requires Supporter or Nitro badge)'}\n` +
          `Themes: ${availableThemes}\n` +
          `Usage: \`${currentPrefix}profilebg <theme>\` or \`${currentPrefix}profilebg clear\``
        ));
      }

      if (input.toLowerCase() === 'clear' || input.toLowerCase() === 'reset') {
        user.profileBg = null;
        user.profileBgTheme = 'crystal';
        await saveUsers();
        return message.reply(toSmallCaps('✅ Cleared your custom profile background and reset to default!'));
      }

      if (!canUseBgPerk) {
        return message.reply(
          toSmallCaps('❌ Customizing your profile background is only available for users with the **Supporter** or **Nitro** badge!')
        );
      }

      const chosenTheme = input.toLowerCase();
      if (!THEME_PALETTES[chosenTheme]) {
        const validThemes = Object.keys(THEME_PALETTES).map(k => `\`${k}\``).join(', ');
        return message.reply(toSmallCaps(`❌ Unknown theme! Choose from: ${validThemes} or use \`${currentPrefix}profilebg clear\`.`));
      }

      user.profileBg = null;
      user.profileBgTheme = chosenTheme;
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated your profile background theme to **${chosenTheme}**!`));
    }

    if (command === 'setbg') {
      if (!Array.isArray(user.badges)) user.badges = [];
      const syncedBadges = await evaluateAndSyncUserBadges(userId, user, message.guild);
      const canUseBgPerk = hasSupporterOrNitro(user, syncedBadges);

      if (!canUseBgPerk) {
        return message.reply(
          toSmallCaps('❌ Custom profile image backgrounds are exclusively for **Beta Supporter** and **Nitro** badge holders!')
        );
      }

      const subArg = (args[0] || '').trim().toLowerCase();

      if (subArg === 'clear' || subArg === 'reset' || subArg === 'remove') {
        user.customBg = null;
        await saveUsers();
        return message.reply(toSmallCaps('✅ Cleared your custom profile background image!'));
      }

      const downloadAttachmentAsDataUri = async (attachment) => {
        try {
          const res = await fetch(attachment.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 DiscordBot' }
          });
          if (!res.ok) return attachment.url;
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length || buf.length > 2.5 * 1024 * 1024) {
            return attachment.url;
          }
          let mime = (res.headers.get('content-type') || attachment.contentType || '').split(';')[0].trim().toLowerCase();
          if (!mime.startsWith('image/')) {
            const extMatch = (attachment.name || attachment.url || '').match(/\.(png|jpe?g|webp|gif)(\?.*)?$/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
            mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          }
          return `data:${mime};base64,${buf.toString('base64')}`;
        } catch {
          return attachment.url;
        }
      };

      const resolveImageFromAttachmentOrUrl = async (attachment, rawUrl) => {
        if (attachment) {
          const isImageAttachment = attachment.contentType?.startsWith('image/');
          const hasImageExt = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(attachment.name || attachment.url || '');
          if (!isImageAttachment && !hasImageExt) {
            return { error: toSmallCaps('❌ Please upload a valid image file (`.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif`).') };
          }
          const persistedSource = await downloadAttachmentAsDataUri(attachment);
          return { url: persistedSource };
        }

        let parsedUrl;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          return { error: toSmallCaps('❌ Please provide a valid image URL (`https://...`), attach an image, or click **Upload File**!') };
        }

        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          return { error: toSmallCaps('❌ Image URL must start with `http://` or `https://`.') };
        }

        let finalImageUrl = parsedUrl.toString();
        const hasImageExt = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(parsedUrl.pathname);

        if (!hasImageExt) {
          try {
            const pageRes = await fetch(finalImageUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const contentType = pageRes.headers.get('content-type') || '';

            if (contentType.startsWith('image/')) {
              finalImageUrl = pageRes.url || finalImageUrl;
            } else {
              const html = await pageRes.text();
              const ogMatch =
                html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                html.match(/https:\/\/i\.ibb\.co\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)/i);

              const extractedUrl = ogMatch ? (ogMatch[1] || ogMatch[0]).trim() : null;
              if (!extractedUrl) {
                return { error: toSmallCaps('❌ Could not find a direct image at that link. Use a direct `.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif` URL or click **Upload File**!') };
              }
              finalImageUrl = extractedUrl;
            }
          } catch {
            return { error: toSmallCaps('❌ Could not load that link. Use a direct `.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif` URL or click **Upload File**!') };
          }
        }

        return { url: finalImageUrl };
      };

      const attachPreviewButtonToMessage = async (targetMsg) => {
        const previewRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('setbg_preview_card_btn')
            .setLabel(toSmallCaps('Preview Card'))
            .setStyle(ButtonStyle.Success)
        );

        await targetMsg.edit({
          content: toSmallCaps(`✅ Custom profile background saved! Click **Preview Card** below or run \`${currentPrefix}p\`.`),
          components: [previewRow]
        }).catch(() => {});

        const previewCollector = targetMsg.createMessageComponentCollector({ time: 60000, max: 1 });
        let previewed = false;

        previewCollector.on('collect', async pi => {
          if (!pi.deferred && !pi.replied) await pi.deferUpdate().catch(() => {});
          if (pi.user.id !== userId) {
            return pi.followUp({ content: toSmallCaps('❌ Only the command sender can preview this card!'), ephemeral: true });
          }
          previewed = true;
          await targetMsg.edit({ components: [] }).catch(() => {});
          const cardAtt = await buildProfileAttachmentForUser(userId, message.author, syncedBadges);
          await message.channel.send({ files: [cardAtt] }).catch(() => {});
        });

        previewCollector.on('end', async () => {
          if (!previewed) {
            await targetMsg.edit({ components: [] }).catch(() => {});
          }
        });
      };

      const directAttachment = message.attachments?.first();
      if (directAttachment || subArg) {
        const resolved = await resolveImageFromAttachmentOrUrl(directAttachment, args[0]?.trim());
        if (resolved.error) {
          return message.reply(resolved.error);
        }
        user.customBg = resolved.url;
        await saveUsers();
        const savedMsg = await message.reply(toSmallCaps('✅ Saving custom profile background...'));
        await attachPreviewButtonToMessage(savedMsg);
        return;
      }

      const uploadRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setbg_upload_file_btn')
          .setLabel(toSmallCaps('Upload File'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setbg_clear_btn')
          .setLabel(toSmallCaps('Clear BG'))
          .setStyle(ButtonStyle.Secondary)
      );

      const promptMsg = await message.reply({
        content: toSmallCaps(
          `🖼️ **Custom Profile Background (Supporter & Nitro Perk)**\n` +
          `Current BG: ${user.customBg ? 'Set ✅' : 'None'}\n` +
          `Click **Upload File** below, attach an image with \`${currentPrefix}setbg\`, or pass an image URL.`
        ),
        components: [uploadRow]
      });

      const btnCollector = promptMsg.createMessageComponentCollector({ time: 30000, max: 1 });
      let clicked = false;

      btnCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) {
          return i.followUp({ content: toSmallCaps('❌ Only the command sender can use these buttons!'), ephemeral: true });
        }
        clicked = true;

        if (i.customId === 'setbg_clear_btn') {
          user.customBg = null;
          await saveUsers();
          await promptMsg.edit({
            content: toSmallCaps('✅ Cleared your custom profile background image!'),
            components: []
          }).catch(() => {});
          return;
        }

        if (i.customId === 'setbg_upload_file_btn') {
          await promptMsg.edit({
            content: toSmallCaps('📤 **Upload File Mode Active:** Please send or attach your background image in this channel within **30 seconds** (or type `cancel`).'),
            components: []
          }).catch(() => {});

          const msgCollector = message.channel.createMessageCollector({
            filter: m => m.author.id === userId && (m.attachments.size > 0 || m.content.trim().toLowerCase() === 'cancel'),
            time: 30000,
            max: 1
          });

          let received = false;

          msgCollector.on('collect', async m => {
            received = true;
            if (m.content.trim().toLowerCase() === 'cancel') {
              await m.delete().catch(() => {});
              return promptMsg.edit({ content: toSmallCaps('❌ Background upload cancelled.'), components: [] }).catch(() => {});
            }

            const uploadedAtt = m.attachments.first();
            const resolved = await resolveImageFromAttachmentOrUrl(uploadedAtt, null);
            await m.delete().catch(() => {});

            if (resolved.error) {
              return promptMsg.edit({ content: resolved.error, components: [] }).catch(() => {});
            }

            user.customBg = resolved.url;
            await saveUsers();
            await attachPreviewButtonToMessage(promptMsg);
          });

          msgCollector.on('end', async () => {
            if (!received) {
              await promptMsg.edit({
                content: toSmallCaps(`⏳ Upload timed out. Run \`${currentPrefix}setbg\` again to try once more.`),
                components: []
              }).catch(() => {});
            }
          });
        }
      });

      btnCollector.on('end', async () => {
        if (!clicked) {
          await promptMsg.edit({ components: [] }).catch(() => {});
        }
      });
      return;
    }

    if (command === 'seasons') {
      const currentSeasonNum = db.config.seasonNumber || 1;
      const currentSeasonData = SEASON_LIST[currentSeasonNum] || { name: `Season ${currentSeasonNum}`, start: 'Active' };
      const timeRemainingMs = Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now());
      const seasonTimerStr = formatTimeRemaining(timeRemainingMs);
      const seasonLines = Object.entries(SEASON_LIST).map(([num, s]) => {
        const activeMarker = parseInt(num, 10) === currentSeasonNum ? ' 🟢 (Active)' : '';
        return toSmallCaps(`• ${s.name}${activeMarker}\n  Begin In: ${s.start}`);
      }).join('\n\n');

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 📅 Chibi RPG Seasons\n\nCurrent Active: ${currentSeasonData.name}\nTime Until Reset: ${seasonTimerStr}\n\n-----------------------------------\n\n`) +
          seasonLines
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'higheststats') {
      updatePeakRank(user);
      const peakRank = user.highestSeasonRank || '<:unranked:1571314276071907519>';
      const peakPoints = user.highestSeasonPoints || 0;
      const displayName = user.customNickname || message.author.username;

      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 🏆 ${displayName}'s Highest Stats (Last Season)\n\nHighest Rank Icon: `) +
          `${peakRank}` +
          toSmallCaps(`\nHighest Points Reached: ${peakPoints.toLocaleString()} Points\n\n*Stats snapshotted from previous competitive season.*`)
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'help') {
      const betaHelpSection = isTester(userId)
        ? toSmallCaps('🧪 **Beta Tester Exclusive Commands**\n') +
          `\`${currentPrefix}testerpanel\` — Open Beta Tester Panel\n` +
          `\`${currentPrefix}testerfeatures\` (\`${currentPrefix}tf\`) — List active beta features\n` +
          `\`${currentPrefix}admingivebadges\` (\`${currentPrefix}agb\`) — View/grant badges\n` +
          `\`${currentPrefix}cpromote\` (\`${currentPrefix}cp\`) [@user] — Promote clan member\n` +
          `\`${currentPrefix}kick\` [@user] [reason] — Kick member from clan\n` +
          `\`${currentPrefix}cannounce\` [msg] — Announce to clan mail\n` +
          `\`${currentPrefix}ceditdesc\` (\`${currentPrefix}ced\`) [desc] — Edit clan description\n` +
          `\`${currentPrefix}cmail\` — View clan mail inbox\n\n`
        : '';

      const helpText =
        betaHelpSection +
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
        `\`${currentPrefix}profilebg\` — Customize profile background (Supporter/Nitro)\n` +
        `\`${currentPrefix}setbg\` — Set custom background image (Supporter/Nitro)\n` +
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

      const container = new ContainerBuilder().setAccentColor(0xff77aa)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps('# 🌸 Chibi RPG RNG — Help Center\nExplore the categories below:')))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(helpText));
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'status') {
      const ping = client.ws.ping;
      const uptimeSec = Math.floor(client.uptime / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🤖 Bot System Status & Info\n\n` +
          `📶 Latency / Ping: ${ping}ms\n` +
          `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
          `🌐 Connected Servers: ${client.guilds.cache.size} Servers\n` +
          `💻 Runtime: Node.js (Discord.js v14 - Components V2)\n` +
          `⚙️ Status: 🟢 Online & Operational (MongoDB Connected)`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'slot') {
      const bet = parseInt(args[0], 10);
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
        content: toSmallCaps(`🎰 Spinning Chibi Slot Machine for ${bet} 🎲...\n| 🔄 | 🔄 | 🔄 |`)
      });

      for (let step = 0; step < 3; step++) {
        await new Promise(resolve => setTimeout(resolve, 600));
        await slotMsg.edit({
          content: toSmallCaps(`🎰 Spinning...\n| ${getRandomChibiSymbol()} | ${getRandomChibiSymbol()} | ${getRandomChibiSymbol()} |`)
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
        resultText = toSmallCaps('❌ No matching chibis! Better luck next time!');
      }

      const winnings = Math.round(bet * payoutMultiplier);
      user.dice += winnings;
      user.points += pointsWon;
      updateUserRank(user);
      await saveUsers();

      const container = new ContainerBuilder().setAccentColor(payoutMultiplier > 0 ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🎰 Chibi Slot Machine Results\n\n| ${final1} | ${final2} | ${final3} |\n\n` +
          `${resultText}\n💰 Dice Payout: +${winnings} 🎲 | 🏆 Points Gained: +${pointsWon} Pts\n` +
          `🎲 Total Dice: ${user.dice} | 🏆 Total Points: ${user.points}`
        ))
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
      if (!user.lastDaily || currentMs - user.lastDaily > fortyEightHours) user.streak = 1;
      else user.streak = (user.streak || 0) + 1;

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
      const qty = Math.min(parseInt(args[0], 10) || 1, gameData.settings.maxRollQuantity);
      const boost = args[1] ? args[1].toLowerCase() : null;

      if (qty < 1) return message.reply(toSmallCaps('❌ Quantity must be at least 1.'));
      if (user.dice < qty) {
        return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice} 🎲.`));
      }
      if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };

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
          C: { normal: 20, shiny: 1 }, U: { normal: 12, shiny: 0.10 }, R: { normal: 7, shiny: 0.5 },
          SR: { normal: 1, shiny: 0.1 }, SRR: { normal: 0.10, shiny: 0.0010 }, UTR: { normal: 0.001, shiny: 0.0001 }
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
          user.inventory.chibis.push({
            id: generatedId, chibiId: generatedId, name: chibiTemplate.name, rarity: chibiTemplate.rarity,
            emoji: chibiTemplate.emoji, isShiny, level: 1, exp: 0, date: new Date().toLocaleDateString()
          });
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
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();

      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
      const luckNotice = activeLuckMultiplier > 1.0 ? toSmallCaps(`\n⚡ Active Luck Boost: ${activeLuckMultiplier}x`) : '';
      const container = new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# ${diceIcon} Chibi Roll Results\n\n`) +
          resultsSummary.map(r => `${rarityIconsMap[r.chibi.rarity]} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${r.duplicated ? '(🍀 Duplicated!)' : ''}`).join('\n') +
          toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!`) + luckNotice +
          toSmallCaps(`\n${diceIcon} Remaining Dice: ${user.dice}`)
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
      user.todayDrops = (user.todayDrops || 0) + 1;

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

      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
      return message.reply(toSmallCaps(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${chosenDrop.dice}x Dice** ${diceIcon}! Total dice: ${user.dice}`));
    }

    if (command === 'inventory') {
      if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };
      const sprays = user.inventory.items.spray || 0;
      const clovers = user.inventory.items.clover || 0;
      const displayName = user.customNickname || message.author.username;
      const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';

      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🎒 ${displayName}'s Inventory\n\n` +
          `${diceIcon} Dice: ${user.dice || 0}\n` +
          `🧴 Spray Boosts: ${sprays} Uses\n` +
          `🍀 Clover Boosts: ${clovers} Uses\n\n` +
          `*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
        ))
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
              rarity: c.rarity, emoji: c.emoji || '✨', name: c.name, isShiny: c.isShiny,
              date: c.date || 'Unknown Date', count: 0, firstId: uniqueId ? uniqueId.slice(-6) : 'unknown'
            };
          }
          grouped[key].count++;
        });
        const entries = Object.values(grouped);
        const rarityRank = { SSRP: 1, UTR: 2, SRR: 3, SR: 4, R: 5, U: 6, C: 7 };
        if (sortBy === 'rarity') entries.sort((a, b) => (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99));
        else if (sortBy === 'alpha') entries.sort((a, b) => a.name.localeCompare(b.name));
        return entries;
      };

      const renderColContainer = (page) => {
        const entries = getGroupedEntries();
        const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
        if (page >= totalPages) page = totalPages - 1;
        const start = page * itemsPerPage;
        const pageItems = entries.slice(start, start + itemsPerPage);
        const formatted = pageItems.map((e, idx) => {
          const badgeIcon = e.rarity === 'SSRP' ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
          const shinyIconPart = e.isShiny ? ` ${SHINY_ICON}` : '';
          return `**${start + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}**${shinyIconPart}${badgeIcon}`;
        }).join('\n') || toSmallCaps('Collection page empty.');

        const displayName = user.customNickname || message.author.username;
        const colIcon = callerHasBetaView ? BETA_EMOJIS.COLLECTIONS : '📖';
        const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            toSmallCaps(`# ${colIcon} ${displayName}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\nSort: ${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}\n\n`) +
            formatted +
            toSmallCaps(`\n\n*Unique Types: ${new Set(user.inventory.chibis.map(c => c.name)).size} | Total Owned: ${user.inventory.chibis.length}*`)
          )
        );
        return { container, totalPages };
      };

      const getColRows = (page, totalPages) => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sort_rarity').setLabel(toSmallCaps('Order by Rarity')).setStyle(sortBy === 'rarity' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('sort_alpha').setLabel(toSmallCaps('Order Alphabetical')).setStyle(sortBy === 'alpha' ? ButtonStyle.Success : ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('col_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('col_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        )
      ];

      const initialRender = renderColContainer(currentPage);
      const colMsg = await message.reply({
        components: [initialRender.container, ...getColRows(currentPage, initialRender.totalPages)],
        flags: MessageFlags.IsComponentsV2
      });

      const colCollector = colMsg.createMessageComponentCollector({ time: 120000 });
      colCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your collection session!'), ephemeral: true });
        if (i.customId === 'sort_rarity') { sortBy = 'rarity'; currentPage = 0; }
        else if (i.customId === 'sort_alpha') { sortBy = 'alpha'; currentPage = 0; }
        else if (i.customId === 'col_prev' && currentPage > 0) currentPage--;
        else if (i.customId === 'col_next') currentPage++;

        const updated = renderColContainer(currentPage);
        await colMsg.edit({ components: [updated.container, ...getColRows(currentPage, updated.totalPages)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'shop') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_spray').setLabel(toSmallCaps('Buy Spray (5 🎲)')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('buy_clover').setLabel(toSmallCaps('Buy Clover (15 🎲)')).setStyle(ButtonStyle.Success)
      );
      const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          '# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n' +
          '🧴 Spray (5 🎲): Use this for Awesome Chibi boost [30 Uses]\n' +
          '🍀 Clover (15 🎲): Use this to duplicate Chibis while rolling [50 Uses]'
        ))
      );
      const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

      const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });
        if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };

        if (i.customId === 'buy_spray') {
          if (user.dice < 5) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
          user.dice -= 5;
          user.inventory.items.spray += 30;
          updateUserRank(user);
          await saveUsers();
          return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`), ephemeral: true });
        } else if (i.customId === 'buy_clover') {
          if (user.dice < 15) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
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
      const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
      const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
      const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

      const teamLines = (user.team || [null, null, null]).map((chibiId, index) => {
        if (!chibiId) return toSmallCaps(`**[${index + 1}]** *Empty Slot* (Use ${currentPrefix}equipteam [id] ${index + 1})`);
        const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
        if (!chibi) return toSmallCaps(`**[${index + 1}]** *Chibi missing from inventory*`);

        const statConfig = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
        const hpVal = statConfig.hp + chibi.level * statConfig.hpPer;
        const atkVal = statConfig.atk + chibi.level * statConfig.atkPer;
        const defVal = statConfig.def + chibi.level * statConfig.defPer;
        const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
        const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
        const maxExp = baseExp + (chibi.level - 1) * perLvl;
        const shortId = (chibi.chibiId || chibi.id).slice(-6);
        const badgeIcon = chibi.rarity === 'SSRP' ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
        const shinyIconPart = chibi.isShiny ? ` ${SHINY_ICON}` : '';

        return (
          `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity] || '🌟'} ${chibi.emoji} **${chibi.name}**${shinyIconPart}${badgeIcon}\n` +
          `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
          `${hpIcon} HP: \`${hpVal}\` | ${defIcon} DEF: \`${defVal}\` | ${atkIcon} ATK: \`${atkVal}\`\n`
        );
      });

      const displayName = user.customNickname || message.author.username;
      const container = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
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
      return message.reply(toSmallCaps('🏆 Your current rank icon: ') + `${user.rank}`);
    }

    if (command === 'points') {
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`💰 Your current points balance is: **${user.points}** (Rank: `) + `${user.rank}` + ')');
    }

    if (command === 'ranks') {
      const allSortedUsers = Object.entries(db.users).map(([uId, uData]) => {
        updateUserRank(uData);
        return { uId, ...uData };
      }).sort((a, b) => b.points - a.points);

      const itemsPerPage = 10;
      let currentPage = 0;
      const totalPages = Math.max(1, Math.ceil(allSortedUsers.length / itemsPerPage));
      const seasonNum = db.config.seasonNumber || 1;
      const seasonMeta = SEASON_LIST[seasonNum] || { name: `Season ${seasonNum}` };
      const maxSeasonMs = 30 * 24 * 60 * 60 * 1000;
      const timeRemainingMs = Math.min(maxSeasonMs, Math.max(0, (db.config.seasonExpires || (Date.now() + maxSeasonMs)) - Date.now()));
      const seasonTimerStr = formatTimeRemaining(timeRemainingMs);

      const userGlobalIndex = allSortedUsers.findIndex(u => u.uId === userId);
      const userRankPos = userGlobalIndex !== -1 ? userGlobalIndex + 1 : 'Unranked';
      const userPointsDisplay = user.points || 0;
      const userRankIcon = user.rank || '<:unranked:1571314276071907519>';

      const getRanksRow = (page) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
      );

      if (callerHasBetaView) {
        const buildBetaRanksPageContent = async (page) => {
          const start = page * itemsPerPage;
          const lines = await Promise.all(allSortedUsers.slice(start, start + itemsPerPage).map(async (u, idx) => {
            const username = await getDisplayName(u.uId);
            let clanSubLine = '';
            if (u.clan && db.clans[u.clan]) {
              const clanObj = db.clans[u.clan];
              clanSubLine = `\n   ${getClanLogoDisplay(clanObj.logoId)} ` + toSmallCaps(u.clan.replace(/\*/g, ''));
            }
            return toSmallCaps(`**${start + idx + 1}.** @${username} | `) + `${u.rank}` + toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${(u.points || 0).toLocaleString()}`) + clanSubLine;
          }));
          return lines.join('\n\n') || toSmallCaps('No players on the leaderboard yet.');
        };

        const renderBetaRanksContainer = async (page) => new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${BETA_EMOJIS.CRR_TROPHY} ` + toSmallCaps(`**Chibi Global Leaderboard [${seasonMeta.name}]**\n`) +
            `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${seasonTimerStr} (Page ${page + 1}/${totalPages})\n\n`) +
            await buildBetaRanksPageContent(page) +
            toSmallCaps('\n\n____________________\n\n') +
            `${BETA_EMOJIS.USERS} ` + toSmallCaps('Your rank: ') + `${userRankIcon}` +
            toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${userPointsDisplay.toLocaleString()} (#${userRankPos})`)
          )
        );

        const initialContainer = await renderBetaRanksContainer(currentPage);
        const ranksMsg = await message.reply({ components: [initialContainer, getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 });
        const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
        ranksCollector.on('collect', async i => {
          if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
          if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });
          if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
          if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;
          const updatedContainer = await renderBetaRanksContainer(currentPage);
          await ranksMsg.edit({ components: [updatedContainer, getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
        return;
      }

      const buildRanksPageContent = async (page) => {
        const start = page * itemsPerPage;
        const lines = await Promise.all(allSortedUsers.slice(start, start + itemsPerPage).map(async (u, idx) => {
          const username = await getDisplayName(u.uId);
          let clanInfo = '';
          if (u.clan && db.clans[u.clan]) {
            const clanObj = db.clans[u.clan];
            clanInfo = ` | ${getClanLogoDisplay(clanObj.logoId)} ${u.clan.replace(/\*/g, '')}`.trim();
          }
          return toSmallCaps(`**${start + idx + 1}.** **${username}** — Rank: `) + `${u.rank}` + toSmallCaps(` | Points: **${u.points.toLocaleString()}**`) + clanInfo;
        }));
        return lines.join('\n') || toSmallCaps('No players on the leaderboard yet.');
      };

      const renderRanksContainer = async (page) => new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 🏆 Chibi Global Leaderboard Season ${seasonNum}\nEnd Season: ${seasonTimerStr}\n\n(Page ${page + 1}/${totalPages})\n\n`) +
          await buildRanksPageContent(page) +
          toSmallCaps('\n\n-----------------------------------\n👤 Your Rank: #') + `${userRankPos} | Rank: ` + `${userRankIcon}` + toSmallCaps(` | Points: ${userPointsDisplay.toLocaleString()}`)
        )
      );

      const initialContainer = await renderRanksContainer(currentPage);
      const ranksMsg = await message.reply({ components: [initialContainer, getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 });
      const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
      ranksCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });
        if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
        if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;
        const updatedContainer = await renderRanksContainer(currentPage);
        await ranksMsg.edit({ components: [updatedContainer, getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'ccranks') {
      const clanEntries = Object.entries(db.clans).map(([name, clan]) => {
        const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        return { name, clan, totalPoints };
      }).sort((a, b) => b.totalPoints - a.totalPoints);

      const maxClanSeasonMs = 30 * 24 * 60 * 60 * 1000;
      const timeRemainingMs = Math.min(maxClanSeasonMs, Math.max(0, (db.config.clanSeasonExpires || (Date.now() + maxClanSeasonMs)) - Date.now()));
      const clanTimerStr = formatTimeRemaining(timeRemainingMs);
      const rewards = db.config.clanRewards || {};

      const formatReward = (rNum) => {
        const rw = rewards[rNum];
        if (!rw) return '100x 🎲 Dice (Consolation)';
        const rIcon = rarityIconsMap[rw.rarity] || '📦';
        const sampleChibi = gameData.chibis.find(c => c.rarity === rw.rarity) || gameData.chibis[0];
        return `${rw.qty} ${rIcon} ${sampleChibi ? sampleChibi.emoji : rw.chibiEmoji}`;
      };

      const top10Lines = await Promise.all(clanEntries.slice(0, 10).map(async (c, idx) => {
        const leaderName = await getDisplayName(c.clan.leader);
        return toSmallCaps(`**${idx + 1}.** ${getClanLogoDisplay(c.clan.logoId)} ${c.name.replace(/\*/g, '')} | Leader: **${leaderName}** | Points: **${c.totalPoints.toLocaleString()}**`);
      }));

      let userClanLine = toSmallCaps('You are not currently in a clan.');
      if (user.clan && db.clans[user.clan]) {
        const uClanObj = db.clans[user.clan];
        const uClanRankIdx = clanEntries.findIndex(c => c.name === user.clan);
        const uClanRank = uClanRankIdx !== -1 ? `#${uClanRankIdx + 1}` : 'Unranked';
        const uClanPoints = uClanObj.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        const leaderName = await getDisplayName(uClanObj.leader);
        userClanLine = toSmallCaps(`${uClanRank}. ${getClanLogoDisplay(uClanObj.logoId)} ${user.clan.replace(/\*/g, '')} | Leader: **${leaderName}** | Members: ${uClanObj.members.length} | Points: **${uClanPoints.toLocaleString()}**`);
      }

      if (callerHasBetaView) {
        const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${BETA_EMOJIS.GLOBAL} ` + toSmallCaps('**Top 10 Global Clan Leaderboard**\n') +
            `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${clanTimerStr}\n\n`) +
            `${BETA_EMOJIS.RANKS_POS[1]}: ${formatReward(1)}\n${BETA_EMOJIS.RANKS_POS[2]}: ${formatReward(2)}\n${BETA_EMOJIS.RANKS_POS[3]}: ${formatReward(3)}\n\n` +
            toSmallCaps('-----------------------------------\n\n') +
            (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
            toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine
          )
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# 🏛️ Top 10 Global Clan Leaderboard\nEnds: ${clanTimerStr}\n\n**Clan Rewards:**\n1st: ${formatReward(1)}\n2nd: ${formatReward(2)}\n3rd: ${formatReward(3)}\n\n-----------------------------------\n\n`) +
          (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
          toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'equipteam') {
      const chibiIdArg = args[0];
      const slot = parseInt(args[1], 10);
      if (!chibiIdArg || isNaN(slot) || slot < 1 || slot > 3) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}equipteam [chibi_id or short id] [slot 1-3]\nExample: ${currentPrefix}equipteam a1b2c3 1`));
      }
      const chibi = user.inventory.chibis.find(c => {
        const uId = c.chibiId || c.id;
        return uId === chibiIdArg || uId.endsWith(chibiIdArg);
      });
      if (!chibi) return message.reply(toSmallCaps(`❌ Chibi ID not found in your inventory! Check ${currentPrefix}collections for correct IDs.`));

      const chibiUniqueId = chibi.chibiId || chibi.id;
      if (user.team.includes(chibiUniqueId)) {
        const existingSlot = user.team.indexOf(chibiUniqueId) + 1;
        if (existingSlot !== slot) {
          return message.reply(toSmallCaps(`❌ This Chibi is already equipped in Team Slot ${existingSlot}! You cannot equip the same Chibi in multiple slots.`));
        }
      }

      const wasEmpty = !user.team[slot - 1];
      user.team[slot - 1] = chibiUniqueId;
      if (slot === 1) user.equippedChibi = chibiUniqueId;

      let expMsg = '';
      if (wasEmpty) {
        const awardedExp = addExpAndLevelUp(user, chibi, 250);
        expMsg = toSmallCaps(`\n✨ Team slot bonus: +${awardedExp} EXP awarded to you and **${chibi.name}**!`);
      }
      updateUserRank(user);
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();

      return message.reply(toSmallCaps('✅ Successfully equipped ') + `${chibi.emoji} **${chibi.name}** ${chibi.isShiny ? SHINY_ICON : ''}` + toSmallCaps(` to Team Slot ${slot}!${expMsg}`));
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

          const getTeamChibis = (u) => (u.team || [null, null, null]).map(id => {
            if (!id) return null;
            return u.inventory.chibis.find(c => (c.chibiId || c.id) === id);
          });

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

          const p1Power = getTeamCombatStats(p1Team).totalPower * (0.85 + Math.random() * 0.3);
          const p2Power = getTeamCombatStats(p2Team).totalPower * (0.85 + Math.random() * 0.3);
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
          await evaluateAndSyncUserBadges(userId, p1User, message.guild);
          await evaluateAndSyncUserBadges(opponent.id, p2User, message.guild);
          await saveUsers();

          const p1Name = user.customNickname || message.author.username;
          const p2Name = db.users[opponent.id].customNickname || opponent.username;
          const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
          const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
          const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

          const renderTeamLineWithStats = (team, isWinnerTeam) => team.map((c, idx) => {
            if (!c) return toSmallCaps(`**[${idx + 1}]** *Empty Slot*`);
            const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
            const hp = statCfg.hp + c.level * statCfg.hpPer;
            const atk = statCfg.atk + c.level * statCfg.atkPer;
            const def = statCfg.def + c.level * statCfg.defPer;
            return toSmallCaps(`**[${idx + 1}]** `) + `${rarityIconsMap[c.rarity] || '📦'}` + ` ${c.emoji} **${c.name}** ${c.isShiny ? SHINY_ICON : ''}` + toSmallCaps(` (Lvl ${c.level}) — ${hpIcon} HP: \`${isWinnerTeam ? hp : 0}\` | ${atkIcon} ATK: \`${atk}\` | ${defIcon} DEF: \`${def}\``);
          }).join('\n');

          const container = new ContainerBuilder().setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              toSmallCaps(`# ⚔️ 3v3 Chibi Arena Clash Result\n\n🏆 Winner: <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n🛡️ ${p1Name}'s Team Lineup:\n`) +
              renderTeamLineWithStats(p1Team, isP1Winner) +
              toSmallCaps(`\n\n🛡️ ${p2Name}'s Team Lineup:\n`) +
              renderTeamLineWithStats(p2Team, !isP1Winner) +
              toSmallCaps(`\n\n📊 Match Rewards: ✨ Victor earned +${winReward.win} Points, +${totalExpWon} EXP & Crystals! 💔 Loser lost -${losePenalty.lose} Points.`)
            )
          );
          await battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } else {
          await battleMsg.edit({ content: toSmallCaps(`❌ <@${opponent.id}> declined the 3v3 arena clash.`), components: [] }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        if (!handled) await battleMsg.edit({ content: toSmallCaps('⏳ Arena clash request timed out (5s elapsed) and was automatically cancelled.'), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'meme') {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();
      const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(`# ${data.title}\n*(r/${data.subreddit})*`))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'trivia') {
      const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`));
      const collector = message.channel.createMessageCollector({ filter: m => m.author.id === userId, time: 15000, max: 1 });

      collector.on('collect', async m => {
        const userAnswer = m.content.toLowerCase().trim();
        if (selected.a.some(ans => userAnswer.includes(ans))) {
          const awardedPoints = Math.floor(Math.random() * 4) + 17;
          user.points += awardedPoints;
          const awardedExp = addExpAndLevelUp(user, null, 450);
          const triviaCrystals = Math.floor(Math.random() * 6) + 5;
          if (!db.config.eventCrystals) db.config.eventCrystals = {};
          db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + triviaCrystals;
          updateUserRank(user);
          await evaluateAndSyncUserBadges(userId, user, message.guild);
          await saveUsers();
          m.reply(toSmallCaps(`🎉 Correct! You earned +${awardedPoints} Points, +${awardedExp} EXP & +${triviaCrystals} Event Crystals ${EVENT_ICONS.CRYSTAL}!`));
        } else {
          m.reply(toSmallCaps(`❌ Incorrect! The correct answer was **${selected.a[0]}**.`));
        }
      });
      return;
    }

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

      const targetMember = targetUserMention || message.author;
      const syncedBadges = await evaluateAndSyncUserBadges(targetUserId, targetUserData, message.guild);
      await saveUsers();

      const attachment = await buildProfileAttachmentForUser(targetUserId, targetMember, syncedBadges);
      return message.reply({ files: [attachment] });
    }

    if (command === 'clanlist') {
      const clanNames = Object.keys(db.clans);
      if (clanNames.length === 0) return message.reply(toSmallCaps('🏛️ There are currently no clans available.'));
      let sortBy = 'points';

      const getSortedClanEntries = async () => {
        const entries = await Promise.all(clanNames.map(async name => {
          const clan = db.clans[name];
          return {
            name, leaderName: await getDisplayName(clan.leader),
            totalPoints: clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0),
            memberCount: clan.members.length, logoId: clan.logoId || '1'
          };
        }));
        entries.sort((a, b) => sortBy === 'points' ? b.totalPoints - a.totalPoints : b.memberCount - a.memberCount);
        return entries;
      };

      const renderClanContainer = async () => {
        const sortedEntries = await getSortedClanEntries();
        const clanListText = sortedEntries.map((c, idx) =>
          toSmallCaps(`${idx + 1}. ${getClanLogoDisplay(c.logoId)} ${c.name.replace(/\*/g, '')} | Leader: ${c.leaderName} | Points: 🏆 ${c.totalPoints.toLocaleString()} | Members: 👥 ${c.memberCount}`)
        ).join('\n');
        return new ContainerBuilder().setAccentColor(0x34495e).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# 🏛️ Available Clans\n\nSorted by: ${sortBy === 'points' ? 'Total Points' : 'Member Count'}\n\n`) + clanListText)
        );
      };

      const getClanRows = () => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sort_points').setLabel(toSmallCaps('Sort by Points 🏆')).setStyle(sortBy === 'points' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sort_members').setLabel(toSmallCaps('Sort by Members 👥')).setStyle(sortBy === 'members' ? ButtonStyle.Success : ButtonStyle.Secondary)
      )];

      const initialContainer = await renderClanContainer();
      const clanMsg = await message.reply({ components: [initialContainer, ...getClanRows()], flags: MessageFlags.IsComponentsV2 });
      const clanCollector = clanMsg.createMessageComponentCollector({ time: 120000 });
      clanCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your clan list session!'), ephemeral: true });
        if (i.customId === 'sort_points') sortBy = 'points';
        if (i.customId === 'sort_members') sortBy = 'members';
        const updatedContainer = await renderClanContainer();
        await clanMsg.edit({ components: [updatedContainer, ...getClanRows()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return;
    }

    if (command === 'ccreateclan') {
      const clanName = args[0]?.replace(/\*/g, '');
      const logoArg = args[1];
      if (!clanName || !logoArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ccreateclan [ClanName] [Logo ID 1-12]\n\nAvailable Clan Logos:\n` + getClanLogoListText()));
      }
      if (!CLAN_LOGOS[logoArg]) {
        return message.reply(toSmallCaps('❌ Invalid Logo ID! Please pick a number from 1 to 12 (ID 13+ is invalid).\n\nAvailable Clan Logos:\n' + getClanLogoListText()));
      }
      if (clanName.length > 12) return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      if (db.clans[clanName]) return message.reply(toSmallCaps('❌ A clan with this name already exists!'));

      const clanCreationCost = 100;
      if (user.dice < clanCreationCost) {
        return message.reply(toSmallCaps(`❌ You do not have enough dice to create a clan! You need **${clanCreationCost} 🎲 Dice**, but you only have **${user.dice} 🎲**.`));
      }

      user.dice -= clanCreationCost;
      db.clans[clanName] = {
        name: clanName, leader: userId, viceLeader: null, members: [userId],
        roles: { [userId]: 'Leader' }, description: '', logoId: logoArg, renameCount: 0
      };
      user.clan = clanName;
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully created and joined clan ${getClanLogoDisplay(logoArg)} **${clanName}**! (Cost: ${clanCreationCost} 🎲 Dice)`));
    }

    if (command === 'cclanjoin') {
      const clanName = args.join(' ').replace(/\*/g, '');
      if (!db.clans[clanName]) return message.reply(toSmallCaps('❌ Clan does not exist!'));
      if (db.clans[clanName].members.includes(userId)) return message.reply(toSmallCaps('⚠️ You are already in this clan!'));
      if (!db.clans[clanName].roles) db.clans[clanName].roles = {};
      db.clans[clanName].members.push(userId);
      db.clans[clanName].roles[userId] = 'Member';
      user.clan = clanName;
      pushClanMail(userId, {
        title: `Joined Clan ${clanName}`,
        body: `Welcome to **${clanName}**! Use \`${currentPrefix}cclaninfo\` to view members and \`${currentPrefix}cmail\` for clan notices.`,
        category: 'Status'
      });
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully joined clan ${clanName}!`));
    }

    if (command === 'clanleave') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      const clanName = user.clan;
      const clanObj = db.clans[clanName];
      if (clanObj.leader === userId && clanObj.members.length > 1) {
        return message.reply(toSmallCaps('❌ As the clan leader, you must transfer leadership or disband the clan before leaving!'));
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_leave').setLabel(toSmallCaps('Confirm Leave')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_leave').setLabel(toSmallCaps('Cancel')).setStyle(ButtonStyle.Secondary)
      );
      const leaveMsg = await message.reply({ content: toSmallCaps(`⚠️ Are you sure you want to leave your clan **${clanName}**?`), components: [confirmRow] });
      const leaveCollector = leaveMsg.createMessageComponentCollector({ time: 15000 });

      leaveCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your confirmation!'), ephemeral: true });

        if (i.customId === 'confirm_leave') {
          leaveCollector.stop();
          const targetClan = db.clans[clanName];
          if (targetClan) {
            targetClan.members = targetClan.members.filter(id => id !== userId);
            if (targetClan.roles) delete targetClan.roles[userId];
            if (targetClan.members.length === 0) delete db.clans[clanName];
          }
          user.clan = null;
          await saveUsers();
          return leaveMsg.edit({ content: toSmallCaps(`✅ Successfully left the clan **${clanName}**.`), components: [] }).catch(() => {});
        } else {
          leaveCollector.stop();
          return leaveMsg.edit({ content: toSmallCaps('❌ Clan leave request cancelled.'), components: [] }).catch(() => {});
        }
      });
      return;
    }

    if (command === 'clanrename') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not currently in any clan!'));
      const clanObj = db.clans[user.clan];
      if (clanObj.leader !== userId) return message.reply(toSmallCaps('❌ Only the clan leader can rename or change the clan logo!'));
      const currentRenameCount = clanObj.renameCount || 0;
      if (currentRenameCount >= 3) return message.reply(toSmallCaps('❌ Your clan has already reached the maximum limit of 3 renames/logo updates!'));

      const newNameArg = args[0]?.replace(/\*/g, '');
      const newLogoArg = args[1];
      if (!newNameArg || !newLogoArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}clanrename [NewClanName] [Logo ID 1-12]\n*(Renames left: ${3 - currentRenameCount}/3)*\n\nAvailable Clan Logos:\n` + getClanLogoListText()));
      }
      if (!CLAN_LOGOS[newLogoArg]) {
        return message.reply(toSmallCaps('❌ Invalid Logo ID! Please pick a number from 1 to 12 (ID 13+ is invalid).\n\nAvailable Clan Logos:\n' + getClanLogoListText()));
      }
      if (newNameArg.length > 12) return message.reply(toSmallCaps('❌ Clan name cannot exceed 12 characters!'));
      if (db.clans[newNameArg] && newNameArg !== user.clan) return message.reply(toSmallCaps('❌ A clan with this name already exists!'));

      const oldName = user.clan;
      db.clans[newNameArg] = { ...clanObj, name: newNameArg, logoId: newLogoArg, renameCount: currentRenameCount + 1 };
      if (oldName !== newNameArg) delete db.clans[oldName];
      for (const mId of db.clans[newNameArg].members) {
        if (db.users[mId]) db.users[mId].clan = newNameArg;
      }
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Successfully updated clan! Name: **${newNameArg}**, Logo: ${getClanLogoDisplay(newLogoArg)}\n*(Renames/Updates used: ${currentRenameCount + 1}/3)*`));
    }

    if (command === 'ceditdesc') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));

      const clanObj = db.clans[user.clan];
      const actorTier = CLAN_ROLE_HIERARCHY[getClanMemberRole(clanObj, userId)] || 0;
      if (actorTier < CLAN_ROLE_HIERARCHY['Co-Leader']) return message.reply(toSmallCaps('❌ Only the Clan Leader or Co-Leader can edit the clan description!'));

      const newDesc = args.join(' ').trim();
      if (!newDesc) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ceditdesc [description text] (or \`clear\` to reset)`));
      if (newDesc.length > 160) return message.reply(toSmallCaps('❌ Clan description cannot exceed 160 characters!'));

      clanObj.description = newDesc.toLowerCase() === 'clear' ? '' : newDesc;
      await saveUsers();
      const displayDesc = clanObj.description ? clanObj.description : 'No Description of the clan';
      return message.reply(toSmallCaps(`✅ Updated clan description for **${clanObj.name}**:\n`) + `${BETA_EMOJIS.CLAN_DESC}: ` + toSmallCaps(displayDesc));
    }

    if (command === 'cpromote') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));

      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      const actorTier = CLAN_ROLE_HIERARCHY[actorRole] || 0;
      if (actorTier < CLAN_ROLE_HIERARCHY.Officer) return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can promote members!'));

      const target = message.mentions.users.first();
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}cpromote [@user] (or \`${currentPrefix}cp [@user]\`)`));
      if (!clanObj.members.includes(target.id)) return message.reply(toSmallCaps('❌ That user is not a member of your clan!'));
      if (target.id === clanObj.leader) return message.reply(toSmallCaps('❌ You cannot change the Clan Leader role!'));

      const currentTargetRole = getClanMemberRole(clanObj, target.id);
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('cpromote_select_role').setPlaceholder(toSmallCaps('Select which position to promote to')).addOptions([
          { label: 'Co-Leader', description: 'Can kick members below Co-Leader (Officer & Deputy)', value: 'Co-Leader' },
          { label: 'Officer', description: 'Can kick members below Officer (Deputy & Member)', value: 'Officer' },
          { label: 'Deputy', description: 'Official clan member rank', value: 'Deputy' }
        ])
      );
      const promptMsg = await message.reply({
        content: toSmallCaps(`🎖️ **Clan Promotion UI**\nTarget: <@${target.id}> (Current: **${currentTargetRole}**)\nChoose which position you want to assign below:`),
        components: [row]
      });

      const collector = promptMsg.createMessageComponentCollector({ time: 25000, max: 1 });
      collector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Only the command sender can select the position!'), ephemeral: true });

        const chosenRole = i.values[0];
        if (actorRole !== 'Leader' && (CLAN_ROLE_HIERARCHY[chosenRole] || 0) >= actorTier) {
          return i.followUp({ content: toSmallCaps('❌ You cannot assign a position equal to or higher than your own rank!'), ephemeral: true });
        }
        if (!clanObj.roles) clanObj.roles = {};
        clanObj.roles[target.id] = chosenRole;
        clanObj.viceLeader = chosenRole === 'Co-Leader' ? target.id : (clanObj.viceLeader === target.id ? null : clanObj.viceLeader);
        pushClanMail(target.id, {
          title: `Clan Promotion in ${clanObj.name}`,
          body: `You have been assigned the position **${chosenRole}** in **${clanObj.name}**!`,
          category: 'Status'
        });
        await saveUsers();
        await promptMsg.edit({ content: toSmallCaps(`✅ <@${target.id}> has been set to **${chosenRole}** in clan **${clanObj.name}**!`), components: [] }).catch(() => {});
      });
      return;
    }

    if (command === 'kick') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));

      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      const actorTier = CLAN_ROLE_HIERARCHY[actorRole] || 0;
      if (actorTier < CLAN_ROLE_HIERARCHY.Officer) return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can kick clan members!'));

      const target = message.mentions.users.first();
      const reason = args.slice(1).join(' ') || 'No reason provided';
      if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}kick [@user] [reason]`));
      if (target.id === userId) return message.reply(toSmallCaps('❌ You cannot kick yourself!'));
      if (!clanObj.members.includes(target.id)) return message.reply(toSmallCaps('❌ That user is not in your clan!'));
      if (target.id === clanObj.leader) return message.reply(toSmallCaps('❌ You cannot kick the Clan Leader!'));

      const targetRole = getClanMemberRole(clanObj, target.id);
      if (actorRole !== 'Leader' && (CLAN_ROLE_HIERARCHY[targetRole] || 0) >= actorTier) {
        return message.reply(toSmallCaps(`❌ Your position (**${actorRole}**) cannot kick **${targetRole}**! You can only kick members below your rank.`));
      }

      const clanName = clanObj.name;
      clanObj.members = clanObj.members.filter(id => id !== target.id);
      if (clanObj.roles) delete clanObj.roles[target.id];
      if (clanObj.viceLeader === target.id) clanObj.viceLeader = null;
      if (db.users[target.id]) db.users[target.id].clan = null;

      pushClanMail(target.id, {
        title: `Removed from Clan ${clanName}`,
        body: `You were kicked from **${clanName}** by <@${userId}>.\n**Reason:** ${reason}`,
        category: 'Kick Notice'
      });
      await saveUsers();
      return message.reply(toSmallCaps(`👢 Kicked <@${target.id}> from **${clanName}**! Reason: **${reason}**`));
    }

    if (command === 'cannounce') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));

      const clanObj = db.clans[user.clan];
      const actorRole = getClanMemberRole(clanObj, userId);
      if ((CLAN_ROLE_HIERARCHY[actorRole] || 0) < CLAN_ROLE_HIERARCHY.Officer) {
        return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can post clan announcements!'));
      }
      const announcementText = args.join(' ').trim();
      if (!announcementText) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}cannounce [message]`));

      for (const mId of clanObj.members) {
        pushClanMail(mId, {
          title: `Announcement from ${clanObj.name}`,
          body: `${announcementText}\n*(Sent by <@${userId}> • ${actorRole})*`,
          category: 'Announcement'
        });
      }
      await saveUsers();
      return message.reply(toSmallCaps(`📢 Clan announcement sent to **${clanObj.members.length}** member(s)! Members can read it via \`${currentPrefix}cmail\`.`));
    }

    if (command === 'cmail') {
      if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
      const mails = Array.isArray(user.clanMail) ? user.clanMail : [];
      const claimRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cmail_claim_rewards_btn').setEmoji('1572814245848940707')
          .setLabel(toSmallCaps('Claim')).setStyle(ButtonStyle.Success)
      );

      if (mails.length === 0) {
        const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps('# 📬 Clan Mail Inbox\n\n*No clan mail yet. Announcements, season rewards, and clan status notices will appear here.*'))
        );
        const mailMsg = await message.reply({ components: [container, claimRow], flags: MessageFlags.IsComponentsV2 });
        const mailCollector = mailMsg.createMessageComponentCollector({ time: 60000 });
        mailCollector.on('collect', async i => {
          if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
          if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Not your clan mail inbox!'), ephemeral: true });
          if (i.customId === 'cmail_claim_rewards_btn') {
            return i.followUp({ content: 'There is no claimable rewards in the mail.', ephemeral: true });
          }
        });
        return;
      }

      const renderMailContainer = () => {
        const currentMails = Array.isArray(user.clanMail) ? user.clanMail : [];
        const mailText = currentMails.slice(0, 6).map((m, idx) => {
          const rewardTag = m.reward ? (m.claimed ? ' *(Claimed)*' : ' *(Claimable Reward)*') : '';
          return toSmallCaps(`**[${idx + 1}] [${m.category}] ${m.title}** *(${new Date(m.timestamp).toLocaleDateString()})*`) + rewardTag + '\n' + toSmallCaps(`${m.body}`);
        }).join('\n\n-----------------------------------\n\n');
        return new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(toSmallCaps(`# 📬 Clan Mail Inbox (${currentMails.length})\n\n`) + mailText)
        );
      };

      const mailMsg = await message.reply({ components: [renderMailContainer(), claimRow], flags: MessageFlags.IsComponentsV2 });
      const mailCollector = mailMsg.createMessageComponentCollector({ time: 60000 });

      mailCollector.on('collect', async i => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
        if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Not your clan mail inbox!'), ephemeral: true });

        if (i.customId === 'cmail_claim_rewards_btn') {
          const currentMails = Array.isArray(user.clanMail) ? user.clanMail : [];
          const claimableMails = currentMails.filter(m => m && m.reward && !m.claimed);
          if (claimableMails.length === 0) {
            return i.followUp({ content: 'There is no claimable rewards in the mail.', ephemeral: true });
          }

          if (!user.inventory) user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
          if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];

          const claimedSummaries = [];
          for (const mailEntry of claimableMails) {
            const rw = mailEntry.reward;
            if (rw.type === 'chibi') {
              const qty = Math.max(1, parseInt(rw.qty, 10) || 1);
              const rarity = rw.rarity || 'SR';
              const sampleChibi = gameData.chibis.find(c => c.name === rw.name && c.rarity === rarity)
                || gameData.chibis.find(c => c.rarity === rarity) || gameData.chibis[0];
              const chibiName = rw.name || sampleChibi.name;
              const chibiEmoji = rw.emoji || sampleChibi.emoji;

              for (let q = 0; q < qty; q++) {
                const generatedId = new mongoose.Types.ObjectId().toString();
                user.inventory.chibis.push({
                  id: generatedId, chibiId: generatedId, name: chibiName, rarity,
                  emoji: chibiEmoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
                });
              }
              claimedSummaries.push(`${qty}x ${rarityIconsMap[rarity] || ''} ${chibiEmoji} ${chibiName}`);
            } else if (rw.type === 'dice') {
              const diceAmt = Math.max(1, parseInt(rw.dice, 10) || 0);
              user.dice = (user.dice || 0) + diceAmt;
              claimedSummaries.push(`${diceAmt}x ${BETA_EMOJIS.DICE} Dice`);
            }
            mailEntry.claimed = true;
          }

          updateUserRank(user);
          await evaluateAndSyncUserBadges(userId, user, message.guild);
          await saveUsers();
          await mailMsg.edit({ components: [renderMailContainer(), claimRow], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          return i.followUp({ content: toSmallCaps(`✅ Claimed mail rewards: ${claimedSummaries.join(', ')}!`), ephemeral: true });
        }
      });
      return;
    }

    if (command === 'cclaninfo') {
      if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
      const clan = db.clans[user.clan];
      const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
      const cleanClanName = clan.name.replace(/\*/g, '');
      const logoEmoji = getClanLogoDisplay(clan.logoId);
      const leaderName = await getDisplayName(clan.leader);

      if (callerHasBetaView) {
        const clanTotals = Object.entries(db.clans).map(([cName, cData]) => ({
          cName, pts: cData.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0)
        })).sort((a, b) => b.pts - a.pts);
        const clanRankIdx = clanTotals.findIndex(c => c.cName === user.clan);
        const globalRankStatus = clanRankIdx !== -1 ? `#${clanRankIdx + 1}` : 'Unranked';
        const clanDescText = clan.description && clan.description.trim().length > 0 ? clan.description.trim() : 'No Description of the clan';

        const memberLines = await Promise.all(clan.members.map(async (mId, idx) => {
          const mUser = db.users[mId];
          if (mUser) updateUserRank(mUser);
          return toSmallCaps(`**${idx + 1}.** @${await getDisplayName(mId)} | ${getClanMemberRole(clan, mId)} | ${BETA_EMOJIS.TROPHY_PTS}: ${(mUser?.points || 0).toLocaleString()}`);
        }));

        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            toSmallCaps(`**CLAN : ${cleanClanName}**\n\n`) +
            `${BETA_EMOJIS.C_LEADER}: ` + toSmallCaps(`${leaderName}\n`) +
            `${BETA_EMOJIS.TROPHY_PTS}: ` + toSmallCaps(`${totalPoints.toLocaleString()}\n`) +
            `${BETA_EMOJIS.GLOBAL}: ` + toSmallCaps(`${globalRankStatus}\n`) +
            `${BETA_EMOJIS.CLAN_DESC}: ` + toSmallCaps(`${clanDescText}\n\n`) +
            memberLines.join('\n')
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(getClanLogoImageUrl(clan.logoId)));
        return message.reply({ components: [new ContainerBuilder().setAccentColor(0x1abc9c).addSectionComponents(section)], flags: MessageFlags.IsComponentsV2 });
      }

      const memberLines = await Promise.all(clan.members.map(async (mId, idx) => {
        const mUser = db.users[mId];
        if (mUser) updateUserRank(mUser);
        return toSmallCaps(`${idx + 1}. ${await getDisplayName(mId)} [${getClanMemberRole(clan, mId)}] `) + `${mUser?.rank || '<:unranked:1571314276071907519>'}` + toSmallCaps(` | Points: ${mUser?.points || 0}`);
      }));

      const container = new ContainerBuilder().setAccentColor(0x1abc9c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# CLAN: ${cleanClanName}   `) + `${logoEmoji}\n\n` +
          toSmallCaps(`LEADER: ${leaderName}\nTOTAL POINTS: ${totalPoints.toLocaleString()}\nRENAME USES LEFT: ${3 - (clan.renameCount || 0)}/3\n\nMEMBERS:\n`) +
          memberLines.join('\n')
        )
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'tradehistory') {
      if (!db.tradeHistories[userId] || db.tradeHistories[userId].length === 0) {
        return message.reply(toSmallCaps('📜 You have no recorded trade history yet.'));
      }
      const historyLines = await Promise.all(db.tradeHistories[userId].slice(-10).reverse().map(async (entry, index) =>
        toSmallCaps(`**${index + 1}.** Partner: **${await getDisplayName(entry.partnerId)}**\n   Date: ${new Date(entry.timestamp).toLocaleString()}`)
      ));
      const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps('# 📜 Your Recent Trade History\n\n') + historyLines.join('\n\n'))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (command === 'trade') {
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === userId) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}trade [@user]`));
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
        if (i.user.id !== target.id) return i.followUp({ content: toSmallCaps('This trade invitation is not for you!'), ephemeral: true });

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
              const parts = [];
              if (offer.dice > 0) parts.push(`**${offer.dice} 🎲 Dice**`);
              if (offer.chibi) parts.push(`${rarityIconsMap[offer.chibi.rarity]} ${offer.chibi.emoji} **${offer.chibi.name}** (Lv.${offer.chibi.level})`);
              return parts.length > 0 ? parts.join(' + ') : '*Empty*';
            };
            return {
              color: 0xf1c40f,
              title: toSmallCaps('🤝 Active Trade Session'),
              description: toSmallCaps(`<@${userId}> Offers:\n${getOfferText(p1Offer)}\n\n------------------\n\n<@${target.id}> Offers:\n${getOfferText(p2Offer)}`)
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
          await reqMsg.edit({ content: '', embeds: [getEmbed()], components: tradeRows }).catch(() => {});

          const tradeCollector = reqMsg.createMessageComponentCollector({ time: 60000 });
          tradeCollector.on('collect', async ti => {
            if (!ti.deferred && !ti.replied) await ti.deferUpdate().catch(() => {});
            const isP1 = ti.user.id === userId;
            const isP2 = ti.user.id === target.id;
            if (!isP1 && !isP2) return ti.followUp({ content: toSmallCaps('Not your trade session!'), ephemeral: true });
            const currentOffer = isP1 ? p1Offer : p2Offer;

            if (ti.customId === 'trade_cancel') {
              tradeCollector.stop();
              return reqMsg.edit({ content: toSmallCaps(`❌ Trade cancelled by <@${ti.user.id}>.`), embeds: [], components: [] }).catch(() => {});
            }

            if (ti.customId === 'trade_offer_dice') {
              await ti.followUp({ content: toSmallCaps('🎲 Type the amount of Dice you want to offer in chat (e.g. 50):'), ephemeral: true });
              const msgs = await ti.channel.awaitMessages({ filter: m => m.author.id === ti.user.id, max: 1, time: 20000 }).catch(() => null);
              const m = msgs?.first();
              if (!m) return;
              const amt = parseInt(m.content, 10);
              const uObj = db.users[ti.user.id];
              await m.delete().catch(() => {});
              if (isNaN(amt) || amt <= 0) return ti.followUp({ content: toSmallCaps('❌ Invalid dice amount!'), ephemeral: true });
              if (uObj.dice < amt) return ti.followUp({ content: toSmallCaps(`❌ You don't have enough dice! You have ${uObj.dice} 🎲.`), ephemeral: true });
              currentOffer.dice = amt;
              return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
            }

            if (ti.customId === 'trade_offer_chibi') {
              const uObj = db.users[ti.user.id];
              if (!uObj.inventory.chibis || uObj.inventory.chibis.length === 0) {
                return ti.followUp({ content: toSmallCaps('❌ You have no chibis in your inventory to offer!'), ephemeral: true });
              }
              const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('trade_select_chibi').setPlaceholder(toSmallCaps('Select a Chibi to offer')).addOptions(
                  uObj.inventory.chibis.slice(0, 25).map(c => ({ label: `${c.name} (${c.rarity}) Lv.${c.level}`.slice(0, 100), value: c.chibiId || c.id }))
                )
              );
              await ti.followUp({ content: toSmallCaps('Choose a chibi from your inventory below:'), components: [menuRow], ephemeral: true });

              const selection = await ti.channel.awaitMessageComponent({
                filter: int => int.user.id === ti.user.id && int.customId === 'trade_select_chibi', time: 25000
              }).catch(() => null);
              if (!selection) return;
              if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

              const chosenChibi = uObj.inventory.chibis.find(c => (c.chibiId || c.id) === selection.values[0]);
              if (chosenChibi) {
                currentOffer.chibi = chosenChibi;
                return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
              }
              return;
            }

            if (ti.customId === 'trade_confirm') {
              const u1 = db.users[userId];
              const u2 = db.users[target.id];
              if (!(p1Offer.dice > 0 || p1Offer.chibi !== null) || !(p2Offer.dice > 0 || p2Offer.chibi !== null)) {
                return ti.followUp({ content: toSmallCaps('❌ Both players must offer at least something (dice or chibi) before confirming!'), ephemeral: true });
              }
              if (u1.dice < p1Offer.dice || u2.dice < p2Offer.dice) {
                return ti.followUp({ content: toSmallCaps('❌ One of the players no longer has enough dice for this trade!'), ephemeral: true });
              }

              if (p1Offer.dice > 0) { u1.dice -= p1Offer.dice; u2.dice += p1Offer.dice; }
              if (p1Offer.chibi) {
                const idx = u1.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p1Offer.chibi.chibiId || p1Offer.chibi.id));
                if (idx !== -1) u2.inventory.chibis.push(u1.inventory.chibis.splice(idx, 1)[0]);
              }
              if (p2Offer.dice > 0) { u2.dice -= p2Offer.dice; u1.dice += p2Offer.dice; }
              if (p2Offer.chibi) {
                const idx = u2.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p2Offer.chibi.chibiId || p2Offer.chibi.id));
                if (idx !== -1) u1.inventory.chibis.push(u2.inventory.chibis.splice(idx, 1)[0]);
              }

              if (!db.tradeHistories[userId]) db.tradeHistories[userId] = [];
              if (!db.tradeHistories[target.id]) db.tradeHistories[target.id] = [];
              const tradeTimestamp = Date.now();
              db.tradeHistories[userId].push({ partnerId: target.id, timestamp: tradeTimestamp });
              db.tradeHistories[target.id].push({ partnerId: userId, timestamp: tradeTimestamp });

              updateUserRank(u1);
              updateUserRank(u2);
              await evaluateAndSyncUserBadges(userId, u1, message.guild);
              await evaluateAndSyncUserBadges(target.id, u2, message.guild);
              await saveUsers();
              tradeCollector.stop();

              return reqMsg.edit({
                content: toSmallCaps(`✅ Trade successfully completed between <@${userId}> and <@${target.id}>!`),
                embeds: [getEmbed()], components: []
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
      return (userId === db.config.ownerId || user.permissions === true) && msg.guild.id === db.config.mainGuildId;
    };

    if (command === 'fixadmin') {
      db.config.ownerId = userId;
      if (message.guild) db.config.mainGuildId = message.guild.id;
      user.permissions = true;
      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();
      return message.reply(toSmallCaps(`🛡️ Admin override successful! You are now set as the Bot Owner & Admin, and this server (${message.guild ? message.guild.name : 'DM'}) is locked as the Main Server.`));
    }

    if (command === 'ownersecretpanel') {
      if (!isOwner()) return;
      const container = new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🕵️‍♂️ Secret Owner Control Panel\n\nWelcome, Supreme Master. Here are your hidden master controls:\n` +
          `• Total Registered Users: ${Object.keys(db.users).length}\n• Total Active Clans: ${Object.keys(db.clans).length}\n• Connected Guilds: ${client.guilds.cache.size}\n\nUse your designated admin/owner commands safely.`
        ))
      );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    }

    if (command === 'ownergivechibi') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can use this command!'));
      const target = message.mentions.users.first();
      const rarityArg = args[1]?.toUpperCase();
      if (!target || !rarityArg) {
        return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}ownergivechibi [@user] [rarity] (e.g. ${currentPrefix}ownergivechibi @user SSRP)`));
      }
      ensureUser(target.id);

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('owner_give_chibi_select').setPlaceholder(toSmallCaps('Select chibi to give')).addOptions(
          EVENT_CHIBIS_POOL.map(c => ({ label: `${c.name} (${c.rarity})`.slice(0, 100), value: c.id }))
        )
      );
      const promptMsg = await message.reply({ content: toSmallCaps(`🎁 Select which event chibi to gift to <@${target.id}>:`), components: [row] });

      const selection = await message.channel.awaitMessageComponent({
        filter: int => int.user.id === userId && int.customId === 'owner_give_chibi_select', time: 25000
      }).catch(() => null);
      if (!selection) return promptMsg.edit({ content: toSmallCaps('❌ Chibi giveaway timed out.'), components: [] }).catch(() => {});
      if (!selection.deferred && !selection.replied) await selection.deferUpdate().catch(() => {});

      const template = EVENT_CHIBIS_POOL.find(c => c.id === selection.values[0]);
      const generatedId = new mongoose.Types.ObjectId().toString();
      if (!db.users[target.id].inventory.chibis) db.users[target.id].inventory.chibis = [];
      db.users[target.id].inventory.chibis.push({
        id: generatedId, chibiId: generatedId, name: template.name, rarity: 'SSRP',
        emoji: template.emoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
      });
      await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
      await saveUsers();
      return promptMsg.edit({ content: toSmallCaps(`✅ Successfully gifted ${template.emoji} **${template.name}** (SSRP) to <@${target.id}>!`), components: [] }).catch(() => {});
    }

    if (command === 'adminsetclanrewards') {
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can configure clan rewards!'));
      const rankPos = parseInt(args[0], 10);
      const qty = parseInt(args[1], 10);
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
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can execute this command!'));
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
      if (!newPrefix || newPrefix.length > 5 || /^[a-zA-Z]$/.test(newPrefix)) {
        return message.reply(toSmallCaps(`❌ Please provide a valid symbol prefix (max 5 chars, single letters like 's' or 'a' are not allowed). Usage: ${currentPrefix}prefixchange [new_prefix]`));
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
      if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can remove admin permissions!'));
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
        const amount = parseInt(args[1], 10);
        if (!target || isNaN(amount)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivecrystal [@user] [amount]`));
        ensureUser(target.id);
        if (!db.config.eventCrystals) db.config.eventCrystals = {};
        db.config.eventCrystals[target.id] = (db.config.eventCrystals[target.id] || 0) + amount;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Successfully granted ${amount.toLocaleString()} Event Crystals ${EVENT_ICONS.CRYSTAL} to <@${target.id}>.`));
      }

      if (command === 'adminsetlbseason') {
        const seasonNum = parseInt(args[0], 10);
        if (isNaN(seasonNum) || seasonNum < 1) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlbseason [season_number]`));
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
        if (!isAdmin()) return message.reply(toSmallCaps('❌ Only administrators can use this command!'));
        const target = message.mentions.users.first();
        const newNN = args.slice(1).join(' ');
        if (!target || !newNN) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetnn [@user] [nickname]`));
        if (!db.users[target.id] || !db.users[target.id].started) return message.reply(toSmallCaps('❌ User does not have Chibi RNG data or has not started yet!'));
        if (newNN.length > 12) return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
        db.users[target.id].customNickname = newNN;
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin successfully set custom nickname for <@${target.id}> to ${newNN}!`));
      }

      if (command === 'adminban') {
        const target = message.mentions.users.first();
        const durationArg = args[1]?.toLowerCase();
        if (!target || !durationArg) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminban [@user] [duration or permanent] (e.g. 1d, 2h, permanent)`));
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
        if (!isAdmin()) return message.reply(toSmallCaps('❌ Only administrators can clear the leaderboard!'));
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
        if (isNaN(mult) || !durationMs) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminluckevent [multiplier] [duration] (e.g. ${currentPrefix}adminluckevent 2.0 30m)`));
        db.config.globalLuckMultiplier = mult;
        db.config.luckEventExpires = Date.now() + durationMs;
        await saveUsers();
        return message.reply(toSmallCaps(`⚡ Global Luck Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
      }

      if (command === 'adminsetxp') {
        const mult = parseFloat(args[0]);
        const durationStr = args[1];
        const durationMs = parseDurationToMs(durationStr);
        if (isNaN(mult) || !durationMs) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetxp [multiplier] [duration] (e.g. ${currentPrefix}adminsetxp 1.5 1h)`));
        db.config.globalXpMultiplier = mult;
        db.config.xpEventExpires = Date.now() + durationMs;
        await saveUsers();
        return message.reply(toSmallCaps(`✨ Global XP Event Activated! Multiplier set to ${mult}x for ${durationStr}!`));
      }

      if (command === 'admingiveitem') {
        const target = message.mentions.users.first();
        const itemType = args[1]?.toLowerCase();
        const quantity = parseInt(args[2], 10);
        if (!target || !['dice', 'spray', 'clover'].includes(itemType) || isNaN(quantity)) {
          return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingiveitem [@user] [dice|spray|clover] [quantity]`));
        }
        ensureUser(target.id);
        if (!db.users[target.id].inventory.items) db.users[target.id].inventory.items = { spray: 0, clover: 0 };
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
        const pts = parseInt(args[1], 10);
        if (!target || isNaN(pts)) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetpoints [@user] [points]`));
        ensureUser(target.id);
        db.users[target.id].points = pts;
        updateUserRank(db.users[target.id]);
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin set points for <@${target.id}> to **${pts}** (Rank icon auto-updated).`));
      }

      if (command === 'admingivepermission') {
        if (!isOwner()) return message.reply(toSmallCaps('❌ Only the bot owner can assign admin permissions!'));
        const target = message.mentions.users.first();
        if (!target) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}admingivepermission [@user]`));
        ensureUser(target.id);
        db.users[target.id].permissions = true;
        await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
        await saveUsers();
        return message.reply(toSmallCaps(`🛡️ Admin permissions granted to <@${target.id}>.`));
      }

      if (command === 'adminsetlevel') {
        const target = message.mentions.users.first();
        const lvl = parseInt(args[1], 10);
        if (!target || isNaN(lvl) || lvl < 1) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}adminsetlevel [@user] [level]`));
        ensureUser(target.id);
        db.users[target.id].userLevel = lvl;
        db.users[target.id].userExp = 0;
        await evaluateAndSyncUserBadges(target.id, db.users[target.id], message.guild);
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