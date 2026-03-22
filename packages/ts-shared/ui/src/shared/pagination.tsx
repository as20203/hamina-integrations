"use client";

import { Button } from "@repo/ui/components/button";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  total: number;
  paramName: string;
  baseUrl: string;
  existingParams: { [key: string]: string | string[] | undefined };
  sectionId?: string;
};

export const Pagination = ({
  currentPage,
  totalPages,
  total,
  paramName,
  baseUrl,
  existingParams,
  sectionId,
}: PaginationProps) => {
  const router = useRouter();

  const createQueryString = useCallback(
    (params: Record<string, string>) => {
      const current = new URLSearchParams();

      Object.entries(existingParams).forEach(([key, value]) => {
        if (key !== paramName && value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => current.append(key, v));
          } else {
            current.set(key, value);
          }
        }
      });

      for (const [key, value] of Object.entries(params)) {
        if (value === "") {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      }

      return current.toString();
    },
    [existingParams, paramName]
  );

  const handlePageChange = (page: number) => {
    const anchor = sectionId ? `#${sectionId}` : "";
    router.push(`${baseUrl}?${createQueryString({ [paramName]: page.toString() })}${anchor}`);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">Total: {total} records</div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
