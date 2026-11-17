import { PinItem } from '../types/pin';

const LOCAL_STUDIO_ASSETS: Array<{
  keywords: string[];
  pin: Omit<PinItem, 'id'>;
}> = [
  {
    keywords: ['workspace', 'desk', 'minimalist', 'office', 'setup', 'productivity', 'architecture'],
    pin: {
      title: 'Minimalist Dark Walnut Studio Desk & Concrete Wall',
      imageUrl: '/src/assets/images/pin_minimalist_workspace_1794872454569.jpg',
      fallbackUrl: '/src/assets/images/pin_minimalist_workspace_1794872454569.jpg',
      width: 1200,
      height: 1600,
      dominantColor: '#2A2520',
      sourceUrl: 'https://www.pinterest.com/search/pins/?q=minimalist%20workspace',
    },
  },
  {
    keywords: ['wallpaper', 'aesthetic', 'abstract', 'phone', 'lockscreen', 'crimson', 'satin', 'dark'],
    pin: {
      title: 'Obsidian & Deep Crimson Satin Wave Mobile Wallpaper',
      imageUrl: '/src/assets/images/pin_aesthetic_wallpaper_1794872455350.jpg',
      fallbackUrl: '/src/assets/images/pin_aesthetic_wallpaper_1794872455350.jpg',
      width: 1080,
      height: 1920,
      dominantColor: '#241418',
      sourceUrl: 'https://www.pinterest.com/search/pins/?q=aesthetic%20wallpapers',
    },
  },
  {
    keywords: ['home', 'decor', 'interior', 'living', 'room', 'chair', 'travertine', 'minimalist'],
    pin: {
      title: 'Travertine Side Table & Bouclé Lounge Interior Study',
      imageUrl: '/src/assets/images/pin_home_decor_1794872455701.jpg',
      fallbackUrl: '/src/assets/images/pin_home_decor_1794872455701.jpg',
      width: 1200,
      height: 1600,
      dominantColor: '#8B8175',
      sourceUrl: 'https://www.pinterest.com/search/pins/?q=home%20decor',
    },
  },
  {
    keywords: ['ui', 'dark', 'mode', 'dashboard', 'interface', 'design', 'app', 'tablet'],
    pin: {
      title: 'Monochrome Slate Dark Mode Dashboard Interface',
      imageUrl: '/src/assets/images/pin_dark_ui_showcase_1794872456307.jpg',
      fallbackUrl: '/src/assets/images/pin_dark_ui_showcase_1794872456307.jpg',
      width: 1600,
      height: 1200,
      dominantColor: '#1B1E24',
      sourceUrl: 'https://www.pinterest.com/search/pins/?q=dark%20mode%20UI',
    },
  },
  {
    keywords: ['botanical', 'decor', 'minimalist', 'home', 'still', 'nature', 'art', 'poster'],
    pin: {
      title: 'Smoked Glass Olive Branch Botanical Still Life',
      imageUrl: '/src/assets/images/pin_botanical_print_1794872456970.jpg',
      fallbackUrl: '/src/assets/images/pin_botanical_print_1794872456970.jpg',
      width: 1200,
      height: 1200,
      dominantColor: '#1E2320',
      sourceUrl: 'https://www.pinterest.com/search/pins/?q=botanical%20minimal%20decor',
    },
  },
];

const MOTIVATION_QUOTES: Array<{ quote: string; author: string; tag: string }> = [
  {
    quote: 'Discipline is choosing between what you want now and what you want most.',
    author: 'Abraham Lincoln',
    tag: 'Daily Focus',
  },
  {
    quote: 'Simplicity is about subtracting the obvious and adding the meaningful.',
    author: 'John Maeda',
    tag: 'Design Craft',
  },
  {
    quote: 'Do the work quietly. Let the finished craft make the noise.',
    author: 'Studio Manifesto',
    tag: 'Consistency',
  },
  {
    quote: 'Small daily improvements over time lead to stunning long-term results.',
    author: 'Robin Sharma',
    tag: 'Compounding',
  },
  {
    quote: 'Amateurs sit and wait for inspiration. The rest of us get up and go to work.',
    author: 'Stephen King',
    tag: 'Momentum',
  },
  {
    quote: 'Clarity precedes mastery. Focus on one essential thing before the rest.',
    author: 'Cal Newport',
    tag: 'Deep Work',
  },
  {
    quote: 'What you do every day matters infinitely more than what you do once in a while.',
    author: 'Gretchen Rubin',
    tag: 'Habits',
  },
  {
    quote: 'Stay patient, stay consistent, and never negotiate with your own standards.',
    author: 'Atelier Notes',
    tag: 'Standards',
  },
];

interface Palette {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  accent: string;
}

const EDITORIAL_PALETTES: Palette[] = [
  { bg: '#0E1116', surface: '#181D26', fg: '#F3F4F6', muted: '#9CA3AF', accent: '#E60023' },
  { bg: '#F4F1EA', surface: '#EAE4D7', fg: '#161616', muted: '#5C574E', accent: '#E60023' },
  { bg: '#15181E', surface: '#20252E', fg: '#F8FAFC', muted: '#94A3B8', accent: '#D97706' },
  { bg: '#111615', surface: '#1B2421', fg: '#ECFDF5', muted: '#9CA3AF', accent: '#10B981' },
  { bg: '#1A1416', surface: '#281D21', fg: '#FDF2F4', muted: '#C4A7AF', accent: '#E60023' },
  { bg: '#FAFAFA', surface: '#EFEFEF', fg: '#111827', muted: '#6B7280', accent: '#111827' },
  { bg: '#12151C', surface: '#1D222D', fg: '#E5E7EB', muted: '#9CA3AF', accent: '#3B82F6' },
  { bg: '#1E1B18', surface: '#2B2622', fg: '#F5F0E8', muted: '#A89F91', accent: '#E07A5F' },
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function addSubtleGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: () => number,
  alpha = 0.035
) {
  ctx.save();
  for (let i = 0; i < 1600; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const size = 1 + rng() * 2;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

type ThemeKind = 'quotes' | 'ui' | 'puzzle' | 'wallpaper' | 'typography' | 'editorial';

function detectTheme(query: string): ThemeKind {
  const q = query.toLowerCase();
  if (/(quote|motivation|affirmation|mindset|wisdom|stoic|poem)/.test(q)) return 'quotes';
  if (/(ui|ux|dark mode|dashboard|interface|app|wireframe|saas|figma)/.test(q)) return 'ui';
  if (/(puzzle|maze|kids|printable|worksheet|sudoku|activity|coloring)/.test(q)) return 'puzzle';
  if (/(wallpaper|gradient|lockscreen|background|abstract|neon|minimalist phone)/.test(q))
    return 'wallpaper';
  if (/(typography|poster|swiss|bauhaus|font|typeface|graphic)/.test(q)) return 'typography';
  return 'editorial';
}

function renderQuotePoster(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  palette: Palette,
  index: number,
  rng: () => number
): string {
  const ctx = canvas.getContext('2d')!;
  const item = MOTIVATION_QUOTES[index % MOTIVATION_QUOTES.length];

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid frame
  const pad = Math.round(width * 0.09);
  ctx.strokeStyle = palette.muted + '33';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  // Top index line
  ctx.fillStyle = palette.accent;
  ctx.fillRect(pad + 42, pad + 54, 48, 5);

  ctx.fillStyle = palette.muted;
  ctx.font = `600 ${Math.round(width * 0.025)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(item.tag.toUpperCase(), pad + 42, pad + 102);

  // Quote body
  const fontSize = Math.round(width * (width > height ? 0.048 : 0.064));
  ctx.fillStyle = palette.fg;
  ctx.font = `700 ${fontSize}px "Outfit", "Plus Jakarta Sans", sans-serif`;
  const lines = wrapLines(ctx, `“${item.quote}”`, width - pad * 2 - 84);
  const lineHeight = fontSize * 1.24;
  const blockHeight = lines.length * lineHeight;
  let y = Math.round(height * 0.5 - blockHeight * 0.42);

  for (const line of lines) {
    ctx.fillText(line, pad + 42, y);
    y += lineHeight;
  }

  // Author attribution
  ctx.fillStyle = palette.muted;
  ctx.font = `500 ${Math.round(width * 0.028)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(`— ${item.author}`, pad + 42, height - pad - 54);

  addSubtleGrain(ctx, width, height, rng);
  return `${item.tag}: ${item.quote.slice(0, 44)}…`;
}

function renderDarkUiCard(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  query: string,
  index: number,
  rng: () => number
): string {
  const ctx = canvas.getContext('2d')!;
  const accents = ['#E60023', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];
  const accent = accents[index % accents.length];

  ctx.fillStyle = '#090B0F';
  ctx.fillRect(0, 0, width, height);

  const pad = Math.round(width * 0.075);
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;

  // Outer application frame
  ctx.fillStyle = '#12161F';
  ctx.strokeStyle = '#232A38';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, cardW, cardH, 24);
  ctx.fill();
  ctx.stroke();

  // Top bar inside UI mockup
  ctx.fillStyle = '#191E29';
  ctx.beginPath();
  ctx.roundRect(pad + 28, pad + 28, cardW - 56, 68, 14);
  ctx.fill();

  // Accent indicator dot + title
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(pad + 60, pad + 62, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F3F4F6';
  ctx.font = `600 ${Math.round(width * 0.026)}px "Plus Jakarta Sans", sans-serif`;
  const uiTitles = [
    'Analytics Overview',
    'Command Center UI',
    'Design System Tokens',
    'Revenue Telemetry',
    'Mobile Workspace',
  ];
  const label = uiTitles[index % uiTitles.length];
  ctx.fillText(label, pad + 84, pad + 70);

  // Metric blocks
  const cols = 3;
  const gap = 20;
  const boxW = (cardW - 56 - gap * (cols - 1)) / cols;
  const boxY = pad + 124;
  const boxH = Math.round(cardH * 0.2);

  for (let c = 0; c < cols; c++) {
    const bx = pad + 28 + c * (boxW + gap);
    ctx.fillStyle = '#181D27';
    ctx.strokeStyle = '#262E3D';
    ctx.beginPath();
    ctx.roundRect(bx, boxY, boxW, boxH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9CA3AF';
    ctx.font = `500 ${Math.round(width * 0.018)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(['Active Users', 'Conversion', 'Throughput'][c], bx + 20, boxY + 42);

    ctx.fillStyle = '#F9FAFB';
    ctx.font = `700 ${Math.round(width * 0.036)}px "Outfit", sans-serif`;
    const vals = ['48.2K', '94.6%', '1.84s'];
    ctx.fillText(vals[(c + index) % 3], bx + 20, boxY + Math.min(boxH - 26, 98));
  }

  // Chart area
  const chartY = boxY + boxH + 28;
  const chartH = height - pad - 28 - chartY;
  ctx.fillStyle = '#151A23';
  ctx.strokeStyle = '#232A38';
  ctx.beginPath();
  ctx.roundRect(pad + 28, chartY, cardW - 56, chartH, 16);
  ctx.fill();
  ctx.stroke();

  // Bars & smooth trend curve
  const bars = 12;
  const barAreaW = cardW - 120;
  const barGap = 14;
  const singleBarW = (barAreaW - barGap * (bars - 1)) / bars;
  for (let b = 0; b < bars; b++) {
    const hRatio = 0.22 + rng() * 0.62;
    const bh = (chartH - 80) * hRatio;
    const bx = pad + 60 + b * (singleBarW + barGap);
    const by = chartY + chartH - 36 - bh;
    ctx.fillStyle = b === bars - 2 ? accent : '#2A3344';
    ctx.beginPath();
    ctx.roundRect(bx, by, singleBarW, bh, 6);
    ctx.fill();
  }

  return `${label} — ${query} UI Concept`;
}

function renderPrintablePuzzle(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  index: number,
  rng: () => number
): string {
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const pad = Math.round(width * 0.08);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  const puzzleTypes = [
    'Geometric Labyrinth Maze',
    'Number Logic Grid Sheet',
    'Pattern Matching Challenge',
    'Tangram Shape Study',
  ];
  const title = puzzleTypes[index % puzzleTypes.length];

  ctx.fillStyle = '#111827';
  ctx.font = `700 ${Math.round(width * 0.044)}px "Outfit", sans-serif`;
  ctx.fillText(title, pad + 36, pad + 82);

  ctx.fillStyle = '#6B7280';
  ctx.font = `500 ${Math.round(width * 0.022)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(`Printable Activity Sheet #${index + 1} · Find the clean path from Start to Finish`, pad + 36, pad + 124);

  // Draw crisp maze / grid
  const gridPad = pad + 42;
  const topY = pad + 170;
  const gridW = width - gridPad * 2;
  const gridH = height - topY - pad - 60;
  const cols = 12;
  const rows = Math.max(8, Math.round((gridH / gridW) * cols));
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  ctx.strokeStyle = '#1F2937';
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gridPad + c * cellW;
      const y = topY + r * cellH;
      if (r === 0 && c > 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellW, y);
        ctx.stroke();
      }
      if (c === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellH);
        ctx.stroke();
      }
      if (r === rows - 1 && c < cols - 1) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellH);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      }
      if (c === cols - 1) {
        ctx.beginPath();
        ctx.moveTo(x + cellW, y);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      }
      // Internal maze walls
      if (rng() > 0.45 && c < cols - 1) {
        ctx.beginPath();
        ctx.moveTo(x + cellW, y);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      } else if (r < rows - 1 && rng() > 0.35) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellH);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      }
    }
  }

  // Start / Finish markers
  ctx.fillStyle = '#E60023';
  ctx.font = `700 ${Math.round(width * 0.022)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText('START', gridPad, topY - 14);
  ctx.fillText('FINISH', gridPad + gridW - 84, topY + gridH + 34);

  return `${title} (High-Res Printable)`;
}

function renderWallpaperOrPoster(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  query: string,
  palette: Palette,
  theme: ThemeKind,
  index: number,
  rng: () => number
): string {
  const ctx = canvas.getContext('2d')!;

  // Rich atmospheric gradient background
  const grad = ctx.createLinearGradient(0, 0, width * 0.85, height);
  grad.addColorStop(0, palette.bg);
  grad.addColorStop(0.55, palette.surface);
  grad.addColorStop(1, palette.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Soft architectural radial glow
  const cx = width * (0.25 + rng() * 0.5);
  const cy = height * (0.25 + rng() * 0.5);
  const rad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(width, height) * 0.65);
  rad.addColorStop(0, palette.accent + '44');
  rad.addColorStop(0.5, palette.accent + '12');
  rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, width, height);

  // Geometric / Bauhaus / Architectural composition
  const motif = index % 3;
  ctx.save();
  if (motif === 0) {
    // Concentric Swiss arcs
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i === 1 ? palette.accent : palette.fg + '2A';
      ctx.lineWidth = i === 1 ? 6 : 2;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.52, width * (0.16 + i * 0.1), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (motif === 1) {
    // Architectural stepped monoliths
    for (let i = 0; i < 5; i++) {
      const mw = width * (0.65 - i * 0.09);
      const mh = height * (0.55 - i * 0.07);
      const mx = (width - mw) / 2;
      const my = (height - mh) / 2 + i * 18;
      ctx.fillStyle = i % 2 === 0 ? palette.surface + 'CC' : palette.bg + 'BB';
      ctx.strokeStyle = i === 4 ? palette.accent : palette.fg + '22';
      ctx.lineWidth = 2;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeRect(mx, my, mw, mh);
    }
  } else {
    // Diagonal modernist planes
    ctx.fillStyle = palette.accent + 'CC';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.38, width * 0.19, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.fg + '18';
    ctx.fillRect(width * 0.14, height * 0.54, width * 0.72, height * 0.24);
  }
  ctx.restore();

  if (theme === 'typography' || theme === 'editorial') {
    const words = query
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    const displayWord = words.slice(0, 2).join(' ') || 'Studio Study';

    const pad = Math.round(width * 0.085);
    ctx.fillStyle = palette.fg;
    ctx.font = `700 ${Math.round(width * 0.085)}px "Outfit", sans-serif`;
    const lines = wrapLines(ctx, displayWord, width - pad * 2);
    let y = height - pad - lines.length * Math.round(width * 0.095);
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += Math.round(width * 0.095);
    }

    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${Math.round(width * 0.024)}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `SERIES 0${(index % 9) + 1} · ${width}×${height} ARCHIVE`,
      pad,
      pad + 24
    );
  }

  addSubtleGrain(ctx, width, height, rng, 0.04);

  const cleanTopic = query
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const descriptors = [
    'Swiss Grid Composition',
    'Minimalist Geometric Study',
    'Atmospheric Texture Frame',
    'Monolith Light & Shadow',
    'Curated Editorial Edition',
    'High-Contrast Studio Print',
  ];
  return `${cleanTopic} — ${descriptors[index % descriptors.length]}`;
}

export function generatePreviewPins(query: string): PinItem[] {
  const cleanQuery = query.trim() || 'minimalist workspace';
  const theme = detectTheme(cleanQuery);
  const queryWords = cleanQuery.toLowerCase().split(/\s+/);
  const pins: PinItem[] = [];

  // Include matching locally generated high-res photographic assets first
  const matchingLocalAssets = LOCAL_STUDIO_ASSETS.filter((asset) =>
    queryWords.some((w) => asset.keywords.some((k) => k.includes(w) || w.includes(k)))
  );

  // Always include at least 1–2 relevant photography cards when query aligns, or for general editorial queries
  const assetsToInclude =
    matchingLocalAssets.length > 0
      ? matchingLocalAssets
      : theme === 'editorial'
      ? LOCAL_STUDIO_ASSETS.slice(0, 3)
      : [];

  assetsToInclude.forEach((asset, idx) => {
    pins.push({
      id: `local-${hashString(cleanQuery + idx)}`,
      ...asset.pin,
      isHdOriginal: true,
    });
  });

  // Render crisp high-resolution Canvas artworks up to 16 total pins
  const dimensions: Array<[number, number]> = [
    [1080, 1620], // 2:3 Portrait Pin
    [1200, 1500], // 4:5 Portrait
    [1080, 1920], // 9:16 Wallpaper
    [1200, 1200], // 1:1 Square
    [1600, 1066], // 3:2 Landscape
    [1080, 1620], // 2:3 Portrait Pin
    [1200, 1600], // 3:4 Portrait Pin
    [1200, 1200], // 1:1 Square
    [1080, 1620], // 2:3 Portrait Pin
    [1600, 1200], // 4:3 Landscape
    [1080, 1920], // 9:16 Wallpaper
    [1200, 1500], // 4:5 Portrait
    [900, 1350],  // 2:3 Standard
    [1080, 1080], // 1:1 Square
    [800, 1200],  // 2:3 Standard
    [1440, 960],  // 3:2 Landscape
  ];

  const needed = Math.max(12, 16 - pins.length);
  const baseSeed = hashString(cleanQuery);

  for (let i = 0; i < needed; i++) {
    const [w, h] = dimensions[i % dimensions.length];
    const palette = EDITORIAL_PALETTES[(baseSeed + i) % EDITORIAL_PALETTES.length];
    const rng = createRng(baseSeed + i * 7919);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    let title = cleanQuery;
    if (theme === 'quotes') {
      title = renderQuotePoster(canvas, w, h, palette, i, rng);
    } else if (theme === 'ui') {
      title = renderDarkUiCard(canvas, w, h, cleanQuery, i, rng);
    } else if (theme === 'puzzle') {
      title = renderPrintablePuzzle(canvas, w, h, i, rng);
    } else {
      title = renderWallpaperOrPoster(canvas, w, h, cleanQuery, palette, theme, i, rng);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    pins.push({
      id: `preview-${baseSeed}-${i}`,
      title,
      imageUrl: dataUrl,
      fallbackUrl: dataUrl,
      width: w,
      height: h,
      dominantColor: theme === 'puzzle' ? '#F3F4F6' : palette.bg,
      sourceUrl: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(cleanQuery)}`,
      isHdOriginal: w >= 1080 || h >= 1080,
    });
  }

  return pins;
}
