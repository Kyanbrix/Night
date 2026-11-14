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
    StringSelectMenuBuilder,
    PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const dataFile = path.join(__dirname, 'data.json');

// --- RAM CACHING & SAFE SCHEMA MIGRATION PERSISTENCE ---
let dbCache = null;

function readData() {
    if (dbCache) return dbCache;

    try {
        if (fs.existsSync(dataFile)) {
            const raw = fs.readFileSync(dataFile, 'utf8');
            dbCache = JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading data.json, initializing fallback cache:', e);
    }

    if (!dbCache || typeof dbCache !== 'object') {
        dbCache = {
            users: {},
            clans: {},
            marketListings: [],
            shopItems: [
                { id: 1, name: 'Rifle', price: 100000, category: 'Gun', huntCount: 1, luckBoost: 0.05, emoji: '🔫', description: 'Hunts 1 Animal with 5% Luck Boost' },
                { id: 2, name: 'Sniper', price: 500000, category: 'Gun', huntCount: 3, luckBoost: 0.10, emoji: '🎯', description: 'Hunts 3 Animals with 10% Luck Boost' },
                { id: 3, name: 'Machine Gun', price: 10000000, category: 'Gun', huntCount: 5, luckBoost: 0.50, emoji: '💣', description: 'Hunts 5 Animals with 50% Luck Boost' },
                { id: 4, name: 'NUKE', price: 100000000, category: 'Gun', huntCount: 100, luckBoost: 5.00, emoji: '🚀', description: 'Hunts 100 Animals with 500% Luck Boost' },
                { id: 5, name: 'Lucky Charm I', price: 1500000, category: 'Charm', luckBoost: 0.25, emoji: '🍀', description: 'Increase Luck Boost For 25%' },
                { id: 6, name: 'Lucky Charm II', price: 11500000, category: 'Charm', luckBoost: 0.30, emoji: '🍀', description: 'Increase Luck Boost For 30%' },
                { id: 7, name: 'Lucky Charm III', price: 14500000, category: 'Charm', luckBoost: 0.65, emoji: '🍀', description: 'Increase Luck Boost For 65%' },
                { id: 8, name: 'Lucky Charm IV', price: 17500000, category: 'Charm', luckBoost: 0.90, emoji: '🍀', description: 'Increase Luck Boost For 90%' },
                { id: 9, name: 'Lucky Charm V', price: 50000000, category: 'Charm', luckBoost: 2.00, emoji: '🍀', description: 'Increase Luck Boost For 200%' }
            ],
            globalEvent: { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 },
            currentWeather: { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 },
            admins: []
        };
    }

    if (!dbCache.users) dbCache.users = {};
    if (!dbCache.clans) dbCache.clans = {};
    if (!dbCache.marketListings) dbCache.marketListings = [];
    if (!dbCache.shopItems || dbCache.shopItems.length === 0) {
        dbCache.shopItems = [
            { id: 1, name: 'Rifle', price: 100000, category: 'Gun', huntCount: 1, luckBoost: 0.05, emoji: '🔫', description: 'Hunts 1 Animal with 5% Luck Boost' },
            { id: 2, name: 'Sniper', price: 500000, category: 'Gun', huntCount: 3, luckBoost: 0.10, emoji: '🎯', description: 'Hunts 3 Animals with 10% Luck Boost' },
            { id: 3, name: 'Machine Gun', price: 10000000, category: 'Gun', huntCount: 5, luckBoost: 0.50, emoji: '💣', description: 'Hunts 5 Animals with 50% Luck Boost' },
            { id: 4, name: 'NUKE', price: 100000000, category: 'Gun', huntCount: 100, luckBoost: 5.00, emoji: '🚀', description: 'Hunts 100 Animals with 500% Luck Boost' },
            { id: 5, name: 'Lucky Charm I', price: 1500000, category: 'Charm', luckBoost: 0.25, emoji: '🍀', description: 'Increase Luck Boost For 25%' },
            { id: 6, name: 'Lucky Charm II', price: 11500000, category: 'Charm', luckBoost: 0.30, emoji: '🍀', description: 'Increase Luck Boost For 30%' },
            { id: 7, name: 'Lucky Charm III', price: 14500000, category: 'Charm', luckBoost: 0.65, emoji: '🍀', description: 'Increase Luck Boost For 65%' },
            { id: 8, name: 'Lucky Charm IV', price: 17500000, category: 'Charm', luckBoost: 0.90, emoji: '🍀', description: 'Increase Luck Boost For 90%' },
            { id: 9, name: 'Lucky Charm V', price: 50000000, category: 'Charm', luckBoost: 2.00, emoji: '🍀', description: 'Increase Luck Boost For 200%' }
        ];
    }
    if (!dbCache.globalEvent) dbCache.globalEvent = { luckBonus: 0, luckExpiresAt: 0, catchRateBonus: 0, catchRateExpiresAt: 0 };
    if (!dbCache.currentWeather) dbCache.currentWeather = { name: 'Normal', catchRate: 0, luckBoost: 0, expiresAt: Date.now() + 3600000 };
    if (!dbCache.admins) dbCache.admins = [];

    return dbCache;
}

let saveTimeout = null;
function saveData(data) {
    dbCache = data;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        fs.writeFile(dataFile, JSON.stringify(dbCache, null, 2), (err) => {
            if (err) console.error('Failed to save data:', err);
        });
    }, 500);
}

function getUser(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = { 
            wallet: 500, 
            bank: 1000, 
            inventory: [], 
            boxes: { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 },
            lootboxes: 0,
            collection: {}, 
            cooldowns: {},
            titles: [],
            equippedTitle: null,
            started: false,
            dailyStreak: 0,
            lastDailyTimestamp: 0,
            lastWeeklyTimestamp: 0,
            level: 1,
            exp: 0,
            points: 0,
            team: [null, null, null],
            animalLevels: {},
            badges: [],
            totalHunts: 0,
            clan: null,
            job: 'Unemployed',
            quests: { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 }
        };
        saveData(data);
    }
    const u = data.users[userId];
    if (u.started === undefined) u.started = false;
    if (!Array.isArray(u.titles)) u.titles = [];
    if (!u.boxes) u.boxes = { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 };
    if (!u.lootboxes) u.lootboxes = 0;
    if (u.level === undefined) u.level = 1;
    if (u.exp === undefined) u.exp = 0;
    if (u.points === undefined) u.points = 0;
    if (!Array.isArray(u.team)) u.team = [null, null, null];
    if (!u.animalLevels) u.animalLevels = {};
    if (!Array.isArray(u.badges)) u.badges = [];
    if (u.totalHunts === undefined) u.totalHunts = 0;
    if (u.clan === undefined) u.clan = null;
    if (u.job === undefined) u.job = 'Unemployed';
    if (!u.quests) u.quests = { daily: [], dailyProgress: {}, dailyCompleted: false, dailyReset: 0, weekly: [], weeklyProgress: {}, weeklyCompleted: false, weeklyReset: 0 };
    return u;
}

const CURRENCY = '₱';

function formatCurrency(amount) {
    if (amount >= 1e12) return (amount / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (amount >= 1e9) return (amount / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (amount >= 1e6) return (amount / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (amount >= 1e3) return (amount / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return amount.toLocaleString();
}

function getUserMaxExp(level) {
    return 2500 + ((level - 1) * 6000);
}

function addUserExp(user, amount) {
    user.exp += amount;
    let neededExp = getUserMaxExp(user.level);
    while (user.exp >= neededExp) {
        user.exp -= neededExp;
        user.level++;
        neededExp = getUserMaxExp(user.level);
    }
}

// STRICT CLAN CONTRIBUTION: Only awards if user is in a clan
function addClanContribution(user, userId, data, pointsEarned) {
    if (!user.clan) return; // Must be in a clan to earn contributions
    const clan = data.clans[user.clan];
    if (!clan) return;
    clan.points = (clan.points || 0) + pointsEarned;
    if (!clan.contributions) clan.contributions = {};
    clan.contributions[userId] = (clan.contributions[userId] || 0) + pointsEarned;
    saveData(data);
}

const RARITY_ICONS = {
    'Common': '<:common:1570576518206333098>',
    'Uncommon': '<:uncommon:1570576547298021437>',
    'Rare': '<:rare:1570576572044279918>',
    'Epic': '<:epic:1570576596413190154>',
    'Legendary': '<:legendary:1570562590529159210>',
    'Mythic': '<:mythical:1570576640247861449>',
    'S+ Tier': '<:stier:1571017458419109989>',
    'SS+ Tier': '<:sstier:1571017591189807104>',
    'SSS+ Tier': '<:ssstier:1571017675650367608>',
    'GOD Tier': '<:god:1570577048966140035>',
    'Shiny': '✨'
};

const HUNT_ANIMALS = [
    { name: 'Worm', tier: 'Common', rank: 1, badge: '🐛', rate: 0.85, reward: 50, minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Dog', tier: 'Common', rank: 1, badge: '🐕', rate: 0.85, reward: 60, minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Bird', tier: 'Common', rank: 1, badge: '🐦', rate: 0.85, reward: 60, minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Cat', tier: 'Common', rank: 1, badge: '🐈', rate: 0.85, reward: 60, minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Bee', tier: 'Uncommon', rank: 2, badge: '🐝', rate: 0.50, reward: 120, minExp: 70, maxExp: 110, clanPts: [4, 9] },
    { name: 'Rabbit', tier: 'Uncommon', rank: 2, badge: '🐇', rate: 0.50, reward: 150, minExp: 70, maxExp: 110, clanPts: [4, 9] },
    { name: 'Cow', tier: 'Rare', rank: 3, badge: '🐄', rate: 0.25, reward: 400, minExp: 120, maxExp: 170, clanPts: [7, 13] },
    { name: 'Bear', tier: 'Rare', rank: 3, badge: '🐻', rate: 0.25, reward: 600, minExp: 120, maxExp: 170, clanPts: [7, 13] },
    { name: 'Whale', tier: 'Epic', rank: 4, badge: '🐋', rate: 0.15, reward: 1500, minExp: 180, maxExp: 210, clanPts: [9, 16] },
    { name: 'Elephant', tier: 'Legendary', rank: 5, badge: '🐘', rate: 0.10, reward: 4000, minExp: 230, maxExp: 280, clanPts: [11, 19] },
    { name: 'Lion', tier: 'Mythic', rank: 6, badge: '🦁', rate: 0.01, reward: 15000, minExp: 300, maxExp: 340, clanPts: [14, 23] },
    { name: 'Ghost', tier: 'S+ Tier', rank: 7, badge: '👻', rate: 0.05, reward: 35000, minExp: 1370, maxExp: 1420, clanPts: [18, 29] },
    { name: 'Dragon', tier: 'SS+ Tier', rank: 8, badge: '🐉', rate: 0.005, reward: 50000, minExp: 2500, maxExp: 2700, clanPts: [23, 34] },
    { name: 'Unicorn', tier: 'SSS+ Tier', rank: 9, badge: '🦄', rate: 0.001, reward: 120000, minExp: 3500, maxExp: 4000, clanPts: [34, 52] },
    { name: 'Snowman', tier: 'GOD Tier', rank: 10, badge: '⛄', rate: 0.0001, reward: 500000, minExp: 5000, maxExp: 7000, clanPts: [45, 68] },
    { name: 'Shiny Turtle', tier: 'Shiny', rank: 11, badge: '<:ShinyTurtle:1570467471889137735>', rate: 0.001, reward: 200000, minExp: 8000, maxExp: 10000, clanPts: [56, 100] }
];

function getRankBadge(points) {
    if (points >= 10000) return '<:10000pts:1571018412464021504>';
    if (points >= 6000) return '<:6000pts:1571018312626872421>';
    if (points >= 4500) return '<:4500pts:1571018231584526397>';
    if (points >= 3500) return '<:3500pts:1571019075604193300>';
    if (points >= 2500) return '<:2500pts:1571018118036463786>';
    return '<:1000pts:1571018024838893678>';
}

function formatTitleDisplay(titleName) {
    if (!titleName) return '`No Title Equipped`';
    return `\`${titleName}\``;
}

const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Initialize your profile and claim your Beta title.'),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands in categories.'),
    new SlashCommandBuilder().setName('rank').setDescription('Check your current points and rank tier badge.'),
    new SlashCommandBuilder().setName('balance').setDescription('Check wallet and bank balance.')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for quick starter coins.'),
    new SlashCommandBuilder().setName('work').setDescription('Choose your profession and work to earn coins.')
        .addStringOption(o => o.setName('job').setDescription('Profession').setRequired(false).addChoices(
            {name:'Farmer (₱10k-₱15k)', value:'Farmer'},
            {name:'Chief (₱15k-₱30k)', value:'Chief'},
            {name:'Developer (₱20k-₱50k)', value:'Developer'},
            {name:'Designer (₱40k-₱60k)', value:'Designer'},
            {name:'Discord Manager (₱65k-₱115k)', value:'Discord Manager'},
            {name:'CEO (₱150k-₱900k | Req: 2k Pts)', value:'CEO'},
            {name:'President (₱300k-₱1.3M | Req: 5k Pts)', value:'President'}
        )),
    new SlashCommandBuilder().setName('work-list').setDescription('View list of available professions and salary/point requirements.'),
    new SlashCommandBuilder().setName('trivia').setDescription('Answer a 1-minute timed fill-in-the-blank trivia challenge for cash prizes.'),
    new SlashCommandBuilder().setName('clan').setDescription('Manage or view your clan.')
        .addSubcommand(s => s.setName('create').setDescription('Create a new clan')
            .addStringOption(o => o.setName('name').setDescription('Clan Name').setRequired(true))
            .addStringOption(o => o.setName('logo').setDescription('Logo image URL').setRequired(true)))
        .addSubcommand(s => s.setName('info').setDescription('View your clan info'))
        .addSubcommand(s => s.setName('edit').setDescription('Edit clan settings')
            .addStringOption(o => o.setName('type').setDescription('Open or Private').setRequired(false).addChoices({name:'Open For All', value:'Open'}, {name:'Private', value:'Private'}))
            .addIntegerOption(o => o.setName('min_points').setDescription('Minimum points required').setRequired(false))),
    new SlashCommandBuilder().setName('sclan').setDescription('Search available clans to join')
        .addStringOption(o => o.setName('name').setDescription('Clan name to join').setRequired(true)),
    new SlashCommandBuilder().setName('shop').setDescription('Browse weapons and charms shop.'),
    new SlashCommandBuilder().setName('buy').setDescription('Buy shop item').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true)),
    new SlashCommandBuilder().setName('equip').setDescription('Equip an item or charm').addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
    new SlashCommandBuilder().setName('meme').setDescription('Generate a random meme.'),
    new SlashCommandBuilder().setName('market').setDescription('View community market listings.'),
    new SlashCommandBuilder().setName('sell').setDescription('Sell items or animals on the market.')
        .addStringOption(o => o.setName('type').setDescription('Exact item or animal name').setRequired(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Quantity to sell').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Total price in ₱').setRequired(true)),
    new SlashCommandBuilder().setName('buy-market').setDescription('Buy a listing from the community market.')
        .addIntegerOption(o => o.setName('id').setDescription('Market Listing ID').setRequired(true)),
    new SlashCommandBuilder().setName('hunt').setDescription('Go hunting for creatures and boxes!'),
    new SlashCommandBuilder().setName('lootbox').setDescription('Open lootboxes').addIntegerOption(o => o.setName('quantity').setDescription('Qty').setRequired(false)),
    new SlashCommandBuilder().setName('open').setDescription('Open specific boxes')
        .addStringOption(o => o.setName('rarity').setDescription('Rarity').setRequired(true).addChoices({name:'Rare', value:'Rare'},{name:'Epic', value:'Epic'},{name:'Ultra', value:'Ultra'},{name:'Legendary', value:'Legendary'},{name:'GOD', value:'GOD'}))
        .addIntegerOption(o => o.setName('quantity').setDescription('Qty').setRequired(false)),
    new SlashCommandBuilder().setName('battle').setDescription('Battle another player').addUserOption(o => o.setName('player').setDescription('Target').setRequired(true)),
    new SlashCommandBuilder().setName('level').setDescription('Check level and team EXP'),
    new SlashCommandBuilder().setName('team').setDescription('Equip team pet')
        .addIntegerOption(o => o.setName('slot').setDescription('Slot 1-3').setRequired(true).addChoices({name:'Slot 1', value:1},{name:'Slot 2', value:2},{name:'Slot 3', value:3}))
        .addStringOption(o => o.setName('animal').setDescription('Animal name').setRequired(true)),
    new SlashCommandBuilder().setName('animal-stats').setDescription('View team animal stats'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('View leaderboards')
        .addStringOption(o => o.setName('category').setDescription('Category').setRequired(true).addChoices({name:'Money', value:'money'},{name:'Points', value:'points'},{name:'Hunts', value:'hunts'})),
    new SlashCommandBuilder().setName('daily').setDescription('Claim daily reward'),
    new SlashCommandBuilder().setName('weekly').setDescription('Claim weekly reward'),
    new SlashCommandBuilder().setName('quest').setDescription('View active quests'),
    new SlashCommandBuilder().setName('event').setDescription('View active weather and events'),
    new SlashCommandBuilder().setName('stats').setDescription('View active boosts'),
    new SlashCommandBuilder().setName('collection').setDescription('View animal collection'),
    new SlashCommandBuilder().setName('inventory').setDescription('View inventory'),
    new SlashCommandBuilder().setName('titles').setDescription('View and equip titles').addStringOption(o => o.setName('equip').setDescription('Title').setRequired(false)),
    new SlashCommandBuilder().setName('titlelist').setDescription('View available titles'),
    new SlashCommandBuilder().setName('profiles').setDescription('View RPG profile card').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('bank').setDescription('Bank deposit/withdraw')
        .addStringOption(o => o.setName('action').setDescription('deposit/withdraw').setRequired(true).addChoices({name:'Deposit', value:'deposit'},{name:'Withdraw', value:'withdraw'}))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('give').setDescription('Transfer funds')
        .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
    new SlashCommandBuilder().setName('trade').setDescription('Interactive secure trade with another user')
        .addUserOption(o => o.setName('target').setDescription('Partner').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands synchronized.');
});

setInterval(() => {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`[${serverCount} Servers] /start`, { type: 0 });
}, 60000);

function checkCooldown(user, commandName, seconds = 3) {
    const now = Date.now();
    if (!user.cooldowns) user.cooldowns = {};
    const expiration = (user.cooldowns[commandName] || 0) + (seconds * 1000);
    if (now < expiration) return Math.ceil((expiration - now) / 1000);
    user.cooldowns[commandName] = now;
    return 0;
}

const activeTrades = new Map();

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        if (customId === 'help_category_select') {
            const val = interaction.values[0];
            const embed = new EmbedBuilder().setColor('#5865F2');
            if (val === 'fun') embed.setTitle('🌸 Fun Commands').setDescription('`/meme`, `/trivia`, `/coinflip`, `/slot`, `/blackjack`');
            else if (val === 'utility') embed.setTitle('🛠️ Utility Commands').setDescription('`/help`, `/event`, `/stats`, `/rank`, `/leaderboard`');
            else if (val === 'community') embed.setTitle('🎭 Salem & Community Commands').setDescription('`/clan`, `/sclan`, `/trade`, `/market`, `/sell`, `/buy-market`, `/give`');
            else if (val === 'creative') embed.setTitle('✨ Creative Commands').setDescription('`/titles`, `/titlelist`, `/profiles`');
            else if (val === 'general') embed.setTitle('ℹ️ General & Economy Commands').setDescription('`/start`, `/balance`, `/beg`, `/work`, `/work-list`, `/shop`, `/buy`, `/inventory`, `/daily`, `/weekly`, `/quest`');
            return interaction.update({ embeds: [embed], components: interaction.message.components });
        }

        if (customId.startsWith('trade_')) {
            const parts = customId.split('_');
            const action = parts[1];
            const tradeId = parts[2];
            const session = activeTrades.get(tradeId);

            if (!session) return interaction.reply({ content: '❌ This trade session has expired.', ephemeral: true });
            if (interaction.user.id !== session.p1 && interaction.user.id !== session.p2) {
                return interaction.reply({ content: '❌ You are not part of this trade.', ephemeral: true });
            }

            const isP1 = interaction.user.id === session.p1;

            if (action === 'add') {
                const data = readData();
                const u = getUser(data, interaction.user.id);
                const itemsList = [...u.inventory, ...Object.keys(u.collection)];
                if (itemsList.length === 0) return interaction.reply({ content: '❌ Your inventory and collection are empty.', ephemeral: true });
                
                session.offers[interaction.user.id] = itemsList[0];
                saveData(data);
                return interaction.reply({ content: `✅ Added **${itemsList[0]}** to your trade offer.`, ephemeral: true });
            }
            else if (action === 'confirm') {
                if (isP1) session.p1Confirmed = true;
                else session.p2Confirmed = true;

                if (session.p1Confirmed && session.p2Confirmed) {
                    const data = readData();
                    const u1 = getUser(data, session.p1);
                    const u2 = getUser(data, session.p2);

                    const offer1 = session.offers[session.p1];
                    const offer2 = session.offers[session.p2];

                    if (offer1) {
                        const idx = u1.inventory.indexOf(offer1);
                        if (idx > -1) { u1.inventory.splice(idx, 1); u2.inventory.push(offer1); }
                        else if (u1.collection[offer1]) { u1.collection[offer1]--; u2.collection[offer1] = (u2.collection[offer1]||0)+1; }
                    }
                    if (offer2) {
                        const idx = u2.inventory.indexOf(offer2);
                        if (idx > -1) { u2.inventory.splice(idx, 1); u1.inventory.push(offer2); }
                        else if (u2.collection[offer2]) { u2.collection[offer2]--; u1.collection[offer2] = (u1.collection[offer2]||0)+1; }
                    }
                    saveData(data);
                    activeTrades.delete(tradeId);
                    return interaction.update({ content: '✅ Trade successfully completed!', embeds: [], components: [] });
                } else {
                    return interaction.update({ content: `✅ You confirmed. Waiting for trading partner...`, components: interaction.message.components });
                }
            }
            else if (action === 'cancel') {
                activeTrades.delete(tradeId);
                return interaction.update({ content: '❌ Trade session cancelled.', embeds: [], components: [] });
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    const data = readData();
    const user = getUser(data, interaction.user.id);

    if (commandName === 'start') {
        if (user.started) return interaction.reply({ content: '⚠️ Your profile is already initialized!', ephemeral: true });
        user.started = true;
        if (!user.titles.includes('Beta')) user.titles.push('Beta');
        if (!user.equippedTitle) user.equippedTitle = 'Beta';
        saveData(data);
        return interaction.reply({ content: '✅ Profile successfully initialized!', ephemeral: true });
    }

    if (!user.started && commandName !== 'help') {
        return interaction.reply({ content: '⚠️ Please run `/start` first!', ephemeral: true });
    }

    try {
        if (commandName !== 'start' && commandName !== 'help') {
            const cd = checkCooldown(user, commandName, 3);
            if (cd > 0) return interaction.reply({ content: `⏳ Please wait **${cd}s**.`, ephemeral: true });
            saveData(data);
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('Command Directory')
                .setColor('#5865F2')
                .setDescription('Which Command Want to use?\nSelect a category below:');
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_category_select')
                    .setPlaceholder('Choose a category...')
                    .addOptions([
                        { label: 'Fun Command', description: 'Meme, trivia', value: 'fun', emoji: '🌸' },
                        { label: 'Utility', description: 'Rank, leaderboard', value: 'utility', emoji: '🛠️' },
                        { label: 'Salem & Community', description: 'Clans, trade, market', value: 'community', emoji: '🎭' },
                        { label: 'Creative', description: 'Titles, profiles', value: 'creative', emoji: '✨' },
                        { label: 'General', description: 'Balance, work, shop', value: 'general', emoji: 'ℹ️' }
                    ])
            );
            return interaction.reply({ embeds: [embed], components: [row] });
        }

        else if (commandName === 'rank') {
            const rankBadge = getRankBadge(user.points || 0);
            const embed = new EmbedBuilder().setTitle(`Rank — ${interaction.user.username}`).setColor('#0099ff').setDescription(`Points: **${user.points || 0}**\nBadge: ${rankBadge}`);
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'meme') {
            try {
                const memeData = await new Promise((res, rej) => {
                    https.get('https://meme-api.com/gimme', r => {
                        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
                    }).on('error', rej);
                });
                const embed = new EmbedBuilder().setTitle(memeData.title).setImage(memeData.url).setColor('#ff4500');
                return interaction.reply({ embeds: [embed] });
            } catch (e) {
                return interaction.reply({ content: '❌ Failed to fetch meme.', ephemeral: true });
            }
        }

        else if (commandName === 'work-list') {
            const embed = new EmbedBuilder().setTitle('Employment Directory').setColor('#00ffcc')
                .setDescription('• Farmer: ₱10k-₱15k\n• Chief: ₱15k-₱30k\n• Developer: ₱20k-₱50k\n• Designer: ₱40k-₱60k\n• Discord Manager: ₱65k-₱115k\n• CEO: ₱150k-₱900k (Req: 2k Pts)\n• President: ₱300k-₱1.3M (Req: 5k Pts)');
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'work') {
            const jobChoice = interaction.options.getString('job');
            if (!jobChoice) return interaction.reply({ content: 'Use `/work [job]` or check `/work-list`.', ephemeral: true });

            let minPay = 10000, maxPay = 15000, reqPts = 0;
            if (jobChoice === 'Chief') { minPay = 15000; maxPay = 30000; }
            else if (jobChoice === 'Developer') { minPay = 20000; maxPay = 50000; }
            else if (jobChoice === 'Designer') { minPay = 40000; maxPay = 60000; }
            else if (jobChoice === 'Discord Manager') { minPay = 65000; maxPay = 115000; }
            else if (jobChoice === 'CEO') { minPay = 150000; maxPay = 900000; reqPts = 2000; }
            else if (jobChoice === 'President') { minPay = 300000; maxPay = 1300000; reqPts = 5000; }

            if ((user.points || 0) < reqPts) return interaction.reply({ content: `❌ Requires ${reqPts} points.`, ephemeral: true });

            user.job = jobChoice;
            const salary = Math.floor(Math.random() * (maxPay - minPay + 1)) + minPay;
            user.wallet += salary;

            const clanPts = Math.floor(Math.random() * 9) + 2;
            addClanContribution(user, interaction.user.id, data, clanPts);
            saveData(data);
            return interaction.reply(`Worked as **${jobChoice}** and earned **${CURRENCY}${formatCurrency(salary)}**! *(+${clanPts} Clan Contribution)*`);
        }

        else if (commandName === 'trivia') {
            const questions = [
                { q: "Chemical symbol for Gold? (Hint: _ u)", ans: "au" },
                { q: "Red Planet? (Hint: _ _ a s)", ans: "mars" },
                { q: "Capital of Japan? (Hint: T _ _ y o)", ans: "tokyo" }
            ];
            const sel = questions[Math.floor(Math.random() * questions.length)];
            await interaction.reply({ content: `🧠 **Trivia (1 Minute Timer)!**\n\n${sel.q}\n*Type your answer below!*` });

            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

            collector.on('collect', m => {
                if (m.content.toLowerCase().trim() === sel.ans) {
                    user.wallet += 25000;
                    saveData(data);
                    m.reply(`🎉 Correct! You won **${CURRENCY}25,000**!`);
                } else {
                    m.reply(`❌ Incorrect! Answer was **${sel.ans}**.`);
                }
            });
            return;
        }

        // --- CLAN SYSTEM FIXES ---
        else if (commandName === 'clan') {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'create') {
                if (user.clan) return interaction.reply({ content: '❌ Already in a clan.', ephemeral: true });
                const clanName = interaction.options.getString('name');
                const logo = interaction.options.getString('logo');

                if (data.clans[clanName]) return interaction.reply({ content: '❌ Clan name taken.', ephemeral: true });

                data.clans[clanName] = {
                    name: clanName, logo: logo, leader: interaction.user.id, viceLeader: null,
                    points: 0, type: 'Open', minPoints: 0, members: [interaction.user.id], contributions: { [interaction.user.id]: 0 }
                };
                user.clan = clanName;
                saveData(data);
                return interaction.reply(`✅ Created clan **${clanName}**!`);
            }
            else if (subcommand === 'info') {
                if (!user.clan) return interaction.reply({ content: '❌ You are not in a clan.', ephemeral: true });
                const clan = data.clans[user.clan];

                const embed = new EmbedBuilder().setTitle(`🛡️ Clan: ${clan.name}`).setThumbnail(clan.logo).setColor('#9900ff')
                    .addFields(
                        { name: 'Leader', value: `<@${clan.leader}>`, inline: true },
                        { name: 'Total Clan Points', value: `${clan.points || 0} pts`, inline: true },
                        { name: 'Type', value: clan.type, inline: true }
                    );

                const memberLines = [];
                for (const mId of clan.members) {
                    const mObj = getUser(data, mId);
                    const contrib = clan.contributions[mId] || 0;
                    memberLines.text = `<@${mId}> — Contributions: ${contrib} pts | Rank Pts: ${mObj.points || 0}`;
                    memberLines.push(`<@${mId}> — Contributions: ${contrib} pts | Rank Pts: ${mObj.points || 0}`);
                }
                embed.addFields({ name: `Members (${clan.members.length})`, value: memberLines.join('\n') });

                return interaction.reply({ embeds: [embed] });
            }
            else if (subcommand === 'edit') {
                if (!user.clan) return interaction.reply({ content: '❌ Not in a clan.', ephemeral: true });
                const clan = data.clans[user.clan];
                if (clan.leader !== interaction.user.id) return interaction.reply({ content: '❌ Only leader can edit.', ephemeral: true });

                const newType = interaction.options.getString('type');
                const newMin = interaction.options.getInteger('min_points');
                if (newType) clan.type = newType;
                if (newMin !== null) clan.minPoints = newMin;
                saveData(data);
                return interaction.reply(`✅ Clan updated.`);
            }
        }

        else if (commandName === 'sclan') {
            const clanName = interaction.options.getString('name');
            const clan = data.clans[clanName];
            if (!clan) return interaction.reply({ content: `❌ Clan not found.`, ephemeral: true });
            if (user.clan) return interaction.reply({ content: '❌ Already in a clan.', ephemeral: true });
            if (clan.type === 'Private') return interaction.reply({ content: '❌ Clan is Private.', ephemeral: true });

            clan.members.push(interaction.user.id);
            clan.contributions[interaction.user.id] = 0;
            user.clan = clanName;
            saveData(data);
            return interaction.reply(`✅ Joined clan **${clanName}**!`);
        }

        // --- MARKET & SELLING FIXES ---
        else if (commandName === 'sell') {
            const typeName = interaction.options.getString('type');
            const qty = interaction.options.getInteger('quantity');
            const amount = interaction.options.getInteger('amount');

            if (qty <= 0 || amount <= 0) return interaction.reply({ content: '❌ Invalid quantity or price.', ephemeral: true });

            const isAnimal = HUNT_ANIMALS.some(a => a.name.toLowerCase() === typeName.toLowerCase());
            const isItem = user.inventory.some(i => i.toLowerCase() === typeName.toLowerCase());

            if (isAnimal) {
                const animalObj = HUNT_ANIMALS.find(a => a.name.toLowerCase() === typeName.toLowerCase());
                if ((user.collection[animalObj.name] || 0) < qty) return interaction.reply({ content: `❌ You do not own ${qty}x ${animalObj.name}.`, ephemeral: true });
                user.collection[animalObj.name] -= qty;
                if (user.collection[animalObj.name] <= 0) delete user.collection[animalObj.name];

                data.marketListings.push({
                    id: data.marketListings.length + 1, sellerId: interaction.user.id, sellerName: interaction.user.username,
                    type: 'Animal', name: animalObj.name, quantity: qty, price: amount
                });
            } else if (isItem) {
                const count = user.inventory.filter(i => i.toLowerCase() === typeName.toLowerCase()).length;
                if (count < qty) return interaction.reply({ content: `❌ You do not have ${qty}x ${typeName}.`, ephemeral: true });
                for (let i = 0; i < qty; i++) {
                    const idx = user.inventory.findIndex(inv => inv.toLowerCase() === typeName.toLowerCase());
                    if (idx > -1) user.inventory.splice(idx, 1);
                }

                data.marketListings.push({
                    id: data.marketListings.length + 1, sellerId: interaction.user.id, sellerName: interaction.user.username,
                    type: 'Item', name: typeName, quantity: qty, price: amount
                });
            } else {
                return interaction.reply({ content: `❌ You do not own **${typeName}** to sell.`, ephemeral: true });
            }

            saveData(data);
            return interaction.reply(`✅ Listed **${qty}x ${typeName}** on market for **${CURRENCY}${formatCurrency(amount)}**! (ID: ${data.marketListings.length})`);
        }

        else if (commandName === 'market') {
            const embed = new EmbedBuilder().setTitle('Community Player Market').setColor('#00ffcc');
            if (!data.marketListings || data.marketListings.length === 0) {
                embed.setDescription('No active listings available on the market.');
            } else {
                const list = data.marketListings.map(l => `**[ID: ${l.id}]** ${l.quantity}x **${l.name}** (${l.type}) by **${l.sellerName}** — **${CURRENCY}${formatCurrency(l.price)}**`).join('\n');
                embed.setDescription(list);
            }
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'buy-market') {
            const id = interaction.options.getInteger('id');
            const listing = data.marketListings.find(l => l.id === id);
            if (!listing) return interaction.reply({ content: '❌ Listing not found.', ephemeral: true });
            if (listing.sellerId === interaction.user.id) return interaction.reply({ content: '❌ Cannot buy your own listing.', ephemeral: true });
            if (user.wallet < listing.price) return interaction.reply({ content: '❌ Insufficient funds.', ephemeral: true });

            user.wallet -= listing.price;
            const sellerData = getUser(data, listing.sellerId);
            sellerData.wallet += listing.price;

            if (listing.type === 'Animal') {
                if (!user.collection[listing.name]) user.collection[listing.name] = 0;
                user.collection[listing.name] += listing.quantity;
            } else {
                for (let i = 0; i < listing.quantity; i++) user.inventory.push(listing.name);
            }

            data.marketListings = data.marketListings.filter(l => l.id !== id);
            saveData(data);

            return interaction.reply(`✅ Successfully bought ${listing.quantity}x **${listing.name}** for **${CURRENCY}${formatCurrency(listing.price)}**!`);
        }

        // --- TRADE ---
        else if (commandName === 'trade') {
            const target = interaction.options.getUser('target');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Cannot trade with yourself.', ephemeral: true });

            const tradeId = `${interaction.user.id}_${target.id}_${Date.now()}`;
            activeTrades.set(tradeId, { p1: interaction.user.id, p2: target.id, offers: { [interaction.user.id]: null, [target.id]: null }, p1Confirmed: false, p2Confirmed: false });

            const embed = new EmbedBuilder().setTitle('Secure Trade Session').setColor('#ffaa00')
                .setDescription(`Trade between **${interaction.user.username}** and **${target.username}**.`);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_add_${tradeId}`).setLabel('Add Item').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`trade_confirm_${tradeId}`).setLabel('Confirm Trade').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`trade_cancel_${tradeId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- BALANCE, BEG, SHOP, HUNT ---
        else if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            const embed = new EmbedBuilder().setColor('#0099ff').setTitle(`Balance — ${target.username}`)
                .addFields({ name: '🪙 Wallet', value: `${CURRENCY}${formatCurrency(tData.wallet)}`, inline: true }, { name: '🏦 Bank', value: `${CURRENCY}${formatCurrency(tData.bank)}`, inline: true });
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'beg') {
            const amt = Math.floor(Math.random() * 10000) + 1;
            user.wallet += amt;
            const clanPts = Math.floor(Math.random() * 6) + 2;
            addClanContribution(user, interaction.user.id, data, clanPts);
            saveData(data);
            return interaction.reply(`Begged and received **${CURRENCY}${formatCurrency(amt)}**! *(+${clanPts} Clan Contribution)*`);
        }

        else if (commandName === 'hunt') {
            const caught = HUNT_ANIMALS[Math.floor(Math.random() * HUNT_ANIMALS.length)];
            if (!user.collection[caught.name]) user.collection[caught.name] = 0;
            user.collection[caught.name]++;
            user.totalHunts = (user.totalHunts || 0) + 1;

            const clanPts = Math.floor(Math.random() * (caught.clanPts[1] - caught.clanPts[0] + 1)) + caught.clanPts[0];
            addClanContribution(user, interaction.user.id, data, clanPts);
            addUserExp(user, caught.minExp);
            saveData(data);

            const embed = new EmbedBuilder().setTitle('Hunting Expedition').setColor('#00ff88')
                .setDescription(`Discovered:\n${RARITY_ICONS[caught.tier]} ${caught.badge} **${caught.name}**!\n\n*(+${clanPts} Clan Contribution Points)*`);
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'inventory') {
            const embed = new EmbedBuilder().setTitle(`Inventory — ${interaction.user.username}`).setColor('#ffaa00')
                .addFields({ name: 'Items', value: user.inventory.join(', ') || 'Empty inventory.' });
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'profiles') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            const rankBadge = getRankBadge(tData.points || 0);

            const embed = new EmbedBuilder().setColor('#5865F2').setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`RPG Profile — ${target.username}`)
                .setDescription(`Title: ${formatTitleDisplay(tData.equippedTitle)}\nRank Badge: ${rankBadge}\nClan: **${tData.clan || 'None'}**`)
                .addFields({ name: 'Stats', value: `Level: **${tData.level}**\nJob: **${tData.job}**`, inline: true }, { name: 'Money', value: `Wallet: ${CURRENCY}${formatCurrency(tData.wallet)}\nBank: ${CURRENCY}${formatCurrency(tData.bank)}`, inline: true });
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'bank') {
            const action = interaction.options.getString('action');
            const amount = interaction.options.getInteger('amount');
            if (amount <= 0) return interaction.reply({ content: '❌ Invalid amount.', ephemeral: true });

            if (action === 'deposit') {
                if (user.wallet < amount) return interaction.reply({ content: '❌ Insufficient wallet funds.', ephemeral: true });
                user.wallet -= amount; user.bank += amount;
                interaction.reply(`Deposited **${CURRENCY}${formatCurrency(amount)}** into bank.`);
            } else {
                if (user.bank < amount) return interaction.reply({ content: '❌ Insufficient bank funds.', ephemeral: true });
                user.bank -= amount; user.wallet += amount;
                interaction.reply(`Withdrew **${CURRENCY}${formatCurrency(amount)}** to wallet.`);
            }
            saveData(data);
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);