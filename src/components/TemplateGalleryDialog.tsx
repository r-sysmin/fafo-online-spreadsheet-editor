import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IWorkbookData } from "@univerjs/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SPREADSHEET_TEMPLATES, type SpreadsheetTemplate } from "@/lib/templates";
import { createSheetFromTemplate } from "@/lib/templates/createFromTemplate";
import { SheetMiniPreview } from "@/components/SheetMiniPreview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
};

export function TemplateGalleryDialog({ open, onOpenChange, ownerId }: Props) {
  const navigate = useNavigate();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const previews = useMemo(
    () =>
      SPREADSHEET_TEMPLATES.map((t) => ({
        template: t,
        data: t.build("preview") as IWorkbookData,
      })),
    [],
  );

  async function handleUseTemplate(t: SpreadsheetTemplate) {
    setCreatingId(t.id);
    try {
      const id = await createSheetFromTemplate(t, ownerId);
      if (!id) return;
      onOpenChange(false);
      navigate({ to: "/sheet/$id", params: { id } });
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Pick a template to create a new spreadsheet pre-filled with structure and sample
            content.
          </DialogDescription>
        </DialogHeader>

        {previews.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No templates available yet.
          </p>
        ) : (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 max-h-[65vh] overflow-y-auto pr-1 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"
            data-testid="template-list"
          >

            {previews.map(({ template: t, data }) => {
              const Icon = t.icon;
              const isCreating = creatingId === t.id;
              return (
                <li
                  key={t.id}
                  className="group flex flex-col overflow-hidden rounded-lg border bg-background hover:shadow-md transition"
                  data-testid="template-card"
                  data-template-id={t.id}
                >
                  <button
                    type="button"
                    onClick={() => handleUseTemplate(t)}
                    disabled={!!creatingId}
                    className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-b bg-muted/20 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    aria-label={`Use ${t.name} template`}
                    data-testid="template-preview"
                  >
                    <div className="h-full w-full overflow-hidden rounded-md border bg-background shadow-sm">
                      <SheetMiniPreview data={data} />
                    </div>
                  </button>
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm">{t.name}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t.category}
                        </div>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    <Button
                      size="sm"
                      className="mt-1 min-h-11 w-full"

                      onClick={() => handleUseTemplate(t)}
                      disabled={!!creatingId}
                      data-testid="use-template"
                    >
                      {isCreating ? "Creating…" : "Use template"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

