import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "@/app/actions";
import { NavLinks } from "@/components/nav-links";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace, email } = await requireWorkspace();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-muted/40 p-4 md:w-56 md:border-b-0 md:border-r">
        <Link href="/app" className="block text-lg font-bold">
          AgentLedger
        </Link>
        <p className="mb-4 truncate text-xs text-muted-foreground">{workspace.name}</p>
        <NavLinks />
        <form action={signOut} className="mt-6 hidden md:block">
          <p className="mb-1 truncate text-xs text-muted-foreground">{email}</p>
          <button className="text-xs underline">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
