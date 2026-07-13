import { readFileSync } from 'fs'
import { join } from 'path'
import { WORKSPACE_PATHS } from './workspacePaths'

const cache = new Map<string, string>()

// prompteval renders candidate templates through the real builders by pointing this
// at a temp dir; unset in production, where prompts always come from src/prompts/.
const PROMPT_DIR =
  process.env.COMMAND_PROMPT_DIR || join(WORKSPACE_PATHS.commandRoot, 'src', 'prompts')

/** Load a governed prompt artifact from src/prompts/ (ADR-0039). */
export function loadPrompt(id: string): string {
  let template = cache.get(id)
  if (template === undefined) {
    template = readFileSync(join(PROMPT_DIR, `${id}.md`), 'utf-8').trim()
    cache.set(id, template)
  }
  return template
}

/**
 * Substitute {placeholders}.
 *
 * The replacer must stay a function, not a string: values here carry raw diffs,
 * task descriptions and shell, and String.replace treats `$&`, `$'`, "$`" and
 * `$$` in a *string* replacement as patterns — silently corrupting the prompt.
 * A single regex pass also means substituted content is never rescanned, so a
 * value containing {placeholder} text cannot trigger a second substitution.
 * Matches the re.sub() semantics the prompteval adapters render with.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  )
}
