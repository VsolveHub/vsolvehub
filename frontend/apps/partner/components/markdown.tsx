import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Server-rendered Markdown → styled HTML (good for SEO). Element styling lives
// here so post bodies stay plain Markdown.
const components: Components = {
  h2: (props) => <h2 className="mt-8 text-xl font-bold text-ink-900" {...props} />,
  h3: (props) => <h3 className="mt-6 text-lg font-semibold text-ink-900" {...props} />,
  p: (props) => <p className="mt-4 leading-relaxed text-gray-600" {...props} />,
  ul: (props) => <ul className="mt-4 list-disc space-y-1.5 pl-6 text-gray-600" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-1.5 pl-6 text-gray-600" {...props} />,
  a: (props) => <a className="font-medium text-brand-600 hover:underline" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink-900" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="mt-5 border-l-4 border-brand-200 bg-brand-50/40 py-2 pl-4 italic text-ink-900"
      {...props}
    />
  ),
  table: (props) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-border bg-surface-muted px-3 py-2 text-left font-semibold text-ink-900"
      {...props}
    />
  ),
  td: (props) => <td className="border border-border px-3 py-2 text-gray-600" {...props} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
