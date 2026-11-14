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

let dbCache = null;

function readData() {
    if (dbCache) return dbCache;
    try {
        if (fs.existsSync(dataFile)) {
            dbCache = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading data.json:', e);
    }
    if (!dbCache || typeof dbCache !== 'object') {
        dbCache = { users: {}, clans: {}, marketListings: [], shopItems: [] };
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
            { id: 5, name: 'Lucky Charm I', price: 1500000, category: 'Charm', luckBoost: 0.25, emoji: '🍀', description: 'Increase Luck Boost For 25%' }
        ];
    }
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
            wallet: 500, bank: 1000, inventory: [], boxes: { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 },
            lootboxes: 0, collection: {}, cooldowns: {}, titles: ['Beta'], equippedTitle: 'Beta',
            started: false, level: 1, exp: 0, points: 0, totalHunts: 0,
            clan: null, job: 'Unemployed', badges: []
        };
        saveData(data);
    }
    const u = data.users[userId];
    if (u.started === undefined) u.started = false;
    if (!u.clan) u.clan = null;
    if (!u.boxes) u.boxes = { Rare: 0, Epic: 0, Ultra: 0, Legendary: 0, GOD: 0 };
    return u;
}

const CURRENCY = '₱';

function formatCurrency(amount) {
    if (amount >= 1e9) return (amount / 1e9).toFixed(1) + 'B';
    if (amount >= 1e6) return (amount / 1e6).toFixed(1) + 'M';
    if (amount >= 1e3) return (amount / 1e3).toFixed(1) + 'k';
    return amount.toLocaleString();
}

function getUserMaxExp(level) {
    return 2500 + ((level - 1) * 6000);
}

function addUserExp(user, amount) {
    user.exp += amount;
    let needed = getUserMaxExp(user.level);
    while (user.exp >= needed) {
        user.exp -= needed;
        user.level++;
        needed = getUserMaxExp(user.level);
    }
}

// STRICT CLAN CONTRIBUTION: Returns immediately if user has no clan or clan doesn't exist
function addClanContribution(user, userId, data, pointsEarned) {
    if (!user || !user.clan) return; 
    const clan = data.clans[user.clan];
    if (!clan) {
        user.clan = null; // Clean up ghost clan reference
        saveData(data);
        return;
    }
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
    { name: 'Worm', tier: 'Common', badge: '🐛', minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Dog', tier: 'Common', badge: '🐕', minExp: 20, maxExp: 50, clanPts: [2, 7] },
    { name: 'Bee', tier: 'Uncommon', badge: '🐝', minExp: 70, maxExp: 110, clanPts: [4, 9] },
    { name: 'Bear', tier: 'Rare', badge: '🐻', minExp: 120, maxExp: 170, clanPts: [7, 13] },
    { name: 'Whale', tier: 'Epic', badge: '🐋', minExp: 180, maxExp: 210, clanPts: [9, 16] },
    { name: 'Lion', tier: 'Mythic', badge: '🦁', minExp: 300, maxExp: 340, clanPts: [14, 23] },
    { name: 'Ghost', tier: 'S+ Tier', badge: '👻', minExp: 1370, maxExp: 1420, clanPts: [18, 29] },
    { name: 'Dragon', tier: 'SS+ Tier', badge: '🐉', minExp: 2500, maxExp: 2700, clanPts: [23, 34] },
    { name: 'Unicorn', tier: 'SSS+ Tier', badge: '🦄', minExp: 3500, maxExp: 4000, clanPts: [34, 52] },
    { name: 'Snowman', tier: 'GOD Tier', badge: '⛄', minExp: 5000, maxExp: 7000, clanPts: [45, 68] },
    { name: 'Shiny Turtle', tier: 'Shiny', badge: '<:ShinyTurtle:1570467471889137735>', minExp: 8000, maxExp: 10000, clanPts: [56, 100] },
    { name: 'Shiny Snowman', tier: 'Shiny', badge: '<:ShinySnowman:1570467561454305520>', minExp: 8000, maxExp: 10000, clanPts: [56, 100] },
    { name: 'Shiny Scorpion', tier: 'Shiny', badge: '<:ShinyScorpion:1570467397834379285>', minExp: 8000, maxExp: 10000, clanPts: [56, 100] },
    { name: 'Shiny Dolphin', tier: 'Shiny', badge: '<:Shinydolphin:1570467326573416602>', minExp: 8000, maxExp: 10000, clanPts: [56, 100] }
];

const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Initialize your profile.'),
    new SlashCommandBuilder().setName('help').setDescription('List available bot commands.'),
    new SlashCommandBuilder().setName('balance').setDescription('Check wallet and bank.'),
    new SlashCommandBuilder().setName('beg').setDescription('Beg for coins.'),
    new SlashCommandBuilder().setName('work').setDescription('Work to earn coins.')
        .addStringOption(o => o.setName('job').setDescription('Profession').setRequired(false).addChoices(
            {name:'Farmer', value:'Farmer'}, {name:'Chief', value:'Chief'}, {name:'Developer', value:'Developer'},
            {name:'Designer', value:'Designer'}, {name:'Discord Manager', value:'Discord Manager'},
            {name:'CEO', value:'CEO'}, {name:'President', value:'President'}
        )),
    new SlashCommandBuilder().setName('work-list').setDescription('View list of available professions.'),
    new SlashCommandBuilder().setName('trivia').setDescription('Answer a 1-minute random trivia challenge for cash prizes (₱1k-₱7k).'),
    new SlashCommandBuilder().setName('clan').setDescription('Manage your clan.')
        .addSubcommand(s => s.setName('create').setDescription('Create a clan').addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)).addStringOption(o => o.setName('logo').setDescription('Logo URL').setRequired(true)))
        .addSubcommand(s => s.setName('info').setDescription('View your current clan info'))
        .addSubcommand(s => s.setName('edit').setDescription('Edit clan settings').addStringOption(o => o.setName('type').setDescription('Open/Private').setRequired(false).addChoices({name:'Open', value:'Open'}, {name:'Private', value:'Private'}))),
    new SlashCommandBuilder().setName('sclan').setDescription('Search or join a clan').addStringOption(o => o.setName('name').setDescription('Clan name').setRequired(true)),
    new SlashCommandBuilder().setName('hunt').setDescription('Go hunting for animals and shinies!'),
    new SlashCommandBuilder().setName('profiles').setDescription('View your enhanced RPG profile card').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('sell').setDescription('Sell items/animals on market')
        .addStringOption(o => o.setName('type').setDescription('Name').setRequired(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Qty').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Price').setRequired(true)),
    new SlashCommandBuilder().setName('market').setDescription('View market listings'),
    new SlashCommandBuilder().setName('buy-market').setDescription('Buy market listing').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))
];

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    const data = readData();
    const user = getUser(data, interaction.user.id);

    if (commandName === 'start') {
        if (user.started) return interaction.reply({ content: '⚠️ Profile already initialized!', ephemeral: true });
        user.started = true;
        saveData(data);
        return interaction.reply({ content: '✅ Profile successfully initialized!', ephemeral: true });
    }

    if (!user.started && commandName !== 'help') {
        return interaction.reply({ content: '⚠️ Please run `/start` first!', ephemeral: true });
    }

    try {
        // --- /trivia REWORK ---
        if (commandName === 'trivia') {
            const triviaPool = [
                { q: "What is the chemical symbol for Gold? (Hint: _ u)", ans: "au" },
                { q: "What planet is known as the Red Planet? (Hint: _ _ a s)", ans: "mars" },
                { q: "How many continents are there on Earth? (Hint: type number)", ans: "7" },
                { q: "What is the capital of Japan? (Hint: T _ _ y o)", ans: "tokyo" },
                { q: "Which animal is known as the King of the Jungle? (Hint: L _ _ n)", ans: "lion" },
                { q: "Fill in the blank: Actions speak louder than _____.", ans: "words" }
            ];
            const selected = triviaPool[Math.floor(Math.random() * triviaPool.length)];
            const prize = Math.floor(Math.random() * 6001) + 1000; // ₱1,000 to ₱7,000

            await interaction.reply({ content: `🧠 **RPG Trivia Challenge!** (Prize: **${CURRENCY}${formatCurrency(prize)}** | Time: **1 Minute**)\n\n❓ **${selected.q}**\n\n*Type your answer in this channel!*` });

            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

            collector.on('collect', m => {
                if (m.content.toLowerCase().trim() === selected.ans) {
                    user.wallet += prize;
                    saveData(data);
                    m.reply(`🎉 Correct! You won **${CURRENCY}${formatCurrency(prize)}**!`);
                } else {
                    m.reply(`❌ Incorrect! The correct answer was **${selected.ans}**.`);
                }
            });
            return;
        }

        // --- /clan SYSTEM & INFO FIX ---
        else if (commandName === 'clan') {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'create') {
                if (user.clan) return interaction.reply({ content: '❌ You are already in a clan!', ephemeral: true });
                const clanName = interaction.options.getString('name');
                const logo = interaction.options.getString('logo');

                if (data.clans[clanName]) return interaction.reply({ content: '❌ Clan name already taken.', ephemeral: true });

                data.clans[clanName] = {
                    name: clanName, logo: logo, leader: interaction.user.id,
                    points: 0, type: 'Open', members: [interaction.user.id], contributions: { [interaction.user.id]: 0 }
                };
                user.clan = clanName;
                saveData(data);
                return interaction.reply(`✅ Successfully created clan **${clanName}**!`);
            }
            else if (subcommand === 'info') {
                if (!user.clan) return interaction.reply({ content: '❌ You are not in a clan. Use `/sclan [name]` to join one.', ephemeral: true });
                const clan = data.clans[user.clan];
                if (!clan) {
                    user.clan = null;
                    saveData(data);
                    return interaction.reply({ content: '❌ Your clan no longer exists.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ Clan: ${clan.name}`)
                    .setThumbnail(clan.logo || null)
                    .setColor('#9900ff')
                    .addFields(
                        { name: '👑 Leader', value: `<@${clan.leader}>`, inline: true },
                        { name: '⭐ Total Clan Points', value: `${clan.points || 0} pts`, inline: true },
                        { name: '🔓 Type', value: clan.type || 'Open', inline: true }
                    );

                const memberList = (clan.members || []).map(mId => {
                    const contrib = (clan.contributions && clan.contributions[mId]) || 0;
                    return `• <@${mId}> — Contributions: **${contrib} pts**`;
                }).join('\n');

                embed.addFields({ name: `👥 Members (${(clan.members || []).length})`, value: memberList || 'No members' });
                return interaction.reply({ embeds: [embed] });
            }
        }

        else if (commandName === 'sclan') {
            const clanName = interaction.options.getString('name');
            const clan = data.clans[clanName];
            if (!clan) return interaction.reply({ content: `❌ Clan not found.`, ephemeral: true });
            if (user.clan) return interaction.reply({ content: '❌ You are already in a clan.', ephemeral: true });

            if (!clan.members.includes(interaction.user.id)) {
                clan.members.push(interaction.user.id);
                clan.contributions[interaction.user.id] = 0;
            }
            user.clan = clanName;
            saveData(data);
            return interaction.reply(`✅ Successfully joined clan **${clanName}**!`);
        }

        // --- /hunt (Strict clan contribution check + Shinies included) ---
        else if (commandName === 'hunt') {
            const caught = HUNT_ANIMALS[Math.floor(Math.random() * HUNT_ANIMALS.length)];
            if (!user.collection[caught.name]) user.collection[caught.name] = 0;
            user.collection[caught.name]++;
            user.totalHunts = (user.totalHunts || 0) + 1;

            const clanPts = Math.floor(Math.random() * (caught.clanPts[1] - caught.clanPts[0] + 1)) + caught.clanPts[0];
            
            // Strictly check if user has a clan before awarding
            addClanContribution(user, interaction.user.id, data, clanPts);
            addUserExp(user, caught.minExp);
            saveData(data);

            const contributionText = user.clan ? `\n*(+${clanPts} Clan Contribution Points)*` : `\n*(Join a clan with /sclan to start earning clan contributions!)*`;

            const embed = new EmbedBuilder()
                .setTitle('⚔️ Hunting Expedition')
                .setColor('#00ff88')
                .setDescription(`Discovered:\n${RARITY_ICONS[caught.tier]} ${caught.badge} **${caught.name}**!${contributionText}`);
            return interaction.reply({ embeds: [embed] });
        }

        // --- /profiles REWORK (Enhanced cool RPG profile layout with emojis) ---
        else if (commandName === 'profiles') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`🛡️ RPG Character Profile — ${target.username}`)
                .setDescription(`📜 **Title**: \`${tData.equippedTitle || 'Adventurer'}\`\n🏰 **Clan**: **${tData.clan || 'None'}**`)
                .addFields(
                    { name: '📊 Progression', value: `⚡ Level: **${tData.level}**\n🎯 Points: **${tData.points || 0} pts**\n🗡️ Total Hunts: **${tData.totalHunts || 0}**`, inline: true },
                    { name: '💰 Economy', value: `🪙 Wallet: **${CURRENCY}${formatCurrency(tData.wallet)}**\n🏦 Bank: **${CURRENCY}${formatCurrency(tData.bank)}**`, inline: true },
                    { name: '💼 Occupation', value: `👔 Job: **${tData.job || 'Unemployed'}**`, inline: false }
                )
                .setFooter({ text: 'Keep hunting and questing to climb the global ranks!' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'balance') {
            const target = interaction.options.getUser('user') || interaction.user;
            const tData = getUser(data, target.id);
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`💰 Balance — ${target.username}`)
                .addFields(
                    { name: '🪙 Wallet', value: `${CURRENCY}${formatCurrency(tData.wallet)}`, inline: true },
                    { name: '🏦 Bank', value: `${CURRENCY}${formatCurrency(tData.bank)}`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'beg') {
            const amt = Math.floor(Math.random() * 5000) + 500;
            user.wallet += amt;
            const clanPts = Math.floor(Math.random() * 4) + 1;
            addClanContribution(user, interaction.user.id, data, clanPts);
            saveData(data);
            return interaction.reply(`🤲 You begged and received **${CURRENCY}${formatCurrency(amt)}**!${user.clan ? ` *(+${clanPts} Clan Contribution)*` : ''}`);
        }

        else if (commandName === 'sell') {
            const typeName = interaction.options.getString('type');
            const qty = interaction.options.getInteger('quantity');
            const amount = interaction.options.getInteger('amount');

            if (qty <= 0 || amount <= 0) return interaction.reply({ content: '❌ Invalid quantity or price.', ephemeral: true });

            data.marketListings.push({
                id: data.marketListings.length + 1, sellerId: interaction.user.id, sellerName: interaction.user.username,
                type: 'Item', name: typeName, quantity: qty, price: amount
            });
            saveData(data);
            return interaction.reply(`✅ Listed **${qty}x ${typeName}** on the market for **${CURRENCY}${formatCurrency(amount)}**!`);
        }

        else if (commandName === 'market') {
            const embed = new EmbedBuilder().setTitle('🛒 Community Player Market').setColor('#00ffcc');
            if (!data.marketListings || data.marketListings.length === 0) {
                embed.setDescription('No active listings available.');
            } else {
                const list = data.marketListings.map(l => `**[ID: ${l.id}]** ${l.quantity}x **${l.name}** by **${l.sellerName}** — **${CURRENCY}${formatCurrency(l.price)}**`).join('\n');
                embed.setDescription(list);
            }
            return interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'buy-market') {
            const id = interaction.options.getInteger('id');
            const listing = data.marketListings.find(l => l.id === id);
            if (!listing) return interaction.reply({ content: '❌ Listing not found.', ephemeral: true });
            if (user.wallet < listing.price) return interaction.reply({ content: '❌ Insufficient funds.', ephemeral: true });

            user.wallet -= listing.price;
            const sellerData = getUser(data, listing.sellerId);
            sellerData.wallet += listing.price;
            user.inventory.push(listing.name);

            data.marketListings = data.marketListings.filter(l => l.id !== id);
            saveData(data);
            return interaction.reply(`✅ Successfully purchased **${listing.name}** for **${CURRENCY}${formatCurrency(listing.price)}**!`);
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);