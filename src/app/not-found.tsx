import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

export default function NotFound() {
  return (
    <main className="tracky-404-page">
      <div className="tracky-404-grain" aria-hidden="true" />
      <div className="tracky-404-art" aria-hidden="true">
        <span className="tracky-404-art-core" />
      </div>

      <header className="tracky-404-topline">
        <Link href="/" className="tracky-404-brand" aria-label="Tracky home">
          TRACKY<span aria-hidden="true">®</span>
        </Link>
        <p>FEE OPERATIONS, BACK ON TRACK</p>
        <span className="tracky-404-code">ERROR&nbsp; 404</span>
      </header>

      <section className="tracky-404-content" aria-labelledby="not-found-title">
        <h1 id="not-found-title" className="tracky-404-heading">
          <span className="tracky-404-this">this</span>
          <span className="tracky-404-page-word">page</span>
          <span className="tracky-404-isnt">isn&apos;t</span>
          <span className="tracky-404-real">real.</span>
        </h1>

        <div className="tracky-404-note">
          <p>404. This page doesn&apos;t exist.</p>
          <p>Let&apos;s get you back to something real.</p>
          <Link href="/" className="tracky-404-home">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back home
          </Link>
        </div>
      </section>

      <footer className="tracky-404-footer">
        <span>TRACKY · COACHING INSTITUTE FEE OPERATIONS</span>
        <span>NOT ALL WHO WANDER OWE FEES.</span>
      </footer>
    </main>
  );
}
