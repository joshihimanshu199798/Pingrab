import { ArrowUpRight, Flame, Sparkles } from 'lucide-react';

export interface TrendingTrendItem {
  id: string;
  title: string;
  tagline: string;
  query: string;
  badge: string;
  gradient: string;
  imageUrl: string;
}

export const FEATURED_TODAY_TRENDS: TrendingTrendItem[] = [
  {
    id: 'trend-1',
    title: 'Minimalist Soft Gradients',
    tagline: 'Airy peach, taupe & lavender seamless mesh blends',
    query: 'Minimalist Soft Gradient iPhone Wallpaper',
    badge: 'Trending #1',
    gradient: 'from-amber-500/80 via-rose-500/85 to-indigo-600/90',
    imageUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'trend-2',
    title: 'Biophilic Bambicore Forest',
    tagline: 'Mist-covered pine macro details & woodland light',
    query: 'Biophilic Mist Forest Phone Wallpaper 4K',
    badge: 'Organic 4K',
    gradient: 'from-emerald-700 via-teal-800 to-slate-900',
    imageUrl: 'https://images.unsplash.com/photo-1542224566-6e85f2e6772f?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'trend-3',
    title: 'AI Surreal Dreamscapes',
    tagline: 'Floating glass architecture & chromatic neon skies',
    query: 'Surreal Dreamscape Architecture Phone Wallpaper',
    badge: 'AI Surreal',
    gradient: 'from-indigo-600 via-purple-700 to-pink-600',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'trend-4',
    title: 'AMOLED Dark Noir',
    tagline: 'Pitch-black obsidian shadows & rainy glass reflections',
    query: 'AMOLED Dark Noir Rain Window Wallpaper',
    badge: 'Battery Saver',
    gradient: 'from-zinc-950 via-neutral-900 to-red-950',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'trend-5',
    title: 'Retro Y2K Cyber-Grid',
    tagline: 'Glossy metallic chrome typography & vaporwave sunsets',
    query: 'Retro Y2K Cyberpunk Grid Wallpaper 4K',
    badge: 'Outrun 80s',
    gradient: 'from-fuchsia-600 via-purple-800 to-cyan-600',
    imageUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1000&auto=format&fit=crop',
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
      className="mx-auto max-w-[1440px] pt-4 pb-2"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E60023]/15 text-[#E60023] dark:text-[#FF4D67]">
            <Flame className="h-4 w-4 fill-current" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-sm font-bold tracking-tight text-[#111827] dark:text-[#F3F4F6] sm:text-base">
              Featured Today &amp; Google Trends
            </h2>
            <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
              Live 4K mobile aesthetics dominating high-end screen setups today
            </p>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
          <Sparkles className="h-3.5 w-3.5 text-[#E60023]" aria-hidden="true" />
          <span>Updated Daily via AI &amp; Web Trends</span>
        </div>
      </div>

      {/* Horizontal Scrollable Trend Cards with padding-inline 16px and scroll-snap */}
      <div
        className="flex items-center gap-3 overflow-x-auto pb-3 scrollbar-none no-scrollbar [-webkit-overflow-scrolling:touch]"
        style={{
          paddingInline: 'max(1rem, env(safe-area-inset-left))',
          scrollPaddingInline: 'max(1rem, env(safe-area-inset-left))',
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
              className={`group relative flex h-36 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                isActive
                  ? 'border-[#E60023] ring-2 ring-[#E60023]/75'
                  : 'border-white/15 hover:border-white/30'
              }`}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url(${trend.imageUrl})` }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 z-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20"
              />

              <div className="relative z-10 flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/55 px-2 py-0.5 font-mono text-[10px] font-semibold text-white/95 backdrop-blur-md">
                  <Sparkles className="h-2.5 w-2.5 text-[#FF4D67]" aria-hidden="true" />
                  <span>{trend.badge}</span>
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/50 text-white transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-[#E60023]">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="relative z-10">
                <h3 className="font-display text-sm font-bold leading-tight text-white drop-shadow">
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
