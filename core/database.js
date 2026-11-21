const BADGE_CATALOG = {
  partner: { key: 'partner', category: 'Discord Category', name: 'Partner Badge', icon: '<:Partner_badge:1572633331244474369>', description: 'Owning by partnership' },
  staff: { key: 'staff', category: 'Discord Category', name: 'Staff Badge', icon: '<:Staff_badge:1572633388622549063>', description: 'You must admin or mod to have this' },
  moderator: { key: 'moderator', category: 'Discord Category', name: 'Moderator Badge', icon: '<:Moderator_badge:1572633450081558618>', description: 'You must moderator to have this' },
  developer: { key: 'developer', category: 'Discord Category', name: 'Developer Badge', icon: '<:Developer:1572779245242159284>', description: 'Creator of the bot' },
  bughunter: { key: 'bughunter', category: 'Discord Category', name: 'Bug Hunter Badge', icon: '<:Bughunter:1572779201126469824>', description: 'Catching Too many bugs' },
  support: { key: 'support', category: 'Discord Category', name: 'Beta Supporter Badge', icon: '<a:Support_badge:1572634032712188077>', description: 'Giving this by support the server since beta' },
  booster: { key: 'booster', category: 'Discord Category', name: 'Server Booster Badge', icon: '<a:Booster_badge:1572634086034505768>', description: 'Boosting the server in discord' },
  nitro: { key: 'nitro', category: 'Discord Category', name: 'Nitro Badge', icon: '<a:Nitro_badge:1572634168037220453>', description: 'Must owned a nitro, this badge have many perks' },
  collections: { key: 'collections', category: 'Event & Stats Category', name: 'Complete Collections Badge', icon: '<a:Collections:1572768891547947078>', description: 'Complete all collections' },
  lvl100: { key: 'lvl100', category: 'Event & Stats Category', name: 'Level 100 Badge', icon: '<:Lvl100_badge:1572634228074614965>', description: 'Obtained reaching lvl 100' },
  xmas2026: { key: 'xmas2026', category: 'Event & Stats Category', name: 'Xmas 2026 Badge', icon: '<a:Snow_badge:1572633513042387016>', description: 'Obtainable during xmas event 2026' },
  halloween2026: { key: 'halloween2026', category: 'Event & Stats Category', name: 'Halloween 2026 Badge', icon: '<a:Pumpkins:1572780141246152724>', description: 'Obtainable during halloween event 2026' }
};

const BETA_EMOJIS = {
  USERS: '<:Users:1572761957340287066>',
  TOTAL_BADGE: '<:Totalbadge:1572774284273909801>',
  STATS: '<:Stats:1572761987736408145>',
  DICE: '<:Dice:1572769311414820937>',
  CASH: '<:Cash:1572769444025999420>',
  STREAK: '<:Streak:1572769479803277403>',
  EXP: '<:Expp:1572769510170038282>',
  RANK: '<:Rank:1572771446801965076>',
  TROPHY_PTS: '<:Trophypts:1572763419382124544>',
  GLOBAL: '<:Global:1572766388727185488>',
  CLAN_BADGE: '<a:Clanbadge:1572769261032575147>',
  INV: '<:Inv:1572769543238062210>',
  COLLECTIONS: '<a:Collections:1572768891547947078>',
  HP: '<:Hp:1572769347061940356>',
  ATK: '<:Swordx:1572769375318970368>',
  DEF: '<:Def:1572769405841055784>',
  CRR_TROPHY: '<:Crrtrophy:1572796318869618738>',
  END_SEASON: '<:Endseason:1572796368718925959>',
  C_LEADER: '<a:Cleader:1572763472729477384>',
  CLAN_DESC: '<:Clandesc:1572806342736085052>',
  START_BTN: '<:Start:1572796405033214043>',
  CLAIM_BTN: '<:Claim:1572814245848940707>',
  RANKS_POS: { 1: '<:1st:1572796499979403334>', 2: '<:2nd:1572796465355690104>', 3: '<:3rd:1572796434867159161>' },
  RARITIES: {
    C: '<:Pcommon:1573802564200300687>',
    U: '<:Puncommon:1573802607561015306>',
    R: '<:Prare:1573802661134864464>',
    SR: '<:Psr:1573802765459918889>',
    SRR: '<:Psrr:1573802796040585358>',
    UTR: '<a:Putr:1573802703090614342>',
    STR: '<a:Pstr:1573802859491762237>',
    USRR: '<a:Pusrr:1573802908846264380>',
    UGMR: '<a:Pugmr:1573802950675923024>',
    SSRP: '<a:NewSSRP:1572759498198745248>'
  }
};

const RARITY_ICONS = {
  C: '<:Pcommon:1573802564200300687>',
  U: '<:Puncommon:1573802607561015306>',
  R: '<:Prare:1573802661134864464>',
  SR: '<:Psr:1573802765459918889>',
  SRR: '<:Psrr:1573802796040585358>',
  UTR: '<a:Putr:1573802703090614342>',
  STR: '<a:Pstr:1573802859491762237>',
  USRR: '<a:Pusrr:1573802908846264380>',
  UGMR: '<a:Pugmr:1573802950675923024>',
  SSRP: '<a:NewSSRP:1572759498198745248>'
};

const RARITY_RATES = [
  { key: 'C', label: 'Common', emoji: '<:Pcommon:1573802564200300687>', normalPct: 35, shinyPct: 0.0952 },
  { key: 'U', label: 'Uncommon', emoji: '<:Puncommon:1573802607561015306>', normalPct: 15, shinyPct: 0.0721 },
  { key: 'R', label: 'Rare', emoji: '<:Prare:1573802661134864464>', normalPct: 8, shinyPct: 0.0572 },
  { key: 'SR', label: 'SR', emoji: '<:Psr:1573802765459918889>', normalPct: 4, shinyPct: 0.0217 },
  { key: 'SRR', label: 'SRR', emoji: '<:Psrr:1573802796040585358>', normalPct: 1, shinyPct: 0.0137 },
  { key: 'UTR', label: 'UTR', emoji: '<a:Putr:1573802703090614342>', normalPct: 0.49, shinyPct: 0.0092 },
  { key: 'STR', label: 'STR', emoji: '<a:Pstr:1573802859491762237>', normalPct: 0.1, shinyPct: 0.0028 },
  { key: 'USRR', label: 'USRR', emoji: '<a:Pusrr:1573802908846264380>', normalPct: 0.0190, shinyPct: 0.0010 },
  { key: 'UGMR', label: 'UGMR', emoji: '<a:Pugmr:1573802950675923024>', normalPct: 0.015, shinyPct: 0.0001 }
];

const CLAN_ROLE_HIERARCHY = { Leader: 4, 'Co-Leader': 3, Officer: 2, Deputy: 1, Member: 0 };

const CLAN_LOGOS = {
  '1': '<a:Clanlogo1:1572057180704604261>',
  '2': '<a:Clanlogo2:1572057251022241913>',
  '3': '<a:Clanlogo3:1572057291400683653>',
  '4': '<a:Clanlogo4:1572057336112226324>',
  '5': '<a:Clanlogo5:1572057406102310923>',
  '6': '<a:Clanlogo6:1572057452864602223>',
  '7': '<a:Clanlogo7:1572057492501037176>',
  '8': '<a:Clanlogo8:1572057529817632828>',
  '9': '<a:Clanlogo9:1572057564135555142>',
  '10': '<a:Clanlogo10:1572057937814495355>',
  '11': '<a:Clanlogo11:1572057971830161408>',
  '12': '<:Cllanlogo12:1572058007532077238>'
};

const EVENT_ICONS = {
  TIPS: '<a:Tips:1572101474329300992>',
  CRYSTAL: '<a:Crystal_event:1572101509288558652>',
  EVENT_BADGE: '<a:Ascending:1572101417144025169>'
};

const EVENT_NPCS = [
  { name: 'Seroko Mabey', icon: '<:Np8:1572106125652795464>' },
  { name: 'Suxt Bebon', icon: '<:Npc7:1572106075807817768>' },
  { name: 'AXF Nurse', icon: '<:Npc6:1572106025929146469>' },
  { name: 'Jest Clumsey', icon: '<:Npc5:1572105934317293758>' },
  { name: 'Yumey Ker', icon: '<:Npc4:1572105897990430760>' },
  { name: 'Riri Zhun', icon: '<:Npc3:1572105865400549458>' },
  { name: 'Pamey Ev', icon: '<:Npc2:1572105768214204528>' },
  { name: 'Oz Wizzard', icon: '<:Npc1:1572105705958412399>' }
];

const EVENT_CHIBIS_POOL = [
  { id: 'cat_event', name: 'Cat Event', rarity: 'SSRP', emoji: '<a:Cat_event:1572106344511569990>' },
  { id: 'doge_event', name: 'Doge Event', rarity: 'SSRP', emoji: '<a:Doge_event:1572106275578319009>' },
  { id: 'troll_event', name: 'Troll Event', rarity: 'SSRP', emoji: '<a:Troll_event:1572106181013545092>' },
  { id: 'frien_event', name: 'Frien Event', rarity: 'SSRP', emoji: '<a:Frien_event:1572049331366928504>' },
  { id: 'seren_event', name: 'Seren Event', rarity: 'SSRP', emoji: '<a:Seren_event:1572049443765751939>' },
  { id: 'hellkitty_event', name: 'Hellkitty Event', rarity: 'SSRP', emoji: '<a:Hellkitty_event:1572049176915742822>' },
  { id: 'mezz_event', name: 'Mezz Event', rarity: 'SSRP', emoji: '<a:Mezz_event:1572049078001340517>' },
  { id: 'ruru_event', name: 'Ruru Event', rarity: 'SSRP', emoji: '<a:Ruru_event:1572048951786344448>' },
  { id: 'zoprb_event', name: 'Zoprb Event', rarity: 'SSRP', emoji: '<a:Zoprb_event:1572051059528958054>' },
  { id: 'kazerb_event', name: 'Kazerb Event', rarity: 'SSRP', emoji: '<a:Kazerb_event:1572050964192563281>' },
  { id: 'georb_event', name: 'Georb Event', rarity: 'SSRP', emoji: '<a:Georb_event:1572050282123366410>' }
];

const SEASON_LIST = {
  1: { name: 'Season 1 - Beta Phrase', start: 'November 1, 2026 - 12:00 AM' },
  2: { name: 'Season 2 - Alpha Xmas', start: 'December 1, 2026 - 12:00 AM' },
  3: { name: 'Season 3 - New Year Begins', start: 'January 1, 2027 - 12:00 AM' },
  4: { name: 'Season 4 - Snowy Flakes', start: 'February 1, 2027 - 12:00 AM' },
  5: { name: 'Season 5 - Chibi Venture', start: 'March 1, 2027 - 12:00 AM' },
  6: { name: 'Season 6 - Hacker Sonata', start: 'April 1, 2027 - 12:00 AM' },
  7: { name: 'Season 7 - Galaxy Reign', start: 'May 1, 2027 - 12:00 AM' },
  8: { name: 'Season 8 - New Era', start: 'June 1, 2027 - 12:00 AM' }
};

const TRIVIA_BANK = [
  { q: 'What is the powerhouse of the cell? Answer starts with M___', a: ['mitochondria'] },
  { q: 'What programming language is this bot written in? J______', a: ['javascript', 'js'] },
  { q: 'Which planet is known as the Red Planet? M___', a: ['mars'] },
  { q: 'What is the chemical symbol for gold? A_', a: ['au'] },
  { q: 'Who painted the Mona Lisa? L______', a: ['da vinci', 'leonardo da vinci'] },
  { q: 'What is the capital city of Japan? T____', a: ['tokyo'] },
  { q: 'How many continents are there on Earth? S____ / Number', a: ['seven', '7'] },
  { q: 'What gas do plants absorb from the atmosphere? C______ d______', a: ['carbon dioxide'] },
  { q: 'What is the largest mammal in the world? B____ w____', a: ['blue whale'] },
  { q: 'In what year did the Titanic sink? 1___', a: ['1912'] }
];

const SHINY_ICON = '<a:Shinynew:1572053794332872886>';
const RARITY_HIERARCHY = { SSRP: 10, UGMR: 9, USRR: 8, STR: 7, UTR: 6, SRR: 5, SR: 4, R: 3, U: 2, C: 1 };

const ALL_VALID_COMMANDS = new Set([
  'start', 'help', 'status', 'roll', 'drop', 'slot', 'shop', 'rarities',
  'event', 'eadventure', 'eshop', 'ecrystal', 'daily', 'points', 'rank', 'ranks',
  'ccranks', 'customnn', 'profilebg', 'setbg', 'seasons', 'higheststats', 'tradehistory',
  'cstats', 'equipteam', 'battle', 'inventory', 'collections', 'profile', 'trade',
  'clanlist', 'cclaninfo', 'ccreateclan', 'cclanjoin', 'clanleave', 'clanrename',
  'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced',
  'prefixchange', 'enablec', 'disablec', 'meme', 'trivia',
  'ownercommands', 'admincommands', 'ownerbotmaintenance', 'ownersetstatus',
  'adminrestoreall', 'ownerresetdata', 'fixadmin', 'ownersecretpanel',
  'ownergivechibi', 'adminsetclanrewards', 'owneradminpermsrem', 'removeadminperms',
  'admingivecrystal', 'adminsetlbseason', 'adminresetrank', 'adminsetnn',
  'adminban', 'adminclearlb', 'adminluckevent', 'adminsetxp', 'admingiveitem',
  'adminsetrank', 'adminsetpoints', 'admingivepermission', 'adminsetlevel',
  'testerpanel', 'addtester', 'removetester', 'pubnewupd', 'testerfeature',
  'testerfeatures', 'tf', 'admingivebadges', 'agb'
]);

const TESTER_ONLY_COMMANDS = new Set([
  'testerfeature', 'testerfeatures', 'tf', 'cpromote', 'cp', 'cannounce', 'kick', 'cmail', 'ceditdesc', 'ced'
]);

module.exports = {
  BADGE_CATALOG, BETA_EMOJIS, RARITY_ICONS, RARITY_RATES, CLAN_ROLE_HIERARCHY,
  CLAN_LOGOS, EVENT_ICONS, EVENT_NPCS, EVENT_CHIBIS_POOL, SEASON_LIST,
  TRIVIA_BANK, SHINY_ICON, RARITY_HIERARCHY, ALL_VALID_COMMANDS, TESTER_ONLY_COMMANDS
};