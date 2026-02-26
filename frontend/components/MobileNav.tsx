'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isActiveRoute } from '@/lib/navigation';

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(pathname, item);
        // Parent with children: link to first child
        const href = item.children ? item.children[0]?.href || '#' : item.href || '#';
        return (
          <Link
            key={item.label}
            href={href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 ${
              active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={item.iconPath}
              />
            </svg>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
