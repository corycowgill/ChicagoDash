// Graphics quality profiles. Chosen once at startup (before any geometry or
// material is built) from the Settings value, and read everywhere else.
export const Q = {
  level: 'high',
  pbr: true, // physically based materials + sky reflections
  post: true, // bloom, grading and speed blur
  bloomScale: 1, // render-target scale for bloom
  seg: 2, // multiplier for curved-surface segment counts
  shadowSize: 2048,
  shadows: true,
  particles: 1, // multiplier for ambient particle counts
  anisotropy: 8,
  msaa: 4,
  ao: true,
};

const PROFILES = {
  high: { pbr: true, post: true, ao: true, bloomScale: 1, seg: 1.6, shadowSize: 2048, shadows: true, particles: 1, msaa: 4 },
  medium: { pbr: true, post: true, ao: false, bloomScale: 0.5, seg: 1.2, shadowSize: 1024, shadows: true, particles: 0.6, msaa: 2 },
  low: { pbr: false, post: false, ao: false, bloomScale: 0.5, seg: 1, shadowSize: 512, shadows: false, particles: 0.35, msaa: 0 },
};

export function setQuality(level) {
  Q.level = PROFILES[level] ? level : 'high';
  Object.assign(Q, PROFILES[Q.level]);
}

/** Segment count scaled by quality, never below the given minimum. */
export function segs(n, min = 3) {
  return Math.max(min, Math.round(n * Q.seg));
}
