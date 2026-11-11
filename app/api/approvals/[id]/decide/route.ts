import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { decide } from "@/lib/decide";
import { supabaseDecideDeps } from "@/lib/decide-deps";
import { SendRejectedError } from "@/lib/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected", "edited"]),
  edited_body: z.string().max(100_000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

/** `[id]` is the message id. Approve (sends via Resend if not yet sent), edit-then-approve, or reject. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const result = await decide(supabaseDecideDeps(createAdminClient(), auth.workspace), {
      messageId: params.id,
      decision: parsed.data.decision,
      decidedBy: auth.email,
      note: parsed.data.note,
      editedBody: parsed.data.edited_body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SendRejectedError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
