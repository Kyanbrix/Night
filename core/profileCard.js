const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { BADGE_CATALOG, SHINY_ICON } = require('./constants');

const THEME_PALETTES = {
  crystal: {
    bgTop: '#160a26',
    bgBottom: '#090412',
    panelFill: 'rgba(18, 9, 32, 0.78)',
    borderOuter: '#9b4dff',
    borderInner: '#5b21b6',
    nameplateFill: 'rgba(67, 24, 134, 0.85)',
    nameplateStroke: '#b57aff',
    textPrimary: '#ffffff',
    textMuted: '#c4b5fd',
    accent: '#c084fc'
  },
  crimson: {
    bgTop: '#2a0812',
    bgBottom: '#110307',
    panelFill: 'rgba(30, 8, 15, 0.78)',
    borderOuter: '#f43f5e',
    borderInner: '#9f1239',
    nameplateFill: 'rgba(136, 19, 55, 0.85)',
    nameplateStroke: '#fb7185',
    textPrimary: '#ffffff',
    textMuted: '#fecdd3',
    accent: '#fb7185'
  },
  emerald: {
    bgTop: '#06241b',
    bgBottom: '#020d0a',
    panelFill: 'rgba(6, 28, 21, 0.78)',
    borderOuter: '#10b981',
    borderInner: '#047857',
    nameplateFill: 'rgba(6, 95, 70, 0.85)',
    nameplateStroke: '#34d399',
    textPrimary: '#ffffff',
    textMuted: '#a7f3d0',
    accent: '#34d399'
  },
  gold: {
    bgTop: '#261a05',
    bgBottom: '#0f0a02',
    panelFill: 'rgba(28, 19, 5, 0.78)',
    borderOuter: '#f59e0b',
    borderInner: '#b45309',
    nameplateFill: 'rgba(146, 64, 14, 0.85)',
    nameplateStroke: '#fbbf24',
    textPrimary: '#ffffff',
    textMuted: '#fde68a',
    accent: '#fbbf24'
  },
  ocean: {
    bgTop: '#061a2e',
    bgBottom: '#020a14',
    panelFill: 'rgba(7, 23, 41, 0.78)',
    borderOuter: '#38bdf8',
    borderInner: '#0369a1',
    nameplateFill: 'rgba(12, 74, 110, 0.85)',
    nameplateStroke: '#7dd3fc',
    textPrimary: '#ffffff',
    textMuted: '#bae6fd',
    accent: '#7dd3fc'
  }
};

const FONT_STACK = '"DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif';

function hasSupporterOrNitro(userData = {}, syncedBadges = []) {
  const badgeSet = new Set([
    ...(Array.isArray(userData.badges) ? userData.badges : []),
    ...(Array.isArray(syncedBadges) ? syncedBadges : [])
  ]);
  return badgeSet.has('supporter') || badgeSet.has('nitro');
}

function parseEmojiSpec(raw) {
  if (!raw || typeof raw !== 'string') return { type: 'text', value: '✨' };
  const trimmed = raw.trim();
  const customMatch = trimmed.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (customMatch) {
    const id = customMatch[3];
    // Static PNG URL for crisp canvas rendering (animated emojis still render as a frame in PNG)
    return { type: 'url', url: `https://cdn.discordapp.com/emojis/${id}.png?size=128&quality=lossless`, fallback: '✨' };
  }
  if (/^\d{15,22}$/.test(trimmed)) {
    return { type: 'url', url: `https://cdn.discordapp.com/emojis/${trimmed}.png?size=128&quality=lossless`, fallback: '✨' };
  }
  return { type: 'text', value: trimmed };
}

async function safeLoadImage(url) {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function drawIconSpec(ctx, spec, x, y, size, palette) {
  if (!spec) return;
  if (spec.type === 'url') {
    const img = await safeLoadImage(spec.url);
    if (img) {
      ctx.drawImage(img, x, y, size, size);
      return;
    }
  }
  const label = spec.type === 'url' ? spec.fallback : spec.value;
  ctx.save();
  ctx.font = `${Math.round(size * 0.78)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText(label, x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

async function renderProfileCard({
  targetUserData = {},
  targetMember = null,
  displayName = 'Player',
  joinedDateStr = 'N/A',
  leaderboardPos = 'Unranked',
  syncedBadges = [],
  rarityCounts = {},
  rarityIconsMap = {},
  betaEmojis = {},
  useBetaStyle = false,
  themeKey = 'crystal'
}) {
  const width = 900;
  const height = 1040;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const palette = THEME_PALETTES[themeKey] || THEME_PALETTES.crystal;

  // 1. Background gradient & subtle glow
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.35, 40, width * 0.5, height * 0.35, 520);
  glow.addColorStop(0, `${palette.accent}28`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 2. Outer & inner card frame
  ctx.save();
  roundRectPath(ctx, 22, 22, width - 44, height - 44, 34);
  ctx.strokeStyle = palette.borderOuter;
  ctx.lineWidth = 6;
  ctx.stroke();

  roundRectPath(ctx, 36, 36, width - 72, height - 72, 26);
  ctx.strokeStyle = palette.borderInner;
  ctx.lineWidth = 3;
  ctx.stroke();

  roundRectPath(ctx, 44, 44, width - 88, height - 88, 22);
  ctx.fillStyle = palette.panelFill;
  ctx.fill();
  ctx.restore();

  // 3. Top-right Avatar
  const avatarSize = 186;
  const avatarX = width - 86 - avatarSize;
  const avatarY = 86;
  const avatarUrl = targetMember && typeof targetMember.displayAvatarURL === 'function'
    ? targetMember.displayAvatarURL({ extension: 'png', size: 256 })
    : null;
  const avatarImg = avatarUrl ? await safeLoadImage(avatarUrl) : null;

  ctx.save();
  roundRectPath(ctx, avatarX - 4, avatarY - 4, avatarSize + 8, avatarSize + 8, 24);
  ctx.strokeStyle = palette.borderOuter;
  ctx.lineWidth = 4;
  ctx.stroke();

  roundRectPath(ctx, avatarX, avatarY, avatarSize, avatarSize, 20);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#2a1845';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // 4. Badges row (upper-left)
  const badgeKeys = Array.from(new Set([
    ...(Array.isArray(syncedBadges) ? syncedBadges : []),
    ...(Array.isArray(targetUserData.badges) ? targetUserData.badges : [])
  ]));
  let badgeX = 86;
  const badgeY = 186;
  for (const key of badgeKeys.slice(0, 8)) {
    const def = BADGE_CATALOG[key];
    if (!def) continue;
    await drawIconSpec(ctx, parseEmojiSpec(def.icon), badgeX, badgeY, 44, palette);
    badgeX += 54;
  }

  // 5. Nameplate pill + Visible Display Name
  const nameBoxX = 86;
  const nameBoxY = 258;
  const nameBoxW = width - 172;
  const nameBoxH = 66;

  ctx.save();
  roundRectPath(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, 33);
  ctx.fillStyle = palette.nameplateFill;
  ctx.fill();
  ctx.strokeStyle = palette.nameplateStroke;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const safeName = String(displayName || 'Player').trim() || 'Player';
  let fontSize = 32;
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  while (fontSize > 18 && ctx.measureText(safeName).width > nameBoxW - 48) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  }
  ctx.fillStyle = palette.textPrimary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(safeName, nameBoxX + nameBoxW / 2, nameBoxY + nameBoxH / 2 + 1);
  ctx.restore();

  // 6. Left Column: Dice, Cash (0), Streak, Level
  const leftX = 96;
  const statsStartY = 385;
  const rowGap = 72;

  const leftRows = [
    { icon: useBetaStyle && betaEmojis.DICE ? betaEmojis.DICE : '🎲', text: `${(targetUserData.dice || 0).toLocaleString()} Dice` },
    { icon: '💵', text: '0 Cash' },
    { icon: '🔥', text: `${targetUserData.streak || 0} Streak` },
    { icon: '⭐', text: `Lvl ${targetUserData.userLevel || 1}` }
  ];

  for (let i = 0; i < leftRows.length; i++) {
    const y = statsStartY + i * rowGap;
    await drawIconSpec(ctx, parseEmojiSpec(leftRows[i].icon), leftX, y, 42, palette);
    ctx.save();
    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(leftRows[i].text, leftX + 56, y + 22);
    ctx.restore();
  }

  // 7. Right Column: Rank, Points, Leaderboard Pos, Best Roll, Clan
  const rightX = 485;
  const rightRows = [
    { icon: targetUserData.rank || '🏅', text: `${(targetUserData.points || 0).toLocaleString()} Pts` },
    { icon: '🏆', text: `${leaderboardPos} Rank` },
    { icon: '🌐', text: `Joined ${joinedDateStr}` },
    { icon: targetUserData.bestChibi || '🌟', text: `Best: ${targetUserData.bestRoll || 'None'}` },
    { icon: '🏛️', text: targetUserData.clan ? String(targetUserData.clan).replace(/\*/g, '') : 'No Clan' }
  ];

  for (let i = 0; i < rightRows.length; i++) {
    const y = statsStartY + i * rowGap;
    await drawIconSpec(ctx, parseEmojiSpec(rightRows[i].icon), rightX, y, 40, palette);
    ctx.save();
    ctx.font = `600 24px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = rightRows[i].text;
    ctx.fillText(label.length > 26 ? `${label.slice(0, 25)}…` : label, rightX + 54, y + 21);
    ctx.restore();
  }

  // 8. Bottom Rarity Counts Grid
  const raritiesOrder = ['SSRP', 'UTR', 'SRR', 'SR', 'R', 'U', 'C'];
  const gridStartY = 815;
  const colWidth = (width - 172) / 4;

  for (let i = 0; i < raritiesOrder.length; i++) {
    const rKey = raritiesOrder[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 86 + col * colWidth;
    const y = gridStartY + row * 92;

    const rIconRaw = rarityIconsMap[rKey] || rKey;
    await drawIconSpec(ctx, parseEmojiSpec(rIconRaw), x, y, 36, palette);

    ctx.save();
    ctx.font = `700 24px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${rKey}: ${rarityCounts[rKey] || 0}`, x + 46, y + 19);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  THEME_PALETTES,
  hasSupporterOrNitro
};