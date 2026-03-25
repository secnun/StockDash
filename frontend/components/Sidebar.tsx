'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, NavItem, isActiveRoute } from '@/lib/navigation';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

export default function Sidebar({ open, onToggle }: SidebarProps) {
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
            <span className="text-sm font-medium whitespace-nowrap flex-1 text-left">
              {item.label}
            </span>
            <svg
              className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {isOpen && (
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
        <span className="text-sm font-medium whitespace-nowrap">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 h-screen z-40 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 w-55 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Branding + Close */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="flex items-center gap-3">
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
          <span className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
            StockDash
          </span>
        </Link>

        <button
          onClick={onToggle}
          aria-label="사이드바 닫기"
          className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
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
