const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const { BETA_EMOJIS, CLAN_ROLE_HIERARCHY, CLAN_LOGOS } = require('../core/constants');
const { gameData, db, saveUsers } = require('../core/database');
const {
  isTester, toSmallCaps, updateUserRank, evaluateAndSyncUserBadges,
  getClanLogoDisplay, getClanLogoImageUrl, getClanLogoListText, getClanMemberRole, pushClanMail
} = require('../core/helpers');

const CLAN_CMDS = [
  'clanlist', 'ccreateclan', 'cclanjoin', 'clanleave', 'clanrename',
  'ceditdesc', 'cpromote', 'kick', 'cannounce', 'cmail', 'cclaninfo'
];

async function execute(ctx) {
  const { command, args, message, userId, currentPrefix, user, callerHasBetaView, rarityIconsMap, getDisplayName } = ctx;
  if (!CLAN_CMDS.includes(command)) return false;

  if (command === 'clanlist') {
    const clanNames = Object.keys(db.clans);
    if (clanNames.length === 0) return message.reply(toSmallCaps('🏛️ There are currently no clans available.'));
    let sortBy = 'points';

    const getSortedClanEntries = async () => {
      const entries = await Promise.all(clanNames.map(async name => {
        const clan = db.clans[name];
        const leaderName = await getDisplayName(clan.leader);
        const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
        return { name, leaderName, totalPoints, memberCount: clan.members.length, logoId: clan.logoId || '1' };
      }));
      entries.sort((a, b) => sortBy === 'points' ? b.totalPoints - a.totalPoints : b.memberCount - a.memberCount);
      return entries;
    };

    const renderClanContainer = async () => {
      const sortedEntries = await getSortedClanEntries();
      const clanListText = sortedEntries.map((c, idx) => toSmallCaps(
        `${idx + 1}. ${getClanLogoDisplay(c.logoId)} ${c.name.replace(/\*/g, '')} | Leader: ${c.leaderName} | Points: 🏆 ${c.totalPoints.toLocaleString()} | Members: 👥 ${c.memberCount}`
      )).join('\n');
      return new ContainerBuilder().setAccentColor(0x34495e).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(toSmallCaps(`# 🏛️ Available Clans\n\nSorted by: ${sortBy === 'points' ? 'Total Points' : 'Member Count'}\n\n`) + clanListText)
      );
    };

    const getClanRows = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sort_points').setLabel(toSmallCaps('Sort by Points 🏆')).setStyle(sortBy === 'points' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sort_members').setLabel(toSmallCaps('Sort by Members 👥')).setStyle(sortBy === 'members' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const initialContainer = await renderClanContainer();
    const clanMsg = await message.reply({ components: [initialContainer, getClanRows()], flags: MessageFlags.IsComponentsV2 });

    const clanCollector = clanMsg.createMessageComponentCollector({ time: 120000 });
    clanCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your clan list session!'), ephemeral: true });
      if (i.customId === 'sort_points') sortBy = 'points';
      if (i.customId === 'sort_members') sortBy = 'members';
      await clanMsg.edit({ components: [await renderClanContainer(), getClanRows()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    clanCollector.on('end', async () => {
      await clanMsg.edit({ components: [await renderClanContainer()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
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
    user.dice = Number(user.dice || 0) - clanCreationCost;
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
    let handled = false;
    leaveCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('Not your confirmation!'), ephemeral: true });
      handled = true;
      leaveCollector.stop();
      if (i.customId === 'confirm_leave') {
        const targetClan = db.clans[clanName];
        if (targetClan) {
          targetClan.members = targetClan.members.filter(id => id !== userId);
          if (targetClan.roles) delete targetClan.roles[userId];
          if (targetClan.viceLeader === userId) targetClan.viceLeader = null;
          if (targetClan.members.length === 0) delete db.clans[clanName];
        }
        user.clan = null;
        await saveUsers();
        return leaveMsg.edit({ content: toSmallCaps(`✅ Successfully left the clan **${clanName}**.`), components: [] }).catch(() => {});
      }
      return leaveMsg.edit({ content: toSmallCaps('❌ Clan leave request cancelled.'), components: [] }).catch(() => {});
    });
    leaveCollector.on('end', async () => {
      if (!handled) await leaveMsg.edit({ components: [] }).catch(() => {});
    });
    return true;
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
      return message.reply(toSmallCaps(
        `❌ Usage: ${currentPrefix}clanrename [NewClanName] [Logo ID 1-12]\n*(Renames left: ${3 - currentRenameCount}/3)*\n\nAvailable Clan Logos:\n` + getClanLogoListText()
      ));
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
    return message.reply(toSmallCaps(
      `✅ Successfully updated clan! Name: **${newNameArg}**, Logo: ${getClanLogoDisplay(newLogoArg)}\n*(Renames/Updates used: ${currentRenameCount + 1}/3)*`
    ));
  }

  if (command === 'ceditdesc') {
    if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
    if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
    const clanObj = db.clans[user.clan];
    const actorRole = getClanMemberRole(clanObj, userId);
    if ((CLAN_ROLE_HIERARCHY[actorRole] || 0) < CLAN_ROLE_HIERARCHY['Co-Leader']) {
      return message.reply(toSmallCaps('❌ Only the Clan Leader or Co-Leader can edit the clan description!'));
    }
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
    if (actorTier < CLAN_ROLE_HIERARCHY.Officer) {
      return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can promote members!'));
    }

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
    let promoted = false;
    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.followUp({ content: toSmallCaps('❌ Only the command sender can select the position!'), ephemeral: true });
      const chosenRole = i.values[0];
      if (actorRole !== 'Leader' && (CLAN_ROLE_HIERARCHY[chosenRole] || 0) >= actorTier) {
        return i.followUp({ content: toSmallCaps('❌ You cannot assign a position equal to or higher than your own rank!'), ephemeral: true });
      }
      promoted = true;
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
    collector.on('end', async () => {
      if (!promoted) await promptMsg.edit({ components: [] }).catch(() => {});
    });
    return true;
  }

  if (command === 'kick') {
    if (!isTester(userId)) return message.reply(toSmallCaps('❌ This command is restricted to authorized beta testers only!'));
    if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
    const clanObj = db.clans[user.clan];
    const actorRole = getClanMemberRole(clanObj, userId);
    const actorTier = CLAN_ROLE_HIERARCHY[actorRole] || 0;
    if (actorTier < CLAN_ROLE_HIERARCHY.Officer) {
      return message.reply(toSmallCaps('❌ Only the Clan Leader, Co-Leader, or Officer can kick clan members!'));
    }

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
      new ButtonBuilder().setCustomId('cmail_claim_rewards_btn').setEmoji('1572814245848940707').setLabel(toSmallCaps('Claim')).setStyle(ButtonStyle.Success)
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
      mailCollector.on('end', async () => {
        await mailMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      });
      return true;
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
            for (let q = 0; q < qty; q++) {
              const generatedId = new mongoose.Types.ObjectId().toString();
              user.inventory.chibis.push({
                id: generatedId, chibiId: generatedId, name: rw.name || sampleChibi.name, rarity,
                emoji: rw.emoji || sampleChibi.emoji, isShiny: false, level: 1, exp: 0, date: new Date().toLocaleDateString()
              });
            }
            claimedSummaries.push(`${qty}x ${rarityIconsMap[rarity] || ''} ${rw.emoji || sampleChibi.emoji} ${rw.name || sampleChibi.name}`);
          } else if (rw.type === 'dice') {
            const diceAmt = Math.max(1, parseInt(rw.dice, 10) || 0);
            user.dice = Number(user.dice || 0) + diceAmt;
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
    mailCollector.on('end', async () => {
      await mailMsg.edit({ components: [renderMailContainer()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  if (command === 'cclaninfo') {
    if (!user.clan || !db.clans[user.clan]) return message.reply(toSmallCaps('❌ You are not in a clan!'));
    const clan = db.clans[user.clan];
    const totalPoints = clan.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0);
    const cleanClanName = clan.name.replace(/\*/g, '');
    const logoEmoji = getClanLogoDisplay(clan.logoId);
    const leaderName = await getDisplayName(clan.leader);

    if (callerHasBetaView) {
      const clanTotals = Object.entries(db.clans)
        .map(([cName, cData]) => ({ cName, pts: cData.members.reduce((acc, mId) => acc + (db.users[mId]?.points || 0), 0) }))
        .sort((a, b) => b.pts - a.pts);
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
          `${BETA_EMOJIS.CLAN_DESC}: ` + toSmallCaps(`${clanDescText}\n\n`) + memberLines.join('\n')
        ))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(getClanLogoImageUrl(clan.logoId)));

      return message.reply({ components: [new ContainerBuilder().setAccentColor(0x1abc9c).addSectionComponents(section)], flags: MessageFlags.IsComponentsV2 });
    }

    const memberLines = await Promise.all(clan.members.map(async (mId, idx) => {
      const mUser = db.users[mId];
      if (mUser) updateUserRank(mUser);
      const mUsername = await getDisplayName(mId);
      const role = getClanMemberRole(clan, mId);
      return toSmallCaps(`${idx + 1}. ${mUsername} [${role}] `) + `${mUser?.rank || '<:unranked:1571314276071907519>'}` + toSmallCaps(` | Points: ${mUser?.points || 0}`);
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

  return false;
}

module.exports = { commands: CLAN_CMDS, execute };