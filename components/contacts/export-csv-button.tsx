"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { contactsApi } from "./api";
import { type ContactFilterState, hasActiveFilters } from "./filters";

export interface ExportCsvButtonProps {
  filters: ContactFilterState;
  disabled?: boolean;
}

/** Plain link to the export route so the browser handles the attachment; the active filters ride along. */
function ExportCsvButton({ filters, disabled }: ExportCsvButtonProps) {
  const filtered = hasActiveFilters(filters);
  const button = (
    <Button variant="outline" size="sm" asChild={!disabled} disabled={disabled}>
      {disabled ? (
        <>
          <Download />
          Export CSV
        </>
      ) : (
        <a href={contactsApi.exportUrl(filters)} download>
          <Download />
          Export CSV
        </a>
      )}
    </Button>
  );
  if (!filtered) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>Exports only the contacts matching the current filters</TooltipContent>
    </Tooltip>
  );
}

export { ExportCsvButton };
