const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadGameData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error('data.json is missing! Please make sure your data.json is in the root directory.');
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

const gameData = loadGameData();

const DEFAULT_CONFIG = {
  ownerId: '',
  mainGuildId: '',
  globalLuckMultiplier: 1.0,
  luckEventExpires: 0,
  globalXpMultiplier: 1.0,
  xpEventExpires: 0,
  seasonNumber: 1,
  seasonStartedAt: Date.now(),
  seasonExpires: Date.now() + (30 * 24 * 60 * 60 * 1000),
  clanSeasonExpires: Date.now() + (7 * 24 * 60 * 60 * 1000),
  maintenanceMode: false,
  testers: [],
  featuresPublished: false,
  pendingUpdatesCount: 0,
  clanRewards: {
    1: { qty: 5, rarity: 'UTR', chibiEmoji: '🌟' },
    2: { qty: 3, rarity: 'SRR', chibiEmoji: '🔥' },
    3: { qty: 2, rarity: 'SR', chibiEmoji: '⚡' }
  },
  eventActive: true,
  eventCrystals: {},
  eventShop: {
    cat_event: { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>', cost: 100 },
    doge_event: { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>', cost: 120 },
    troll_event: { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>', cost: 200 },
    frien_event: { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>', cost: 350 },
    seren_event: { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>', cost: 550 },
    hellkitty_event: { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>', cost: 650 },
    mezz_event: { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>', cost: 750 },
    ruru_event: { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>', cost: 1000 },
    zoprb_event: { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>', cost: 3000 },
    kazerb_event: { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>', cost: 4500 },
    georb_event: { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>', cost: 5000 }
  }
};

const GameStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'main_state' },
  users: { type: Object, default: {} },
  clans: { type: Object, default: {} },
  guildPrefixes: { type: Object, default: {} },
  channelRestrictions: { type: Object, default: {} },
  bannedUsers: { type: Object, default: {} },
  tradeHistories: { type: Object, default: {} },
  config: {
    type: Object,
    default: () => JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
});

const GameState = mongoose.model('GameState', GameStateSchema);

const db = {
  users: {},
  clans: {},
  guildPrefixes: {},
  channelRestrictions: {},
  bannedUsers: {},
  tradeHistories: {},
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG))
};

async function initDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is missing!');
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully!');

    let state = await GameState.findById('main_state');
    if (!state) {
      state = await GameState.create({
        _id: 'main_state',
        users: {},
        clans: {},
        guildPrefixes: {},
        channelRestrictions: {},
        bannedUsers: {},
        tradeHistories: {},
        config: db.config
      });
    }
    db.users = state.users || {};
    db.clans = state.clans || {};
    db.guildPrefixes = state.guildPrefixes || {};
    db.channelRestrictions = state.channelRestrictions || {};
    db.bannedUsers = state.bannedUsers || {};
    db.tradeHistories = state.tradeHistories || {};
    db.config = { ...db.config, ...(state.config || {}) };

    let prefixCleaned = false;
    for (const [gId, pref] of Object.entries(db.guildPrefixes)) {
      if (typeof pref === 'string' && /^[a-zA-Z]$/.test(pref)) {
        delete db.guildPrefixes[gId];
        prefixCleaned = true;
      }
    }
    if (prefixCleaned) {
      await saveUsers();
    }
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
}

async function saveUsers() {
  try {
    let state = await GameState.findById('main_state');
    if (!state) {
      state = new GameState({ _id: 'main_state' });
    }
    state.users = db.users;
    state.clans = db.clans;
    state.guildPrefixes = db.guildPrefixes;
    state.channelRestrictions = db.channelRestrictions;
    state.bannedUsers = db.bannedUsers;
    state.tradeHistories = db.tradeHistories;
    state.config = db.config;
    state.markModified('users');
    state.markModified('clans');
    state.markModified('guildPrefixes');
    state.markModified('channelRestrictions');
    state.markModified('bannedUsers');
    state.markModified('tradeHistories');
    state.markModified('config');
    await state.save();
  } catch (err) {
    console.error('Failed to save data to MongoDB:', err);
  }
}

module.exports = {
  DATA_FILE,
  gameData,
  GameState,
  db,
  initDatabase,
  saveUsers
};