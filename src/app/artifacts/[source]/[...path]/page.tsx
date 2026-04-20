import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import Shell from '@/components/Shell'
import { describeSource, readArtifact } from '@/lib/artifacts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PageProps {
  params: { source: string; path: string[] }
}

function formatTimestamp(mtime: number): string {
  return new Date(mtime).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}

export default function ArtifactPage({ params }: PageProps) {
  const source = describeSource(params.source)
  if (!source) notFound()

  const segments = (params.path || []).map((s) => decodeURIComponent(s))
  const doc = readArtifact(params.source, segments)
  if (!doc) notFound()

  const frontmatterEntries = Object.entries(doc.frontmatter)

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav className="mb-4 text-xs text-neutral-500">
          <Link href="/artifacts" className="hover:text-neutral-300">
            Artifacts
          </Link>
          <span className="mx-2 text-neutral-700">/</span>
          <span className="text-neutral-400">{source.label}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span className="font-mono text-neutral-300">{doc.relativePath}</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-100">{doc.title}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            modified {formatTimestamp(doc.mtime)}
          </p>
          {frontmatterEntries.length > 0 && (
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-neutral-400">
              {frontmatterEntries.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-neutral-500">{key}</dt>
                  <dd className="text-neutral-300 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </header>

        <article className="prose prose-invert prose-sm max-w-none prose-headings:text-neutral-100 prose-headings:scroll-mt-20 prose-p:text-neutral-300 prose-li:text-neutral-300 prose-code:text-sky-200 prose-strong:text-neutral-100 prose-a:text-sky-300 prose-pre:bg-black/40">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
            {doc.content}
          </ReactMarkdown>
        </article>
      </div>
    </Shell>
  )
}
