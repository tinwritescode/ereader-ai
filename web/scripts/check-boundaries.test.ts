import { describe, expect, it } from 'vitest'
import { violationsIn } from './check-boundaries.ts'

const check = (path: string, code: string) => violationsIn({ path, code }).map(({ rule }) => rule)

describe('import direction', () => {
  it('lets each layer use the one below it', () => {
    expect(check('src/routes/_app/index.tsx', `import x from '~/features/books/ui/library'`)).toEqual([])
    expect(check('src/features/books/ui/library.tsx', `import x from '../data/books'`)).toEqual([])
    expect(check('src/features/books/data/books.ts', `import x from '../domain/book'`)).toEqual([])
    expect(check('src/features/books/data/books.ts', `import x from '~/shared/server/backend'`)).toEqual([])
    expect(check('src/features/books/ui/library.tsx', `import x from '~/shared/ui/button'`)).toEqual([])
  })

  it('refuses a layer reaching up', () => {
    expect(check('src/features/books/data/books.ts', `import x from '../ui/library'`)).toEqual(['layer-direction'])
    expect(check('src/features/books/domain/book.ts', `import x from '../data/books'`)).toEqual(['layer-direction'])
    expect(check('src/features/books/ui/x.tsx', `import x from '~/routes/index'`)).toEqual(['layer-direction'])
  })

  it('lets features meet only through domain', () => {
    expect(check('src/features/books/ui/x.tsx', `import x from '~/features/tasks/domain/task'`)).toEqual([])
    expect(check('src/features/books/ui/x.tsx', `import x from '~/features/tasks/data/tasks'`)).toEqual([
      'feature-border',
    ])
    expect(check('src/features/books/data/x.ts', `import x from '../../tasks/ui/page'`)).toEqual(['feature-border'])
  })

  it('keeps the server away from ui, and features away from shared code', () => {
    expect(check('src/features/books/ui/x.tsx', `import x from '~/shared/server/session'`)).toEqual(['layer-direction'])
    expect(check('src/shared/ui/x.tsx', `import x from '~/features/books/domain/book'`)).toEqual(['layer-direction'])
    expect(check('src/shared/server/x.ts', `import x from '~/features/books/domain/book'`)).toEqual(['layer-direction'])
  })

  it('counts dynamic imports', () => {
    expect(check('src/features/books/domain/x.ts', `const y = () => import('../ui/page')`)).toEqual(['layer-direction'])
  })
})

describe('domain purity', () => {
  it('allows zod and refuses React', () => {
    expect(check('src/features/books/domain/x.ts', `import { z } from 'zod'`)).toEqual([])
    expect(check('src/features/books/domain/x.ts', `import { useState } from 'react'`)).toEqual(['domain-purity'])
  })

  it('refuses fetch and the browser', () => {
    expect(check('src/features/books/domain/x.ts', `const a = fetch('/x')`)).toEqual(['domain-purity'])
    expect(check('src/features/books/domain/x.ts', `const a = window.location`)).toEqual(['domain-purity'])
  })
})

describe('type discipline', () => {
  it('refuses as casts and keeps as const', () => {
    expect(check('src/shared/ui/x.ts', `const a = b as string`)).toEqual(['no-as'])
    expect(check('src/shared/ui/x.ts', `const a = [1] as const`)).toEqual([])
  })

  it('refuses any', () => {
    expect(check('src/shared/ui/x.ts', `const a: any = 1`)).toEqual(['no-any'])
  })
})

it('lets a domain test use its runner, and no one else', () => {
  const code = "import { it } from 'vitest'\n"
  expect(violationsIn({ path: 'src/features/books/domain/book.test.ts', code })).toEqual([])
  expect(violationsIn({ path: 'src/features/books/domain/book.ts', code }).map(({ rule }) => rule)).toEqual([
    'domain-purity',
  ])
})
