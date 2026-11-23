const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');

const { db } = require('../core/database');
const {
  toSmallCaps,
  updateUserRank,
  evaluateAndSyncUserBadges,
  addExpAndLevelUp
} = require('../core/helpers');

const ECONOMY_COMMANDS = [
  'work', 'working', 'workshift', 'job', 'jobs',
  'balance',
  'casino', 'blackjack', 'coinflip',
  'ticketbuy', 'ticketuse', 'lottery',
  'csell'
];

const BASE_JOBS = [
  {
    id: 'farmer',
    name: 'Farmer',
    emoji: '🌾',
    minSalary: 50000,
    maxSalary: 150000,
    shiftSalary: 250000,
    isEvent: false
  },
  {
    id: 'streamer',
    name: 'Streamer',
    emoji: '🎮',
    minSalary: 80000,
    maxSalary: 210000,
    shiftSalary: 450000,
    isEvent: false
  },
  {
    id: 'youtuber',
    name: 'YouTuber',
    emoji: '📹',
    minSalary: 120000,
    maxSalary: 500000,
    shiftSalary: 650000,
    isEvent: false
  },
  {
    id: 'seaman',
    name: 'Seaman',
    emoji: '⚓',
    minSalary: 350000,
    maxSalary: 600000,
    shiftSalary: 1200000,
    isEvent: false
  }
];

const PH_EVENT_JOBS = [
  {
    id: 'akyat_bahay',
    name: 'Akyat Bahay',
    emoji: '🥷',
    minSalary: 350000,
    maxSalary: 800000,
    shiftSalary: 1000000,
    isEvent: true
  },
  {
    id: 'adik_sa_sha',
    name: 'Adik sa Sha',
    emoji: '🧪',
    minSalary: 500000,
    maxSalary: 1300000,
    shiftSalary: 5000000,
    isEvent: true
  },
  {
    id: 'promoter_sa_sugal',
    name: 'Promoter Sa Sugal',
    emoji: '🎰',
    minSalary: 900000,
    maxSalary: 3450000,
    shiftSalary: 15000000,
    isEvent: true
  },
  {
    id: 'artista_sa_pilipinas',
    name: 'Artista Sa Pilipinas',
    emoji: '🎬',
    minSalary: 2300000,
    maxSalary: 6700000,
    shiftSalary: 25000000,
    isEvent: true
  },
  {
    id: 'bangag_na_senator',
    name: 'Bangag Na Senator',
    emoji: '🏛️',
    minSalary: 5000000,
    maxSalary: 12000000,
    shiftSalary: 75000000,
    isEvent: true
  }
];

// PH Event ends after December 2, 2026 (end of Dec 2, 2026 in UTC+8 / PHT)
const PH_EVENT_END_MS = Date.parse('2026-12-02T23:59:59+08:00');

const RARITY_SELL_VALUES = {
  C: 15,
  U: 35,
  R: 80,
  SR: 200,
  SRR: 500,
  UTR: 1200,
  STR: 3000,
  USRR: 8000,
  UGMR: 20000,
  SSRP: 50000
};

const WORK_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const SHIFT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function isPhEventActive(nowMs = Date.now()) {
  return nowMs <= PH_EVENT_END_MS;
}

function getAvailableJobs(nowMs = Date.now()) {
  if (isPhEventActive(nowMs)) {
    return [...BASE_JOBS, ...PH_EVENT_JOBS];
  }
  return [...BASE_JOBS];
}

function findJobByQuery(query, nowMs = Date.now()) {
  if (!query) return null;
  const normalized = String(query).trim().toLowerCase().replace(/\s+/g, ' ');
  const slug = normalized.replace(/\s+/g, '_');
  const jobs = getAvailableJobs(nowMs);
  return (
    jobs.find(j => j.id === slug || j.name.toLowerCase() === normalized) ||
    jobs.find(j => j.name.toLowerCase().includes(normalized)) ||
    null
  );
}

function formatDiceDisplay(val) {
  const num = Number(val) || 0;
  if (!Number.isFinite(num)) return String(val);
  if (Math.abs(num) >= 1e15) return num.toExponential(4);
  return num.toLocaleString();
}

function ensureEconomyFields(user, nowMs = Date.now()) {
  if (typeof user.cash !== 'number' || Number.isNaN(user.cash)) user.cash = 0;
  if (typeof user.dice !== 'number' || Number.isNaN(user.dice)) user.dice = 0;
  if (typeof user.points !== 'number' || Number.isNaN(user.points)) user.points = 0;
  if (typeof user.tickets !== 'number' || Number.isNaN(user.tickets)) user.tickets = 0;
  if (typeof user.workCount !== 'number' || Number.isNaN(user.workCount)) user.workCount = 0;
  if (typeof user.lastWork !== 'number' || Number.isNaN(user.lastWork)) user.lastWork = 0;
  if (!user.activeShift || typeof user.activeShift !== 'object') {
    user.activeShift = null;
  }
  if (!user.inventory || typeof user.inventory !== 'object') {
    user.inventory = { chibis: [], items: { spray: 0, clover: 0 } };
  }
  if (!Array.isArray(user.inventory.chibis)) user.inventory.chibis = [];

  // If user selected a PH Event job and the event is over, clear selected job so they pick an active one
  if (user.selectedJobId && !isPhEventActive(nowMs)) {
    const wasEventJob = PH_EVENT_JOBS.some(j => j.id === user.selectedJobId);
    if (wasEventJob) {
      user.selectedJobId = null;
    }
  }
}

function getSelectedJob(user, nowMs = Date.now()) {
  if (!user.selectedJobId) return null;
  const available = getAvailableJobs(nowMs);
  return available.find(j => j.id === user.selectedJobId) || null;
}

function formatDurationShort(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function parsePositiveInt(val) {
  if (!val) return NaN;
  const cleaned = String(val).replace(/,/g, '').trim();
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function drawCard() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits = ['♠', '♥', '♦', '♣'];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  let value = Number.parseInt(rank, 10);
  if (['J', 'Q', 'K'].includes(rank)) value = 10;
  if (rank === 'A') value = 11;
  return { label: `${rank}${suit}`, rank, value };
}

function calculateBlackjackTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += card.value;
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function buildWorkListText(currentPrefix, selectedJob, nowMs = Date.now()) {
  const eventActive = isPhEventActive(nowMs);
  const baseLines = BASE_JOBS.map(j =>
    `• ${j.emoji} **${j.name}** — Work: \`$${j.minSalary.toLocaleString()}–$${j.maxSalary.toLocaleString()}\` | Shift: \`$${j.shiftSalary.toLocaleString()}\``
  ).join('\n');

  let eventBlock = '';
  if (eventActive) {
    const eventLines = PH_EVENT_JOBS.map(j =>
      `• ${j.emoji} **${j.name}** — Work: \`$${j.minSalary.toLocaleString()}–$${j.maxSalary.toLocaleString()}\` | Shift: \`$${j.shiftSalary.toLocaleString()}\``
    ).join('\n');
    eventBlock = `\n\n🇵🇭 **PH EVENT (Ends Dec 2, 2026):**\n${eventLines}`;
  }

  const currentJobLabel = selectedJob
    ? `${selectedJob.emoji} **${selectedJob.name}**`
    : '*None selected yet — choose one below or run `' + currentPrefix + 'work <job name>`*';

  return (
    `Current Job: ${currentJobLabel}\n\n` +
    `**Work List:**\n${baseLines}${eventBlock}`
  );
}

function buildJobSelectRow(selectedJobId = null, nowMs = Date.now()) {
  const jobs = getAvailableJobs(nowMs);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('economy_choose_job_select')
      .setPlaceholder(toSmallCaps('Choose your work / job...'))
      .addOptions(
        jobs.map(j => ({
          label: `${j.name}${j.isEvent ? ' [PH Event]' : ''}`.slice(0, 100),
          description: `Work $${j.minSalary.toLocaleString()}-$${j.maxSalary.toLocaleString()} | Shift $${j.shiftSalary.toLocaleString()}`.slice(0, 100),
          value: j.id,
          emoji: j.emoji,
          default: selectedJobId === j.id
        }))
      )
  );
}

async function promptJobSelection(message, user, userId, currentPrefix, nowMs, saveUsers, headerNote = '') {
  const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      toSmallCaps(`# 💼 Choose Your Work\n${headerNote ? `${headerNote}\n\n` : ''}`) +
      buildWorkListText(currentPrefix, getSelectedJob(user, nowMs), nowMs)
    )
  );
  const selectRow = buildJobSelectRow(user.selectedJobId, nowMs);
  const promptMsg = await message.reply({
    components: [container, selectRow],
    flags: MessageFlags.IsComponentsV2
  });

  const collector = promptMsg.createMessageComponentCollector({ time: 45000 });
  collector.on('collect', async i => {
    if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
    if (i.user.id !== userId) {
      return i.followUp({ content: toSmallCaps('❌ Only the command user can choose a job here!'), ephemeral: true });
    }
    if (i.customId === 'economy_choose_job_select') {
      const chosen = getAvailableJobs(Date.now()).find(j => j.id === i.values[0]);
      if (!chosen) {
        return i.followUp({ content: toSmallCaps('❌ That job is no longer available.'), ephemeral: true });
      }
      user.selectedJobId = chosen.id;
      await saveUsers();
      collector.stop();

      const updatedContainer = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          toSmallCaps(`# ✅ Work Selected — ${chosen.emoji} ${chosen.name}\n\n`) +
          `• Random Work Salary: **$${chosen.minSalary.toLocaleString()}–$${chosen.maxSalary.toLocaleString()}** (\`${currentPrefix}work\`)\n` +
          `• Workshift Salary: **$${chosen.shiftSalary.toLocaleString()}** (\`${currentPrefix}workshift\`)`
        )
      );
      await promptMsg.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  });

  collector.on('end', async () => {
    await promptMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });
}

async function execute({
  command,
  args,
  message,
  userId,
  currentPrefix,
  user,
  currentMs,
  rarityIconsMap,
  saveUsers,
  trackPeakPoints
}) {
  if (!ECONOMY_COMMANDS.includes(command)) return false;

  const nowMs = Date.now() || currentMs;
  ensureEconomyFields(user, nowMs);

  // JOB / JOBS selector command
  if (command === 'job' || command === 'jobs') {
    if (args.length > 0) {
      const chosen = findJobByQuery(args.join(' '), nowMs);
      if (!chosen) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Could not find an active job matching "${args.join(' ')}". Pick one below:`
        );
        return true;
      }
      user.selectedJobId = chosen.id;
      await saveUsers();
      return message.reply(toSmallCaps(
        `✅ You are now working as ${chosen.emoji} **${chosen.name}**!\n` +
        `💵 Work Salary: **$${chosen.minSalary.toLocaleString()}–$${chosen.maxSalary.toLocaleString()}** | ⏱️ Workshift Salary: **$${chosen.shiftSalary.toLocaleString()}**`
      ));
    }

    await promptJobSelection(message, user, userId, currentPrefix, nowMs, saveUsers);
    return true;
  }

  // 1. WORK (choose job if not selected or if a job name is passed; otherwise do work)
  if (command === 'work') {
    if (args.length > 0) {
      const requestedJob = findJobByQuery(args.join(' '), nowMs);
      if (!requestedJob) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Unknown or expired job "${args.join(' ')}". Select your work below:`
        );
        return true;
      }
      user.selectedJobId = requestedJob.id;
      await saveUsers();
    }

    const job = getSelectedJob(user, nowMs);
    if (!job) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        '⚠️ You haven’t chosen a work yet! Select your work from the menu below:'
      );
      return true;
    }

    const elapsed = nowMs - user.lastWork;
    if (elapsed < WORK_COOLDOWN_MS) {
      const waitStr = formatDurationShort(WORK_COOLDOWN_MS - elapsed);
      return message.reply(toSmallCaps(`⏳ You are still resting from work! Try \`${currentPrefix}work\` again in **${waitStr}**.`));
    }

    const earnedCash = Math.floor(Math.random() * (job.maxSalary - job.minSalary + 1)) + job.minSalary;
    const earnedExp = addExpAndLevelUp(user, null, 120);

    user.lastWork = nowMs;
    user.workCount += 1;
    user.cash += earnedCash;
    if (typeof trackPeakPoints === 'function') trackPeakPoints(user);
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    const changeJobRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('economy_switch_job_btn')
        .setLabel(toSmallCaps('Change Work'))
        .setStyle(ButtonStyle.Secondary)
    );

    const container = new ContainerBuilder().setAccentColor(0x2ecc71).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(toSmallCaps(
        `# 💼 SHIFT COMPLETE — ${job.name}\n\n` +
        `💵 Earned Cash: **+$${earnedCash.toLocaleString()}** *(Range: $${job.minSalary.toLocaleString()}–$${job.maxSalary.toLocaleString()})*\n` +
        `✨ EXP Gained: **+${earnedExp}**\n` +
        `🏦 Cash Balance: **$${user.cash.toLocaleString()}** | 🎲 Dice: **${formatDiceDisplay(user.dice)}**`
      ))
    );
    const workMsg = await message.reply({
      components: [container, changeJobRow],
      flags: MessageFlags.IsComponentsV2
    });

    const btnCollector = workMsg.createMessageComponentCollector({ time: 30000, max: 1 });
    btnCollector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Only the command sender can change their work here!'), ephemeral: true });
      }
      if (i.customId === 'economy_switch_job_btn') {
        await workMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        await promptJobSelection(message, user, userId, currentPrefix, Date.now(), saveUsers);
      }
    });
    btnCollector.on('end', async () => {
      await workMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  // 2. WORKING (Active shift / job status + selector)
  if (command === 'working') {
    const job = getSelectedJob(user, nowMs);
    const cooldownLeft = Math.max(0, WORK_COOLDOWN_MS - (nowMs - user.lastWork));
    const cooldownStatus = cooldownLeft > 0 ? `Cooling down (${formatDurationShort(cooldownLeft)})` : 'Ready';

    let shiftStatus = 'No active shift';
    if (user.activeShift) {
      const remaining = user.activeShift.endsAt - nowMs;
      if (remaining > 0) {
        shiftStatus = `In Progress (${formatDurationShort(remaining)} remaining)`;
      } else {
        shiftStatus = `Completed! Use \`${currentPrefix}workshift\` to claim`;
      }
    }

    const jobSummary = job
      ? `${job.emoji} **${job.name}** (Work: $${job.minSalary.toLocaleString()}–$${job.maxSalary.toLocaleString()} | Shift: $${job.shiftSalary.toLocaleString()})`
      : `*Not chosen yet — pick one below*`;

    const container = new ContainerBuilder().setAccentColor(0x3498db).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(toSmallCaps(
        `# 🧑‍💼 Work & Shift Status\n\n` +
        `💼 Selected Work: ${jobSummary}\n` +
        `📊 Completed Shifts / Works: **${user.workCount}**\n` +
        `🔨 Quick Work (\`${currentPrefix}work\`): **${cooldownStatus}**\n` +
        `⏱️ Timed Shift (\`${currentPrefix}workshift\`): **${shiftStatus}**\n\n`
      ) + buildWorkListText(currentPrefix, job, nowMs))
    );

    const selectRow = buildJobSelectRow(user.selectedJobId, nowMs);
    const statusMsg = await message.reply({
      components: [container, selectRow],
      flags: MessageFlags.IsComponentsV2
    });

    const collector = statusMsg.createMessageComponentCollector({ time: 45000 });
    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Not your job menu!'), ephemeral: true });
      }
      if (i.customId === 'economy_choose_job_select') {
        const chosen = getAvailableJobs(Date.now()).find(j => j.id === i.values[0]);
        if (chosen) {
          user.selectedJobId = chosen.id;
          await saveUsers();
          await i.followUp({
            content: toSmallCaps(`✅ Selected work: ${chosen.emoji} **${chosen.name}**!`),
            ephemeral: true
          });
        }
      }
    });
    collector.on('end', async () => {
      await statusMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
    return true;
  }

  // 3. WORKSHIFT (Start or claim a timed shift using selected job's shiftSalary)
  if (command === 'workshift') {
    if (args.length > 0) {
      const requestedJob = findJobByQuery(args.join(' '), nowMs);
      if (!requestedJob) {
        await promptJobSelection(
          message,
          user,
          userId,
          currentPrefix,
          nowMs,
          saveUsers,
          `❌ Unknown or expired job "${args.join(' ')}". Select your work below:`
        );
        return true;
      }
      user.selectedJobId = requestedJob.id;
      await saveUsers();
    }

    const job = getSelectedJob(user, nowMs);
    if (!job) {
      await promptJobSelection(
        message,
        user,
        userId,
        currentPrefix,
        nowMs,
        saveUsers,
        '⚠️ Choose your work first before starting a workshift:'
      );
      return true;
    }

    if (!user.activeShift) {
      user.activeShift = {
        startedAt: nowMs,
        endsAt: nowMs + SHIFT_DURATION_MS,
        jobId: job.id,
        roleName: job.name,
        shiftSalary: job.shiftSalary
      };
      await saveUsers();
      return message.reply(toSmallCaps(
        `⏱️ Started a **15m** workshift as ${job.emoji} **${job.name}** (Salary: **$${job.shiftSalary.toLocaleString()}**)! Run \`${currentPrefix}workshift\` again when finished to claim.`
      ));
    }

    const remaining = user.activeShift.endsAt - nowMs;
    if (remaining > 0) {
      return message.reply(toSmallCaps(
        `⏳ Your workshift as **${user.activeShift.roleName || job.name}** is still in progress! **${formatDurationShort(remaining)}** remaining.`
      ));
    }

    const activeJob = getAvailableJobs(nowMs).find(j => j.id === user.activeShift.jobId) || job;
    const payoutCash = Number(user.activeShift.shiftSalary) || activeJob.shiftSalary;
    const payoutExp = addExpAndLevelUp(user, null, 220);

    user.activeShift = null;
    user.workCount += 1;
    user.cash += payoutCash;
    if (typeof trackPeakPoints === 'function') trackPeakPoints(user);
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    return message.reply(toSmallCaps(
      `✅ **Workshift Payout Claimed (${activeJob.emoji} ${activeJob.name})!**\n` +
      `💵 Workshift Salary: **+$${payoutCash.toLocaleString()}**\n` +
      `✨ EXP Gained: **+${payoutExp}**\n` +
      `🏦 Cash Balance: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 4. BALANCE
  if (command === 'balance') {
    const targetMention = message.mentions.users.first();
    if (targetMention && targetMention.id !== userId) {
      return message.reply(toSmallCaps(`❌ View your own balance with \`${currentPrefix}balance\`.`));
    }

    updateUserRank(user);
    const displayName = user.customNickname || message.author.username;
    const job = getSelectedJob(user, nowMs);
    const container = new ContainerBuilder().setAccentColor(0xf1c40f).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 💰 ${displayName}'s Balance\n\n`) +
        toSmallCaps(`💵 Cash: **$${user.cash.toLocaleString()}**\n`) +
        toSmallCaps(`🎲 Dice: **${formatDiceDisplay(user.dice)}**\n`) +
        toSmallCaps(`🎟️ Tickets: **${user.tickets.toLocaleString()}**\n`) +
        toSmallCaps(`💼 Current Work: **${job ? `${job.emoji} ${job.name}` : 'None'}**\n`) +
        toSmallCaps(`🏆 Points: **${user.points.toLocaleString()}**\n`) +
        toSmallCaps(`🎖️ Rank: `) + `${user.rank}`
      )
    );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  // 5. CASINO
  if (command === 'casino') {
    const wager = parsePositiveInt(args[0]);
    const currencyMode = (args[1] || 'cash').toLowerCase() === 'dice' ? 'dice' : 'cash';

    if (Number.isNaN(wager) || wager <= 0) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}casino [amount] [cash|dice]\` (e.g. \`${currentPrefix}casino 250 cash\`)`));
    }

    if (currencyMode === 'dice') {
      if (user.dice < wager) {
        return message.reply(toSmallCaps(`❌ You only have **${formatDiceDisplay(user.dice)} 🎲 Dice**!`));
      }
      user.dice -= wager;
      const roll = Math.random();
      let mult = 0;
      let label = '💔 House Wins!';
      if (roll >= 0.92) {
        mult = 3;
        label = '🌟 Mega Casino Hit (3x)!';
      } else if (roll >= 0.52) {
        mult = 2;
        label = '🎉 Casino Win (2x)!';
      }
      const payout = wager * mult;
      user.dice += payout;
      updateUserRank(user);
      await saveUsers();
      return message.reply(toSmallCaps(
        `🎰 **Casino Wheel** — ${label}\n` +
        `🎲 Payout: **${payout > 0 ? `+${payout.toLocaleString()}` : `-${wager.toLocaleString()}`} Dice** | Balance: **${formatDiceDisplay(user.dice)} 🎲**`
      ));
    }

    if (user.cash < wager) {
      return message.reply(toSmallCaps(`❌ You only have **$${user.cash.toLocaleString()}** Cash!`));
    }
    user.cash -= wager;
    const roll = Math.random();
    let mult = 0;
    let label = '💔 House Wins!';
    if (roll >= 0.92) {
      mult = 3;
      label = '🌟 Mega Casino Jackpot (3x)!';
    } else if (roll >= 0.52) {
      mult = 2;
      label = '🎉 Casino Win (2x)!';
    }
    const payout = wager * mult;
    user.cash += payout;
    updateUserRank(user);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎰 **Casino Table** — ${label}\n` +
      `💵 Payout: **${payout > 0 ? `+$${payout.toLocaleString()}` : `-$${wager.toLocaleString()}`}** | Cash: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 6. BLACKJACK
  if (command === 'blackjack') {
    const bet = parsePositiveInt(args[0]);
    if (Number.isNaN(bet) || bet <= 0) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}blackjack [cash_bet]\` (e.g. \`${currentPrefix}blackjack 200\`)`));
    }
    if (user.cash < bet) {
      return message.reply(toSmallCaps(`❌ Insufficient cash! You have **$${user.cash.toLocaleString()}**.`));
    }

    user.cash -= bet;
    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    const formatHand = (hand, hideSecond = false) => {
      if (hideSecond && hand.length > 1) {
        return `${hand[0].label}, [🂠]`;
      }
      return hand.map(c => c.label).join(', ');
    };

    const finishBlackjack = async (msg, outcome) => {
      let payout = 0;
      let statusLine = '';
      if (outcome === 'blackjack') {
        payout = Math.round(bet * 2.5);
        statusLine = `🃏 **BLACKJACK!** You won **+$${payout.toLocaleString()}**!`;
      } else if (outcome === 'win') {
        payout = bet * 2;
        statusLine = `🎉 **You Win!** Payout: **+$${payout.toLocaleString()}**!`;
      } else if (outcome === 'push') {
        payout = bet;
        statusLine = `🤝 **Push (Tie)!** Bet of **$${bet.toLocaleString()}** refunded.`;
      } else {
        statusLine = `💔 **Dealer Wins!** Lost **-$${bet.toLocaleString()}**.`;
      }

      user.cash += payout;
      updateUserRank(user);
      await saveUsers();

      await msg.edit({
        content: toSmallCaps(
          `🃏 **Blackjack Final**\n` +
          `Your Hand: ${formatHand(playerHand)} (**${calculateBlackjackTotal(playerHand)}**)\n` +
          `Dealer Hand: ${formatHand(dealerHand)} (**${calculateBlackjackTotal(dealerHand)}**)\n\n` +
          `${statusLine}\n💵 Cash Balance: **$${user.cash.toLocaleString()}**`
        ),
        components: []
      }).catch(() => {});
    };

    const playerStartTotal = calculateBlackjackTotal(playerHand);
    const dealerStartTotal = calculateBlackjackTotal(dealerHand);
    if (playerStartTotal === 21 || dealerStartTotal === 21) {
      const replyMsg = await message.reply(toSmallCaps('🃏 Checking natural blackjack...'));
      if (playerStartTotal === 21 && dealerStartTotal !== 21) return finishBlackjack(replyMsg, 'blackjack');
      if (playerStartTotal === 21 && dealerStartTotal === 21) return finishBlackjack(replyMsg, 'push');
      return finishBlackjack(replyMsg, 'lose');
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel(toSmallCaps('Hit')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel(toSmallCaps('Stand')).setStyle(ButtonStyle.Success)
    );

    const bjMsg = await message.reply({
      content: toSmallCaps(
        `🃏 **Blackjack** — Bet: **$${bet.toLocaleString()}**\n` +
        `Your Hand: ${formatHand(playerHand)} (**${playerStartTotal}**)\n` +
        `Dealer Hand: ${formatHand(dealerHand, true)}`
      ),
      components: [row]
    });

    const collector = bjMsg.createMessageComponentCollector({ time: 30000 });
    let resolved = false;

    collector.on('collect', async i => {
      if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) {
        return i.followUp({ content: toSmallCaps('❌ Not your blackjack table!'), ephemeral: true });
      }

      if (i.customId === 'bj_hit') {
        playerHand.push(drawCard());
        const pTotal = calculateBlackjackTotal(playerHand);
        if (pTotal > 21) {
          resolved = true;
          collector.stop();
          return finishBlackjack(bjMsg, 'bust');
        }
        if (pTotal === 21) {
          resolved = true;
          collector.stop();
          while (calculateBlackjackTotal(dealerHand) < 17) dealerHand.push(drawCard());
          const dTotal = calculateBlackjackTotal(dealerHand);
          if (dTotal === 21) return finishBlackjack(bjMsg, 'push');
          return finishBlackjack(bjMsg, 'win');
        }
        await bjMsg.edit({
          content: toSmallCaps(
            `🃏 **Blackjack** — Bet: **$${bet.toLocaleString()}**\n` +
            `Your Hand: ${formatHand(playerHand)} (**${pTotal}**)\n` +
            `Dealer Hand: ${formatHand(dealerHand, true)}`
          ),
          components: [row]
        }).catch(() => {});
      } else if (i.customId === 'bj_stand') {
        resolved = true;
        collector.stop();
        while (calculateBlackjackTotal(dealerHand) < 17) {
          dealerHand.push(drawCard());
        }
        const pTotal = calculateBlackjackTotal(playerHand);
        const dTotal = calculateBlackjackTotal(dealerHand);
        if (dTotal > 21 || pTotal > dTotal) return finishBlackjack(bjMsg, 'win');
        if (pTotal === dTotal) return finishBlackjack(bjMsg, 'push');
        return finishBlackjack(bjMsg, 'lose');
      }
    });

    collector.on('end', async () => {
      if (!resolved) {
        resolved = true;
        return finishBlackjack(bjMsg, 'lose');
      }
    });
    return true;
  }

  // 7. COINFLIP
  if (command === 'coinflip') {
    const bet = parsePositiveInt(args[0]);
    const choiceArg = (args[1] || '').toLowerCase();
    const pick = ['heads', 'h'].includes(choiceArg) ? 'Heads' : ['tails', 't'].includes(choiceArg) ? 'Tails' : null;

    if (Number.isNaN(bet) || bet <= 0 || !pick) {
      return message.reply(toSmallCaps(`❌ Usage: \`${currentPrefix}coinflip [cash_bet] [heads|tails]\` (e.g. \`${currentPrefix}coinflip 150 heads\`)`));
    }
    if (user.cash < bet) {
      return message.reply(toSmallCaps(`❌ You only have **$${user.cash.toLocaleString()}** Cash!`));
    }

    user.cash -= bet;
    const flipped = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const won = flipped === pick;
    if (won) {
      user.cash += bet * 2;
    }
    updateUserRank(user);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🪙 Coin landed on **${flipped}** (You picked **${pick}**)\n` +
      `${won ? `🎉 You won **+$${(bet * 2).toLocaleString()}**!` : `💔 You lost **-$${bet.toLocaleString()}**.`}\n` +
      `💵 Cash Balance: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 8. TICKETBUY
  if (command === 'ticketbuy') {
    const qty = Math.max(1, parsePositiveInt(args[0]) || 1);
    const unitPrice = 250;
    const totalCost = qty * unitPrice;

    if (user.cash < totalCost) {
      return message.reply(toSmallCaps(
        `❌ You need **$${totalCost.toLocaleString()}** to buy **${qty}x Ticket(s)** ($${unitPrice} each), but you have **$${user.cash.toLocaleString()}**.`
      ));
    }

    user.cash -= totalCost;
    user.tickets += qty;
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ Purchased **+${qty}x Ticket(s)** for **$${totalCost.toLocaleString()}**!\n` +
      `🎟️ Total Tickets: **${user.tickets}** | 💵 Cash: **$${user.cash.toLocaleString()}**`
    ));
  }

  // 9. TICKETUSE
  if (command === 'ticketuse') {
    const qty = Math.min(Math.max(1, parsePositiveInt(args[0]) || 1), user.tickets);
    if (user.tickets <= 0) {
      return message.reply(toSmallCaps(`❌ You don't have any tickets! Buy some with \`${currentPrefix}ticketbuy [qty]\`.`));
    }

    user.tickets -= qty;
    const bonusDice = qty * 4;
    const bonusCash = qty * 100;
    user.dice += bonusDice;
    user.cash += bonusCash;
    updateUserRank(user);
    await evaluateAndSyncUserBadges(userId, user, message.guild);
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ Used **${qty}x Ticket(s)**!\n` +
      `🎲 Received: **+${bonusDice}x Dice** | 💵 Received: **+$${bonusCash.toLocaleString()}**\n` +
      `🎟️ Remaining Tickets: **${user.tickets}** | 🎲 Dice: **${formatDiceDisplay(user.dice)}**`
    ));
  }

  // 10. LOTTERY
  if (command === 'lottery') {
    const sub = (args[0] || '').toLowerCase();
    if (!db.config.lotteryPool || typeof db.config.lotteryPool !== 'number') {
      db.config.lotteryPool = 5000;
    }
    if (!Array.isArray(db.config.lotteryEntries)) {
      db.config.lotteryEntries = [];
    }

    if (sub === 'draw') {
      if (db.config.lotteryEntries.length === 0) {
        return message.reply(toSmallCaps(`🎟️ No lottery tickets have been entered yet! Use \`${currentPrefix}lottery\` with a ticket to join.`));
      }
      const winnerId = db.config.lotteryEntries[Math.floor(Math.random() * db.config.lotteryEntries.length)];
      const jackpot = db.config.lotteryPool;
      db.config.lotteryEntries = [];
      db.config.lotteryPool = 5000;

      if (winnerId === userId) {
        user.cash += jackpot;
      }
      updateUserRank(user);
      await saveUsers();

      return message.reply(toSmallCaps(
        `🎉 **Lottery Draw Complete!**\n` +
        `🏆 Winner: <@${winnerId}>\n` +
        `💰 Jackpot Prize: **$${jackpot.toLocaleString()}**`
      ));
    }

    if (user.tickets < 1) {
      return message.reply(toSmallCaps(
        `🎟️ **Chibi Lottery**\n` +
        `Current Jackpot: **$${db.config.lotteryPool.toLocaleString()}** | Entries: **${db.config.lotteryEntries.length}**\n` +
        `Buy a ticket with \`${currentPrefix}ticketbuy\` and enter with \`${currentPrefix}lottery\`!`
      ));
    }

    user.tickets -= 1;
    db.config.lotteryEntries.push(userId);
    db.config.lotteryPool += 350;
    await saveUsers();

    return message.reply(toSmallCaps(
      `🎟️ You entered the **Chibi Lottery** using **1x Ticket**!\n` +
      `💰 Current Jackpot: **$${db.config.lotteryPool.toLocaleString()}**\n` +
      `🎟️ Your Tickets Left: **${user.tickets}** | Total Entries: **${db.config.lotteryEntries.length}**`
    ));
  }

  // 11. CSELL
  if (command === 'csell') {
    if (user.inventory.chibis.length === 0) {
      return message.reply(toSmallCaps(`❌ Your chibi collection is empty! Use \`${currentPrefix}roll\` first.`));
    }

    let qtyToSell = 1;
    let rarityFilter = null;

    for (const arg of args) {
      const parsedNum = parsePositiveInt(arg);
      if (!Number.isNaN(parsedNum) && parsedNum > 0) {
        qtyToSell = parsedNum;
      } else if (arg && arg.trim()) {
        rarityFilter = arg.trim().toUpperCase();
      }
    }

    const equippedSet = new Set([...(user.team || []), user.equippedChibi].filter(Boolean));
    const sellableIndices = [];
    user.inventory.chibis.forEach((chibi, idx) => {
      const cId = chibi.chibiId || chibi.id;
      const matchesRarity = !rarityFilter || (chibi.rarity || '').toUpperCase() === rarityFilter;
      if (matchesRarity && !equippedSet.has(cId)) {
        sellableIndices.push(idx);
      }
    });

    if (sellableIndices.length === 0) {
      const targetMsg = rarityFilter ? ` with rarity **${rarityFilter}**` : '';
      return message.reply(toSmallCaps(`❌ No unequipped chibis${targetMsg} available to sell.`));
    }

    const actualSellCount = Math.min(qtyToSell, sellableIndices.length);
    const chosenIndices = sellableIndices.slice(0, actualSellCount);
    const chosenSet = new Set(chosenIndices);

    let totalCashEarned = 0;
    const soldPreview = [];

    chosenIndices.forEach(idx => {
      const c = user.inventory.chibis[idx];
      const baseVal = RARITY_SELL_VALUES[(c.rarity || 'C').toUpperCase()] || 15;
      const shinyMult = c.isShiny ? 3 : 1;
      const lvlBonus = Math.max(0, (Number(c.level) || 1) - 1) * 5;
      const val = (baseVal + lvlBonus) * shinyMult;
      totalCashEarned += val;
      if (soldPreview.length < 5) {
        soldPreview.push(`${rarityIconsMap?.[c.rarity] || '📦'} ${c.emoji || '✨'} **${c.name}** (+$${val.toLocaleString()})`);
      }
    });

    user.inventory.chibis = user.inventory.chibis.filter((_, idx) => !chosenSet.has(idx));
    user.cash += totalCashEarned;
    updateUserRank(user);
    await saveUsers();

    const extraCount = actualSellCount - soldPreview.length;
    const extraLine = extraCount > 0 ? `\n*...and ${extraCount} more.*` : '';

    const container = new ContainerBuilder().setAccentColor(0xe67e22).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        toSmallCaps(`# 💵 Sold ${actualSellCount}x Chibi(s)\n\n`) +
        soldPreview.join('\n') +
        toSmallCaps(`${extraLine}\n\nTotal Cash Earned: **+$${totalCashEarned.toLocaleString()}**\nCash Balance: **$${user.cash.toLocaleString()}**`)
      )
    );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  return false;
}

module.exports = {
  commands: ECONOMY_COMMANDS,
  execute
};