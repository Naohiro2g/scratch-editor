import { describe, expect, test } from 'vitest'
import { messageKeys, resolveLocale, translate } from '../src/l10n'

describe('WireScope localization', () => {
  test('selects Japanese from the browser language preference list', () => {
    expect(resolveLocale(['fr-FR', 'ja-JP', 'en-US'])).toBe('ja')
    expect(resolveLocale(['ja'])).toBe('ja')
    expect(resolveLocale(['ja-Hira'])).toBe('ja-Hira')
  })

  test('falls back to English for unsupported languages', () => {
    expect(resolveLocale(['fr-FR'])).toBe('en')
    expect(resolveLocale([])).toBe('en')
  })

  test('provides Japanese UI text and interpolates observation counts', () => {
    expect(translate('ja', 'emptyTitle')).toBe('観測対象を待っています')
    expect(translate('ja', 'documentTitle')).toBe('WireScope・ライブ画面')
    expect(translate('ja', 'statusObserving', { count: 2 })).toBe('2 本のストリームを観測中')
    expect(translate('en', 'statusObserving', { count: 2, streams: 'streams' })).toBe('Observing 2 streams')
    expect(translate('ja', 'streamMain')).toBe('メインストリーム')
    expect(translate('ja', 'fieldWorldConstants')).toBe('世界定数')
    expect(translate('ja', 'fieldWorld')).toBe('初期ワールド')
    expect(translate('ja', 'fieldOrigin')).toBe('初期原点')
    expect(translate('ja', 'historyWindowTruncated', { count: 12 })).toContain('12 件')
    expect(translate('ja', 'statusDirectNavigation')).toBe(
      'ScratchやPythonなど、接続中の観測元からWireScopeを開いてください。',
    )
    expect(translate('ja', 'endBackpressure')).toBe('データ流量が観測可限界を超えたため、観測を終了しました。')
    expect(translate('en', 'statusDirectNavigation')).toBe(
      'Open WireScope from a connected source, such as Scratch or Python.',
    )
    expect(translate('en', 'streamEnded')).toBe('ended')
    expect(translate('ja', 'streamEnded')).toBe('終了')
    expect(translate('ja', 'directionSentUnconfirmed')).toBe('送信済み・結果未確認')
    expect(translate('en', 'directionSentUnconfirmed')).toBe('Sent · unconfirmed')
  })

  test('provides a kanji-free Japanese Hiragana locale', () => {
    expect(translate('ja-Hira', 'languageSwitch')).toBe('English')
    expect(translate('ja-Hira', 'emptyTitle')).toBe('かんそくするものをまっています')
    expect(translate('ja-Hira', 'statusDirectNavigation')).toBe(
      'Scratch や Python など、せつぞくちゅうのかんそくもとから WireScope をひらいてください。',
    )
    expect(translate('ja-Hira', 'endBackpressure')).toBe(
      'データのながれがはやすぎるため、かんそくをしゅうりょうしました。',
    )
    expect(translate('ja-Hira', 'streamEnded')).toBe('しゅうりょう')
    expect(translate('ja-Hira', 'directionSentUnconfirmed')).toBe('そうしんずみ・けっかみかくにん')
    for (const key of messageKeys) {
      expect(translate('ja-Hira', key)).not.toContain('かんさつ')
    }
    for (const key of messageKeys) {
      expect(translate('ja-Hira', key)).not.toMatch(/[\u3400-\u9fff]/u)
    }
  })
})
