'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, NavItem, isActiveRoute } from '@/lib/navigation';

interface SidebarProps {
  pinned: boolean;
  onTogglePin: () => void;
  expanded: boolean;
  onHoverChange: (hovered: boolean) => void;
}

export default function Sidebar({ pinned, onTogglePin, expanded, onHoverChange }: SidebarProps) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // Auto-expand parent sections when a child route is active
  useEffect(() => {
    const newOpen: Record<string, boolean> = {};
    NAV_ITEMS.forEach((item) => {
      if (item.children && isActiveRoute(pathname, item)) {
        newOpen[item.label] = true;
      }
    });
    setOpenSections((prev) => ({ ...prev, ...newOpen }));
  }, [pathname]);

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActiveRoute(pathname, item);
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openSections[item.label];

    if (hasChildren) {
      return (
        <div key={item.label}>
          {/* Parent button */}
          <button
            onClick={() => toggleSection(item.label)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              active
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg
              className="w-6 h-6 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
            <span
              className={`text-sm font-medium whitespace-nowrap transition-opacity duration-200 flex-1 text-left ${
                expanded ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {item.label}
            </span>
            {/* Chevron */}
            <svg
              className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${
                expanded ? 'opacity-100' : 'opacity-0'
              } ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Children */}
          {isOpen && expanded && (
            <div className="mt-0.5 space-y-0.5">
              {item.children!.map((child) => {
                const matches = child.href ? pathname === child.href || pathname.startsWith(child.href + '/') : false;
                const hasBetterSibling = matches && item.children!.some(
                  (sib) => sib !== child && sib.href && sib.href.length > (child.href?.length ?? 0) && (pathname === sib.href || pathname.startsWith(sib.href + '/'))
                );
                const childActive = matches && !hasBetterSibling;
                return (
                  <Link
                    key={child.label}
                    href={child.href || '#'}
                    className={`flex items-center pl-9 pr-3 py-2 rounded-lg transition-colors ${
                      childActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-sm whitespace-nowrap">{child.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Leaf item (no children)
    return (
      <Link
        key={item.label}
        href={item.href || '#'}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          active
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        <svg
          className="w-6 h-6 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
        </svg>
        <span
          className={`text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <aside
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className={`hidden md:flex fixed left-0 top-0 h-screen z-40 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 ${
        expanded ? 'w-55' : 'w-16'
      }`}
    >
      {/* Branding + Pin */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <svg
            className="w-8 h-8 flex-shrink-0 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <span
            className={`text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap transition-opacity duration-200 ${
              expanded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            StockDash
          </span>
        </Link>

        {/* Pin toggle */}
        <button
          onClick={onTogglePin}
          aria-label={pinned ? '사이드바 고정 해제' : '사이드바 고정'}
          className={`p-1.5 rounded-md transition-all duration-200 ${
            expanded
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          } ${
            pinned
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${pinned ? 'rotate-0' : 'rotate-45'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 4h6v6l2 4H7l2-4V4z" fill={pinned ? 'currentColor' : 'none'} />
            <line x1="12" y1="14" x2="12" y2="21" />
            <line x1="8" y1="4" x2="16" y2="4" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(renderNavItem)}
      </nav>
    </aside>
  );
}
