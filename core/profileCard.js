const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { BADGE_CATALOG } = require('./constants');
const { getClanLogoDisplay } = require('./helpers');

const emojiCache = new Map();
const imageCache = new Map();

const EMOJI_FONT_STACK = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "DejaVu Sans", sans-serif';
const TEXT_FONT_STACK = '"DejaVu Sans", "Liberation Sans", sans-serif';

const SMALL_CAPS_MAP = {
  'ᴀ': 'A', 'ʙ': 'B', 'ᴄ': 'C', 'ᴅ': 'D', 'ᴇ': 'E', 'ꜰ': 'F', 'ɢ': 'G',
  'ʜ': 'H', 'ɪ': 'I', 'ᴊ': 'J', 'ᴋ': 'K', 'ʟ': 'L', 'ᴍ': 'M', 'ɴ': 'N',
  'ᴏ': 'O', 'ᴘ': 'P', 'ꞯ': 'Q', 'ʀ': 'R', 'ꜱ': 'S', 'ᴛ': 'T', 'ᴜ': 'U',
  'ᴠ': 'V', 'ᴡ': 'W', 'x': 'X', 'ʏ': 'Y', 'ᴢ': 'Z'
};

function normalizeText(str) {
  return String(str ?? '')
    .split('')
    .map(ch => SMALL_CAPS_MAP[ch] || ch)
    .join('');
}

const THEME_PALETTES = {
  crystal: {
    bgTop: '#0d061c',
    bgMid: '#230e47',
    bgBot: '#090414',
    frameOuter: '#c084fc',
    frameInner: '#e9d5ff',
    glow: 'rgba(168, 85, 247, 0.55)',
    pillStart: '#581c87',
    pillMid: '#7e22ce',
    pillEnd: '#4c1d95',
    panelFill: 'rgba(9, 6, 20, 0.80)',
    subText: '#d8b4fe'
  },
  abyss: {
    bgTop: '#061126',
    bgMid: '#0f295c',
    bgBot: '#040a17',
    frameOuter: '#60a5fa',
    frameInner: '#bfdbfe',
    glow: 'rgba(59, 130, 246, 0.50)',
    pillStart: '#1e3a8a',
    pillMid: '#1d4ed8',
    pillEnd: '#172554',
    panelFill: 'rgba(6, 13, 28, 0.80)',
    subText: '#93c5fd'
  },
  crimson: {
    bgTop: '#1f060c',
    bgMid: '#4c0d1e',
    bgBot: '#120307',
    frameOuter: '#fb7185',
    frameInner: '#fecdd3',
    glow: 'rgba(244, 63, 94, 0.50)',
    pillStart: '#881337',
    pillMid: '#be123c',
    pillEnd: '#4c0519',
    panelFill: 'rgba(20, 5, 10, 0.80)',
    subText: '#fda4af'
  },
  emerald: {
    bgTop: '#041c14',
    bgMid: '#0b4733',
    bgBot: '#02120c',
    frameOuter: '#34d399',
    frameInner: '#a7f3d0',
    glow: 'rgba(16, 185, 129, 0.48)',
    pillStart: '#065f46',
    pillMid: '#047857',
    pillEnd: '#064e3b',
    panelFill: 'rgba(5, 20, 15, 0.80)',
    subText: '#6ee7b7'
  },
  solar: {
    bgTop: '#1f1304',
    bgMid: '#4d2f09',
    bgBot: '#120a02',
    frameOuter: '#fbbf24',
    frameInner: '#fde68a',
    glow: 'rgba(245, 158, 11, 0.50)',
    pillStart: '#78350f',
    pillMid: '#b45309',
    pillEnd: '#451a03',
    panelFill: 'rgba(20, 12, 4, 0.80)',
    subText: '#fcd34d'
  }
};

function hasSupporterOrNitro(userData, syncedBadges = []) {
  const active = new Set([
    ...(Array.isArray(userData?.badges) ? userData.badges : []),
    ...(Array.isArray(syncedBadges) ? syncedBadges : [])
  ]);
  return active.has('nitro') || active.has('supporter');
}

function getEmojiCdnUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/<(a?):[\w~]+:(\d+)>/);
  if (!match) return null;
  const ext = match[1] === 'a' ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${match[2]}.${ext}?size=96`;
}

async function loadRemote(url, cache, timeoutMs = 4500) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const fetcher = typeof fetch === 'function' ? fetch : require('node-fetch');
    const res = await fetcher(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    cache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

async function drawIcon(ctx, rawIcon, fallback, x, y, size) {
  const url = getEmojiCdnUrl(rawIcon);
  if (url) {
    const img = await loadRemote(url, emojiCache);
    if (img) {
      ctx.drawImage(img, x, y, size, size);
      return;
    }
  }
  const cleanRaw = rawIcon && !rawIcon.includes('<') ? normalizeText(rawIcon) : null;
  const glyph = fallback || cleanRaw || '•';
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(size * 0.72)}px ${EMOJI_FONT_STACK}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, x, y + size / 2);
  ctx.restore();
}

function traceChamferBox(ctx, x, y, w, h, cut = 22) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function drawSparkles(ctx, w, h, color) {
  const spots = [
    [95, 70, 12], [865, 68, 14], [75, 430, 10], [895, 415, 12],
    [110, 810, 11], [855, 815, 13], [480, 56, 9]
  ];
  ctx.save();
  ctx.fillStyle = color;
  for (const [sx, sy, r] of spots) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.quadraticCurveTo(sx, sy, sx + r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy + r);
    ctx.quadraticCurveTo(sx, sy, sx - r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy - r);
    ctx.fill();
  }
  ctx.restore();
}

function fitText(ctx, text, maxWidth, fontSize, weight = 'bold') {
  const normalized = normalizeText(text);
  let size = fontSize;
  ctx.font = `${weight} ${size}px ${TEXT_FONT_STACK}`;
  while (size > 16 && ctx.measureText(normalized).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${TEXT_FONT_STACK}`;
  }
  return normalized;
}

async function renderProfileCard({
  targetUserData = {},
  targetMember,
  displayName,
  joinedDateStr = 'N/A',
  leaderboardPos = 'Unranked',
  syncedBadges = [],
  rarityCounts = {},
  rarityIconsMap = {},
  betaEmojis = {},
  useBetaStyle = false,
  themeKey = 'crystal'
}) {
  const width = 960;
  const height = 880;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const canCustomizeBg = hasSupporterOrNitro(targetUserData, syncedBadges);
  const selectedKey = canCustomizeBg && THEME_PALETTES[themeKey] ? themeKey : 'crystal';
  const palette = THEME_PALETTES[selectedKey];

  // Base gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(0.5, palette.bgMid);
  bgGrad.addColorStop(1, palette.bgBot);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Ambient aura glows
  const auraLeft = ctx.createRadialGradient(190, 210, 15, 190, 210, 330);
  auraLeft.addColorStop(0, palette.glow);
  auraLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = auraLeft;
  ctx.fillRect(0, 0, width, height);

  const auraRight = ctx.createRadialGradient(780, 680, 20, 780, 680, 350);
  auraRight.addColorStop(0, palette.glow);
  auraRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = auraRight;
  ctx.fillRect(0, 0, width, height);

  drawSparkles(ctx, width, height, palette.frameInner);

  // Outer & inner beveled frame
  ctx.save();
  ctx.shadowColor = palette.frameOuter;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = palette.frameOuter;
  ctx.lineWidth = 5;
  traceChamferBox(ctx, 24, 24, width - 48, height - 48, 26);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = palette.frameInner;
  ctx.lineWidth = 2;
  traceChamferBox(ctx, 36, 36, width - 72, height - 72, 20);
  ctx.stroke();

  // Main dark translucent container
  ctx.fillStyle = palette.panelFill;
  traceChamferBox(ctx, 46, 46, width - 92, height - 92, 16);
  ctx.fill();
  ctx.restore();

  // Top-right avatar frame
  const avX = 688;
  const avY = 74;
  const avSize = 184;
  const avatarUrl = targetMember?.displayAvatarURL
    ? targetMember.displayAvatarURL({ extension: 'png', size: 256 })
    : null;
  const avatarImg = await loadRemote(avatarUrl, imageCache);

  ctx.save();
  ctx.shadowColor = palette.frameOuter;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = palette.frameInner;
  ctx.lineWidth = 3;
  traceChamferBox(ctx, avX, avY, avSize, avSize, 16);
  ctx.stroke();
  ctx.shadowBlur = 0;
  traceChamferBox(ctx, avX, avY, avSize, avSize, 16);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX, avY, avSize, avSize);
  } else {
    ctx.fillStyle = palette.bgMid;
    ctx.fillRect(avX, avY, avSize, avSize);
  }
  ctx.restore();

  // User identity & join date
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const rawDisplay = displayName || targetMember?.username || 'Player';
  const safeHandle = fitText(ctx, `@${rawDisplay}`, 560, 42, 'bold');
  ctx.fillText(safeHandle, 82, 120);

  ctx.fillStyle = palette.subText;
  ctx.font = `bold 26px ${TEXT_FONT_STACK}`;
  ctx.fillText(normalizeText(`[${joinedDateStr}]`), 82, 162);

  // USER BADGES row
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 23px ${EMOJI_FONT_STACK}`;
  ctx.fillText('★  USER BADGES', 82, 218);
  ctx.restore();

  if (syncedBadges.length > 0) {
    let bx = 82;
    for (const badgeKey of syncedBadges.slice(0, 8)) {
      const bIcon = BADGE_CATALOG[badgeKey]?.icon || '🏅';
      await drawIcon(ctx, bIcon, '🏅', bx, 236, 42);
      bx += 54;
    }
  } else {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `italic 22px ${TEXT_FONT_STACK}`;
    ctx.fillText('None', 82, 264);
    ctx.restore();
  }

  // Center pill header: USER STATS | RANK STATS
  const pillX = 195;
  const pillY = 312;
  const pillW = 570;
  const pillH = 54;

  ctx.save();
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
  pillGrad.addColorStop(0, palette.pillStart);
  pillGrad.addColorStop(0.5, palette.pillMid);
  pillGrad.addColorStop(1, palette.pillEnd);
  ctx.fillStyle = pillGrad;
  ctx.strokeStyle = palette.frameInner;
  ctx.lineWidth = 2.5;
  traceChamferBox(ctx, pillX, pillY, pillW, pillH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('USER STATS   |   RANK STATS', pillX + pillW / 2, pillY + 35);
  ctx.restore();

  // Vertical divider line
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480, 392);
  ctx.lineTo(480, 652);
  ctx.stroke();

  // Left column: USER STATUS
  const leftX = 84;
  let ly = 402;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${TEXT_FONT_STACK}`;
  ctx.fillText('USER STATUS', leftX + 46, ly + 22);
  ly += 54;

  const statusRows = [
    { icon: useBetaStyle ? betaEmojis.DICE : '🎲', fb: '🎲', text: `DICE: ${(targetUserData.dice || 0).toLocaleString()}` },
    { icon: useBetaStyle ? betaEmojis.CASH : '💵', fb: '💵', text: `CASH: ${(targetUserData.cash || 0).toLocaleString()}` },
    { icon: useBetaStyle ? betaEmojis.STREAK : '🔥', fb: '🔥', text: `STREAK: ${targetUserData.streak || 0}D` },
    { icon: useBetaStyle ? betaEmojis.EXP : '⭐', fb: '⭐', text: `LEVEL: ${targetUserData.userLevel || 1}` }
  ];

  for (const row of statusRows) {
    await drawIcon(ctx, row.icon, row.fb, leftX, ly - 22, 30);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
    ctx.fillText(normalizeText(row.text), leftX + 44, ly);
    ly += 48;
  }

  // Right column: RANK STATS
  const rightX = 515;
  let ry = 402;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${TEXT_FONT_STACK}`;
  ctx.fillText('RANK STATS', rightX + 46, ry + 22);
  ry += 54;

  const hasClan = Boolean(targetUserData.clan && targetUserData.clan !== 'NONE');
  const clanClean = hasClan ? normalizeText(targetUserData.clan.replace(/\*/g, '')) : 'NONE';
  const clanLogo = hasClan ? getClanLogoDisplay(targetUserData.clanLogoId) : null;

  await drawIcon(ctx, useBetaStyle ? betaEmojis.RANK : '🏅', '🏅', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
  ctx.fillText('RANK:', rightX + 44, ry);
  await drawIcon(ctx, targetUserData.rank, '★', rightX + 128, ry - 24, 34);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? betaEmojis.TROPHY_PTS : '🏆', '🏆', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText(normalizeText(`POINTS: ${(targetUserData.points || 0).toLocaleString()}`), rightX + 44, ry);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? betaEmojis.GLOBAL : '🌐', '🌐', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText(normalizeText(`LEADERBOARD: ${leaderboardPos}`), rightX + 44, ry);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? betaEmojis.CLAN_BADGE : '🛡️', '🛡️', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText('CLAN:', rightX + 44, ry);
  let cx = rightX + 128;
  if (clanLogo) {
    await drawIcon(ctx, clanLogo, '⚔️', cx, ry - 22, 30);
    cx += 38;
  }
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, clanClean, 410 - (cx - rightX), 24, 'bold'), cx, ry);

  // Bottom section: COLLECTIONS RARITIES
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 24px ${EMOJI_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('📦  COLLECTIONS RARITIES', width / 2, 704);
  ctx.textAlign = 'left';

  const row1 = [
    { key: 'C', label: `COMMON: ${rarityCounts.C || 0}`, x: 84 },
    { key: 'U', label: `UNCOMMON: ${rarityCounts.U || 0}`, x: 355 },
    { key: 'R', label: `RARE: ${rarityCounts.R || 0}`, x: 675 }
  ];
  const row2 = [
    { key: 'SR', label: `SR: ${rarityCounts.SR || 0}`, x: 84 },
    { key: 'SRR', label: `SRR: ${rarityCounts.SRR || 0}`, x: 285 },
    { key: 'UTR', label: `UTR: ${rarityCounts.UTR || 0}`, x: 485 },
    { key: 'SSRP', label: `SSRP: ${rarityCounts.SSRP || 0}`, x: 685 }
  ];

  const drawRarityRow = async (items, yPos) => {
    for (const item of items) {
      const iconRaw = (useBetaStyle && betaEmojis.RARITIES?.[item.key])
        || rarityIconsMap[item.key]
        || '📦';
      await drawIcon(ctx, iconRaw, '📦', item.x, yPos - 22, 30);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 23px ${TEXT_FONT_STACK}`;
      ctx.fillText(normalizeText(item.label), item.x + 38, yPos);
    }
  };

  await drawRarityRow(row1, 756);
  await drawRarityRow(row2, 812);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  THEME_PALETTES,
  hasSupporterOrNitro
};