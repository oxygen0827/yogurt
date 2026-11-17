import { expect, it, vi } from 'vitest'
import { cloudLlm, endpoint } from '../src/main/notes/cloud'

it('streams only answer text, passes history and tokens, and refuses incomplete responses', async () => {
  const config = { url: 'https://api.deepseek.com/v1/', key: 'test', model: 'deepseek-flash' }
  const request = vi.fn(async () => new Response('data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"决定"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n'))
  const token = vi.fn()
  expect(await cloudLlm(config, undefined, request).chat('问题',token,{ before: ['问','答'], maxTokens: 40 })).toBe('决定')
  expect(token.mock.calls).toEqual([['决定']])
  expect(request).toHaveBeenCalledWith('https://api.deepseek.com/v1/chat/completions', expect.objectContaining({ redirect: 'error',body: expect.stringContaining('"role":"assistant","content":"答"') }))
  const truncated = async () => new Response('data: {"choices":[{"delta":{"content":"半句"}}]}\n')
  await expect(cloudLlm(config,undefined,truncated).chat('?',token)).rejects.toThrow('Incomplete')
  expect(() => endpoint('http://example.org')).toThrow()
})
