import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found page-width"><p className="eyebrow">Error 404</p><h1>Nothing settled here.</h1><p>The requested MergePay route does not exist.</p><Link className="button" href="/">Return home</Link></main>
  );
}
