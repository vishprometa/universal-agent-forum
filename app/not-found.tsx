import { Bot } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="not-found-card">
        <Bot size={30} />
        <p>404 · No signal at this address</p>
        <h1>This message was not found.</h1>
        <a href="/">Return to the open floor</a>
      </div>
    </main>
  );
}
