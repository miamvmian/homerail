import { chromium } from 'playwright'

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:19193/agent'
const apiErrors = []
const consoleErrors = []
const pageErrors = []
const apiSeen = []

function isApiUrl(raw) {
  try {
    return new URL(raw).pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function isAllowedLocalCredentialError(url, status, body) {
  return (
    status === 502 &&
    url.pathname === '/api/voice/speech' &&
    body.includes('Missing TTS API key')
  )
}

async function waitForUi(page, delay = 500) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(delay)
}

async function dismissOnboarding(page) {
  const closeButton = page.getByTitle('稍后配置').first()
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click()
    await page.waitForTimeout(300)
  }
}

async function visibleFirst(page, candidates) {
  for (const candidate of candidates) {
    const locator = candidate.kind === 'testid'
      ? page.getByTestId(candidate.value)
      : candidate.kind === 'placeholder'
        ? page.getByPlaceholder(candidate.value)
        : page.locator(candidate.value)
    if (await locator.count()) {
      const first = locator.first()
      if (await first.isVisible().catch(() => false)) return first
    }
  }
  return null
}

function dumpEvidence() {
  console.log('API seen:')
  console.log(apiSeen.length ? apiSeen.join('\n') : '(none)')
  if (consoleErrors.length) {
    console.log('Console warnings/errors:')
    console.log(consoleErrors.slice(0, 30).join('\n'))
  }
  if (pageErrors.length) {
    console.log('Page errors:')
    console.log(pageErrors.join('\n'))
  }
  if (apiErrors.length) {
    console.log('API errors:')
    console.log(apiErrors.join('\n'))
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1100 },
    })
    const page = await context.newPage()

    page.on('response', async (response) => {
      const rawUrl = response.url()
      if (!isApiUrl(rawUrl)) return
      const url = new URL(rawUrl)
      const status = response.status()
      apiSeen.push(`${response.request().method()} ${url.pathname}${url.search} -> ${status}`)
      if (status >= 400) {
        let body = ''
        try {
          body = (await response.text()).slice(0, 500)
        } catch {
          body = '(body unavailable)'
        }
        if (isAllowedLocalCredentialError(url, status, body)) return
        apiErrors.push(`${response.request().method()} ${rawUrl} -> ${status} ${body}`)
      }
    })
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        consoleErrors.push(`${msg.type()}: ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => {
      pageErrors.push(err.stack || err.message)
    })

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForUi(page, 1200)
    await dismissOnboarding(page)

    if (process.env.HOMERAIL_E2E_TEXT_TURN === '1') {
      const chatInput = await visibleFirst(page, [
        { kind: 'placeholder', value: '描述你的任务...' },
        { kind: 'placeholder', value: '输入任务描述...' },
      ])
      if (!chatInput) throw new Error('Agent chat input not found')

      await chatInput.fill('E2E: verify native agent text turn')
      const textTurn = page.waitForResponse((response) => {
        if (!isApiUrl(response.url())) return false
        const pathname = new URL(response.url()).pathname
        return /^\/api\/agent\/sessions\/[^/]+\/turns$/.test(pathname) || pathname === '/api/manager/chat'
      }, { timeout: 10000 })
      await page.getByTitle('发送').first().click()
      await textTurn
      await waitForUi(page, 1000)
    }

    await page.getByTestId('agent-mode-settings-button').click()
    await page.getByTestId('agent-settings-section-git').waitFor({ state: 'visible', timeout: 10000 })
    for (const tab of ['workspace', 'nodes', 'skills', 'mcp', 'memory']) {
      if (await page.getByTestId(`agent-settings-tab-${tab}`).count()) {
        throw new Error(`Hidden settings tab is visible: ${tab}`)
      }
    }
    for (const tab of ['providers', 'voice']) {
      await page.getByTestId(`agent-settings-tab-${tab}`).click()
      await page.getByTestId(`agent-settings-section-${tab}`).waitFor({ state: 'visible', timeout: 10000 })
      await waitForUi(page, 500)
    }
    if (await page.getByText('Voice Agent Harness', { exact: true }).count()) {
      throw new Error('Voice Agent Harness should be configured from the model menu, not settings')
    }
    if (await page.getByText('Voice Agent LLM', { exact: true }).count()) {
      throw new Error('Voice Agent LLM should be configured from the model menu, not settings')
    }
    for (const removedVoiceSetting of ['Omni 语音输入模型', 'ASR 模型', 'TTS 模型', 'Voice Agent 语音协议']) {
      if (await page.getByText(removedVoiceSetting, { exact: true }).count()) {
        throw new Error(`Removed voice setting is visible: ${removedVoiceSetting}`)
      }
    }
    await page.getByTestId('agent-settings-voice-commentary-toggle').waitFor({ state: 'visible', timeout: 10000 })
    await waitForUi(page, 800)

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await waitForUi(page, 800)
    await dismissOnboarding(page)
    const voiceEntry = page.getByText('进入语音 Cockpit', { exact: false }).first()
    const voiceMode = page.getByText('语音模式', { exact: false }).first()
    if (await voiceEntry.count()) await voiceEntry.click()
    else if (await voiceMode.count()) await voiceMode.click()
    await waitForUi(page, 1200)
    await page.getByText('工作区', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('目录', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    if (await page.getByText('WORKSPACE', { exact: true }).count()) {
      throw new Error('Voice sidebar still shows WORKSPACE')
    }
    if (await page.getByText('项目与会话', { exact: true }).count()) {
      throw new Error('Voice sidebar still shows 项目与会话')
    }
    await page.getByTestId('voice-model-config-button').click()
    await page.getByTestId('voice-model-config-menu').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('voice-model-agent-harness-select').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('voice-model-agent-model-select').waitFor({ state: 'visible', timeout: 10000 })
    await page.keyboard.press('Escape').catch(() => {})

    const voiceInput = page.getByTestId('voice-codex-text-input')
    if (!await voiceInput.count()) throw new Error('Voice text bridge input not found')
    await voiceInput.fill('E2E voice text turn')
    await voiceInput.evaluate((el) => {
      const form = el.closest('form')
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await waitForUi(page, 1800)

    const experienceUrl = baseUrl.replace(/\/agent.*/, '/agent/experience')
    await page.goto(experienceUrl, { waitUntil: 'domcontentloaded' })
    await waitForUi(page, 1500)

    if (apiErrors.length || pageErrors.length) {
      dumpEvidence()
      throw new Error(`Agent UI E2E contract failed: apiErrors=${apiErrors.length}, pageErrors=${pageErrors.length}`)
    }

    console.log('Agent UI E2E contract PASS')
    dumpEvidence()
  } finally {
    await browser.close()
  }
}

run().catch((err) => {
  dumpEvidence()
  console.error(err)
  console.error(`Base URL: ${baseUrl}`)
  console.error('Start the runtime first, for example: node homerail_cli/dist/cli.js start --ui')
  process.exit(1)
})
