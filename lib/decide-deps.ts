import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecideDeps } from "@/lib/decide";
import { insertEval, loadEvalContext, scoreContent } from "@/lib/evaluate";
import { claudeJudge } from "@/lib/judge/claude";
import { deliverEmail, senderAddress } from "@/lib/send";
import type { EvalRow, Message, Workspace } from "@/lib/types";

/** Supabase-backed dependencies, scoped to one workspace. */
export function supabaseDecideDeps(db: SupabaseClient, workspace: Workspace): DecideDeps {
  return {
    async getMessage(id) {
      const { data } = await db.from("messages").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
      return (data as Message | null) ?? null;
    },
    async getLatestOriginalEval(messageId) {
      const { data } = await db.from("evals").select("*").eq("message_id", messageId).eq("target", "original").order("evaluated_at", { ascending: false }).limit(1).maybeSingle();
      return (data as EvalRow | null) ?? null;
    },
    async evaluateEditedBody(message, body) {
      const ctx = await loadEvalContext(db, message);
      const result = await scoreContent(claudeJudge, ctx, { ...message, body });
      return insertEval(db, message, result, { target: "edited", factSheetVersion: ctx.factSheet.version, judgeModel: claudeJudge.model });
    },
    async insertApproval(row) {
      const { error } = await db.from("approvals").insert(row);
      if (error) throw new Error(error.message);
    },
    async updateMessage(id, patch) {
      const { error } = await db.from("messages").update(patch).eq("id", id).eq("workspace_id", workspace.id);
      if (error) throw new Error(error.message);
    },
    send: deliverEmail,
    fromAddress: () => senderAddress(workspace.from_email),
  };
}
