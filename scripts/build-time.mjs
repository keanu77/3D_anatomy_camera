// The time recorded in version.json. A release build of one commit must produce the same bytes
// wherever and whenever it runs, or a rebuilt checkout cannot be compared with the published site.
import { execFileSync } from 'node:child_process';

function commitTime(sha) {
  return execFileSync('git', ['show', '-s', '--format=%cI', sha], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** SOURCE_DATE_EPOCH if given, else the committer date of BUILD_SHA, else the present for a local build. */
export function buildTime({ env = process.env, readCommitTime = commitTime, now = () => new Date() } = {}) {
  if (env.SOURCE_DATE_EPOCH !== undefined && env.SOURCE_DATE_EPOCH !== '') {
    const seconds = Number(env.SOURCE_DATE_EPOCH);
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error(`Invalid SOURCE_DATE_EPOCH: ${env.SOURCE_DATE_EPOCH}`);
    return new Date(seconds * 1000);
  }
  if (env.BUILD_SHA) {
    if (!/^[0-9a-f]{7,64}$/i.test(env.BUILD_SHA)) throw new Error(`Invalid BUILD_SHA: ${env.BUILD_SHA}`);
    let recorded;
    try { recorded = new Date(readCommitTime(env.BUILD_SHA)); } catch { /* Not a checkout of that commit: an archive or a shallow copy. */ }
    if (recorded && Number.isFinite(recorded.getTime())) return recorded;
  }
  return now();
}
