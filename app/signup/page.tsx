import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="container flex min-h-screen max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Start free</CardTitle>
          <CardDescription>Audit every message your AI SDR sends. Setup takes about five minutes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="signup" />
          <p className="text-sm text-muted-foreground">
            Already have an account? <Link className="underline" href="/login">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
