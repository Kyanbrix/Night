const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder, MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const { BETA_EMOJIS, EVENT_ICONS, EVENT_NPCS, EVENT_CHIBIS_POOL, SHINY_ICON } = require('../core/constants');
const database = require('../core/database');
const { gameData, db, saveUsers } = database;
const { toSmallCaps, evaluateAndSyncUserBadges, addExpAndLevelUp } = require('../core/helpers');

const EVENT_CMDS = ['event', 'ecrystal', 'eadventure', 'eshop'];

async function persistConfig() {
  if (typeof database.saveConfig === 'function') {
    await database.saveConfig().catch(() => {});
  }
}

async function execute(ctx) {
  const { command, message, userId, currentPrefix, user, callerHasBetaView } = ctx;
  if (!EVENT_CMDS.includes(command)) return false;

  if (command === 'event') {
    if (!db.config.eventActive) return message.reply(toSmallCaps('❌ The Beta Event is currently inactive!'));
    const crystals = db.config.eventCrystals?.[userId] || 0;
    const eventDescription = 'Welcome to the official Chibi RPG Beta Event! Embark on thrilling adventures, challenge mysterious wandering NPCs across the realm, battle rival players in the arena, and collect exclusive rare event chibis using event crystals to claim supreme glory and build the ultimate collection!';

    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x9b59b6).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
        `# 📦 BETA EVENT HUB & INFORMATION\n\n${EVENT_ICONS.TIPS} **DESCRIPTION:**\n${eventDescription}\n\n` +
        `-----------------------------------\n🎯 **HOW TO PARTICIPATE:**\n` +
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
      )))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === 'ecrystal') {
    return message.reply(toSmallCaps(`💎 You currently have **${db.config.eventCrystals?.[userId] || 0}** Event Crystals ${EVENT_ICONS.CRYSTAL}.`));
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
      collector.stop();

      if (i.customId === 'decline_npc_fight') {
        return advMsg.edit({ content: toSmallCaps(`🏃 You fled from ${randomNpc.name}. Safe travels!`), components: [] }).catch(() => {});
      }

      if (i.customId === 'accept_npc_fight') {
        const npcAtk = Math.floor(Math.random() * 36) + 10;
        const npcHp = Math.floor(Math.random() * 1329) + 400;
        const npcDef = Math.floor(Math.random() * 66) + 40;
        const eventPool = (gameData.eventChibis?.length ? gameData.eventChibis : EVENT_CHIBIS_POOL);
        const npcRandomChibi = eventPool[Math.floor(Math.random() * eventPool.length)];

        const userTeam = (user.team || [null, null, null]).map(id => id ? user.inventory.chibis.find(c => (c.chibiId || c.id) === id) : null);
        let userPower = 50;
        userTeam.forEach(c => {
          if (c) {
            const statCfg = gameData.stats[c.rarity]?.[c.isShiny ? 'shiny' : 'normal'] || { hp: 100, atk: 20, def: 10 };
            userPower += (statCfg.hp + c.level * statCfg.hpPer) + (statCfg.atk + c.level * statCfg.atkPer) * 3;
          }
        });

        const isUserWinner = userPower >= (npcHp + npcAtk * 3 + npcDef * 2) * (0.85 + Math.random() * 0.3);
        if (!db.config.eventCrystals) db.config.eventCrystals = {};

        const rewardCrystal = isUserWinner ? 17 : 8;
        let npcDropText = isUserWinner ? 'NO SHINY DROP (0.1% CHANCE)' : 'DEFEATED (NO DROP)';
        db.config.eventCrystals[userId] = (db.config.eventCrystals[userId] || 0) + rewardCrystal;

        if (isUserWinner && Math.random() * 100 <= 0.1 && eventPool.length > 0) {
          const droppedEventChibi = eventPool[Math.floor(Math.random() * eventPool.length)];
          const generatedId = new mongoose.Types.ObjectId().toString();
          if (!user.inventory.chibis) user.inventory.chibis = [];
          user.inventory.chibis.push({
            id: generatedId, chibiId: generatedId, name: droppedEventChibi.name, rarity: 'SSRP',
            emoji: droppedEventChibi.emoji, isShiny: true, isEvent: true, level: 1, exp: 0, date: new Date().toLocaleDateString()
          });
          npcDropText = `RECEIVED SHINY ${SHINY_ICON} ${droppedEventChibi.emoji} ${droppedEventChibi.name}`;
        }

        const awardedExp = addExpAndLevelUp(user, userTeam.find(Boolean), 350);
        await evaluateAndSyncUserBadges(userId, user, message.guild);
        await saveUsers();
        await persistConfig();

        const resultContainer = new ContainerBuilder().setAccentColor(isUserWinner ? 0x2ecc71 : 0xe74c3c).addTextDisplayComponents(new TextDisplayBuilder().setContent(toSmallCaps(
          `# ⚔️ ADVENTURE BATTLE RESULT\n\nOPPONENT: ${randomNpc.icon} ${randomNpc.name}\nNPC CHIBI: ${npcRandomChibi.emoji} ${npcRandomChibi.name}\n` +
          `NPC STATS -> ${callerHasBetaView ? BETA_EMOJIS.ATK : '⚔️'} ATK: ${npcAtk} | ${callerHasBetaView ? BETA_EMOJIS.HP : '❤️'} HP: ${npcHp}\n` +
          `${callerHasBetaView ? BETA_EMOJIS.DEF : '🛡️'} DEF: ${npcDef}\n\n${isUserWinner ? '🏆 VICTORY! YOU DEFEATED THE NPC!' : '💔 DEFEATED BY THE NPC!'}\n` +
          `💎 CRYSTALS EARNED: +${rewardCrystal} ${EVENT_ICONS.CRYSTAL}\n🎁 NPC DROP: ${npcDropText}\n✨ EXP GAINED: +${awardedExp}`
        )));
        await advMsg.edit({ content: '', components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    });

    collector.on('end', async () => {
      if (!handled) await advMsg.edit({ content: toSmallCaps(`⏳ Encounter with ${randomNpc.name} timed out.`), components: [] }).catch(() => {});
    });
    return true;
  }

  if (command === 'eshop') {
    if (!db.config.eventActive) return message.reply(toSmallCaps('❌ Beta Event is inactive!'));
    const crystals = db.config.eventCrystals?.[userId] || 0;

    const shopMap = (db.config.eventShop && Object.keys(db.config.eventShop).length > 0)
      ? db.config.eventShop
      : Object.fromEntries((gameData.eventChibis || EVENT_CHIBIS_POOL || []).map(c => [String(c.id), c]));

    const shopItems = Object.values(shopMap).sort((a, b) => a.cost - b.cost);
    if (!shopItems.length) return message.reply(toSmallCaps('❌ The Event Shop is currently empty!'));

    const shopLines = shopItems.map((item, idx) => toSmallCaps(`**[${idx + 1}]** ${item.emoji} **${item.name}** — **${item.cost.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}`)).join('\n');

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('eshop_buy_select').setPlaceholder(toSmallCaps('Select an event chibi to purchase')).addOptions(
        shopItems.slice(0, 25).map(item => ({ label: `${item.name} (${item.cost} Crystals)`.slice(0, 100), value: String(item.id) }))
      )
    );

    const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(new TextDisplayBuilder().setContent(
      toSmallCaps(`# 💎 Beta Event Crystal Shop\n\nYour Crystal Balance: **${crystals.toLocaleString()}** ${EVENT_ICONS.CRYSTAL}\n\n*Select from the dropdown menu below to exchange your crystals for exclusive SSRP event chibis!*:\n\n`) + shopLines
    ));
    const shopMsg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    const collector = shopMsg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your eshop session!'), ephemeral: true });
      if (i.customId !== 'eshop_buy_select') return;

      const item = shopMap[i.values[0]];
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
        emoji: item.emoji, isShiny: false, isEvent: true, level: 1, exp: 0, date: new Date().toLocaleDateString()
      });

      await evaluateAndSyncUserBadges(userId, user, message.guild);
      await saveUsers();
      await persistConfig();
      return i.followUp({ content: toSmallCaps(`✅ Successfully purchased ${item.emoji} **${item.name}**! It has been added directly to your collections with the Event badge ${EVENT_ICONS.EVENT_BADGE}.`), ephemeral: true });
    });
    return true;
  }

  return false;
}

module.exports = { commands: EVENT_CMDS, execute };