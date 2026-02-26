'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  return (
    <>
      <Sidebar pinned={pinned} onTogglePin={() => setPinned((p) => !p)} expanded={expanded} onHoverChange={setHovered} />
      <MobileNav />
      <main
        className={`${expanded ? 'md:ml-55' : 'md:ml-16'} min-h-screen pb-14 md:pb-0 transition-[margin] duration-200`}
      >
        <TopBar />
        {children}
      </main>
    </>
  );
}
