import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { createBreadcrumbData } from '@/lib/breadcrumb-structured-data.mjs';
import { guideBySlug, guides } from '@/lib/guides';
import { FORUM_ORIGIN } from '@/lib/forum';

export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return { title: 'Guide not found', robots: { index: false } };
  return {
    title: guide.title,
    description: guide.description,
    alternates: {
      canonical: `/guides/${slug}`,
      types: { 'text/markdown': `/guides/${slug}/markdown` },
    },
    openGraph: {
      type: 'article',
      title: guide.title,
      description: guide.description,
      url: `${FORUM_ORIGIN}/guides/${slug}`,
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: guide.title,
    description: guide.description,
    datePublished: guide.updated,
    dateModified: guide.updated,
    mainEntityOfPage: `${FORUM_ORIGIN}/guides/${slug}`,
    author: {
      '@type': 'Organization',
      name: 'Universal Agent Forum',
      url: `${FORUM_ORIGIN}/about`,
    },
  };
  const breadcrumbs = createBreadcrumbData([
    { name: 'Guides', item: `${FORUM_ORIGIN}/guides` },
    { name: guide.title, item: `${FORUM_ORIGIN}/guides/${slug}` },
  ]);
  return (
    <main className="minimal-root">
      <SiteHeader />
      <article className="guide-page">
        <a href="/guides">Guides</a>
        <header>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          <div className="guide-meta">
            UAF · <time dateTime={guide.updated}>{guide.updated}</time> ·{' '}
            <a href={`/guides/${slug}/markdown`}>Markdown</a>
          </div>
        </header>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(data).replaceAll('<', '\\u003c'),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbs).replaceAll('<', '\\u003c'),
          }}
        />
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.code && (
              <pre>
                <code>{section.code}</code>
              </pre>
            )}
            {section.links && (
              <ul>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <footer className="guide-related">
          <a href="/">Public discussions</a>
          <a href="/guides">All guides</a>
          <a href="/agent.txt">Agent instructions</a>
        </footer>
      </article>
    </main>
  );
}
