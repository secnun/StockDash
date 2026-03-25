'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      <MobileNav />
      <main
        className={`${open ? 'md:ml-55' : 'md:ml-0'} min-h-screen pb-14 md:pb-0 transition-[margin] duration-200`}
      >
        <TopBar sidebarOpen={open} onToggleSidebar={() => setOpen((o) => !o)} />
        {children}
      </main>
    </>
  );
}
