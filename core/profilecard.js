const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { BADGE_CATALOG } = require('./constants');

let helperMod = null;
try {
  helperMod = require('./Helper');
} catch {
  try {
    helperMod = require('./helpers');
  } catch {
    helperMod = null;
  }
}

const getClanLogoDisplay = helperMod?.getClanLogoDisplay || null;
const formatCompactValue = helperMod?.formatCompactValue || ((n) => String(Number(n) || 0));
const getUserRollLuckPercent = helperMod?.getUserRollLuckPercent || null;

const emojiCache = new Map();
const imageCache = new Map();

function registerBundledFonts() {
  const loadedFamilies = [];
  const candidateDirs = [
    path.join(__dirname, '..', 'fonts'),
    path.join(__dirname, '..'),
    path.resolve(process.cwd(), 'fonts'),
    path.resolve(process.cwd()),
    '/fonts'
  ];

  const checkedDirs = new Set();

  for (const dir of candidateDirs) {
    if (checkedDirs.has(dir)) continue;
    checkedDirs.add(dir);

    try {
      if (!fs.existsSync(dir)) continue;
      if (!fs.statSync(dir).isDirectory()) continue;

      const files = fs.readdirSync(dir).filter(f => /\.(ttf|otf|woff2)$/i.test(f));
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const familyName = `BotFont_${path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const ok = GlobalFonts.registerFromPath(fullPath, familyName);
        if (ok) {
          loadedFamilies.push(`"${familyName}"`);
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  return loadedFamilies;
}

const REGISTERED_FONTS = registerBundledFonts();
const EMOJI_FONT_STACK = [...REGISTERED_FONTS, '"Noto Color Emoji"', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"DejaVu Sans"', 'sans-serif'].join(', ');
const TEXT_FONT_STACK = [...REGISTERED_FONTS, '"DejaVu Sans"', '"Liberation Sans"', 'sans-serif'].join(', ');

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

function formatElapsedTimePlayed(startInput, nowMs = Date.now()) {
  let startMs = null;

  if (typeof startInput === 'number' && Number.isFinite(startInput) && startInput > 0) {
    startMs = startInput;
  } else if (typeof startInput === 'string' && startInput.trim()) {
    const parsed = Date.parse(startInput.trim());
    if (!Number.isNaN(parsed) && parsed > 0) {
      startMs = parsed;
    }
  }

  if (!startMs || nowMs <= startMs) {
    return '0s';
  }

  let totalSeconds = Math.floor((nowMs - startMs) / 1000);

  const secInMin = 60;
  const secInHour = 3600;
  const secInDay = 86400;
  const secInWeek = 7 * secInDay;
  const secInMonth = 30 * secInDay;
  const secInYear = 365 * secInDay;

  const years = Math.floor(totalSeconds / secInYear);
  totalSeconds %= secInYear;

  const months = Math.floor(totalSeconds / secInMonth);
  totalSeconds %= secInMonth;

  const weeks = Math.floor(totalSeconds / secInWeek);
  totalSeconds %= secInWeek;

  const days = Math.floor(totalSeconds / secInDay);
  totalSeconds %= secInDay;

  const hours = Math.floor(totalSeconds / secInHour);
  totalSeconds %= secInHour;

  const minutes = Math.floor(totalSeconds / secInMin);
  const seconds = totalSeconds % secInMin;

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
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

const REVAMPED_RARITY_ICONS = {
  C: '<:Pcommon:1573802564200300687>',
  U: '<:Puncommon:1573802607561015306>',
  R: '<:Prare:1573802661134864464>',
  SR: '<:Psr:1573802765459918889>',
  SRR: '<:Psrr:1573802796040585358>',
  UTR: '<a:Putr:1573802703090614342>',
  STR: '<a:Pstr:1573802859491762237>',
  USRR: '<a:Pusrr:1573802908846264380>',
  UGMR: '<a:Pugmr:1573802950675923024>'
};

const REVAMPED_STAT_ICONS = {
  CASH: '<:Newcurrency:1573803627691114598>',
  STREAK: '<:Newstreak:1573803737443467405>',
  LEVEL: '<:Newlvl:1573803698029863106>'
};

function hasSupporterOrNitro(userData, syncedBadges = []) {
  const active = new Set([
    ...(Array.isArray(userData?.badges) ? userData.badges : []),
    ...(Array.isArray(syncedBadges) ? syncedBadges : [])
  ]);
  return active.has('nitrouser') || active.has('supporter') || active.has('nitro') || active.has('support');
}

function isValidImageSource(rawSrc) {
  if (!rawSrc || typeof rawSrc !== 'string') return false;
  const trimmed = rawSrc.trim();
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function drawCoverImage(ctx, img, dx, dy, dw, dh) {
  const imgRatio = img.width / img.height;
  const boxRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else if (imgRatio < boxRatio) {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function getEmojiCdnUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/<(a?):[\w~]+:(\d+)>/);
  if (!match) return null;
  const ext = match[1] === 'a' ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${match[2]}.${ext}?size=96`;
}

async function loadRemote(url, cache, timeoutMs = 6000) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    if (cache.has(trimmed)) return cache.get(trimmed);
    try {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx === -1) return null;
      const base64Data = trimmed.slice(commaIdx + 1);
      const buf = Buffer.from(base64Data, 'base64');
      if (!buf.length) return null;
      const img = await loadImage(buf);
      cache.set(trimmed, img);
      return img;
    } catch (err) {
      console.warn('[profilecard] Failed to decode data URI image:', err?.message || err);
      return null;
    }
  }

  if (cache.has(trimmed)) return cache.get(trimmed);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const fetcher = typeof fetch === 'function' ? fetch : require('node-fetch');
    const res = await fetcher(trimmed, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 DiscordBot' }
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[profilecard] HTTP ${res.status} fetching image: ${trimmed}`);
      return null;
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      console.warn(`[profilecard] Non-image content-type (${contentType}) for URL: ${trimmed}`);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;

    const img = await loadImage(buf);
    cache.set(trimmed, img);
    return img;
  } catch (err) {
    console.warn(`[profilecard] Failed to load image ${trimmed}:`, err?.message || err);
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
  while (size > 14 && ctx.measureText(normalized).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${TEXT_FONT_STACK}`;
  }
  return normalized;
}

function resolveBadgeList(userData = {}, syncedBadges = []) {
  const rawList = [
    ...(Array.isArray(syncedBadges) ? syncedBadges : []),
    ...(Array.isArray(userData?.badges) ? userData.badges : [])
  ];
  const uniqueKeys = [];
  const seen = new Set();
  for (const key of rawList) {
    if (typeof key === 'string' && key.trim() && !seen.has(key)) {
      seen.add(key);
      uniqueKeys.push(key);
    }
  }
  return uniqueKeys;
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
  themeKey = 'crystal',
  customBgUrl = null,
  timePlayedStr = null
}) {
  const safeUserData = targetUserData && typeof targetUserData === 'object' ? targetUserData : {};
  const safeSyncedBadges = resolveBadgeList(safeUserData, syncedBadges);
  const safeRarityCounts = rarityCounts && typeof rarityCounts === 'object' ? rarityCounts : {};
  const safeRarityIconsMap = rarityIconsMap && typeof rarityIconsMap === 'object' ? rarityIconsMap : {};
  const safeBetaEmojis = betaEmojis && typeof betaEmojis === 'object' ? betaEmojis : {};

  const width = 960;
  const height = 880;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const canUsePerk = hasSupporterOrNitro(safeUserData, safeSyncedBadges);
  const selectedKey = canUsePerk && THEME_PALETTES[themeKey] ? themeKey : 'crystal';
  const palette = THEME_PALETTES[selectedKey];

  const candidateBg = customBgUrl
    || safeUserData.customBg
    || safeUserData.bgUrl
    || safeUserData.backgroundUrl
    || null;

  const customBgImg = isValidImageSource(candidateBg)
    ? await loadRemote(candidateBg.trim(), imageCache, 7000)
    : null;

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(0.5, palette.bgMid);
  bgGrad.addColorStop(1, palette.bgBot);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  if (customBgImg) {
    ctx.save();
    drawCoverImage(ctx, customBgImg, 0, 0, width, height);
    const scrim = ctx.createLinearGradient(0, 0, 0, height);
    scrim.addColorStop(0, 'rgba(9, 6, 20, 0.35)');
    scrim.addColorStop(0.5, 'rgba(9, 6, 20, 0.45)');
    scrim.addColorStop(1, 'rgba(9, 6, 20, 0.62)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

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

  ctx.fillStyle = customBgImg ? 'rgba(9, 6, 20, 0.28)' : palette.panelFill;
  traceChamferBox(ctx, 46, 46, width - 92, height - 92, 16);
  ctx.fill();
  ctx.restore();

  const avX = 688;
  const avY = 74;
  const avSize = 184;
  const avatarUrl = typeof targetMember?.displayAvatarURL === 'function'
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

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const rawDisplay = displayName || targetMember?.username || 'Player';
  ctx.fillText(fitText(ctx, `@${rawDisplay}`, 265, 38, 'bold'), 82, 114);

  ctx.fillStyle = palette.subText;
  ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
  ctx.fillText(normalizeText(`[${joinedDateStr}]`), 82, 152);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(358, 82);
  ctx.lineTo(358, 160);
  ctx.stroke();

  const bestRollDisplay = safeUserData.bestRoll && String(safeUserData.bestRoll).trim()
    ? String(safeUserData.bestRoll).trim()
    : 'None';
  const computedTimePlayed = timePlayedStr
    || formatElapsedTimePlayed(safeUserData.firstPlayedAt || joinedDateStr);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 22px ${TEXT_FONT_STACK}`;
  ctx.fillText(fitText(ctx, `Best roll: ${bestRollDisplay}`, 295, 22, 'bold'), 374, 112);

  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold 20px ${TEXT_FONT_STACK}`;
  ctx.fillText(fitText(ctx, `Timeplayed: ${computedTimePlayed}`, 295, 20, 'bold'), 374, 148);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 23px ${EMOJI_FONT_STACK}`;
  ctx.fillText('★  USER BADGES', 82, 218);
  ctx.restore();

  if (safeSyncedBadges.length > 0) {
    let bx = 82;
    for (const badgeKey of safeSyncedBadges.slice(0, 8)) {
      const badgeEntry = BADGE_CATALOG?.[badgeKey];
      const badgeIcon = typeof badgeEntry === 'string' ? badgeEntry : (badgeEntry?.icon || '🏅');
      await drawIcon(ctx, badgeIcon, '🏅', bx, 236, 42);
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

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480, 392);
  ctx.lineTo(480, 652);
  ctx.stroke();

  const leftX = 84;
  let ly = 402;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${TEXT_FONT_STACK}`;
  ctx.fillText('USER STATUS', leftX + 46, ly + 22);
  ly += 54;

  const statusRows = [
    { icon: useBetaStyle ? safeBetaEmojis.DICE : '🎲', fb: '🎲', text: `DICE: ${formatCompactValue(Number(safeUserData.dice) || 0)}` },
    { icon: REVAMPED_STAT_ICONS.CASH, fb: '💵', text: `CASH: ${formatCompactValue(Number(safeUserData.cash) || 0)}` },
    { icon: REVAMPED_STAT_ICONS.STREAK, fb: '🔥', text: `STREAK: ${formatCompactValue(Number(safeUserData.streak) || 0)}D` },
    { icon: REVAMPED_STAT_ICONS.LEVEL, fb: '⭐', text: `LEVEL: ${formatCompactValue(Number(safeUserData.userLevel) || 1)}` }
  ];

  for (const row of statusRows) {
    await drawIcon(ctx, row.icon, row.fb, leftX, ly - 22, 30);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
    ctx.fillText(normalizeText(row.text), leftX + 44, ly);
    ly += 48;
  }

  const rightX = 515;
  let ry = 402;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${TEXT_FONT_STACK}`;
  ctx.fillText('RANK STATS', rightX + 46, ry + 22);
  ry += 54;

  const hasClan = Boolean(safeUserData.clan && safeUserData.clan !== 'NONE');
  const clanClean = hasClan ? normalizeText(String(safeUserData.clan).replace(/\*/g, '')) : 'NONE';
  const clanLogo = hasClan && typeof getClanLogoDisplay === 'function' ? getClanLogoDisplay(safeUserData.clanLogoId) : null;

  await drawIcon(ctx, useBetaStyle ? safeBetaEmojis.RANK : '🏅', '🏅', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold 24px ${TEXT_FONT_STACK}`;
  ctx.fillText('RANK:', rightX + 44, ry);
  await drawIcon(ctx, safeUserData.rank, '★', rightX + 128, ry - 24, 34);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? safeBetaEmojis.TROPHY_PTS : '🏆', '🏆', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText(normalizeText(`POINTS: ${formatCompactValue(Number(safeUserData.points) || 0)}`), rightX + 44, ry);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? safeBetaEmojis.GLOBAL : '🌐', '🌐', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText(normalizeText(`LEADERBOARD: ${leaderboardPos}`), rightX + 44, ry);
  ry += 48;

  await drawIcon(ctx, useBetaStyle ? safeBetaEmojis.CLAN_BADGE : '🛡️', '🛡️', rightX, ry - 22, 30);
  ctx.textAlign = 'left';
  ctx.fillText('CLAN:', rightX + 44, ry);
  let cx = rightX + 128;
  if (clanLogo) {
    await drawIcon(ctx, clanLogo, '⚔️', cx, ry - 22, 30);
    cx += 38;
  }
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, clanClean, 410 - (cx - rightX), 24, 'bold'), cx, ry);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(548, 682);
  ctx.lineTo(548, 836);
  ctx.stroke();

  await drawIcon(ctx, '<:Chibicol:1573807211891654911>', '📦', 82, 682, 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 21px ${TEXT_FONT_STACK}`;
  ctx.fillText(normalizeText('COLLECTIONS RARITY'), 118, 703);

  await drawIcon(ctx, '<:Attributes:1572634228074614965>', '⚡', 572, 682, 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 21px ${TEXT_FONT_STACK}`;
  ctx.fillText(normalizeText('ATTRIBUTES'), 608, 703);

  const rarityRow1 = [
    { key: 'C', count: Number(safeRarityCounts.C) || 0, x: 76 },
    { key: 'U', count: Number(safeRarityCounts.U) || 0, x: 171 },
    { key: 'R', count: Number(safeRarityCounts.R) || 0, x: 266 },
    { key: 'SR', count: Number(safeRarityCounts.SR) || 0, x: 361 },
    { key: 'SRR', count: Number(safeRarityCounts.SRR) || 0, x: 456 }
  ];
  const rarityRow2 = [
    { key: 'UTR', count: Number(safeRarityCounts.UTR) || 0, x: 76 },
    { key: 'STR', count: Number(safeRarityCounts.STR) || 0, x: 171 },
    { key: 'USRR', count: Number(safeRarityCounts.USRR) || 0, x: 266 },
    { key: 'UGMR', count: Number(safeRarityCounts.UGMR) || 0, x: 361 }
  ];

  const drawRarityIconOnlyRow = async (items, yPos) => {
    for (const item of items) {
      const iconRaw =
        REVAMPED_RARITY_ICONS[item.key] ||
        (useBetaStyle && safeBetaEmojis.RARITIES?.[item.key]) ||
        safeRarityIconsMap[item.key] ||
        '📦';
      await drawIcon(ctx, iconRaw, '📦', item.x, yPos - 19, 25);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 18px ${TEXT_FONT_STACK}`;
      ctx.fillText(normalizeText(formatCompactValue(item.count)), item.x + 29, yPos);
    }
  };

  await drawRarityIconOnlyRow(rarityRow1, 754);
  await drawRarityIconOnlyRow(rarityRow2, 806);

  const rawDiceVal = safeUserData.equippedDice ?? safeUserData.currentDice ?? safeUserData.activeDice ?? null;
  const normalizedDiceKey = typeof rawDiceVal === 'string' ? rawDiceVal.trim().toLowerCase() : '';
  const hasEquippedDice = Boolean(normalizedDiceKey && normalizedDiceKey !== 'none' && normalizedDiceKey !== 'null');
  const luckSummary = hasEquippedDice && typeof getUserRollLuckPercent === 'function'
    ? getUserRollLuckPercent(safeUserData)
    : null;
  const currentDiceIcon = hasEquippedDice
    ? (luckSummary?.diceInfo?.emoji || '<:Zenithdice:1573808579042087044>')
    : null;
  const totalLuckVal = hasEquippedDice ? Number(luckSummary?.totalLuckPercent ?? 0) : 0;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold 21px ${TEXT_FONT_STACK}`;
  ctx.fillText(normalizeText('CURRENT DICE:'), 572, 754);
  if (hasEquippedDice && currentDiceIcon) {
    await drawIcon(ctx, currentDiceIcon, '🎲', 748, 732, 30);
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('None', 748, 754);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold 21px ${TEXT_FONT_STACK}`;
  ctx.fillText(
    fitText(ctx, `TOTAL LUCK: ${totalLuckVal > 0 ? `${formatCompactValue(totalLuckVal)}%` : '0%'}`, 310, 21, 'bold'),
    572,
    806
  );

  ctx.restore();

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  THEME_PALETTES,
  hasSupporterOrNitro,
  formatElapsedTimePlayed
};