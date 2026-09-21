import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SpreadsheetTemplate } from "./types";

/**
 * Shared "create a new sheet from a template" pipeline, reused by both the
 * template strip on the sheets home and the full template gallery dialog.
 *
 * Mirrors blank-sheet creation exactly (insert row → seed snapshot) so RLS,
 * owner-membership trigger, and timestamps behave identically.
 *
 * Returns the created sheet id, or null on failure (toast already surfaced).
 */
export async function createSheetFromTemplate(
  template: SpreadsheetTemplate,
  ownerId: string,
): Promise<string | null> {
  const { data: created, error: insertErr } = await supabase
    .from("spreadsheets")
    .insert({ owner_id: ownerId, title: template.name })
    .select("id")
    .single();
  if (insertErr || !created) {
    toast.error("Couldn't create from template", { description: insertErr?.message });
    return null;
  }

  const snapshot = template.build(created.id);
  const { error: updateErr } = await supabase
    .from("spreadsheets")
    .update({ snapshot })
    .eq("id", created.id);
  if (updateErr) {
    toast.error("Couldn't seed template", { description: updateErr.message });
    return null;
  }

  toast.success(`Created "${template.name}"`);
  return created.id;
}
