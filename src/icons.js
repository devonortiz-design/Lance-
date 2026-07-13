import React from "react";

export function LanceLogo({ size = 30 }) {
  const u = `lg${size}`;
  const gold1 = "#C9A84C";
  const gold2 = "#e8c96a";
  const goldDark = "#8a6e2a";
  return (
    <svg width={size} height={size} viewBox="0 0 40 48" fill="none">
      <defs>
        <linearGradient id={`${u}g`} x1="20" y1="0" x2="20" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={gold2}/>
          <stop offset="100%" stopColor={goldDark}/>
        </linearGradient>
      </defs>
      <path d="M20 2 L6 42 L20 34 Z" fill={`url(#${u}g)`} opacity="0.9"/>
      <path d="M20 2 L34 42 L20 34 Z" fill={`url(#${u}g)`} opacity="0.7"/>
      <path d="M20 10 L12 40 L20 34 Z" fill="#0d1321" opacity="0.5"/>
      <path d="M20 10 L28 40 L20 34 Z" fill="#0d1321" opacity="0.3"/>
      <line x1="20" y1="2" x2="20" y2="44" stroke={gold1} strokeWidth="1.2" opacity="0.6"/>
    </svg>
  );
}

export function SendIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor"/></svg>);
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
    </svg>
  );
}

export function StopIcon() {
  return (<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="2" width="9" height="9" rx="2" fill="currentColor"/></svg>);
}

export function DownloadIcon() {
  return (<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3.5 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 11h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);
}

export function AttachIcon() {
  return (<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M12.5 7.5l-5.5 5.5a4 4 0 01-5.5-5.5l6-6a2.5 2.5 0 013.5 3.5L5 11a1 1 0 01-1.5-1.5L9 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

export function CloseIcon() {
  return (<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);
}
