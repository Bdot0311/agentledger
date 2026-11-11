import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="container flex min-h-screen max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to AgentLedger</CardTitle>
          <CardDescription>We&apos;ll email you a magic link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {searchParams.error && <p className="text-sm text-destructive">That link has expired. Request a new one.</p>}
          <AuthForm mode="login" next={searchParams.next} />
          <p className="text-sm text-muted-foreground">
            New here? <Link className="underline" href="/signup">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
