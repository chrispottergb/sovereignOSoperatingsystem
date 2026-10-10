"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="fallback-page"><h1>Let’s reconnect.</h1><p>The workspace hit an unexpected issue. Your saved browser history is still available.</p><button className="primary-button" onClick={reset}>Try again</button></main>; }
