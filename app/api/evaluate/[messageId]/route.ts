import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { evaluateMessage } from "@/lib/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual (re-)evaluation of one message. Appends a new eval row; prior evals are kept. */
export async function POST(_req: Request, { params }: { params: { messageId: string } }) {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const db = createAdminClient();
  const { data: msg } = await db.from("messages").select("id").eq("id", params.messageId).eq("workspace_id", auth.workspace.id).maybeSingle();
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { eval: evalRow, status } = await evaluateMessage(db, msg.id);
    return NextResponse.json({ ok: true, status, eval: evalRow });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
