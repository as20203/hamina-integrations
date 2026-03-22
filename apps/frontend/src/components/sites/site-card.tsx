"use client";

import type { EnhancedSiteInfo } from "@/types/mist";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";
import { shouldSkipNavigationForTextSelection } from "@/lib/skip-navigation-if-text-selection";
import { Clock, Crosshair, Globe2, MapPin, Server, Users, Wifi } from "lucide-react";

type SiteCardProps = {
  site: EnhancedSiteInfo;
  className?: string;
  onSelect: (siteId: string) => void;
};

const formatLatLng = (site: EnhancedSiteInfo): string | null => {
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
        "cursor-pointer select-text transition-shadow hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      onClick={(e) => {
        if (shouldSkipNavigationForTextSelection(e)) {
          return;
        }
        onSelect(site.id);
      }}
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
        
        {/* Device inventory summary */}
        {site.inventory_summary && (
          <div className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-primary/80" />
            <span>
              {site.inventory_summary.ap_count} APs, {site.inventory_summary.switch_count} switches
            </span>
            {site.inventory_summary.connected_devices < site.inventory_summary.total_devices && (
              <Badge variant="outline" className="text-xs">
                {site.inventory_summary.connected_devices}/{site.inventory_summary.total_devices} online
              </Badge>
            )}
          </div>
        )}

        {/* Client summary */}
        {site.client_summary && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary/80" />
            <span>{site.client_summary.active_clients} active clients</span>
            {site.client_summary.wireless_clients > 0 && (
              <div className="flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                <span className="text-xs">{site.client_summary.wireless_clients} wireless</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export { SiteCard };
