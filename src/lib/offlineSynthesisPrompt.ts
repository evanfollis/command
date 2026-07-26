import { capturePromptInput } from './promptCapture'
import { fillTemplate, loadPrompt } from './promptTemplate'

export interface OfflineSynthesisPattern {
  key: string
  project: string
  category: string
  count: number
  latestSummary: string
  sampleEvidence: string[]
}

/**
 * Render the historical offline-synthesis prompt for its governed eval loop.
 * Collection, execution, and durable writes remain outside the web process.
 */
export function buildOfflineSynthesisPrompt(patterns: OfflineSynthesisPattern[]): string {
  const lines = patterns.length > 0
    ? patterns.map((pattern, index) => {
        const evidence = pattern.sampleEvidence.map((sample) => `- ${sample}`).join('\n')
        return `${index + 1}. Project: ${pattern.project}\nCategory: ${pattern.category}\nCount: ${pattern.count}\nPattern: ${pattern.latestSummary}\nEvidence:\n${evidence || '- No attached evidence'}`
      }).join('\n\n')
    : 'No recurring patterns yet.'
  capturePromptInput('offline-synthesis-prompt', { pattern_count: patterns.length })
  return fillTemplate(loadPrompt('offline-synthesis-prompt'), { patterns: lines })
}
