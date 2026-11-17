import type { Llm } from './enhance'

export const defaultEndpoint = 'https://api.deepseek.com'
export const defaultModel = 'deepseek-flash'
export type CloudOptions = { url: string; model: string; key: string }
export function endpoint(input: string) {
  const url = new URL(input.trim())
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS API URL or a localhost address.')
  }
  return url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

export function cloudLlm(config: CloudOptions, signal?: AbortSignal, request = fetch): Llm {
  return {
    // A conservative budget for compatible endpoints whose context size is unknown.
    contextSize: 32768,
    count: async texts => texts.map(text => Buffer.byteLength(text, 'utf8')),
    async chat(prompt, token, options) {
      const messages = (options?.before ?? []).map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content }))
      messages.push({ role: 'user', content: prompt })
      const timeout = AbortSignal.timeout(180_000)
      const response = await request(endpoint(config.url) + '/chat/completions', {
        method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key },
        body: JSON.stringify({ model: config.model, messages, stream: true,
          ...(new URL(config.url).hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}),
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}) }),
      })
      if (!response.ok || !response.body) throw new Error('Cloud model HTTP ' + response.status)
      let answer = '', buffer = '', finished = false
      const handle = (line: string) => {
        if (!line.startsWith('data:')) return
        const data = line.slice(5).trim()
        if (!data) return
        if (data === '[DONE]') { finished = true; return }
        const event = JSON.parse(data)
        if (event.error) throw new Error('Cloud model request failed')
        const choice = event.choices?.[0]
        if (choice?.finish_reason === 'length') throw new Error('Cloud response exceeded the output limit')
        if (choice?.finish_reason === 'stop') finished = true
        const text = choice?.delta?.content
        if (typeof text === 'string' && text) { answer += text; token(text) }
      }
      const reader = response.body.getReader(), decoder = new TextDecoder()
      try {
        while (true) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split('\n')
          buffer = lines.pop()!
          for (const line of lines) handle(line)
          if (done) { handle(buffer); break }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      if (!finished || !answer.trim()) throw new Error('Incomplete cloud model response')
      return answer
    },
  }
}
