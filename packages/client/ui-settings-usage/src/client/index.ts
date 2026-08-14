/**
 * Token-usage settings plugin, browser half. Registers the 用量 (Usage) page
 * through the settings section slot — the same seam every feature settings
 * page uses, so the shell owns the nav and nothing is injected by hand.
 * The page reads its data from the desktop shell's usage bridge
 * (window.dshDesktop.usageGet) and degrades to an unavailable note in plain
 * web builds. Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { UsageSection, type UsageSectionInjected } from './UsageSection.tsx'
import { en, zh, type UsageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Usage page copy. */
    'settings.usage': UsageKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.usage'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Register the Usage section once the `settings.section` declaration is on
 * the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-usage: copy dictionaries')
  const t = ctx.locale.bind(NS) as UsageSectionInjected['t']
  const injected = (): UsageSectionInjected => ({ t })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 40,
    label: () => t('nav'),
    inject: injected,
  }, UsageSection))
}
