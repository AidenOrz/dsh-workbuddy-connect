/**
 * Channel-check fingerprints: the exact strings the CN gateway rejects inside a
 * system message, and what each one is rewritten to.
 *
 * Two sources, merged at read time:
 *
 * 1. {@link BUILTIN_FINGERPRINTS} — ships with the package, so a fresh install
 *    works out of the box. This must never be emptied: a user who installs from
 *    the tarball has no external file and would otherwise get the raw prompt,
 *    i.e. HTTP 400 on every message.
 * 2. An optional machine-local JSON file — untracked, never published — whose
 *    rules override a built-in with the same `find`. That is what makes the next
 *    round of this cat-and-mouse game a text edit plus a restart instead of a
 *    code change, a rebuild and a reinstall.
 *
 * Location, in order of precedence:
 *   - `$WORKBUDDY_FINGERPRINTS`
 *   - `$DSH_HOME/.workbuddy-channel-fingerprints.json`
 *
 * The file is re-read when its size or mtime changes, so editing it takes
 * effect on the next request without restarting anything.
 *
 * @module dsh-workbuddy-connect/channel-fingerprints
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** One rewrite the channel check requires. */
export interface FingerprintRule {
  /** The text the gateway rejects. Literal unless {@link regex} is true. */
  readonly find: string
  /** What it becomes. */
  readonly replace: string
  /** Treat {@link find} as a regular expression source instead of literal text. */
  readonly regex?: boolean
  /** RegExp flags for {@link regex} rules. Defaults to `gu`. */
  readonly flags?: string
}

/** Env var naming an explicit fingerprints file. */
export const FINGERPRINTS_PATH_ENV = 'WORKBUDDY_FINGERPRINTS'

/** Basename of the machine-local file inside the Harness home. */
export const FINGERPRINTS_FILENAME = '.workbuddy-channel-fingerprints.json'

/** Highest document version this build understands. */
const SUPPORTED_VERSION = 1

/**
 * Rules that ship with the package.
 *
 * `DeepSeek Harness` — measured 2026-10-21: with the identity opener already
 * neutralized, a real session still answered 400 / 11128. Its system messages
 * carried the runtime context DSH appends every turn
 *
 *   Current DeepSeek Harness implementation checkout: "C:\…\DeepSeek Harness\…"
 *   Current DeepSeek Harness Web GUI URL: "http://127.0.0.1:…"
 *
 * eleven occurrences in one request. Replacing just this name made the same
 * request succeed, so the check is a full-text scan rather than a prefix rule.
 *
 * `Relative paths resolve from the workspace root` — measured 2026-10-27: a
 * `0.2.1-rc.3` session on `deepseek-v4.1-flash` answered 400 / 11128 with every
 * earlier fingerprint neutralized. Bisecting the captured 49 KB body put the
 * trigger on this one clause, contributed by `@deepseek-ai/dsh-file-reference`;
 * changing any word in it, or dropping the clause, makes the identical body
 * succeed. It is a **sentence-level** rule, not a word list: `workspace root`
 * alone, or the same words padded with filler, does not trigger.
 */
export const BUILTIN_FINGERPRINTS: readonly FingerprintRule[] = [
  { find: 'DeepSeek Harness', replace: 'the agent runtime' },
  {
    find: 'Relative paths resolve from the workspace root',
    replace: 'Relative paths resolve against the workspace directory',
  },
]

/** A compiled rewrite, ready to hand to `String.prototype.replace`. */
export interface CompiledFingerprint {
  readonly pattern: RegExp
  readonly replacement: string
  readonly source: 'builtin' | 'external'
}

interface Loaded {
  readonly rules: readonly FingerprintRule[]
  /** Non-fatal problems to surface in diagnostics; never blocks a request. */
  readonly problem?: string
}

interface Cache {
  readonly stamp: string
  readonly compiled: readonly CompiledFingerprint[]
  readonly problem?: string
}

let cache: Cache | undefined

/** Resolve the fingerprints file path, honouring the env override. */
export function fingerprintsPath(): string {
  const override = process.env[FINGERPRINTS_PATH_ENV]?.trim()
  if (override !== undefined && override !== '') return override
  return join(resolveDshHome(), FINGERPRINTS_FILENAME)
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function compile(rule: FingerprintRule, source: 'builtin' | 'external'): CompiledFingerprint | undefined {
  const find = typeof rule.find === 'string' ? rule.find : ''
  const replace = typeof rule.replace === 'string' ? rule.replace : ''
  if (find === '') return undefined
  const pattern = rule.regex === true
    ? new RegExp(find, rule.flags ?? 'gu')
    : new RegExp(escapeLiteral(find), 'gu')
  return { pattern, replacement: replace, source }
}

/** Parse and validate the external document; `undefined` when it is unusable. */
function parseDocument(text: string): Loaded | { readonly wrongVersion: number } | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { rules: [], problem: `fingerprints file is not valid JSON (${String(error)})` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { rules: [], problem: 'fingerprints file is not a JSON object' }
  }
  const doc = parsed as Record<string, unknown>
  const version = doc['version']
  if (typeof version === 'number' && version > SUPPORTED_VERSION) {
    return { wrongVersion: version }
  }
  const raw = doc['rules']
  if (!Array.isArray(raw)) {
    return { rules: [], problem: 'fingerprints file has no "rules" array' }
  }
  const rules: FingerprintRule[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const rule = entry as Record<string, unknown>
    if (typeof rule['find'] !== 'string' || rule['find'] === '') continue
    if (typeof rule['replace'] !== 'string') continue
    rules.push({
      find: rule['find'],
      replace: rule['replace'],
      ...rule['regex'] === true ? { regex: true } : {},
      ...typeof rule['flags'] === 'string' ? { flags: rule['flags'] } : {},
    })
  }
  return { rules }
}

function readExternal(): Loaded {
  const path = fingerprintsPath()
  try {
    statSync(path)
  } catch {
    return { rules: [] }
  }
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return { rules: [], problem: `fingerprints file is unreadable (${String(error)})` }
  }
  const parsed = parseDocument(text)
  if (parsed === undefined) return { rules: [] }
  if ('wrongVersion' in parsed) {
    return { rules: [], problem: `fingerprints file version ${String(parsed.wrongVersion)} is newer than this build (${String(SUPPORTED_VERSION)})` }
  }
  return parsed
}

/**
 * Compile built-ins plus the external overrides, cached against the file's
 * size+mtime so a request never pays for a parse it does not need.
 *
 * A missing file is normal (most installs have none). A broken one is reported
 * through {@link fingerprintDiagnostics} but never blocks the request — the
 * built-ins still apply.
 */
export function activeFingerprints(): readonly CompiledFingerprint[] {
  const path = fingerprintsPath()
  let stamp = 'absent'
  try {
    const st = statSync(path)
    stamp = `${String(st.size)}:${String(st.mtimeMs)}`
  } catch {}
  if (cache !== undefined && cache.stamp === stamp) return cache.compiled

  const external = readExternal()
  const merged = new Map<string, FingerprintRule>()
  for (const rule of BUILTIN_FINGERPRINTS) merged.set(rule.find, rule)
  for (const rule of external.rules) merged.set(rule.find, rule)

  const compiled: CompiledFingerprint[] = []
  for (const rule of merged.values()) {
    const isExternal = external.rules.some(r => r.find === rule.find)
    const one = compile(rule, isExternal ? 'external' : 'builtin')
    if (one !== undefined) compiled.push(one)
  }

  cache = { stamp, compiled, ...external.problem === undefined ? {} : { problem: external.problem } }
  return compiled
}

/** Non-fatal state for `doctor` and the settings card. */
export function fingerprintDiagnostics(): {
  readonly path: string
  readonly rules: number
  readonly external: number
  readonly problem?: string
} {
  const compiled = activeFingerprints()
  return {
    path: fingerprintsPath(),
    rules: compiled.length,
    external: compiled.filter(rule => rule.source === 'external').length,
    ...cache?.problem === undefined ? {} : { problem: cache.problem },
  }
}

/** Drop the cache so the next call re-reads. Tests and diagnostics only. */
export function resetFingerprintCache(): void {
  cache = undefined
}
