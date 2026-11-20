import React from 'react';

interface TopNavProps {
  onFocusPairing: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onFocusPairing }) => {
  return (
    <header className="border-b border-[#D6D6CE] bg-[#F7F7F4]">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4">
        <a
          href="/"
          className="font-display text-xl font-bold tracking-tight text-[#111214] whitespace-nowrap shrink-0"
        >
          KepokDesk
        </a>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-[#4B5058]"
        >
          <a
            href="#pairing-console"
            className="hover:text-[#111214] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Pairing
          </a>
          <a
            href="#architecture"
            className="hover:text-[#111214] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Architecture
          </a>
          <a
            href="#cryptography"
            className="hover:text-[#111214] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Cryptography
          </a>
          <a
            href="#execution"
            className="hover:text-[#111214] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Execution
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onFocusPairing}
            className="rounded-[2px] bg-[#D9381E] px-4 py-2 text-sm font-medium text-white hover:bg-[#B82D16] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111214] whitespace-nowrap shrink-0"
          >
            Start Session
          </button>
        </div>
      </div>
    </header>
  );
};
