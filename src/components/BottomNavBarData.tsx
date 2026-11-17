export interface WallpaperCategoryPack {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  badge: string;
  gradient: string;
  accentColor: string;
}

export const WALLPAPER_CATEGORY_PACKS: WallpaperCategoryPack[] = [
  {
    id: 'amoled-dark',
    title: 'AMOLED Pitch Black',
    subtitle: 'True #000000 OLED battery-saving contrast art',
    query: 'AMOLED Dark Phone Wallpaper 4K',
    badge: '4K OLED',
    gradient: 'from-zinc-950 via-neutral-900 to-rose-950/80',
    accentColor: '#E60023',
  },
  {
    id: 'cyberpunk-neon',
    title: 'Cyberpunk & Neon',
    subtitle: 'Futuristic night cities, rain reflections & synth glow',
    query: 'Cyberpunk Neon Phone Wallpaper 4K',
    badge: '9:16 HD',
    gradient: 'from-fuchsia-950 via-indigo-950 to-cyan-900',
    accentColor: '#06B6D4',
  },
  {
    id: 'liquid-glass',
    title: '3D Liquid & Glass',
    subtitle: 'Iridescent abstract waves, chrome & frosted renders',
    query: '3D Liquid Glass iPhone Wallpaper 4K',
    badge: '3D Render',
    gradient: 'from-indigo-950 via-purple-900 to-pink-900',
    accentColor: '#A855F7',
  },
  {
    id: 'minimal-abstract',
    title: 'Minimalist Geometry',
    subtitle: 'Clean architectural lines, Bauhaus shapes & calm tones',
    query: 'Minimalist Abstract Phone Wallpaper',
    badge: 'Clean UI',
    gradient: 'from-slate-900 via-stone-900 to-amber-950',
    accentColor: '#F59E0B',
  },
  {
    id: 'anime-lockscreen',
    title: 'Anime & Manga Art',
    subtitle: 'Vibrant scenic skies, Makoto Shinkai vibes & characters',
    query: 'Anime Aesthetic Phone Wallpaper HD',
    badge: 'Trending',
    gradient: 'from-sky-950 via-blue-900 to-indigo-950',
    accentColor: '#3B82F6',
  },
  {
    id: 'moody-nature',
    title: 'Moody Nordic Nature',
    subtitle: 'Misty pine forests, alpine peaks & dramatic storms',
    query: 'Moody Nature Vertical Phone Wallpaper',
    badge: 'Earth 4K',
    gradient: 'from-emerald-950 via-teal-950 to-slate-900',
    accentColor: '#10B981',
  },
  {
    id: 'supercars-916',
    title: 'Supercars & JDM',
    subtitle: 'Porsche, GT3 RS, cockpit night shots & carbon detail',
    query: 'Supercar Vertical Phone Wallpaper 4K',
    badge: 'Automotive',
    gradient: 'from-red-950 via-zinc-900 to-neutral-950',
    accentColor: '#EF4444',
  },
  {
    id: 'retro-synthwave',
    title: 'Retro Outrun 80s',
    subtitle: 'Sunset wireframe grids, neon palms & analog VHS',
    query: 'Retro Synthwave Phone Wallpaper',
    badge: 'Vaporwave',
    gradient: 'from-purple-950 via-fuchsia-900 to-orange-900',
    accentColor: '#EC4899',
  },
  {
    id: 'deep-space',
    title: 'Cosmos & Nebulas',
    subtitle: 'James Webb deep field galaxies, planets & astronauts',
    query: 'Deep Space Galaxy Phone Wallpaper 4K',
    badge: 'Astro 4K',
    gradient: 'from-slate-950 via-violet-950 to-blue-950',
    accentColor: '#8B5CF6',
  },
  {
    id: 'dark-architecture',
    title: 'Brutalist Architecture',
    subtitle: 'Monolithic concrete, dramatic shadows & urban symmetry',
    query: 'Dark Architecture Vertical Wallpaper',
    badge: 'Editorial',
    gradient: 'from-neutral-950 via-stone-900 to-zinc-800',
    accentColor: '#9CA3AF',
  },
  {
    id: 'motivation-quotes',
    title: 'Lockscreen Typography',
    subtitle: 'Minimalist stoic reminders, focus quotes & bold type',
    query: 'Motivational Quote Lockscreen Wallpaper',
    badge: 'Mindset',
    gradient: 'from-zinc-950 via-neutral-900 to-stone-900',
    accentColor: '#F3F4F6',
  },
  {
    id: 'pastel-gradient',
    title: 'Soft Aura Gradients',
    subtitle: 'Smooth mesh blurs for high-legibility homescreen icons',
    query: 'Aura Gradient Minimal iPhone Wallpaper',
    badge: 'Homescreen',
    gradient: 'from-rose-900 via-amber-900 to-teal-900',
    accentColor: '#F43F5E',
  },
];
