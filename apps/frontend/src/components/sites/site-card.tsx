"use client";

import type { MistOrgSite } from "@/types/mist";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { Clock, Crosshair, Globe2, MapPin } from "lucide-react";

type SiteCardProps = {
  site: MistOrgSite;
  className?: string;
  onSelect: (siteId: string) => void;
};

const formatLatLng = (site: MistOrgSite): string | null => {
  const { lat, lng } = site.latlng ?? {};
  if (typeof lat === "number" && typeof lng === "number") {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return null;
};

const SiteCard = ({ site, className, onSelect }: SiteCardProps) => {
  const coords = formatLatLng(site);

  return (
    <Card
      role="link"
      tabIndex={0}
      className={cn(
        "cursor-pointer transition-shadow hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      onClick={() => onSelect(site.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(site.id);
        }
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg leading-tight">{site.name || "Unnamed site"}</CardTitle>
        <p className="font-mono text-xs text-muted-foreground">{site.id}</p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {site.address ? (
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" aria-hidden />
            <span className="leading-snug">{site.address}</span>
          </div>
        ) : null}
        {site.country_code ? (
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
            <span>{site.country_code}</span>
          </div>
        ) : null}
        {site.timezone ? (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
            <span className="font-mono text-xs">{site.timezone}</span>
          </div>
        ) : null}
        {coords ? (
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
            <span className="font-mono text-xs">{coords}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export { SiteCard };
