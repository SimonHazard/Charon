import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <main className="app-shell">
      <p className="app-eyebrow">{m.home_status()}</p>
      <h1>{m.home_title()}</h1>
      <p>{m.home_description()}</p>
    </main>
  );
}
