import React from 'react';

export interface JetBrainsIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Modern JetBrains ExpUI colorful icons with micro-gradients,
 * high visual hierarchy, clean geometry, and prominent colors.
 */

// 1. CR Explorer (Warm Amber + Coral + Code bracket)
export const JetBrainsProjectIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbProjGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#ea580c" />
      </linearGradient>
      <linearGradient id="jbProjBack" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f97316" />
      </linearGradient>
    </defs>
    {/* Back folder flap */}
    <path d="M 3 6 C 3 4.8 3.8 4 5 4 L 9 4 L 11 6 L 19 6 C 20.2 6 21 6.8 21 8 L 21 10 L 3 10 Z" fill="url(#jbProjBack)" />
    {/* Front folder body with 3D gradient */}
    <rect x="3" y="8" width="18" height="12" rx="2" fill="url(#jbProjGrad)" />
    {/* Accent geometric lines */}
    <path d="M 7 13 L 9.5 15.5 L 7 18" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
    <line x1="12" y1="18" x2="16" y2="18" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
  </svg>
);

// 2. Docs Explorer (Vivid Cyan + Sky Blue + Document folds)
export const JetBrainsDocsIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbDocsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="jbFoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="100%" stopColor="#bae6fd" />
      </linearGradient>
    </defs>
    {/* Document Body */}
    <path d="M 5 4 C 5 2.8 5.8 2 7 2 L 14 2 L 19 7 L 19 20 C 19 21.2 18.2 22 17 22 L 7 22 C 5.8 22 5 21.2 5 20 Z" fill="url(#jbDocsGrad)" />
    {/* Folded corner */}
    <path d="M 14 2 L 14 7 L 19 7 Z" fill="url(#jbFoldGrad)" />
    {/* Content lines */}
    <line x1="8.5" y1="11" x2="15.5" y2="11" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="8.5" y1="14.5" x2="15.5" y2="14.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
    <line x1="8.5" y1="18" x2="13" y2="18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
  </svg>
);

// 2b. Diagram Explorer (Mermaid Flowchart: Decision Diamond + Process Rect + Terminal Node)
export const JetBrainsDiagramIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbDiagDiamond" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="jbDiagRect" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="jbDiagCircle" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    {/* Flowchart Connector Lines with Branching */}
    <path
      d="M 12 11.5 L 12 14 M 12 14 L 6 14 L 6 16.5 M 12 14 L 18 14 L 18 16.5"
      stroke="#94a3b8"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Top Decision Diamond (Mermaid flowchart decision) */}
    <polygon points="12,2.5 17.5,7 12,11.5 6.5,7" fill="url(#jbDiagDiamond)" />
    {/* Left Process Rect (Operation step) */}
    <rect x="2.5" y="16.5" width="7" height="5" rx="1.5" fill="url(#jbDiagRect)" />
    {/* Right Terminal Circle (State/Endpoint) */}
    <circle cx="18" cy="19" r="3.2" fill="url(#jbDiagCircle)" />
  </svg>
);

// 2c. Systems Explorer (3-Tier Isometric Architecture Stack: App + Services + DB)
export const JetBrainsSystemsIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbSysLayer1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
      <linearGradient id="jbSysLayer2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
      <linearGradient id="jbSysLayer3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Bottom Layer: Infrastructure / DB Tier */}
    <path d="M 12 14.5 L 20.5 18.5 L 12 22.5 L 3.5 18.5 Z" fill="url(#jbSysLayer3)" />
    {/* Middle Layer: Services / Middleware Tier */}
    <path d="M 12 8.5 L 20.5 12.5 L 12 16.5 L 3.5 12.5 Z" fill="url(#jbSysLayer2)" />
    {/* Top Layer: Application / Presentation Tier */}
    <path d="M 12 2.5 L 20.5 6.5 L 12 10.5 L 3.5 6.5 Z" fill="url(#jbSysLayer1)" />
  </svg>
);

// 2d. Remote Git Explorer (Git Branch Fork + Commit Nodes + Remote Globe Badge)
export const JetBrainsRemoteGitIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbGitOrange" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fb923c" />
        <stop offset="100%" stopColor="#ea580c" />
      </linearGradient>
      <linearGradient id="jbRemoteGlobe" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
    </defs>
    {/* Remote Globe background badge */}
    <circle cx="15.5" cy="8.5" r="5.5" fill="url(#jbRemoteGlobe)" opacity="0.35" />
    <ellipse cx="15.5" cy="8.5" rx="2.5" ry="5.5" stroke="#0284c7" strokeWidth="0.9" fill="none" opacity="0.75" />
    <line x1="10" y1="8.5" x2="21" y2="8.5" stroke="#0284c7" strokeWidth="0.9" opacity="0.75" />

    {/* Main trunk line */}
    <line x1="6.5" y1="5.5" x2="6.5" y2="18.5" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" />
    {/* Feature branch fork curve */}
    <path
      d="M 6.5 13.5 C 6.5 10.5 15.5 12 15.5 9"
      stroke="#ea580c"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />

    {/* Root commit node */}
    <circle cx="6.5" cy="18.5" r="2.8" fill="url(#jbGitOrange)" stroke="#ffffff" strokeWidth="1.2" />
    {/* Trunk commit node */}
    <circle cx="6.5" cy="5.5" r="2.8" fill="url(#jbGitOrange)" stroke="#ffffff" strokeWidth="1.2" />
    {/* Remote branch commit node */}
    <circle cx="15.5" cy="8.5" r="2.8" fill="#fbbf24" stroke="#ea580c" strokeWidth="1.2" />
  </svg>
);

// 3. AI Assistant (Electric Violet + Pink + Sparkle)
export const JetBrainsAIIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbAiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="50%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="jbSparkle" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    {/* Central Robot / Diamond AI Orb */}
    <rect x="4" y="5" width="16" height="15" rx="4" fill="url(#jbAiGrad)" />
    {/* Robot antenna */}
    <line x1="12" y1="2" x2="12" y2="5" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="2" r="1.5" fill="#ec4899" />
    {/* Eyes */}
    <circle cx="9" cy="11" r="1.6" fill="#ffffff" />
    <circle cx="15" cy="11" r="1.6" fill="#ffffff" />
    {/* Smile */}
    <path d="M 9.5 15 Q 12 17 14.5 15" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    {/* AI Star Sparkle */}
    <path d="M 19 3 C 19 4.8 20.2 5.5 21 5.5 C 20.2 5.5 19 6.2 19 8 C 19 6.2 17.8 5.5 17 5.5 C 17.8 5.5 19 4.8 19 3 Z" fill="url(#jbSparkle)" />
  </svg>
);

// 4. Notifications Bell (Golden Yellow + Sunset Orange + Sound Wave)
export const JetBrainsNotificationIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbBellGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    {/* Bell body */}
    <path d="M 12 3 C 9.5 3 7.5 5 7.5 7.5 L 7.5 12 L 5 15 L 5 17 L 19 17 L 19 15 L 16.5 12 L 16.5 7.5 C 16.5 5 14.5 3 12 3 Z" fill="url(#jbBellGrad)" />
    {/* Bell Clapper */}
    <path d="M 10 18 C 10 19.1 10.9 20 12 20 C 13.1 20 14 18.9 14 18 Z" fill="#d97706" />
    {/* Sound pulse dot */}
    <circle cx="17.5" cy="4.5" r="2.5" fill="#f43f5e" />
  </svg>
);

// 5. Tasks (Emerald Green + Lime + Checkmark Badge)
export const JetBrainsTasksIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbTaskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="jbCheckLime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a3e635" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
    </defs>
    {/* Rounded square container */}
    <rect x="3" y="3" width="18" height="18" rx="4" fill="url(#jbTaskGrad)" />
    {/* Checkmark */}
    <path d="M 7 12 L 10.5 15.5 L 17 8.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// 6. Planner / Calendar (Royal Blue + Indigo + Grid)
export const JetBrainsPlannerIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbPlanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
    <rect x="3" y="5" width="18" height="16" rx="3.5" fill="url(#jbPlanGrad)" />
    <path d="M 3 5 C 3 3.8 3.8 3 5 3 L 19 3 C 20.2 3 21 3.8 21 5 L 21 9 L 3 9 Z" fill="#4338ca" />
    <circle cx="8" cy="13" r="1.5" fill="#ffffff" />
    <circle cx="12" cy="13" r="1.5" fill="#ffffff" />
    <circle cx="16" cy="13" r="1.5" fill="#ffffff" />
    <circle cx="8" cy="17" r="1.5" fill="#ffffff" />
    <circle cx="12" cy="17" r="1.5" fill="#38bdf8" />
  </svg>
);

// 7. Dashboard Overview (Purple + Deep Violet + Meter tiles)
export const JetBrainsDashboardIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbDash1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="jbDash2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#4f46e5" />
      </linearGradient>
      <linearGradient id="jbDash3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f43f5e" />
        <stop offset="100%" stopColor="#e11d48" />
      </linearGradient>
      <linearGradient id="jbDash4" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="8" height="9" rx="2" fill="url(#jbDash1)" />
    <rect x="13" y="3" width="8" height="5" rx="2" fill="url(#jbDash2)" />
    <rect x="3" y="14" width="8" height="7" rx="2" fill="url(#jbDash3)" />
    <rect x="13" y="10" width="8" height="11" rx="2" fill="url(#jbDash4)" />
  </svg>
);

// 8. Ghost Dev Agents (Neon Cyan + Thunderbolt + Jet)
export const JetBrainsAgentsIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbAgentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="jbBoltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="url(#jbAgentGrad)" />
    <path d="M 13 4 L 7 13 L 12 13 L 11 20 L 17 11 L 12 11 Z" fill="url(#jbBoltGrad)" stroke="#b45309" strokeWidth="0.5" />
  </svg>
);

// 9. Telegram Monitor (Paper Airplane with Blue-Cyan Sky gradient)
export const JetBrainsTelegramIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbTeleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#29b6f6" />
        <stop offset="100%" stopColor="#0288d1" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#jbTeleGrad)" />
    <path d="M 6.8 11.5 L 16.5 7.5 C 17 7.3 17.5 7.7 17.3 8.2 L 15.2 16.5 C 15 17.1 14.3 17.3 13.8 16.9 L 11.4 14.8 L 9.8 16.2 C 9.6 16.4 9.3 16.3 9.3 16 L 9.6 13.4 L 14.8 9.5 L 8.6 12.8 Z" fill="#ffffff" />
  </svg>
);

// 10. Analytics & Trends (Pink to Purple Histogram & Trending Up)
export const JetBrainsAnalyticsIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbAnalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f43f5e" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="url(#jbAnalGrad)" />
    {/* Bars */}
    <rect x="6" y="13" width="3" height="6" rx="1" fill="#ffffff" opacity="0.9" />
    <rect x="10.5" y="9.5" width="3" height="9.5" rx="1" fill="#ffffff" opacity="0.9" />
    <rect x="15" y="6" width="3" height="13" rx="1" fill="#ffffff" />
  </svg>
);

// 11. SDLC Studio (DevOps Continuous Lifecycle Infinity Loop: Cyan -> Blue -> Violet -> Emerald)
export const JetBrainsSdlcIcon: React.FC<JetBrainsIconProps> = ({ size = 16, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="jbSdlcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="35%" stopColor="#3b82f6" />
        <stop offset="70%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
    </defs>
    {/* Continuous SDLC Lifecycle Infinity Loop */}
    <path
      d="M 7.5 7.5 C 4.5 7.5 2.5 9.5 2.5 12 C 2.5 14.5 4.5 16.5 7.5 16.5 C 10.5 16.5 12.5 13.5 12 12 C 11.5 10.5 13.5 7.5 16.5 7.5 C 19.5 7.5 21.5 9.5 21.5 12 C 21.5 14.5 19.5 16.5 16.5 16.5 C 13.5 16.5 11.5 13.5 12 12 C 12.5 10.5 10.5 7.5 7.5 7.5 Z"
      fill="none"
      stroke="url(#jbSdlcGrad)"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Architecture / Design Milestone Dot */}
    <circle cx="7.5" cy="12" r="1.6" fill="#06b6d4" />
    {/* Deploy / Release Milestone Dot */}
    <circle cx="16.5" cy="12" r="1.6" fill="#10b981" />
  </svg>
);

