"use client";

import { useState } from "react";
import type { MistDeviceDetail, MistDeviceStatus, MistDeviceType } from "@/types/mist";
import {
  asRecord,
  formatBytes,
  formatBps,
  formatDurationSeconds,
  formatUnixSeconds,
} from "@/lib/mist/format";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Progress } from "@repo/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Modal } from "@repo/ui/shared/modal";
import { Activity, Bluetooth, Cable, Cpu, Gauge, Globe, Radio, Shield, Zap } from "lucide-react";
import { DeviceDetailSection, KvGrid } from "./device-detail-section";
import { DeviceFloorPlacement } from "./device-floor-placement";
import { DeviceStatusBadge } from "./device-status-badge";
import { DeviceTypeIcon } from "./device-type-icon";

type DeviceDetailViewProps = {
  device: MistDeviceDetail;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const DeviceDetailView = ({ device }: DeviceDetailViewProps) => {
  const [rawOpen, setRawOpen] = useState(false);
  const raw = device.raw;
  const type = device.type as MistDeviceType;
  const status = device.status as MistDeviceStatus;

  const ipStat = asRecord(raw.ip_stat);
  const radioStat = asRecord(raw.radio_stat);
  const portStat = asRecord(raw.port_stat);
  const lldp = asRecord(raw.lldp_stat);
  const envStat = asRecord(raw.env_stat);
  const bleStat = asRecord(raw.ble_stat);
  const redundancy = asRecord(raw.switch_redundancy);

  const clients = num(raw.num_clients);
  const cpuUtil = num(raw.cpu_util);
  const uptime = num(raw.uptime);
  const rxBps = num(raw.rx_bps);
  const txBps = num(raw.tx_bps);
  const rxBytes = num(raw.rx_bytes);
  const txBytes = num(raw.tx_bytes);

  const radioBands = ["band_6", "band_5", "band_24"] as const;
  const portKeys = Object.keys(portStat).filter((k) => portStat[k] && typeof portStat[k] === "object");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DeviceTypeIcon type={type} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{device.name}</h1>
              <DeviceStatusBadge status={status} />
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{device.id}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {device.model ? <Badge variant="outline">Model {device.model}</Badge> : null}
              {device.serial ? (
                <Badge variant="outline" className="font-mono">
                  SN {device.serial}
                </Badge>
              ) : null}
              {raw.version != null ? (
                <Badge variant="secondary">FW {String(raw.version)}</Badge>
              ) : null}
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setRawOpen(true)}>
          Show raw JSON
        </Button>
      </div>

      <DeviceFloorPlacement device={device} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            Clients
          </div>
          <p className="mt-1 text-2xl font-bold">{clients ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" />
            CPU util
          </div>
          <p className="mt-1 text-2xl font-bold">{cpuUtil != null ? `${cpuUtil}%` : "—"}</p>
          {cpuUtil != null ? <Progress className="mt-2 h-2" value={Math.min(100, cpuUtil)} /> : null}
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="h-4 w-4" />
            Uptime
          </div>
          <p className="mt-1 text-2xl font-bold">{uptime != null ? formatDurationSeconds(uptime) : "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            Throughput
          </div>
          <p className="mt-1 text-sm font-medium">
            RX {rxBps != null ? formatBps(rxBps) : "—"} · TX {txBps != null ? formatBps(txBps) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Totals {rxBytes != null ? formatBytes(rxBytes) : "—"} down /{" "}
            {txBytes != null ? formatBytes(txBytes) : "—"} up
          </p>
        </div>
      </div>

      <DeviceDetailSection title="Network" icon={Globe}>
        <KvGrid
          rows={[
            { label: "IPv4", value: String(ipStat.ip ?? raw.ip ?? device.ip ?? "—"), mono: true },
            { label: "Gateway", value: String(ipStat.gateway ?? "—"), mono: true },
            { label: "Netmask", value: String(ipStat.netmask ?? "—"), mono: true },
            { label: "DNS", value: Array.isArray(ipStat.dns) ? (ipStat.dns as string[]).join(", ") : "—" },
            { label: "External IP", value: String(raw.ext_ip ?? "—"), mono: true },
            { label: "DHCP server", value: String(ipStat.dhcp_server ?? "—"), mono: true },
          ]}
        />
      </DeviceDetailSection>

      {type === "ap" && Object.keys(radioStat).length > 0 ? (
        <DeviceDetailSection title="Radios" icon={Radio}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Band</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Util %</TableHead>
                <TableHead>Noise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {radioBands.map((band) => {
                const b = asRecord(radioStat[band]);
                if (!b || Object.keys(b).length === 0) return null;
                const util = num(b.util_all);
                return (
                  <TableRow key={band}>
                    <TableCell className="font-medium">{String(b.usage ?? band)}</TableCell>
                    <TableCell>{String(b.channel ?? "—")}</TableCell>
                    <TableCell>{String(b.num_clients ?? "—")}</TableCell>
                    <TableCell>
                      {util != null ? (
                        <div className="flex items-center gap-2">
                          <Progress className="h-2 w-24" value={Math.min(100, util)} />
                          <span className="text-xs">{util}%</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{b.noise_floor != null ? `${b.noise_floor} dBm` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DeviceDetailSection>
      ) : null}

      {portKeys.length > 0 ? (
        <DeviceDetailSection title="Wired ports" icon={Cable}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Duplex</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portKeys.map((key) => {
                const p = asRecord(portStat[key]);
                const up = p.up === true;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-mono text-xs">{key}</TableCell>
                    <TableCell>
                      <Badge variant={up ? "secondary" : "outline"} className={up ? "bg-emerald-50 text-emerald-800" : ""}>
                        {up ? "Up" : "Down"}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.speed != null ? `${p.speed} Mbps` : "—"}</TableCell>
                    <TableCell>{p.full_duplex === true ? "Full" : p.full_duplex === false ? "Half" : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DeviceDetailSection>
      ) : null}

      {Object.keys(lldp).length > 0 ? (
        <DeviceDetailSection title="Uplink (LLDP)" icon={Shield}>
          <KvGrid
            rows={[
              { label: "Neighbor", value: String(lldp.system_name ?? "—") },
              { label: "Port", value: String(lldp.port_id ?? lldp.port_desc ?? "—") },
              { label: "Chassis", value: String(lldp.chassis_id ?? "—"), mono: true },
              {
                label: "Power draw (mW)",
                value: lldp.power_draw != null ? String(lldp.power_draw) : "—",
              },
            ]}
          />
          {lldp.system_desc ? (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{String(lldp.system_desc)}</p>
          ) : null}
        </DeviceDetailSection>
      ) : null}

      <DeviceDetailSection title="Power" icon={Zap}>
        <KvGrid
          rows={[
            { label: "Source", value: String(raw.power_src ?? "—") },
            { label: "Budget (mW)", value: raw.power_budget != null ? String(raw.power_budget) : "—" },
            { label: "Available (mW)", value: raw.power_avail != null ? String(raw.power_avail) : "—" },
            { label: "Needed (mW)", value: raw.power_needed != null ? String(raw.power_needed) : "—" },
            {
              label: "Constrained",
              value: raw.power_constrained === true ? "Yes" : raw.power_constrained === false ? "No" : "—",
            },
            { label: "Operating mode", value: String(raw.power_opmode ?? "—") },
          ]}
        />
      </DeviceDetailSection>

      {Object.keys(envStat).length > 0 ? (
        <DeviceDetailSection title="Environment & sensors" icon={Activity}>
          <KvGrid
            rows={[
              { label: "CPU temp °C", value: envStat.cpu_temp != null ? String(envStat.cpu_temp) : "—" },
              { label: "Ambient °C", value: envStat.ambient_temp != null ? String(envStat.ambient_temp) : "—" },
              { label: "Accel X/Y/Z", value: `${envStat.accel_x ?? "—"}, ${envStat.accel_y ?? "—"}, ${envStat.accel_z ?? "—"}` },
            ]}
          />
        </DeviceDetailSection>
      ) : null}

      {Object.keys(bleStat).length > 0 ? (
        <DeviceDetailSection title="Bluetooth / beacon" icon={Bluetooth}>
          <KvGrid
            rows={[
              { label: "Beacon", value: bleStat.beacon_enabled === true ? "On" : "Off" },
              {
                label: "Major / minor",
                value: `${bleStat.major ?? "—"} / ${
                  bleStat.ibeacon_minor != null
                    ? String(bleStat.ibeacon_minor)
                    : Array.isArray(bleStat.minors)
                      ? `[${(bleStat.minors as number[]).slice(0, 4).join(", ")}…]`
                      : "—"
                }`,
              },
            ]}
          />
        </DeviceDetailSection>
      ) : null}

      {redundancy.num_redundant_aps != null ? (
        <DeviceDetailSection title="Redundancy" icon={Shield}>
          <p className="text-sm text-muted-foreground">
            Redundant APs nearby: <span className="font-semibold text-foreground">{String(redundancy.num_redundant_aps)}</span>
          </p>
        </DeviceDetailSection>
      ) : null}

      <DeviceDetailSection title="Lifecycle" icon={Gauge}>
        <KvGrid
          rows={[
            { label: "Last seen", value: formatUnixSeconds(raw.last_seen) },
            { label: "Created", value: formatUnixSeconds(raw.created_time) },
            { label: "Modified", value: formatUnixSeconds(raw.modified_time) },
            { label: "Mount", value: String(raw.mount ?? "—") },
          ]}
        />
      </DeviceDetailSection>

      <Modal
        isOpen={rawOpen}
        onClose={() => setRawOpen(false)}
        title="Raw device JSON"
        contentOnly
        className="max-w-4xl sm:max-w-4xl lg:max-w-5xl"
      >
        <pre className="max-h-[65vh] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
          {JSON.stringify(device.raw, null, 2)}
        </pre>
      </Modal>
    </div>
  );
};

export { DeviceDetailView };
