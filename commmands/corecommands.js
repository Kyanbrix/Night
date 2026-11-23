const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, AttachmentBuilder, MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const {
  BADGE_CATALOG, BETA_EMOJIS, EVENT_ICONS, EVENT_CHIBIS_POOL, SEASON_LIST, SHINY_ICON, RARITY_HIERARCHY
} = require('../core/constants');
const { gameData, db, saveUsers } = require('../core/database');
const {
  isTester, toSmallCaps, updateUserRank, updatePeakRank,
  evaluateAndSyncUserBadges, ensureUser, getClanLogoDisplay,
  formatTimeRemaining, addExpAndLevelUp, parseOddsNumber
} = require('../core/helpers');
const { renderProfileCard } = require('../core/profilecard');

const CORE_CMDS = [
  'start', 'rarities', 'customnn', 'profilebg', 'seasons', 'higheststats', 'help', 'status',
  'slot', 'daily', 'roll', 'drop', 'inventory', 'collections', 'shop',
  'rank', 'points', 'ranks', 'ccranks', 'tradehistory', 'trade', 'profile'
];

const BACKGROUND_THEMES = {
  crystal: { label: 'Violet Crystal', accent: 0xc084fc },
  abyss: { label: 'Midnight Abyss', accent: 0x3b82f6 },
  crimson: { label: 'Crimson Nova', accent: 0xef4444 },
  emerald: { label: 'Emerald Rune', accent: 0x10b981 },
  solar: { label: 'Solar Gold', accent: 0xf59e0b }
};

function getSyncedBadgeKeys(syncedResult, userData) {
  const keys = new Set(Array.isArray(userData?.badges) ? userData.badges : []);
  if (Array.isArray(syncedResult)) {
    for (const k of syncedResult) {
      if (typeof k === 'string' && k.trim()) keys.add(k.trim());
    }
  } else if (syncedResult && typeof syncedResult === 'object') {
    if (Array.isArray(syncedResult.badges)) {
      for (const k of syncedResult.badges) {
        if (typeof k === 'string' && k.trim()) keys.add(k.trim());
      }
    }
    for (const [k, v] of Object.entries(syncedResult)) {
      if (v === true && k !== 'badges') keys.add(k);
    }
  }
  return Array.from(keys).filter(k => Boolean(BADGE_CATALOG?.[k]));
}

async function syncAllBadges(targetUserId, targetUserData, guild, client) {
  if (!Array.isArray(targetUserData.badges)) targetUserData.badges = [];
  let rawSync = null;
  try {
    rawSync = await evaluateAndSyncUserBadges(targetUserId, targetUserData, guild);
  } catch {
    rawSync = null;
  }

  const badgeSet = new Set(getSyncedBadgeKeys(rawSync, targetUserData));

  if (isTester(targetUserId) && BADGE_CATALOG?.tester) {
    badgeSet.add('tester');
  }

  const ownerIds = new Set([
    db?.config?.ownerId,
    process.env.BOT_OWNER_ID,
    process.env.OWNER_ID,
    guild?.ownerId
  ].filter(Boolean));
  if (ownerIds.has(targetUserId) && BADGE_CATALOG?.owner) {
    badgeSet.add('owner');
  }

  try {
    const member = guild?.members?.cache?.get(targetUserId)
      || (guild?.members?.fetch ? await guild.members.fetch(targetUserId).catch(() => null) : null);
    if (member && member.premiumSince && BADGE_CATALOG?.booster) {
      badgeSet.add('booster');
    }
  } catch {
    // Ignore guild member fetch errors in DMs or uncached guilds
  }

  if (badgeSet.has('nitrouser') && BADGE_CATALOG?.nitro) {
    badgeSet.add('nitro');
  }
  if (badgeSet.has('nitro') && BADGE_CATALOG?.nitrouser) {
    badgeSet.add('nitrouser');
  }

  targetUserData.badges = Array.from(badgeSet);
  return targetUserData.badges;
}

function hasBackgroundPerk(userData, syncedBadges = []) {
  const active = new Set([
    ...(Array.isArray(userData?.badges) ? userData.badges : []),
    ...(Array.isArray(syncedBadges) ? syncedBadges : [])
  ]);
  return active.has('nitro') || active.has('nitrouser') || active.has('supporter') || active.has('booster') || active.has('owner');
}

function parseHexColor(rawHex) {
  if (!rawHex || typeof rawHex !== 'string') return null;
  const cleaned = rawHex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

function parseBadgeFlagValue(rawVal) {
  if (!rawVal) return null;
  const v = rawVal.trim().toLowerCase();
  if (['on', 'true', '1', 'yes', 'enable', 'enabled'].includes(v)) return true;
  if (['off', 'false', '0', 'no', 'disable', 'disabled'].includes(v)) return false;
  return null;
}

function buildHelpCategories(prefix) {
  return {
    rolling: {
      label: 'Rolling, Drops & Games',
      emoji: '🎲',
      title: '🎲 Rolling, Drops & Games',
      lines: [
        `\`${prefix}roll [qty] [boost]\` (\`${prefix}r\`)`,
        `\`${prefix}drop\` (\`${prefix}d\`)`,
        `\`${prefix}slot [bet]\``,
        `\`${prefix}shop\``,
        `\`${prefix}rarities\` (\`${prefix}rar\`)`
      ]
    },
    economy: {
      label: 'Rewards & Economy',
      emoji: '💰',
      title: '💰 Rewards & Economy',
      lines: [
        `\`${prefix}work\` (\`${prefix}w\`)`,
        `\`${prefix}working\` (\`${prefix}wg\`)`,
        `\`${prefix}workshift\` (\`${prefix}ws\`)`,
        `\`${prefix}balance\` (\`${prefix}bal\`)`,
        `\`${prefix}casino\` (\`${prefix}cs\`)`,
        `\`${prefix}blackjack\` (\`${prefix}bj\`)`,
        `\`${prefix}coinflip\` (\`${prefix}cf\` / \`${prefix}cp\`)`,
        `\`${prefix}ticketbuy\` (\`${prefix}tb\`)`,
        `\`${prefix}ticketuse\` (\`${prefix}tu\`)`,
        `\`${prefix}lottery\` (\`${prefix}lot\`)`,
        `\`${prefix}csell [qty] [rarity]\` (\`${prefix}sell\`)`,
        `\`${prefix}daily\``,
        `\`${prefix}points\``,
        `\`${prefix}rank\` / \`${prefix}ranks\``,
        `\`${prefix}ccranks\` (\`${prefix}ccr\`)`,
        `\`${prefix}customnn\` (\`${prefix}cnn\`)`,
        `\`${prefix}profilebg\``,
        `\`${prefix}seasons\` (\`${prefix}ss\`)`,
        `\`${prefix}higheststats\` (\`${prefix}hss\`)`,
        `\`${prefix}tradehistory\` (\`${prefix}th\`)`
      ]
    },
    event: {
      label: 'Event System',
      emoji: '🌟',
      title: '🌟 Event System',
      lines: [
        `\`${prefix}event\``,
        `\`${prefix}eadventure\` (\`${prefix}ca\`)`,
        `\`${prefix}eshop\` (\`${prefix}es\`)`,
        `\`${prefix}ecrystal\` (\`${prefix}ec\`)`
      ]
    },
    rpg: {
      label: 'RPG & Battling',
      emoji: '⚔️',
      title: '⚔️ RPG & Battling',
      lines: [
        `\`${prefix}cstats\``,
        `\`${prefix}equipteam [id] [slot]\``,
        `\`${prefix}battle [@user]\``
      ]
    },
    inventory: {
      label: 'Inventory & Profile',
      emoji: '🎒',
      title: '🎒 Inventory & Profile',
      lines: [
        `\`${prefix}inventory\` (\`${prefix}inv\`)`,
        `\`${prefix}collections\` (\`${prefix}col\`)`,
        `\`${prefix}profile\` (\`${prefix}p\`) [@user]`,
        `\`${prefix}trade\` (\`${prefix}t\`) [@user]`
      ]
    },
    clans: {
      label: 'Clans & Server',
      emoji: '🏛️',
      title: '🏛️ Clans & Server',
      lines: [
        `\`${prefix}clanlist\``,
        `\`${prefix}cclaninfo\``,
        `\`${prefix}ccreateclan\``,
        `\`${prefix}cclanjoin\``,
        `\`${prefix}clanleave\``,
        `\`${prefix}clanrename\``,
        `\`${prefix}prefixchange\``,
        `\`${prefix}enablec\``,
        `\`${prefix}disablec\``
      ]
    }
  };
}

function renderHelpContainer(prefix, selectedKey = null) {
  const categories = buildHelpCategories(prefix);
  let bodyContent = '';

  if (selectedKey && categories[selectedKey]) {
    const cat = categories[selectedKey];
    bodyContent = toSmallCaps(`${cat.title}\n`) + cat.lines.join('\n');
  } else {
    bodyContent = Object.values(categories)
      .map(cat => toSmallCaps(`${cat.title}\n`) + cat.lines.join('\n'))
      .join('\n\n');
  }

  const activeLabel = selectedKey && categories[selectedKey]
    ? categories[selectedKey].label
    : 'All Categories';

  return new ContainerBuilder()
    .setAccentColor(0xff77aa)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 🌸 Chibi RPG RNG — Help Center\nViewing: **${activeLabel}**\nSelect a category below:`)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent));
}

function renderHelpMenuRow(selectedKey = null) {
  const categories = buildHelpCategories('');
  const options = [
    {
      label: 'All Categories',
      value: 'all',
      emoji: '📚',
      default: !selectedKey
    },
    ...Object.entries(categories).map(([key, cat]) => ({
      label: cat.label,
      value: key,
      emoji: cat.emoji,
      default: selectedKey === key
    }))
  ];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder(toSmallCaps('Choose a help category...'))
      .addOptions(options)
  );
}

async function execute(ctx) {
  const { command, args, message, client, userId, currentPrefix, user, currentMs, callerHasBetaView, rarityIconsMap, getDisplayName } = ctx;
  if (!CORE_CMDS.includes(command)) return false;

  if (command === 'start') {
    if (user.started) return message.reply(toSmallCaps('⚠️ You have already started your Chibi RPG journey!'));

    if (isTester(userId)) {
      const startRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('beta_start_journey_btn').setEmoji('1572796405033214043').setLabel(toSmallCaps('Start Journey')).setStyle(ButtonStyle.Success)
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
        user.dice = Number(user.dice || 0) + 50;
        if (!db.config.ownerId) db.config.ownerId = userId;
        if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
        updateUserRank(user);
        updatePeakRank(user);
        await syncAllBadges(userId, user, message.guild, client);
        await saveUsers();
        await startPromptMsg.edit({
          content: toSmallCaps(`🎉 **Journey Initialized!** You have been awarded **x50 Dice** ${BETA_EMOJIS.DICE} and your Chibi RPG profile is now active.`),
          components: []
        }).catch(() => {});
      });

      startCollector.on('end', async () => {
        if (!pressed && !user.started) {
          await startPromptMsg.edit({ content: toSmallCaps(`⏳ Start button expired. Type \`${currentPrefix}start\` again to begin.`), components: [] }).catch(() => {});
        }
      });
      return true;
    }

    user.started = true;
    user.joinedDate = new Date().toLocaleDateString();
    user.dice = Number(user.dice || 0) + 20;
    if (!db.config.ownerId) db.config.ownerId = userId;
    if (!db.config.mainGuildId && message.guild) db.config.mainGuildId = message.guild.id;
    updateUserRank(user);
    updatePeakRank(user);
    await syncAllBadges(userId, user, message.guild, client);
    await saveUsers();
    return message.reply(toSmallCaps('🎉 Welcome to Chibi RPG RNG! You have been awarded 20x Dice 🎲 and your profile is initialized.'));
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

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps('# 📊 Chibi Rarities & Drop Rates\n\n') + raritiesInfo))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'customnn') {
    const newNickname = args.join(' ').trim();
    if (!newNickname) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}customnn [nickname] (Max 12 characters)`));
    if (newNickname.length > 12) return message.reply(toSmallCaps('❌ Nickname cannot exceed 12 characters!'));
    user.customNickname = newNickname;
    await saveUsers();
    return message.reply(toSmallCaps(`✅ Successfully updated your custom nickname to ${newNickname}!`));
  }

  if (command === 'profilebg') {
    if (!Array.isArray(user.badges)) user.badges = [];
    const syncedBadges = await syncAllBadges(userId, user, message.guild, client);
    const canUseBgPerk = hasBackgroundPerk(user, syncedBadges);

    if (!args || args.length === 0) {
      const currentThemeKey = user.profileBgTheme || 'crystal';
      const currentTheme = BACKGROUND_THEMES[currentThemeKey] || BACKGROUND_THEMES.crystal;
      const themeList = Object.entries(BACKGROUND_THEMES)
        .map(([key, t]) => `• \`${key}\` — ${t.label}`)
        .join('\n');

      return message.reply({
        components: [new ContainerBuilder().setAccentColor(user.profileAccentColor || currentTheme.accent).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
          `# 🎨 Chibi RPG Profile Background Customizer\n\nCurrent Theme: **${currentTheme.label}** (\`${currentThemeKey}\`)\n` +
          `Perk Status: ${canUseBgPerk ? '✅ Unlocked (Nitro / Booster / Supporter / Owner)' : '🔒 Locked — Requires Nitro, Booster, Supporter, or Owner Badge'}\n\n` +
          `Available Themes:\n${themeList}\n\n` +
          `Usage:\n• \`${currentPrefix}profilebg <theme>\`\n• \`${currentPrefix}profilebg reset\``
        )))],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const choice = args[0].toLowerCase();

    if (choice === 'reset') {
      user.profileBg = null;
      user.profileBgTheme = 'crystal';
      user.profileAccentColor = null;
      await syncAllBadges(userId, user, message.guild, client);
      await saveUsers();
      return message.reply(toSmallCaps('✅ Your profile background theme has been reset to default!'));
    }

    if (!canUseBgPerk) {
      return message.reply(
        toSmallCaps('❌ Only users with the **Nitro**, **Booster**, **Supporter**, or **Owner** badge can customize their profile background!')
      );
    }

    const parts = args.join(' ').trim().split('|').map(p => p.trim()).filter(Boolean);
    const themeKey = parts[0].toLowerCase();
    if (!BACKGROUND_THEMES[themeKey]) {
      const validKeys = Object.keys(BACKGROUND_THEMES).map(k => `\`${k}\``).join(', ');
      return message.reply(toSmallCaps(`❌ Invalid background theme. Choose from: ${validKeys} or use \`${currentPrefix}profilebg reset\`.`));
    }

    const badgeSet = new Set(user.badges);
    let updatedNickname = null;
    let updatedColor = BACKGROUND_THEMES[themeKey].accent;

    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i];
      const badgeMatch = seg.match(/^(supporter|nitro|booster)\s*:\s*(.+)$/i);
      const colorMatch = seg.match(/^(?:color|accent)\s*:\s*#?([0-9a-fA-F]{6})$/i);
      if (badgeMatch) {
        const key = badgeMatch[1].toLowerCase();
        const parsedBool = parseBadgeFlagValue(badgeMatch[2]);
        if (parsedBool !== null && BADGE_CATALOG[key]) {
          if (parsedBool) badgeSet.add(key);
          else badgeSet.delete(key);
        }
      } else if (colorMatch) {
        updatedColor = parseHexColor(colorMatch[1]);
      } else if (!updatedNickname) {
        updatedNickname = seg.slice(0, 12);
      }
    }

    user.profileBg = null;
    user.profileBgTheme = themeKey;
    if (updatedNickname) user.customNickname = updatedNickname;
    if (typeof updatedColor === 'number') user.profileAccentColor = updatedColor;
    user.badges = Array.from(badgeSet).filter(k => Boolean(BADGE_CATALOG[k]));

    await syncAllBadges(userId, user, message.guild, client);
    await saveUsers();

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(user.profileAccentColor || BACKGROUND_THEMES[themeKey].accent).addTextDisplayComponents(new TextDisplayBuilder().setContent([
        toSmallCaps('# ✅ Profile Background Updated!'),
        toSmallCaps(`🎨 Background Theme: **${BACKGROUND_THEMES[themeKey].label}** (\`${themeKey}\`)`),
        toSmallCaps(`🏷️ Nickname: ${user.customNickname || message.author.username}`),
        toSmallCaps(`💛 Supporter Badge: ${user.badges.includes('supporter') ? 'ON' : 'OFF'}`),
        toSmallCaps(`💎 Nitro Badge: ${user.badges.includes('nitro') ? 'ON' : 'OFF'}`),
        toSmallCaps(`🚀 Booster Badge: ${user.badges.includes('booster') ? 'ON' : 'OFF'}`),
        toSmallCaps(`🧪 Tester Badge: ${user.badges.includes('tester') ? 'ON' : 'OFF'}`),
        toSmallCaps(`👑 Owner Badge: ${user.badges.includes('owner') ? 'ON' : 'OFF'}`)
      ].join('\n')))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'seasons') {
    const currentSeasonNum = db.config.seasonNumber || 1;
    const currentSeasonData = SEASON_LIST[currentSeasonNum] || { name: `Season ${currentSeasonNum}`, start: 'Active' };
    const seasonTimerStr = formatTimeRemaining(Math.max(0, (db.config.seasonExpires || Date.now()) - Date.now()));
    const seasonLines = Object.entries(SEASON_LIST).map(([num, s]) => toSmallCaps(
      `• ${s.name}${parseInt(num, 10) === currentSeasonNum ? ' 🟢 (Active)' : ''}\n  Begin In: ${s.start}`
    )).join('\n\n');

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# 📅 Chibi RPG Seasons\n\nCurrent Active: ${currentSeasonData.name}\nTime Until Reset: ${seasonTimerStr}\n\n-----------------------------------\n\n`) + seasonLines
      ))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'higheststats') {
    updatePeakRank(user);
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# 🏆 ${user.customNickname || message.author.username}'s Highest Stats (Last Season)\n\nHighest Rank Icon: `) +
        `${user.highestSeasonRank || '<:unranked:1571314276071907519>'}` +
        toSmallCaps(`\nHighest Points Reached: ${(user.highestSeasonPoints || 0).toLocaleString()} Points\n\n*Stats snapshotted from previous competitive season.*`)
      ))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'help') {
    let selectedCategory = null;
    const helpMsg = await message.reply({
      components: [renderHelpContainer(currentPrefix, selectedCategory), renderHelpMenuRow(selectedCategory)],
      flags: MessageFlags.IsComponentsV2
    });

    const helpCollector = helpMsg.createMessageComponentCollector({ time: 120000 });
    helpCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Only the command user can use this help menu!'), ephemeral: true });
      }
      if (i.customId === 'help_category_select') {
        const val = i.values?.[0];
        selectedCategory = val && val !== 'all' ? val : null;
        await helpMsg.edit({
          components: [renderHelpContainer(currentPrefix, selectedCategory), renderHelpMenuRow(selectedCategory)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    });

    helpCollector.on('end', async () => {
      await helpMsg.edit({
        components: [renderHelpContainer(currentPrefix, selectedCategory)],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    });
    return true;
  }

  if (command === 'status') {
    const uptimeSec = Math.floor((client.uptime || 0) / 1000);
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
        `# 🤖 Bot System Status & Info\n\n📶 Latency / Ping: ${client.ws.ping}ms\n⏱️ Uptime: ${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s\n` +
        `🌐 Connected Servers: ${client.guilds.cache.size} Servers\n💻 Runtime: Node.js (Discord.js v14 - Components V2)\n⚙️ Status: 🟢 Online & Operational (MongoDB Connected)`
      )))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'slot') {
    const bet = parseInt(args[0], 10);
    if (isNaN(bet) || bet <= 0) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}slot [bet_amount] (e.g. ${currentPrefix}slot 5)`));
    if (Number(user.dice || 0) < bet) return message.reply(toSmallCaps(`❌ You don't have enough dice! You have ${user.dice || 0} 🎲, but your bet is ${bet} 🎲.`));

    user.dice = Number(user.dice || 0) - bet;
    await saveUsers();

    let availableChibiEmojis = ['📦', '✨', '⭐', '🌟', '💎', '🔥', '💖'];
    if (user.inventory?.chibis?.length > 0) {
      availableChibiEmojis = Array.from(new Set(user.inventory.chibis.map(c => c.emoji || '📦')));
    }
    const getRandomChibiSymbol = () => availableChibiEmojis[Math.floor(Math.random() * availableChibiEmojis.length)];

    const slotMsg = await message.reply({ content: toSmallCaps(`🎰 Spinning Chibi Slot Machine for ${bet} 🎲...\n| 🔄 | 🔄 | 🔄 |`) });
    for (let step = 0; step < 3; step++) {
      await new Promise(resolve => setTimeout(resolve, 600));
      await slotMsg.edit({ content: toSmallCaps(`🎰 Spinning...\n| ${getRandomChibiSymbol()} | ${getRandomChibiSymbol()} | ${getRandomChibiSymbol()} |`) }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    const final1 = getRandomChibiSymbol();
    const final2 = getRandomChibiSymbol();
    const final3 = getRandomChibiSymbol();

    let payoutMultiplier = 0, pointsWon = 0, resultText = '';
    if (final1 === final2 && final2 === final3) {
      payoutMultiplier = 10; pointsWon = 25;
      resultText = toSmallCaps(`🎉 CHIBI JACKPOT! TRIPLE MATCH (${final1})! (+10x Dice, +${pointsWon} Points!) 🎉`);
    } else if (final1 === final2 || final2 === final3 || final1 === final3) {
      payoutMultiplier = 2; pointsWon = 10;
      resultText = toSmallCaps(`✨ Partial Chibi Match! (+2x Dice, +${pointsWon} Points!) ✨`);
    } else {
      resultText = toSmallCaps('❌ No matching chibis! Better luck next time!');
    }

    const winnings = Math.round(bet * payoutMultiplier);
    user.dice = Number(user.dice || 0) + winnings;
    user.points = Number(user.points || 0) + pointsWon;
    updateUserRank(user);
    await saveUsers();

    return slotMsg.edit({
      content: '',
      components: [new ContainerBuilder().setAccentColor(payoutMultiplier > 0 ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
        `# 🎰 Chibi Slot Machine Results\n\n| ${final1} | ${final2} | ${final3} |\n\n${resultText}\n` +
        `💰 Dice Payout: +${winnings} 🎲 | 🏆 Points Gained: +${pointsWon} Pts\n🎲 Total Dice: ${user.dice} | 🏆 Total Points: ${user.points}`
      )))],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => {});
  }

  if (command === 'daily') {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const lastDaily = Number(user.lastDaily || 0);
    if (lastDaily > 0 && currentMs - lastDaily < twentyFourHours) {
      return message.reply(toSmallCaps(`⏳ You have already claimed your daily reward! Please wait another ${Math.ceil((twentyFourHours - (currentMs - lastDaily)) / 1000 / 60)} minutes.`));
    }
    user.streak = (!lastDaily || currentMs - lastDaily > fortyEightHours) ? 1 : (Number(user.streak) || 0) + 1;
    user.lastDaily = currentMs;

    let multiplier = 1;
    if (user.streak >= 100) multiplier = 5;
    else if (user.streak >= 50) multiplier = 3;
    else if (user.streak >= 10) multiplier = 2;

    const rewardDice = 1 * multiplier;
    user.dice = Number(user.dice || 0) + rewardDice;
    updateUserRank(user);
    await saveUsers();
    return message.reply(toSmallCaps(`🎁 Daily Reward Claimed!\n🔥 Streak: ${user.streak} Days\n🎲 Reward: +${rewardDice}x Dice (x${multiplier} multiplier active! Total: ${user.dice} 🎲)`));
  }

  if (command === 'roll') {
    const maxQty = Number(gameData.settings?.maxRollQuantity) || 50;
    const qty = Math.min(parseInt(args[0], 10) || 1, maxQty);
    const boost = args[1] ? args[1].toLowerCase() : null;
    if (qty < 1) return message.reply(toSmallCaps('❌ Quantity must be at least 1.'));
    if (Number(user.dice || 0) < qty) return message.reply(toSmallCaps(`❌ You don't have enough dice! You need ${qty} 🎲, but you have ${user.dice || 0} 🎲.`));
    if (!user.inventory) user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
    if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];
    if (!user.inventory.items) user.inventory.items = { spray: 0, clover: 0 };

    if (boost === 'spray') {
      if ((user.inventory.items.spray || 0) <= 0) return message.reply(toSmallCaps(`❌ No Spray uses left! Buy more in ${currentPrefix}shop.`));
      user.inventory.items.spray--;
    } else if (boost === 'clover') {
      if ((user.inventory.items.clover || 0) <= 0) return message.reply(toSmallCaps(`❌ No Clover uses left! Buy more in ${currentPrefix}shop.`));
      user.inventory.items.clover--;
    }

    user.dice = Number(user.dice || 0) - qty;
    const resultsSummary = [];
    let activeLuckMultiplier = Number(db.config?.globalLuckMultiplier) || 1.0;
    if (boost === 'spray') activeLuckMultiplier *= 1.5;

    let totalExpGained = 0;
    const teamArr = Array.isArray(user.team) ? user.team : [null, null, null];
    const primaryChibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === (teamArr[0] || user.equippedChibi));
    const baseRarityChances = {
      C: { normal: 20, shiny: 1 }, U: { normal: 12, shiny: 0.10 }, R: { normal: 7, shiny: 0.5 },
      SR: { normal: 1, shiny: 0.1 }, SRR: { normal: 0.10, shiny: 0.0010 }, UTR: { normal: 0.001, shiny: 0.0001 }
    };

    for (let i = 0; i < qty; i++) {
      const adjustedRarities = (gameData.rarities || []).map(r => {
        const cfg = baseRarityChances[r.key] || { normal: r.weight || 1, shiny: 0.1 };
        const mult = r.key !== 'C' ? activeLuckMultiplier : 1;
        return { ...r, normW: cfg.normal * mult, shinyW: cfg.shiny * mult };
      });
      const totalWeight = adjustedRarities.reduce((sum, r) => sum + r.normW, 0);
      if (totalWeight <= 0) continue;
      let randW = Math.random() * totalWeight;
      let chosenRarityObj = adjustedRarities[0];
      for (const r of adjustedRarities) {
        if (randW < r.normW) { chosenRarityObj = r; break; }
        randW -= r.normW;
      }

      const availableChibis = (gameData.chibis || []).filter(c => c.rarity === chosenRarityObj.key);
      if (!availableChibis.length) continue;
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
      const currentRollVal = isShiny ? (normalVal * 10) : normalVal;
      if (currentTier > (user.bestRollTier || 0) || (currentTier === (user.bestRollTier || 0) && currentRollVal > (user.bestRollVal || 0))) {
        user.bestRollTier = currentTier;
        user.bestRollVal = currentRollVal;
        user.bestRoll = chibiTemplate.shinyOdds || chibiTemplate.odds;
        user.bestChibi = `${rarityIconsMap[chibiTemplate.rarity] || ''} ${chibiTemplate.emoji} ${chibiTemplate.name} ${isShiny ? SHINY_ICON : ''}`;
      }
    }

    updateUserRank(user);
    await syncAllBadges(userId, user, message.guild, client);
    await saveUsers();

    const diceIcon = callerHasBetaView ? BETA_EMOJIS.DICE : '🎲';
    const luckNotice = activeLuckMultiplier > 1.0 ? toSmallCaps(`\n⚡ Active Luck Boost: ${activeLuckMultiplier}x`) : '';
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# ${diceIcon} Chibi Roll Results\n\n`) +
        resultsSummary.map(r => `${rarityIconsMap[r.chibi.rarity] || '📦'} ${r.chibi.emoji} **${r.chibi.name}** ${r.isShiny ? SHINY_ICON : ''} ${r.duplicated ? '(🍀 Duplicated!)' : ''}`).join('\n') +
        toSmallCaps(`\n\n✨ Gained +${totalExpGained} EXP!`) + luckNotice + toSmallCaps(`\n${diceIcon} Remaining Dice: ${user.dice}`)
      ))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'drop') {
    const cooldownMs = (Number(gameData.settings?.dropCooldownSeconds) || 10) * 1000;
    const lastDrop = Number(user.lastDrop || 0);
    if (lastDrop > 0 && currentMs - lastDrop < cooldownMs) {
      return message.reply(toSmallCaps(`⏳ Please wait ${Math.ceil((cooldownMs - (currentMs - lastDrop)) / 1000)} more seconds before claiming your next Chibi Drop!`));
    }
    user.lastDrop = currentMs;
    user.todayDrops = (Number(user.todayDrops) || 0) + 1;

    const dropTable = Array.isArray(gameData.dropTable) && gameData.dropTable.length > 0
      ? gameData.dropTable
      : [{ name: 'Lucky Dice Drop', emoji: '🎲', dice: 3, weight: 1 }];
    const totalDropWeight = dropTable.reduce((sum, d) => sum + (Number(d.weight) || 1), 0);
    let randD = Math.random() * totalDropWeight;
    let chosenDrop = dropTable[0];
    for (const d of dropTable) {
      const w = Number(d.weight) || 1;
      if (randD < w) { chosenDrop = d; break; }
      randD -= w;
    }
    const dropDice = Number(chosenDrop.dice) || 1;
    user.dice = Number(user.dice || 0) + dropDice;
    updateUserRank(user);
    await saveUsers();
    return message.reply(toSmallCaps(`${chosenDrop.emoji} ${chosenDrop.name}! You received **${dropDice}x Dice** ${callerHasBetaView ? BETA_EMOJIS.DICE : '🎲'}! Total dice: ${user.dice}`));
  }

  if (command === 'inventory') {
    if (!user.inventory?.items) user.inventory = { ...(user.inventory || {}), chibis: user.inventory?.chibis || [], items: { spray: 0, clover: 0 } };
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
        `# 🎒 ${user.customNickname || message.author.username}'s Inventory\n\n${callerHasBetaView ? BETA_EMOJIS.DICE : '🎲'} Dice: ${user.dice || 0}\n` +
        `🧴 Spray Boosts: ${user.inventory.items.spray || 0} Uses\n🍀 Clover Boosts: ${user.inventory.items.clover || 0} Uses\n\n*Note: Chibis are stored in your collections (${currentPrefix}collections).*`
      )))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'collections') {
    const validChibis = (user.inventory?.chibis || []).filter(c => c && String(c.name || '').toLowerCase() !== 'str_aegis');
    if (!validChibis.length) return message.reply(toSmallCaps(`📖 Your collection is empty! Use ${currentPrefix}roll to summon chibis.`));
    let sortBy = 'rarity', currentPage = 0;
    const itemsPerPage = 10;
    const eventChibiNames = new Set([
      ...(gameData.eventChibis || []).map(c => c.name),
      ...(EVENT_CHIBIS_POOL || []).map(c => c.name)
    ]);

    const getGroupedEntries = () => {
      const grouped = {};
      validChibis.forEach(c => {
        const rarityKey = String(c.rarity || 'C').toUpperCase();
        const isEventChibi = rarityKey === 'SSRP' || eventChibiNames.has(c.name) || Boolean(c.isEvent);
        const key = `${rarityKey}_${c.name}_${c.isShiny ? 'shiny' : 'normal'}`;
        const uniqueId = c.chibiId || c.id;
        if (!grouped[key]) {
          grouped[key] = {
            rarity: rarityKey,
            emoji: c.emoji || '✨',
            name: c.name,
            isShiny: c.isShiny,
            isEventChibi,
            count: 0,
            firstId: uniqueId ? String(uniqueId).slice(-6) : 'unknown'
          };
        }
        grouped[key].count++;
      });
      const entries = Object.values(grouped);
      const rarityRank = { SSRP: 0, UGMR: 1, USRR: 2, STR: 3, UTR: 4, SRR: 5, SR: 6, R: 7, U: 8, C: 9 };
      if (sortBy === 'rarity') entries.sort((a, b) => (rarityRank[a.rarity] ?? 99) - (rarityRank[b.rarity] ?? 99));
      else if (sortBy === 'alpha') entries.sort((a, b) => a.name.localeCompare(b.name));
      return entries;
    };

    const renderColContainer = (page) => {
      const entries = getGroupedEntries();
      const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
      if (page >= totalPages) page = totalPages - 1;
      const pageItems = entries.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
      const formatted = pageItems.map((e, idx) => {
        const eventTag = (e.rarity === 'SSRP' || e.isEventChibi) ? ` ${EVENT_ICONS.EVENT_BADGE}` : '';
        return `**${page * itemsPerPage + idx + 1}.** \`[${e.firstId}]\` ${e.count}x ${rarityIconsMap[e.rarity] || '📦'} ${e.emoji} **${e.name}**${e.isShiny ? ` ${SHINY_ICON}` : ''}${eventTag}`;
      }).join('\n') || toSmallCaps('Collection page empty.');

      const container = new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# ${callerHasBetaView ? BETA_EMOJIS.COLLECTIONS : '📖'} ${user.customNickname || message.author.username}'s Chibi Collection (Page ${page + 1}/${totalPages})\n\nSort: ${sortBy === 'rarity' ? 'Rarity' : 'Alphabetical'}\n\n`) +
        formatted + toSmallCaps(`\n\n*Unique Types: ${new Set(validChibis.map(c => c.name)).size} | Total Owned: ${validChibis.length}*`)
      ));
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
    const colMsg = await message.reply({ components: [initialRender.container, ...getColRows(currentPage, initialRender.totalPages)], flags: MessageFlags.IsComponentsV2 });
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
    colCollector.on('end', async () => {
      const finalState = renderColContainer(currentPage);
      await colMsg.edit({ components: [finalState.container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  if (command === 'shop') {
    if (args[0]?.toLowerCase() === 'buy' && args[1]) {
      const diceObj = (gameData.shopDice || []).find(d => d.id.toLowerCase() === args[1].toLowerCase() || d.name.toLowerCase().includes(args[1].toLowerCase()));
      if (!diceObj) return message.reply(toSmallCaps('❌ Dice not found!'));
      const syncedBadges = await syncAllBadges(userId, user, message.guild, client);

      if (diceObj.restriction === 'cash' && Number(user.cash || 0) < Number(diceObj.cost || 0)) {
        return message.reply(toSmallCaps(`❌ Need ${diceObj.costDisplay || diceObj.cost} Cash!`));
      }
      if (diceObj.restriction === 'supporter' && !syncedBadges.includes('supporter') && !user.supporter && !user.betaSupporter) {
        return message.reply(toSmallCaps('❌ This dice requires the **Supporter** badge!'));
      }
      if (diceObj.restriction === 'developer' && userId !== db.config?.ownerId && !isTester(userId)) {
        return message.reply(toSmallCaps('❌ This dice is restricted to **Developer / Beta Testers**!'));
      }

      if (diceObj.restriction === 'cash') user.cash = Number(user.cash || 0) - Number(diceObj.cost || 0);
      if (!Array.isArray(user.ownedDice)) user.ownedDice = [];
      if (!user.ownedDice.includes(diceObj.id)) user.ownedDice.push(diceObj.id);
      user.equippedDice = diceObj.id;
      user.explicitlyEquippedDice = true;

      await syncAllBadges(userId, user, message.guild, client);
      await saveUsers();
      return message.reply(toSmallCaps(`✅ Equipped ${diceObj.emoji} **${diceObj.name}** (+${diceObj.luckPercent}% Luck)!`));
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('buy_spray').setLabel(toSmallCaps('Buy Spray (5 🎲)')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('buy_clover').setLabel(toSmallCaps('Buy Clover (15 🎲)')).setStyle(ButtonStyle.Success)
    );
    const diceList = (gameData.shopDice || []).map(d => {
      const cleanCost = String(d.costDisplay || d.cost || '0')
        .replace(/<:Newcurrency:1573803627691114598>/g, '')
        .replace(/\|/g, '')
        .trim();
      return `${d.emoji} **${d.name}** (\`${d.id}\`) — ${cleanCost} <:Newcurrency:1573803627691114598> +${d.luckPercent}%`;
    }).join('\n');
    const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(new TextDisplayBuilder().setContent(
      toSmallCaps('# 🛒 Chibi Shop\nBoost your rolling potential with shop items!\n\n🧴 Spray (5 🎲): Use this for Awesome Chibi boost [30 Uses]\n🍀 Clover (15 🎲): Use this to duplicate Chibis while rolling [50 Uses]\n\n**Shop Dice** (`' + currentPrefix + 'shop buy <id>`):\n') + diceList
    ));
    const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your shop session!'), ephemeral: true });
      if (!user.inventory?.items) user.inventory = { ...(user.inventory || {}), chibis: user.inventory?.chibis || [], items: { spray: 0, clover: 0 } };

      if (i.customId === 'buy_spray') {
        if (Number(user.dice || 0) < 5) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
        user.dice = Number(user.dice || 0) - 5;
        user.inventory.items.spray = (Number(user.inventory.items.spray) || 0) + 30;
        updateUserRank(user); await saveUsers();
        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Spray! Uses: ${user.inventory.items.spray}`), ephemeral: true });
      }
      if (i.customId === 'buy_clover') {
        if (Number(user.dice || 0) < 15) return i.followUp({ content: toSmallCaps('❌ Not enough dice!'), ephemeral: true });
        user.dice = Number(user.dice || 0) - 15;
        user.inventory.items.clover = (Number(user.inventory.items.clover) || 0) + 50;
        updateUserRank(user); await saveUsers();
        return i.followUp({ content: toSmallCaps(`✅ Successfully purchased Clover! Uses: ${user.inventory.items.clover}`), ephemeral: true });
      }
    });
    collector.on('end', async () => {
      await shopMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  if (command === 'rank') {
    updateUserRank(user); await saveUsers();
    return message.reply(toSmallCaps('🏆 Your current rank icon: ') + `${user.rank}`);
  }

  if (command === 'points') {
    updateUserRank(user); await saveUsers();
    return message.reply(toSmallCaps(`💰 Your current points balance is: **${user.points || 0}** (Rank: `) + `${user.rank}` + ')');
  }

  if (command === 'ranks') {
    const allSortedUsers = Object.entries(db.users).map(([uId, uData]) => { updateUserRank(uData); return { uId, ...uData }; }).sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
    const itemsPerPage = 10;
    let currentPage = 0;
    const totalPages = Math.max(1, Math.ceil(allSortedUsers.length / itemsPerPage));
    const seasonNum = db.config.seasonNumber || 1;
    const seasonMeta = SEASON_LIST[seasonNum] || { name: `Season ${seasonNum}` };
    const maxSeasonMs = 30 * 24 * 60 * 60 * 1000;
    const seasonTimerStr = formatTimeRemaining(Math.min(maxSeasonMs, Math.max(0, (db.config.seasonExpires || (Date.now() + maxSeasonMs)) - Date.now())));
    const userGlobalIndex = allSortedUsers.findIndex(u => u.uId === userId);
    const userRankPos = userGlobalIndex !== -1 ? userGlobalIndex + 1 : 'Unranked';
    const userPointsDisplay = Number(user.points) || 0;
    const userRankIcon = user.rank || '<:unranked:1571314276071907519>';

    const getRanksRow = (page) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rank_prev').setLabel(toSmallCaps('◀ Previous')).setStyle(ButtonStyle.Primary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('rank_next').setLabel(toSmallCaps('Next ▶')).setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
    );

    const renderRanksContainer = async (page) => {
      const pageUsers = allSortedUsers.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
      if (callerHasBetaView) {
        const lines = await Promise.all(pageUsers.map(async (u, idx) => {
          const username = await getDisplayName(u.uId);
          let clanSubLine = '';
          if (u.clan && db.clans[u.clan]) {
            clanSubLine = `\n   ${getClanLogoDisplay(db.clans[u.clan].logoId)} ` + toSmallCaps(u.clan.replace(/\*/g, ''));
          }
          return toSmallCaps(`**${page * itemsPerPage + idx + 1}.** @${username} | `) + `${u.rank}` + toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${(Number(u.points) || 0).toLocaleString()}`) + clanSubLine;
        }));
        return new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `${BETA_EMOJIS.CRR_TROPHY} ` + toSmallCaps(`**Chibi Global Leaderboard [${seasonMeta.name}]**\n`) +
          `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${seasonTimerStr} (Page ${page + 1}/${totalPages})\n\n`) +
          (lines.join('\n\n') || toSmallCaps('No players on the leaderboard yet.')) +
          toSmallCaps('\n\n____________________\n\n') + `${BETA_EMOJIS.USERS} ` + toSmallCaps('Your rank: ') + `${userRankIcon}` +
          toSmallCaps(` | ${BETA_EMOJIS.TROPHY_PTS} ${userPointsDisplay.toLocaleString()} (#${userRankPos})`)
        ));
      }

      const lines = await Promise.all(pageUsers.map(async (u, idx) => {
        const username = await getDisplayName(u.uId);
        let clanInfo = '';
        if (u.clan && db.clans[u.clan]) {
          clanInfo = ` | ${getClanLogoDisplay(db.clans[u.clan].logoId)} ${u.clan.replace(/\*/g, '')}`.trim();
        }
        return toSmallCaps(`**${page * itemsPerPage + idx + 1}.** **${username}** — Rank: `) + `${u.rank}` + toSmallCaps(` | Points: **${(Number(u.points) || 0).toLocaleString()}**`) + clanInfo;
      }));
      return new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# 🏆 Chibi Global Leaderboard Season ${seasonNum}\nEnd Season: ${seasonTimerStr}\n\n(Page ${page + 1}/${totalPages})\n\n`) +
        (lines.join('\n') || toSmallCaps('No players on the leaderboard yet.')) +
        toSmallCaps('\n\n-----------------------------------\n👤 Your Rank: #') + `${userRankPos} | Rank: ` + `${userRankIcon}` + toSmallCaps(` | Points: ${userPointsDisplay.toLocaleString()}`)
      ));
    };

    const ranksMsg = await message.reply({ components: [await renderRanksContainer(currentPage), getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 });
    const ranksCollector = ranksMsg.createMessageComponentCollector({ time: 120000 });
    ranksCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your leaderboard session!'), ephemeral: true });
      if (i.customId === 'rank_prev' && currentPage > 0) currentPage--;
      if (i.customId === 'rank_next' && currentPage < totalPages - 1) currentPage++;
      await ranksMsg.edit({ components: [await renderRanksContainer(currentPage), getRanksRow(currentPage)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    ranksCollector.on('end', async () => {
      await ranksMsg.edit({ components: [await renderRanksContainer(currentPage)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  if (command === 'ccranks') {
    const clanEntries = Object.entries(db.clans).map(([name, clan]) => ({
      name, clan, totalPoints: clan.members.reduce((acc, mId) => acc + (Number(db.users[mId]?.points) || 0), 0)
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    const maxClanSeasonMs = 30 * 24 * 60 * 60 * 1000;
    const clanTimerStr = formatTimeRemaining(Math.min(maxClanSeasonMs, Math.max(0, (db.config.clanSeasonExpires || (Date.now() + maxClanSeasonMs)) - Date.now())));
    const rewards = db.config.clanRewards || {};

    const formatReward = (rNum) => {
      const rw = rewards[rNum];
      if (!rw) return '100x 🎲 Dice (Consolation)';
      const sampleChibi = (gameData.chibis || []).find(c => c.rarity === rw.rarity) || (gameData.chibis || [])[0];
      return `${rw.qty} ${rarityIconsMap[rw.rarity] || '📦'} ${sampleChibi ? sampleChibi.emoji : rw.chibiEmoji}`;
    };

    const top10Lines = await Promise.all(clanEntries.slice(0, 10).map(async (c, idx) => toSmallCaps(
      `**${idx + 1}.** ${getClanLogoDisplay(c.clan.logoId)} ${c.name.replace(/\*/g, '')} | Leader: **${await getDisplayName(c.clan.leader)}** | Points: **${c.totalPoints.toLocaleString()}**`
    )));

    let userClanLine = toSmallCaps('You are not currently in a clan.');
    if (user.clan && db.clans[user.clan]) {
      const uClanObj = db.clans[user.clan];
      const uClanRankIdx = clanEntries.findIndex(c => c.name === user.clan);
      const uClanPoints = uClanObj.members.reduce((acc, mId) => acc + (Number(db.users[mId]?.points) || 0), 0);
      userClanLine = toSmallCaps(
        `${uClanRankIdx !== -1 ? `#${uClanRankIdx + 1}` : 'Unranked'}. ${getClanLogoDisplay(uClanObj.logoId)} ${user.clan.replace(/\*/g, '')} | ` +
        `Leader: **${await getDisplayName(uClanObj.leader)}** | Members: ${uClanObj.members.length} | Points: **${uClanPoints.toLocaleString()}**`
      );
    }

    const content = callerHasBetaView
      ? `${BETA_EMOJIS.GLOBAL} ` + toSmallCaps('**Top 10 Global Clan Leaderboard**\n') + `${BETA_EMOJIS.END_SEASON}: ` + toSmallCaps(`${clanTimerStr}\n\n`) +
        `${BETA_EMOJIS.RANKS_POS?.[1] || '🥇'}: ${formatReward(1)}\n${BETA_EMOJIS.RANKS_POS?.[2] || '🥈'}: ${formatReward(2)}\n${BETA_EMOJIS.RANKS_POS?.[3] || '🥉'}: ${formatReward(3)}\n\n` +
        toSmallCaps('-----------------------------------\n\n') + (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) +
        toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine
      : toSmallCaps(`# 🏛️ Top 10 Global Clan Leaderboard\nEnds: ${clanTimerStr}\n\n**Clan Rewards:**\n1st: ${formatReward(1)}\n2nd: ${formatReward(2)}\n3rd: ${formatReward(3)}\n\n-----------------------------------\n\n`) +
        (top10Lines.join('\n') || toSmallCaps('No clans registered yet.')) + toSmallCaps('\n\n-----------------------------------\n**Your Clan Status:**\n') + userClanLine;

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'tradehistory') {
    if (!db.tradeHistories?.[userId]?.length) return message.reply(toSmallCaps('📜 You have no recorded trade history yet.'));
    const historyLines = await Promise.all(db.tradeHistories[userId].slice(-10).reverse().map(async (entry, index) => toSmallCaps(
      `**${index + 1}.** Partner: **${await getDisplayName(entry.partnerId)}**\n   Date: ${new Date(entry.timestamp).toLocaleString()}`
    )));
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps('# 📜 Your Recent Trade History\n\n') + historyLines.join('\n\n')))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'trade') {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === userId) return message.reply(toSmallCaps(`❌ Usage: ${currentPrefix}trade [@user]`));
    ensureUser(target.id);

    const acceptRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade_accept').setLabel(toSmallCaps('Accept Trade')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trade_decline').setLabel(toSmallCaps('Decline')).setStyle(ButtonStyle.Danger)
    );
    const reqMsg = await message.reply({ content: toSmallCaps(`🤝 <@${target.id}>, you have been invited to trade by <@${userId}>! (Accept within 15 seconds)`), components: [acceptRow] });

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
        const p1Offer = { dice: 0, chibi: null }, p2Offer = { dice: 0, chibi: null };
        const getEmbed = () => {
          const getOfferText = (offer) => {
            const parts = [];
            if (offer.dice > 0) parts.push(`**${offer.dice} 🎲 Dice**`);
            if (offer.chibi) parts.push(`${rarityIconsMap[offer.chibi.rarity] || '📦'} ${offer.chibi.emoji} **${offer.chibi.name}** (Lv.${offer.chibi.level})`);
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
          const isP1 = ti.user.id === userId, isP2 = ti.user.id === target.id;
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
            if (Number(uObj.dice || 0) < amt) return ti.followUp({ content: toSmallCaps(`❌ You don't have enough dice! You have ${uObj.dice || 0} 🎲.`), ephemeral: true });
            currentOffer.dice = amt;
            return reqMsg.edit({ embeds: [getEmbed()], components: tradeRows }).catch(() => {});
          }
          if (ti.customId === 'trade_offer_chibi') {
            const uObj = db.users[ti.user.id];
            if (!uObj.inventory?.chibis?.length) return ti.followUp({ content: toSmallCaps('❌ You have no chibis in your inventory to offer!'), ephemeral: true });
            const menuRow = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId('trade_select_chibi').setPlaceholder(toSmallCaps('Select a Chibi to offer')).addOptions(
                uObj.inventory.chibis.slice(0, 25).map(c => ({ label: `${c.name} (${c.rarity}) Lv.${c.level}`.slice(0, 100), value: c.chibiId || c.id }))
              )
            );
            await ti.followUp({ content: toSmallCaps('Choose a chibi from your inventory below:'), components: [menuRow], ephemeral: true });
            const selection = await ti.channel.awaitMessageComponent({ filter: int => int.user.id === ti.user.id && int.customId === 'trade_select_chibi', time: 25000 }).catch(() => null);
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
            const u1 = db.users[userId], u2 = db.users[target.id];
            if ((!p1Offer.dice && !p1Offer.chibi) || (!p2Offer.dice && !p2Offer.chibi)) {
              return ti.followUp({ content: toSmallCaps('❌ Both players must offer at least something (dice or chibi) before confirming!'), ephemeral: true });
            }
            if (Number(u1.dice || 0) < p1Offer.dice || Number(u2.dice || 0) < p2Offer.dice) {
              return ti.followUp({ content: toSmallCaps('❌ One of the players no longer has enough dice for this trade!'), ephemeral: true });
            }

            if (p1Offer.dice > 0) {
              u1.dice = Number(u1.dice || 0) - p1Offer.dice;
              u2.dice = Number(u2.dice || 0) + p1Offer.dice;
            }
            if (p1Offer.chibi) {
              const idx = u1.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p1Offer.chibi.chibiId || p1Offer.chibi.id));
              if (idx !== -1) u2.inventory.chibis.push(u1.inventory.chibis.splice(idx, 1)[0]);
            }
            if (p2Offer.dice > 0) {
              u2.dice = Number(u2.dice || 0) - p2Offer.dice;
              u1.dice = Number(u1.dice || 0) + p2Offer.dice;
            }
            if (p2Offer.chibi) {
              const idx = u2.inventory.chibis.findIndex(c => (c.chibiId || c.id) === (p2Offer.chibi.chibiId || p2Offer.chibi.id));
              if (idx !== -1) u1.inventory.chibis.push(u2.inventory.chibis.splice(idx, 1)[0]);
            }

            if (!db.tradeHistories) db.tradeHistories = {};
            if (!db.tradeHistories[userId]) db.tradeHistories[userId] = [];
            if (!db.tradeHistories[target.id]) db.tradeHistories[target.id] = [];
            const tradeTimestamp = Date.now();
            db.tradeHistories[userId].push({ partnerId: target.id, timestamp: tradeTimestamp });
            db.tradeHistories[target.id].push({ partnerId: userId, timestamp: tradeTimestamp });

            updateUserRank(u1); updateUserRank(u2);
            await syncAllBadges(userId, u1, message.guild, client);
            await syncAllBadges(target.id, u2, message.guild, client);
            await saveUsers();
            tradeCollector.stop();

            return reqMsg.edit({ content: toSmallCaps(`✅ Trade successfully completed between <@${userId}> and <@${target.id}>!`), embeds: [getEmbed()], components: [] }).catch(() => {});
          }
        });
      }
    });
    return true;
  }

  if (command === 'profile') {
    const targetUserMention = message.mentions.users.first();
    const targetUserId = targetUserMention ? targetUserMention.id : userId;
    ensureUser(targetUserId);
    const targetUserData = db.users[targetUserId];
    updateUserRank(targetUserData);

    if (targetUserData.inventory?.chibis?.length > 0) {
      let highestChibi = null, highestTier = 0, highestVal = 0;
      const allChibisPool = [...(gameData.chibis || []), ...(gameData.eventChibis || [])];
      for (const c of targetUserData.inventory.chibis) {
        const tier = RARITY_HIERARCHY[c.rarity] || 1;
        const template = allChibisPool.find(t => t.name === c.name && t.rarity === c.rarity);
        const oddsStr = template ? (c.isShiny ? template.shinyOdds : template.odds) : '1 in 1';
        const val = parseOddsNumber(oddsStr);
        if (tier > highestTier || (tier === highestTier && val > highestVal)) {
          highestTier = tier; highestVal = val; highestChibi = { chibi: c, oddsStr };
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
    const allSortedUsers = Object.entries(db.users).map(([uId, uData]) => ({ uId, points: Number(uData.points) || 0 })).sort((a, b) => b.points - a.points);
    const globalIndex = allSortedUsers.findIndex(u => u.uId === targetUserId);
    const leaderboardPos = globalIndex !== -1 ? `#${globalIndex + 1}` : 'Unranked';
    const joinedDateStr = targetUserData.joinedDate || 'N/A';
    const displayName = targetUserData.customNickname || targetMember.username;
    const rarityCounts = { SSRP: 0, UGMR: 0, USRR: 0, STR: 0, UTR: 0, SRR: 0, SR: 0, R: 0, U: 0, C: 0 };
    targetUserData.inventory?.chibis?.forEach(c => { if (rarityCounts[c.rarity] !== undefined) rarityCounts[c.rarity]++; });

    const syncedBadges = await syncAllBadges(targetUserId, targetUserData, message.guild, client);
    await saveUsers();

    const canUseBgPerk = hasBackgroundPerk(targetUserData, syncedBadges);
    const activeThemeKey = canUseBgPerk ? (targetUserData.profileBgTheme || 'crystal') : 'crystal';
    const activeTheme = BACKGROUND_THEMES[activeThemeKey] || BACKGROUND_THEMES.crystal;
    const customAccent = canUseBgPerk && typeof targetUserData.profileAccentColor === 'number'
      ? targetUserData.profileAccentColor
      : activeTheme.accent;

    const cardBuffer = await renderProfileCard({
      targetUserData: {
        ...targetUserData,
        badges: syncedBadges,
        profileBg: null,
        profileAccentColor: customAccent,
        clanLogoId: targetUserData.clan && db.clans[targetUserData.clan]
          ? db.clans[targetUserData.clan].logoId
          : null
      },
      targetMember,
      displayName,
      joinedDateStr,
      leaderboardPos,
      syncedBadges,
      rarityCounts,
      rarityIconsMap,
      betaEmojis: BETA_EMOJIS,
      useBetaStyle: Boolean(callerHasBetaView && isTester(userId)),
      themeKey: activeThemeKey,
      customBgUrl: targetUserData.customBg || null
    });

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'profile-card.png' });
    return message.reply({ files: [attachment] });
  }

  return false;
}

module.exports = { commands: CORE_CMDS, execute };