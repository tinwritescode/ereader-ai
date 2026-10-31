import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { parseSync } from 'oxc-parser'

export type Rule = 'layer-direction' | 'feature-border' | 'domain-purity' | 'no-as' | 'no-any'
export type Violation = { path: string; rule: Rule; detail: string }

type Layer =
  | { kind: 'route' }
  | { kind: 'feature'; feature: string; part: 'ui' | 'data' | 'domain' }
  | { kind: 'shared-ui' }
  | { kind: 'shared-server' }
  | { kind: 'app' }

const BROWSER_GLOBALS = new Set(['fetch', 'window', 'document', 'localStorage', 'XMLHttpRequest'])
const DOMAIN_PACKAGES = new Set(['zod'])
const ORDER = { ui: 2, data: 1, domain: 0 } as const

function layerOf(path: string): Layer {
  const feature = /^src\/features\/([^/]+)\/(ui|data|domain)\//.exec(path)
  const [, name, part] = feature ?? []
  if (name && (part === 'ui' || part === 'data' || part === 'domain')) return { kind: 'feature', feature: name, part }
  if (path.startsWith('src/routes/')) return { kind: 'route' }
  if (path.startsWith('src/shared/ui/')) return { kind: 'shared-ui' }
  if (path.startsWith('src/shared/server/')) return { kind: 'shared-server' }
  return { kind: 'app' }
}

/** The path an import points at inside the app, or null for a package. */
function targetOf(path: string, specifier: string): string | null {
  if (specifier.startsWith('~/')) return `src/${specifier.slice(2)}/`
  if (specifier.startsWith('.')) return `${posix.join(posix.dirname(path), specifier)}/`
  return null
}

function importRule(from: Layer, to: Layer): Rule | null {
  switch (from.kind) {
    case 'app':
    case 'route':
      return null
    case 'shared-ui':
      return to.kind === 'shared-ui' ? null : 'layer-direction'
    case 'shared-server':
      return to.kind === 'shared-server' ? null : 'layer-direction'
    case 'feature':
      return featureImportRule(from, to)
    default: {
      const _exhaustive: never = from
      return _exhaustive
    }
  }
}

function featureImportRule(from: Extract<Layer, { kind: 'feature' }>, to: Layer): Rule | null {
  switch (to.kind) {
    case 'route':
    case 'app':
      return 'layer-direction'
    case 'shared-ui':
      return from.part === 'ui' ? null : 'layer-direction'
    case 'shared-server':
      return from.part === 'data' ? null : 'layer-direction'
    case 'feature':
      if (to.feature !== from.feature) return to.part === 'domain' ? null : 'feature-border'
      return ORDER[to.part] <= ORDER[from.part] ? null : 'layer-direction'
    default: {
      const _exhaustive: never = to
      return _exhaustive
    }
  }
}

type Node = Record<string, unknown>

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit))
  } else if (isNode(value)) {
    visit(value)
    Object.values(value).forEach((child) => walk(child, visit))
  }
}

function isAsConst(node: Node): boolean {
  const annotation = node['typeAnnotation']
  if (!isNode(annotation)) return false
  const name = annotation['typeName']
  return isNode(name) && name['name'] === 'const'
}

function typeViolations(program: unknown): { rule: Rule; detail: string }[] {
  const found: { rule: Rule; detail: string }[] = []
  walk(program, (node) => {
    if (node['type'] === 'TSTypeAssertion' || (node['type'] === 'TSAsExpression' && !isAsConst(node))) {
      found.push({ rule: 'no-as', detail: 'type cast' })
    }
    if (node['type'] === 'TSAnyKeyword') found.push({ rule: 'no-any', detail: 'any' })
  })
  return found
}

function browserUses(program: unknown): string[] {
  const used = new Set<string>()
  walk(program, (node) => {
    if (node['type'] === 'Identifier' && typeof node['name'] === 'string' && BROWSER_GLOBALS.has(node['name'])) {
      used.add(node['name'])
    }
  })
  return [...used]
}

export function violationsIn({ path, code }: { path: string; code: string }): Violation[] {
  // A domain's tests may use the runner and read fixtures; they ship in no bundle.
  const isTest = /\.test\.tsx?$/.test(path)
  const { program, module } = parseSync(path, code)
  const from = layerOf(path)
  const specifiers = [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((entry) =>
      entry.entries.flatMap(({ moduleRequest }) => (moduleRequest ? [moduleRequest.value] : [])),
    ),
    ...module.dynamicImports.flatMap(({ moduleRequest }) => {
      const literal = /^['"`](.+)['"`]$/.exec(code.slice(moduleRequest.start, moduleRequest.end))
      return literal?.[1] ? [literal[1]] : []
    }),
  ]
  const found: Violation[] = []
  const report = (rule: Rule, detail: string) => found.push({ path, rule, detail })
  for (const specifier of new Set(specifiers)) {
    const target = targetOf(path, specifier)
    if (target === null) {
      if (from.kind === 'feature' && from.part === 'domain' && !isTest && !DOMAIN_PACKAGES.has(specifier))
        report('domain-purity', specifier)
      continue
    }
    const rule = importRule(from, layerOf(target))
    if (rule) report(rule, specifier)
  }
  if (from.kind === 'feature' && from.part === 'domain' && !isTest)
    browserUses(program).forEach((name) => report('domain-purity', name))
  typeViolations(program).forEach(({ rule, detail }) => report(rule, detail))
  return found
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.gen.ts') ? [path] : []
  })
}

if (import.meta.main) {
  const root = dirname(dirname(new URL(import.meta.url).pathname))
  const violations = sourceFiles(join(root, 'src')).flatMap((file) =>
    violationsIn({ path: relative(root, file), code: readFileSync(file, 'utf8') }),
  )
  violations.forEach(({ path, rule, detail }) => process.stderr.write(`${path}: ${rule}: ${detail}\n`))
  if (violations.length > 0) process.exit(1)
  process.stdout.write('boundaries hold\n')
}
