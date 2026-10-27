import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_FINGERPRINTS,
  FINGERPRINTS_PATH_ENV,
  activeFingerprints,
  fingerprintDiagnostics,
  fingerprintsPath,
  resetFingerprintCache,
} from '../src/channel-fingerprints.ts'

/**
 * The rule table is the part of this plugin the gateway keeps obsoleting, so it
 * moved out of the source and into a file a user can edit without a rebuild.
 * These tests pin the contract that makes that safe: built-ins always apply,
 * the external file only ever overrides what it names, and a broken file can
 * never take the request path down with it.
 */

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-fp-'))
  file = join(dir, 'fingerprints.json')
  process.env[FINGERPRINTS_PATH_ENV] = file
  resetFingerprintCache()
})

afterEach(() => {
  delete process.env[FINGERPRINTS_PATH_ENV]
  resetFingerprintCache()
  rmSync(dir, { recursive: true, force: true })
})

function write(doc: unknown): void {
  writeFileSync(file, JSON.stringify(doc))
  resetFingerprintCache()
}

function scrub(text: string): string {
  let out = text
  for (const { pattern, replacement } of activeFingerprints()) out = out.replace(pattern, replacement)
  return out
}

describe('built-in fingerprints', () => {
  it('applies with no external file present', () => {
    // A fresh install has no file at all; that must behave exactly as before.
    expect(fingerprintsPath()).toBe(file)
    expect(activeFingerprints()).toHaveLength(BUILTIN_FINGERPRINTS.length)
    expect(scrub('Current DeepSeek Harness checkout: C:\\x'))
      .toBe('Current the agent runtime checkout: C:\\x')
    expect(scrub('Relative paths resolve from the workspace root.'))
      .toBe('Relative paths resolve against the workspace directory.')
  })

  it('reports the built-ins as builtin-sourced', () => {
    expect(activeFingerprints().every(rule => rule.source === 'builtin')).toBe(true)
    expect(fingerprintDiagnostics()).toMatchObject({ path: file, rules: BUILTIN_FINGERPRINTS.length, external: 0 })
  })

  it('leaves neighbouring text alone', () => {
    // The rule is the exact sentence, not a word list — "workspace root" on its
    // own passes the channel check, so rewriting it would be a silent lie.
    const text = 'The build writes into a workspace root directory.'
    expect(scrub(text)).toBe(text)
  })
})

describe('external overrides', () => {
  it('overrides a built-in with the same find', () => {
    write({
      version: 1,
      rules: [{ find: 'DeepSeek Harness', replace: 'some other runtime' }],
    })
    const rules = activeFingerprints()
    expect(rules).toHaveLength(BUILTIN_FINGERPRINTS.length)
    expect(rules.filter(rule => rule.source === 'external')).toHaveLength(1)
    expect(scrub('DeepSeek Harness')).toBe('some other runtime')
    // The other built-in is untouched.
    expect(scrub('Relative paths resolve from the workspace root'))
      .toBe('Relative paths resolve against the workspace directory')
  })

  it('adds a rule that is not built in', () => {
    write({
      version: 1,
      rules: [{ find: 'next round trigger', replace: 'neutral text' }],
    })
    expect(activeFingerprints()).toHaveLength(BUILTIN_FINGERPRINTS.length + 1)
    expect(scrub('a next round trigger b')).toBe('a neutral text b')
    expect(fingerprintDiagnostics()).toMatchObject({ rules: BUILTIN_FINGERPRINTS.length + 1, external: 1 })
  })

  it('supports regex rules with explicit flags', () => {
    write({
      version: 1,
      rules: [{ find: 'RESOLVE\\s+FROM', replace: 'resolve against', regex: true, flags: 'giu' }],
    })
    expect(scrub('resolve from the root')).toBe('resolve against the root')
  })

  it('treats find as literal text by default', () => {
    // Dots and parentheses in a literal rule must not become regex syntax.
    write({ version: 1, rules: [{ find: 'v4.1 (flash)', replace: 'a model' }] })
    expect(scrub('use v4.1 (flash) now')).toBe('use a model now')
  })
})

describe('broken files never break the request path', () => {
  it('falls back to the built-ins on invalid JSON', () => {
    writeFileSync(file, '{ not json')
    resetFingerprintCache()
    expect(activeFingerprints()).toHaveLength(BUILTIN_FINGERPRINTS.length)
    expect(fingerprintDiagnostics().problem).toMatch(/not valid JSON/u)
    expect(scrub('DeepSeek Harness')).toBe('the agent runtime')
  })

  it('falls back when "rules" is missing', () => {
    write({ version: 1 })
    expect(activeFingerprints()).toHaveLength(BUILTIN_FINGERPRINTS.length)
    expect(fingerprintDiagnostics().problem).toMatch(/no "rules" array/u)
  })

  it('ignores entries without a usable find/replace pair', () => {
    write({
      version: 1,
      rules: [
        { find: 'kept', replace: 'yes' },
        { find: '', replace: 'empty find' },
        { replace: 'no find at all' },
        { find: 'no replace' },
        'not an object',
      ],
    })
    const rules = activeFingerprints()
    expect(rules).toHaveLength(BUILTIN_FINGERPRINTS.length + 1)
    expect(scrub('kept')).toBe('yes')
  })

  it('refuses a document from a newer build rather than guessing', () => {
    write({ version: 99, rules: [{ find: 'x', replace: 'y' }] })
    expect(activeFingerprints()).toHaveLength(BUILTIN_FINGERPRINTS.length)
    expect(fingerprintDiagnostics().problem).toMatch(/newer than this build/u)
  })
})

describe('picking up an edit without a restart', () => {
  it('re-reads when the file changes', () => {
    // Deliberately does not reset the cache: the point is that a size/mtime
    // change is enough for the next request to see the new table.
    writeFileSync(file, JSON.stringify({ version: 1, rules: [{ find: 'first', replace: 'one' }] }))
    resetFingerprintCache()
    expect(scrub('first')).toBe('one')

    writeFileSync(file, JSON.stringify({ version: 1, rules: [{ find: 'second', replace: 'two' }] }))
    expect(scrub('second')).toBe('two')
    // The previous external rule is gone, not accumulated.
    expect(scrub('first')).toBe('first')
  })
})
