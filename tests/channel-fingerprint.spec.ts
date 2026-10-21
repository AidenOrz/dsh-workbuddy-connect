import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkBuddyCredential } from '../src/auth.ts'
import {
  prepareChatBody,
  prepareCnChatBody,
  prepareInternationalChatBody,
  WorkBuddyUpstreamClient,
} from '../src/upstream.ts'

/**
 * The channel-verification fingerprint (400 / code 11128, 「请求被拦截，请重新发送」).
 *
 * Measured against the CN gateway: a chat body whose system message *begins*
 * with the Harness identity sentence is rejected, while the same body with
 * only that sentence neutralized succeeds. These tests pin the two properties
 * the fix depends on — every system message is rewritten, and nothing else in
 * the body moves — plus the boundary that keeps the rewrite from touching
 * legitimate prompt text.
 */

const CREDENTIAL: WorkBuddyCredential = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAtMs: 0,
  domain: 'www.codebuddy.cn',
  uid: 'uid-1',
  source: 'desktop',
}

const FINGERPRINT = 'You are an AI agent powered by DeepSeek Harness.'

/** A minimal Response-like object for the wire assertions below. */
function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

/** The `messages` array of a prepared body, as plain objects. */
function messagesOf(prepared: string): Record<string, unknown>[] {
  return (JSON.parse(prepared) as Record<string, unknown>)['messages'] as Record<string, unknown>[]
}

/** The leading sentence of one message's content. */
function leadingOf(message: Record<string, unknown>): string {
  const content = message['content']
  return typeof content === 'string' ? content.split('\n')[0] ?? '' : ''
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('channel fingerprint neutralization', () => {
  it('rewrites the leading identity sentence of a system message in the CN body', () => {
    const prepared = prepareCnChatBody(JSON.stringify({
      model: 'hy3',
      messages: [
        { role: 'system', content: `${FINGERPRINT}\n\nYou are an agent.` },
        { role: 'user', content: 'hi' },
      ],
    }))
    expect(messagesOf(prepared)[0]?.['content']).toBe('You are an AI agent.\n\nYou are an agent.')
  })

  it('rewrites every system message, not only the first', () => {
    // A long session carries several system messages because DSH re-emits the
    // prompt when it changes; neutralizing only the first was measured to leave
    // the request at 400.
    const prepared = prepareChatBody(JSON.stringify({
      model: 'hy3',
      messages: [
        { role: 'system', content: FINGERPRINT },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'system', content: `${FINGERPRINT}\n\nsecond prompt` },
        { role: 'user', content: 'c' },
      ],
    }))
    const messages = messagesOf(prepared)
    expect(messages[0]?.['content']).toBe('You are an AI agent.')
    expect(messages[3]?.['content']).toBe('You are an AI agent.\n\nsecond prompt')
  })

  it('rewrites a system message whose content is an array of text parts', () => {
    const prepared = prepareCnChatBody(JSON.stringify({
      model: 'hy3',
      messages: [{
        role: 'system',
        content: [
          { type: 'text', text: FINGERPRINT },
          { type: 'text', text: 'You are an AI agent powered by DeepSeek Harness. Again.' },
        ],
      }],
    }))
    const content = messagesOf(prepared)[0]?.['content'] as Record<string, unknown>[]
    expect(content[0]?.['text']).toBe('You are an AI agent.')
    // Only the leading sentence of each text part is in scope; a second
    // occurrence inside the same string is prompt text and stays put.
    expect(content[1]?.['text']).toBe('You are an AI agent. Again.')
  })

  it('rewrites a developer-role message too, since it is rewritten to system first', () => {
    const prepared = prepareChatBody(JSON.stringify({
      model: 'hy3',
      messages: [{ role: 'developer', content: FINGERPRINT }, { role: 'user', content: 'hi' }],
    }))
    const message = messagesOf(prepared)[0]
    expect(message?.['role']).toBe('system')
    expect(message?.['content']).toBe('You are an AI agent.')
  })

  it('leaves a fingerprint that is not at the start of the prompt alone', () => {
    // Prose before the sentence passes the channel check, so there is nothing
    // to neutralize and the prompt must not be touched.
    const text = `Answer briefly.\n\n${FINGERPRINT}\n\nReply with ok.`
    const prepared = prepareCnChatBody(JSON.stringify({
      model: 'hy3',
      messages: [{ role: 'system', content: text }, { role: 'user', content: 'hi' }],
    }))
    expect(messagesOf(prepared)[0]?.['content']).toBe(text)
  })

  it('leaves neighboring identity phrasings and non-system roles untouched', () => {
    const systemPrompt = 'You are a helpful assistant.\n\nYou are an AI agent powered by Claude.'
    const userText = FINGERPRINT
    const prepared = prepareCnChatBody(JSON.stringify({
      model: 'hy3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
        { role: 'tool', content: FINGERPRINT, tool_call_id: 'call-1' },
      ],
    }))
    const messages = messagesOf(prepared)
    expect(messages[0]?.['content']).toBe(systemPrompt)
    expect(messages[1]?.['content']).toBe(userText)
    expect(messages[2]?.['content']).toBe(FINGERPRINT)
  })

  it('keeps unrelated body fields and the international system-prompt prepend intact', () => {
    const prepared = prepareInternationalChatBody(JSON.stringify({
      model: 'hy3',
      temperature: 0.3,
      messages: [
        { role: 'system', content: FINGERPRINT },
        { role: 'user', content: 'hi' },
      ],
    }))
    const body = JSON.parse(prepared) as Record<string, unknown>
    expect(body['model']).toBe('hy3')
    expect(body['temperature']).toBe(0.3)
    expect(body['stream']).toBe(true)
    expect(leadingOf(messagesOf(prepared)[0] ?? {})).toBe('You are an AI agent.')
  })

  it('returns a non-object body unchanged, as the other normalizers do', () => {
    expect(prepareCnChatBody('not json')).toBe('not json')
    expect(prepareCnChatBody('[]')).toBe('[]')
    expect(prepareChatBody('null')).toBe('null')
  })
})

describe('chatStream sends the neutralized system prompt', () => {
  /** Capture the body that actually leaves `chatStream` for one credential. */
  async function wireBody(credential: WorkBuddyCredential): Promise<Record<string, unknown>> {
    const captured: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return fakeResponse('')
    }))
    const result = await new WorkBuddyUpstreamClient().chatStream(credential, JSON.stringify({
      model: 'hy3',
      messages: [
        { role: 'system', content: `${FINGERPRINT}\n\nBe brief.` },
        { role: 'user', content: 'hi' },
      ],
    }))
    expect(result.ok).toBe(true)
    return captured[0] ?? {}
  }

  it('neutralizes the fingerprint on the CN wire', async () => {
    // Judged on the request, not on an intermediate helper: the CN path
    // prepares through `prepareCnChatBody`, the international one through
    // `prepareInternationalChatBody`, and both must reach the gateway clean.
    const body = await wireBody(CREDENTIAL)
    const messages = body['messages'] as Record<string, unknown>[]
    expect(leadingOf(messages[0] ?? {})).toBe('You are an AI agent.')
    expect(messages[1]?.['content']).toBe('hi')
  })

  it('neutralizes the fingerprint on the international wire', async () => {
    const body = await wireBody({ ...CREDENTIAL, domain: 'www.workbuddy.ai' })
    const messages = body['messages'] as Record<string, unknown>[]
    expect(leadingOf(messages[0] ?? {})).toBe('You are an AI agent.')
    expect(messages[1]?.['content']).toBe('hi')
  })
})
