import React from "react";

export function LanceLogo({ size = 30 }) {
  const u = `lg${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2979ff"/>
          <stop offset="100%" stopColor="#0d47a1"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#82b1ff"/>
          <stop offset="100%" stopColor="#2979ff"/>
        </linearGradient>
      </defs>
      <path d="M18 2L4 7.5V18C4 25.5 10.5 31.5 18 34C25.5 31.5 32 25.5 32 18V7.5L18 2Z" fill={`url(#${u}a)`}/>
      <path d="M18 5L7 9.8V18C7 24 12 29.2 18 31.5C24 29.2 29 24 29 18V9.8L18 5Z" fill={`url(#${u}b)`} opacity="0.22"/>
      <line x1="24" y1="9" x2="10" y2="27" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <polygon points="24,9 21,10.5 22.5,13" fill="white" opacity="0.95"/>
      <line x1="13" y1="22" x2="19" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor"/>
    </svg>
  );
}

export function SpeakerIcon({ active, spinning }) {
  if (spinning) return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 7.5 7.5" to="360 7.5 7.5" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
  if (active) return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="2" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.6">
        <animate attributeName="height" values="5;9;5" dur="0.8s" repeatCount="indefinite"/>
        <animate attributeName="y" values="5;3;5" dur="0.8s" repeatCount="indefinite"/>
      </rect>
      <rect x="6" y="3" width="2" height="9" rx="1" fill="currentColor">
        <animate attributeName="height" values="9;4;9" dur="0.7s" repeatCount="indefinite"/>
        <animate attributeName="y" values="3;5.5;3" dur="0.7s" repeatCount="indefinite"/>
      </rect>
      <rect x="10" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.6">
        <animate attributeName="height" values="5;8;5" dur="0.9s" repeatCount="indefinite"/>
        <animate attributeName="y" values="5;3.5;5" dur="0.9s" repeatCount="indefinite"/>
      </rect>
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 5h2.5L8 2v11L4.5 10H2a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
      <path d="M10 4.5a4 4 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 2.5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="currentColor"/>
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v7M3.5 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 11h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function AttachIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M12.5 7.5l-5.5 5.5a4 4 0 01-5.5-5.5l6-6a2.5 2.5 0 013.5 3.5L5 11a1 1 0 01-1.5-1.5L9 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
