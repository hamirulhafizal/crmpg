import type { PolicyBlock } from '@/app/lib/policy/load-policy'

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          className="text-sky-600 underline decoration-sky-600/30 underline-offset-2 hover:decoration-sky-600 dark:text-sky-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function PolicyDocument({
  title,
  description,
  blocks,
}: {
  title: string
  description: string
  blocks: PolicyBlock[]
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
      </header>

      <div className="space-y-4 text-[15px] leading-relaxed text-foreground/90">
        {blocks.map((block, index) => {
          if (block.type === 'heading') {
            if (block.level === 2) {
              return (
                <h2
                  key={index}
                  className="pt-4 text-lg font-semibold tracking-tight text-foreground first:pt-0"
                >
                  {block.text}
                </h2>
              )
            }
            return (
              <h3 key={index} className="pt-2 text-base font-semibold text-foreground">
                {block.text}
              </h3>
            )
          }
          return (
            <p key={index} className="text-muted-foreground">
              {linkify(block.text)}
            </p>
          )
        })}
      </div>
    </article>
  )
}
