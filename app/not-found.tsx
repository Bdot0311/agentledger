import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container py-24 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <Link href="/app" className="mt-4 inline-block underline">Back to dashboard</Link>
    </main>
  );
}
