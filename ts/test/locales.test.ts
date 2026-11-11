import { expect, test } from 'vitest'
import { english, translate } from '../src/messages'

const catalogs = import.meta.glob<Record<string, string>>('../../locales/*.json', { eager: true, import: 'default' })
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()

for (const [path, catalog] of Object.entries(catalogs)) {
  test(`${path} covers the messages and keeps interpolation parameters`, () => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort())
    for (const [key, source] of Object.entries(english)) {
      expect(catalog[key]?.trim(), key).toBeTruthy()
      expect(placeholders(catalog[key]!), key).toEqual(placeholders(source))
    }
    expect(translate(catalog)('signin.title', { appName: 'My app' })).toContain('My app')
  })
}
