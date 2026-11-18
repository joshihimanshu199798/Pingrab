import { Compass, FolderHeart, LayoutGrid, Sliders } from 'lucide-react';
import { AppTab } from '../types/pin';
export type { PackDeviceOrientation, WallpaperCategoryPack } from './BottomNavBarData';

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
      label: 'Discover',
      icon: Compass,
    },
    {
      id: 'categories',
      label: 'Wallpapers',
      icon: LayoutGrid,
    },
    {
      id: 'studio',
      label: 'Studio',
      icon: Sliders,
    },
    {
      id: 'favorites',
      label: 'Library',
      icon: FolderHeart,
      badge: favoritesCount > 0 ? favoritesCount : undefined,
    },
  ];

  return (
    <nav
      aria-label="PinGrab primary bottom navigation"
      className="fixed inset-x-0 bottom-0 z-30 w-full border-t border-slate-200/80 bg-white/95 px-2 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#101010]/95"
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-4 gap-1.5 sm:gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] ${
                isActive
                  ? 'bg-[#D91B42] text-white shadow-[0_6px_18px_rgba(255,49,90,0.38)]'
                  : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:bg-[#171717] dark:hover:text-white'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className="h-4.5 w-4.5 transition-transform duration-150 group-hover:scale-105"
                  aria-hidden="true"
                />
                {item.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-3.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 py-0.5 font-mono text-[8px] font-bold leading-none tabular-nums ${
                      isActive
                        ? 'bg-white text-[#D91B42] shadow-xs'
                        : 'bg-[#E5E7EB] text-[#374151] dark:bg-[#171717] dark:text-[#D1D5DB] dark:border dark:border-white/10'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="truncate text-[10px] sm:text-[11px] font-semibold tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
