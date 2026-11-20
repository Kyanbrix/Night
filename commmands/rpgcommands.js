const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ContainerBuilder, TextDisplayBuilder, MessageFlags
} = require('discord.js');
const fetch = require('node-fetch');
const { BETA_EMOJIS, EVENT_ICONS, TRIVIA_BANK, SHINY_ICON } = require('../core/constants');
const { gameData, db, saveUsers } = require('../core/database');
const { toSmallCaps, updateUserRank, evaluateAndSyncUserBadges, ensureUser, addExpAndLevelUp } = require('../core/helpers');

const RPG_CMDS = ['cstats', 'equipteam', 'battle', 'meme', 'trivia'];

async function execute(ctx) {
  const { command, args, message, userId, currentPrefix, user, callerHasBetaView, rarityIconsMap } = ctx;
  if (!RPG_CMDS.includes(command)) return false;

  if (command === 'cstats') {
    if (!user.inventory?.chibis?.length) return message.reply(toSmallCaps('❌ You have no chibis in your inventory!'));

    const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
    const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
    const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

    const teamLines = (user.team || [null, null, null]).map((chibiId, index) => {
      if (!chibiId) return toSmallCaps(`**[${index + 1}]** *Empty Slot* (Use ${currentPrefix}equipteam [id] ${index + 1})`);
      const chibi = user.inventory.chibis.find(c => (c.chibiId || c.id) === chibiId);
      if (!chibi) return toSmallCaps(`**[${index + 1}]** *Chibi missing from inventory*`);

      const statCfg = gameData.stats[chibi.rarity]?.[chibi.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
      const baseExp = chibi.isShiny ? gameData.settings.shinyChibiExpBase : gameData.settings.normalChibiExpBase;
      const perLvl = chibi.isShiny ? gameData.settings.shinyChibiExpPerLevel : gameData.settings.normalChibiExpPerLevel;
      const maxExp = baseExp + (chibi.level - 1) * perLvl;
      const shortId = (chibi.chibiId || chibi.id).slice(-6);

      return (
        `**[${index + 1}]** \`[${shortId}]\` ${rarityIconsMap[chibi.rarity] || '🌟'} ${chibi.emoji} **${chibi.name}**` +
        `${chibi.isShiny ? ` ${SHINY_ICON}` : ''}${chibi.rarity === 'SSRP' ? ` ${EVENT_ICONS.EVENT_BADGE}` : ''}\n` +
        `Lvl ${chibi.level} [\`${chibi.exp}/${maxExp}\`]\n` +
        `${hpIcon} HP: \`${statCfg.hp + chibi.level * statCfg.hpPer}\` | ${defIcon} DEF: \`${statCfg.def + chibi.level * statCfg.defPer}\` | ${atkIcon} ATK: \`${statCfg.atk + chibi.level * statCfg.atkPer}\`\n`
      );
    });

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# 📜 ${user.customNickname || message.author.username}'s Team Card\n\n`) +
        teamLines.join('\n') +
        toSmallCaps(`\n\n*Tip: Use ${currentPrefix}equipteam [id] [1-3] to assign chibis to your team slots!*`)
      ))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'equipteam') {
    const chibiIdArg = args[0], slot = parseInt(args[1], 10);
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

    const expMsg = wasEmpty
      ? toSmallCaps(`\n✨ Team slot bonus: +${addExpAndLevelUp(user, chibi, 250)} EXP awarded to you and **${chibi.name}**!`)
      : '';
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
      collector.stop();

      if (i.customId !== 'accept_battle') {
        return battleMsg.edit({ content: toSmallCaps(`❌ <@${opponent.id}> declined the 3v3 arena clash.`), components: [] }).catch(() => {});
      }

      const p1User = user, p2User = db.users[opponent.id];
      const getTeamChibis = (u) => (u.team || [null, null, null]).map(id => id ? u.inventory.chibis.find(c => (c.chibiId || c.id) === id) : null);
      const p1Team = getTeamChibis(p1User), p2Team = getTeamChibis(p2User);

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

      const p1Stats = getTeamCombatStats(p1Team), p2Stats = getTeamCombatStats(p2Team);
      const isP1Winner = p1Stats.totalPower * (0.85 + Math.random() * 0.3) >= p2Stats.totalPower * (0.85 + Math.random() * 0.3);
      const winner = isP1Winner ? message.author : opponent;
      const winUser = isP1Winner ? p1User : p2User;
      const loseUser = isP1Winner ? p2User : p1User;

      const getBattlePoints = (pts) => {
        if (pts >= 8002) return { win: Math.floor(Math.random() * 31) + 120, lose: 75 };
        if (pts >= 5501) return { win: Math.floor(Math.random() * 31) + 90, lose: 50 };
        if (pts >= 4001) return { win: Math.floor(Math.random() * 31) + 70, lose: 30 };
        if (pts >= 2501) return { win: Math.floor(Math.random() * 31) + 50, lose: 20 };
        if (pts >= 1000) return { win: Math.floor(Math.random() * 21) + 20, lose: 10 };
        return { win: Math.floor(Math.random() * 11) + 10, lose: 5 };
      };

      const winReward = getBattlePoints(winUser.points), losePenalty = getBattlePoints(loseUser.points);
      winUser.points += winReward.win;
      loseUser.points = Math.max(0, loseUser.points - losePenalty.lose);

      if (!db.config.eventCrystals) db.config.eventCrystals = {};
      const winId = winUser === p1User ? userId : opponent.id;
      const loseId = loseUser === p1User ? userId : opponent.id;
      db.config.eventCrystals[winId] = (db.config.eventCrystals[winId] || 0) + Math.floor(Math.random() * 7) + 10;
      db.config.eventCrystals[loseId] = (db.config.eventCrystals[loseId] || 0) + Math.floor(Math.random() * 7) + 2;

      const totalExpWon = addExpAndLevelUp(winUser, (isP1Winner ? p1Team : p2Team).find(Boolean), 400);
      updateUserRank(p1User); updateUserRank(p2User);
      await evaluateAndSyncUserBadges(userId, p1User, message.guild);
      await evaluateAndSyncUserBadges(opponent.id, p2User, message.guild);
      await saveUsers();

      const hpIcon = callerHasBetaView ? BETA_EMOJIS.HP : '❤️';
      const atkIcon = callerHasBetaView ? BETA_EMOJIS.ATK : '🗡️';
      const defIcon = callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️';

      const renderTeamLineWithStats = (team, isWinnerTeam) => team.map((c, idx) => {
        if (!c) return toSmallCaps(`**[${idx + 1}]** *Empty Slot*`);
        const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, hpPer: 10, atk: 20, atkPer: 2, def: 10, defPer: 1 };
        const hp = statCfg.hp + c.level * statCfg.hpPer;
        const atk = statCfg.atk + c.level * statCfg.atkPer;
        const def = statCfg.def + c.level * statCfg.defPer;
        return toSmallCaps(`**[${idx + 1}]** `) + `${rarityIconsMap[c.rarity] || '📦'} ${c.emoji} **${c.name}** ${c.isShiny ? SHINY_ICON : ''}` +
          toSmallCaps(` (Lvl ${c.level}) — ${hpIcon} HP: \`${isWinnerTeam ? hp : 0}\` | ${atkIcon} ATK: \`${atk}\` | ${defIcon} DEF: \`${def}\``);
      }).join('\n');

      const container = new ContainerBuilder().setAccentColor(isP1Winner ? 0xf1c40f : 0xe74c3c).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        toSmallCaps(`# ⚔️ 3v3 Chibi Arena Clash Result\n\n🏆 Winner: <@${winner.id}> triumphs in a fierce 3v3 showdown!\n\n🛡️ ${user.customNickname || message.author.username}'s Team Lineup:\n`) +
        renderTeamLineWithStats(p1Team, isP1Winner) +
        toSmallCaps(`\n\n🛡️ ${db.users[opponent.id].customNickname || opponent.username}'s Team Lineup:\n`) +
        renderTeamLineWithStats(p2Team, !isP1Winner) +
        toSmallCaps(`\n\n📊 Match Rewards: ✨ Victor earned +${winReward.win} Points, +${totalExpWon} EXP & Crystals! 💔 Loser lost -${losePenalty.lose} Points.`)
      ));
      await battleMsg.edit({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });

    collector.on('end', async () => {
      if (!handled) await battleMsg.edit({ content: toSmallCaps('⏳ Arena clash request timed out (5s elapsed) and was automatically cancelled.'), components: [] }).catch(() => {});
    });
    return true;
  }

  if (command === 'meme') {
    const data = await (await fetch('https://meme-api.com/gimme')).json();
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0xe74c3c).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(`# ${data.title}\n*(r/${data.subreddit})*`)))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'trivia') {
    const selected = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
    await message.reply(toSmallCaps(`🧩 Trivia Challenge:\n${selected.q}\n*(Type your answer in chat within 15 seconds!)*`));

    const collector = message.channel.createMessageCollector({ filter: m => m.author.id === userId, time: 15000, max: 1 });
    collector.on('collect', async m => {
      const userAnswer = m.content.toLowerCase().trim();
      if (selected.a.some(ans => userAnswer.includes(ans))) {
        const awardedPoints = Math.floor(Math.random() * 4) + 17;
        const awardedExp = addExpAndLevelUp(user, null, 450);
        const triviaCrystals = Math.floor(Math.random() * 6) + 5;
        user.points += awardedPoints;
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
    return true;
  }

  return false;
}

module.exports = { commands: RPG_CMDS, execute };