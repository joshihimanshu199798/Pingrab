import { Compass, Heart, LayoutGrid } from 'lucide-react';
import { AppTab } from '../types/pin';
import { WALLPAPER_CATEGORY_PACKS } from './BottomNavBarData';

export interface WallpaperCategoryPack {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  badge: string;
  gradient: string;
  accentColor: string;
}

interface BottomNavBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  favoritesCount: number;
}

export function BottomNavBar({
  activeTab,
  onSelectTab,
  favoritesCount,
}: BottomNavBarProps) {
  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: typeof Compass;
    badge?: number | string;
  }> = [
    {
      id: 'explore',
      label: 'Explore',
      icon: Compass,
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: LayoutGrid,
      badge: WALLPAPER_CATEGORY_PACKS.length,
    },
    {
      id: 'favorites',
      label: 'Saved Vault',
      icon: Heart,
      badge: favoritesCount > 0 ? favoritesCount : undefined,
    },
  ];

  return (
    <nav
      aria-label="Wallpaper app bottom navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB]/90 bg-white/92 px-3 py-2 backdrop-blur-xl dark:border-[#1E222B] dark:bg-[#0B0D10]/92"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                isActive
                  ? 'bg-[#E60023]/12 text-[#E60023] dark:bg-[#E60023]/20 dark:text-[#FF4D67]'
                  : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:bg-[#14171D] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`h-5 w-5 transition-transform duration-150 group-hover:scale-105 ${
                    item.id === 'favorites' && isActive ? 'fill-current' : ''
                  }`}
                  aria-hidden="true"
                />
                {item.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-3.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-0.2 font-mono text-[9px] font-bold leading-tight tabular-nums ${
                      isActive
                        ? 'bg-[#E60023] text-white'
                        : 'bg-[#E5E7EB] text-[#374151] dark:bg-[#1E222B] dark:text-[#D1D5DB]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold tracking-tight">{item.label}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-0.5 w-6 rounded-full bg-[#E60023] dark:bg-[#FF4D67]"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
