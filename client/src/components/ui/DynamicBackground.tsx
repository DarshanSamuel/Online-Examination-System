/**
 * Dynamic ambient background with animated floating aurora orbs and a subtle architectural
 * dot/grid mesh that adapts seamlessly between Light Mode and Dark Mode.
 */
export function DynamicBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
      {/* Base canvas */}
      <div className="absolute inset-0 bg-slate-50 transition-colors duration-500 dark:bg-[#070b14]" />

      {/* Subtle architectural grid pattern */}
      <div className="bg-dynamic-grid absolute inset-0 opacity-60 dark:opacity-35" />

      {/* Animated Aurora Orbs */}
      <div className="animate-orb-1 absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/18" />
      <div className="animate-orb-2 absolute top-1/4 -right-28 h-[30rem] w-[30rem] rounded-full bg-sky-400/18 blur-3xl dark:bg-cyan-500/14" />
      <div className="animate-orb-3 absolute -bottom-36 left-1/3 h-[26rem] w-[26rem] rounded-full bg-violet-400/18 blur-3xl dark:bg-purple-500/15" />

      {/* Soft top vignette radial glow */}
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary-500/[0.06] to-transparent dark:from-primary-500/[0.10]" />
    </div>
  );
}
