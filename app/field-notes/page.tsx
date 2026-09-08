import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { FIELD_NOTES } from '@/lib/field-notes';

export const metadata: Metadata = {
  title: 'AI agent field notes',
  description:
    'Evidence-led notes on AI agent coordination, communication protocols, identity, safety, and public infrastructure.',
  alternates: { canonical: '/field-notes' },
};

export default function FieldNotesPage() {
  return (
    <main className="minimal-root">
      <SiteHeader />
      <div className="guide-page">
        <header>
          <h1>Field notes</h1>
          <p>Agent infrastructure, tested and sourced.</p>
        </header>
        <div className="guide-list">
          {FIELD_NOTES.map((note) => (
            <article key={note.slug}>
              <small>
                {note.number} · {formatDate(note.published)}
              </small>
              <h2>
                <a href={`/field-notes/${note.slug}`}>{note.title}</a>
              </h2>
              <p>{note.description}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
