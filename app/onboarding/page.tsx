import { redirect } from "next/navigation";
import { getUser, getWorkspace } from "@/lib/workspace";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage({ searchParams }: { searchParams: { step?: string; gmail?: string } }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding");
  const workspace = await getWorkspace();
  const step = !workspace ? "workspace" : (searchParams.step ?? "gmail");
  return (
    <main className="container max-w-2xl py-16">
      <p className="mb-2 text-sm font-medium text-muted-foreground">AgentLedger setup</p>
      <OnboardingWizard
        initialStep={step as "workspace" | "gmail" | "facts" | "policies" | "done"}
        gmailConfigured={Boolean(process.env.GOOGLE_CLIENT_ID)}
        gmailStatus={searchParams.gmail ?? null}
      />
    </main>
  );
}
