"use client";

import { useEffect, useState } from "react";
import type {
  MistDeviceStatsSseMessage,
  MistDeviceStreamStats,
  MistDeviceStatsStreamStatus,
} from "@/types/mist";
import { normalizeDeviceMac } from "@/lib/mist/mac";

const useMistDeviceStatsStream = (siteId: string, enabled: boolean) => {
  const [liveByMac, setLiveByMac] = useState<Map<string, MistDeviceStreamStats>>(() => new Map());
  const [streamStatus, setStreamStatus] = useState<MistDeviceStatsStreamStatus>("idle");

  useEffect(() => {
    if (!enabled || !siteId.trim()) {
      setLiveByMac(new Map());
      setStreamStatus("idle");
      return;
    }

    const url = `/api/mist/sites/${encodeURIComponent(siteId)}/devices-stats/stream`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as MistDeviceStatsSseMessage;
        if (msg.type === "stream_status") {
          setStreamStatus(msg.status);
          return;
        }
        if (msg.type === "device_stats") {
          const mac = normalizeDeviceMac(String(msg.data.mac ?? ""));
          if (!mac) {
            return;
          }
          setLiveByMac((prev) => {
            const next = new Map(prev);
            next.set(mac, msg.data);
            return next;
          });
        }
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      es.close();
    };
  }, [siteId, enabled]);

  return { liveByMac, streamStatus };
};

export { useMistDeviceStatsStream };
