import { ArrowUpRight, Flame } from 'lucide-react';

export interface TrendingTrendItem {
  id: string;
  title: string;
  tagline: string;
  query: string;
  badge: string;
  badgeType: 'trending' | 'organic';
  gradient: string;
  imageUrl: string;
}

export const FEATURED_TODAY_TRENDS: TrendingTrendItem[] = [
  {
    id: 'trend-1',
    title: 'Obsidian & Crimson Silk',
    tagline: 'Pitch-black OLED waves with deep satin highlights',
    query: 'AMOLED Dark Phone Wallpaper 4K',
    badge: 'Trending #1',
    badgeType: 'trending',
    gradient: 'from-[#090A0D] via-[#1F0910] to-[#3B0A18]',
    imageUrl: '/src/assets/images/pin_aesthetic_wallpaper_1794872455350.jpg',
  },
  {
    id: 'trend-2',
    title: 'Nordic Misty Pines',
    tagline: 'Atmospheric woodland fog & dramatic alpine peaks',
    query: 'Moody Nature Vertical Phone Wallpaper',
    badge: 'Organic 4K',
    badgeType: 'organic',
    gradient: 'from-[#090A0D] via-[#062C22] to-[#111827]',
    imageUrl: '/src/assets/images/cat_nordic_nature_1794931006497.jpg',
  },
  {
    id: 'trend-3',
    title: '3D Dichroic Liquid Glass',
    tagline: 'Refractive obsidian glass with neon caustics',
    query: '3D Liquid Glass iPhone Wallpaper 4K',
    badge: 'Trending',
    badgeType: 'trending',
    gradient: 'from-[#090A0D] via-[#1E1035] to-[#3B0764]',
    imageUrl: '/src/assets/images/cat_liquid_glass_1794931010010.jpg',
  },
  {
    id: 'trend-4',
    title: 'Twilight Anime Horizon',
    tagline: 'Golden hour cumulus clouds & tranquil dusk skies',
    query: 'Anime Aesthetic Phone Wallpaper HD',
    badge: 'Trending',
    badgeType: 'trending',
    gradient: 'from-[#090A0D] via-[#0F172A] to-[#1E3A8A]',
    imageUrl: '/src/assets/images/cat_anime_scenic_1794931011142.jpg',
  },
  {
    id: 'trend-5',
    title: 'Midnight GT3 Supercar',
    tagline: 'Matte black bodywork & wet asphalt tail light glow',
    query: 'Supercar Vertical Phone Wallpaper 4K',
    badge: 'Organic 4K',
    badgeType: 'organic',
    gradient: 'from-[#090A0D] via-[#18181B] to-[#3F0D16]',
    imageUrl: '/src/assets/images/cat_supercar_night_1794931007662.jpg',
  },
  {
    id: 'trend-6',
    title: 'Deep Cosmos Nebula',
    tagline: 'Ringed exoplanets & starfield against pure black',
    query: 'Deep Space Galaxy Phone Wallpaper 4K',
    badge: 'Organic 4K',
    badgeType: 'organic',
    gradient: 'from-[#090A0D] via-[#17153B] to-[#1E1B4B]',
    imageUrl: '/src/assets/images/cat_deep_space_1794931008238.jpg',
  },
];

interface FeaturedTodaySectionProps {
  activeQuery: string;
  onSelectTrendQuery: (query: string) => void;
}

export function FeaturedTodaySection({
  activeQuery,
  onSelectTrendQuery,
}: FeaturedTodaySectionProps) {
  return (
    <section
      aria-label="Featured Today Trending Wallpapers"
      className="mx-auto w-full max-w-[1440px] pt-3 pb-1 overflow-hidden"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[#D91B42]/15 text-[#D91B42]">
            <Flame className="h-4 w-4 fill-current" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-lg truncate">
              Featured Today
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8] truncate">
              Curated 4K wallpapers trending on mobile screens today
            </p>
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Trend Cards */}
      <div
        className="flex w-full max-w-full items-center gap-3 overflow-x-auto pb-2 no-scrollbar [-webkit-overflow-scrolling:touch] px-3 sm:px-6 lg:px-8"
        style={{
          scrollPaddingInline: '0.75rem',
          scrollSnapType: 'x mandatory',
        }}
      >
        {FEATURED_TODAY_TRENDS.map((trend) => {
          const isActive = activeQuery.toLowerCase() === trend.query.toLowerCase();

          return (
            <button
              key={trend.id}
              type="button"
              onClick={() => onSelectTrendQuery(trend.query)}
              style={{ scrollSnapAlign: 'start' }}
              className={`group relative flex h-[144px] w-[248px] sm:h-[156px] sm:w-[276px] shrink-0 flex-col justify-between overflow-hidden rounded-[18px] border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] bg-gradient-to-br ${trend.gradient} ${
                isActive
                  ? 'border-[#D91B42] ring-2 ring-[#D91B42]/70 shadow-[0_8px_24px_rgba(242,10,58,0.25)]'
                  : 'border-white/10 hover:border-white/25'
              }`}
            >
              <img
                src={trend.imageUrl}
                alt={trend.title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-[#090A0D]/95 via-[#090A0D]/45 to-black/20"
              />

              <div className="relative z-10 flex w-full items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-[10px] font-semibold backdrop-blur-md ${
                    trend.badgeType === 'trending'
                      ? 'border-[#D91B42]/40 bg-[#D91B42]/85 text-white'
                      : 'border-emerald-400/35 bg-black/60 text-emerald-300'
                  }`}
                >
                  <span>{trend.badge}</span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white backdrop-blur-md transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:border-[#D91B42] group-hover:bg-[#D91B42]">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="relative z-10 min-w-0">
                <h3 className="font-display text-sm sm:text-base font-bold leading-snug text-white drop-shadow truncate">
                  {trend.title}
                </h3>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/80 drop-shadow">
                  {trend.tagline}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
