"use client";

import { useState, useEffect } from "react";
import type { MistDeviceDetail, MistDeviceStatus, MistDeviceType, ClientStats, InventoryDevice, ApiResponse } from "@/types/mist";
import { useQueueService } from "@/lib/queue/queue-service";
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
import { Activity, Bluetooth, Cable, Cpu, Gauge, Globe, Info, Radio, Shield, Zap, Users, Package } from "lucide-react";
import { DeviceDetailSection, KvGrid } from "./device-detail-section";
import { DeviceFloorPlacement } from "./device-floor-placement";
import { DeviceStatusBadge } from "./device-status-badge";
import { DeviceTypeIcon } from "./device-type-icon";

type DeviceDetailViewProps = {
  device: MistDeviceDetail;
  siteId?: string;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const DeviceDetailView = ({ device, siteId }: DeviceDetailViewProps) => {
  const [rawOpen, setRawOpen] = useState(false);
  const queueService = useQueueService();
  const [inventoryDetails, setInventoryDetails] = useState<InventoryDevice | null>(null);
  const [clientStats, setClientStats] = useState<ClientStats[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [connectedClientsInfoOpen, setConnectedClientsInfoOpen] = useState(false);
  
  const raw = device.raw;
  const type = device.type as MistDeviceType;
  const status = device.status as MistDeviceStatus;

  // Load inventory details
  useEffect(() => {
    if (!siteId) return;
    
    const loadInventoryDetails = async () => {
      setLoadingInventory(true);
      try {
        const q = new URLSearchParams();
        q.set("siteId", siteId);
        q.set("limit", "100");
        if (device.serial) {
          q.set("serial", device.serial);
        }
        if (device.model) {
          q.set("model", device.model);
        }
        if (device.mac) {
          q.set("mac", device.mac);
        }
        const response = await queueService.request<ApiResponse<InventoryDevice[]>>(`/api/mist/inventory?${q.toString()}`);
        if (response.ok && Array.isArray(response.data)) {
          const devices = response.data;
          const inventoryDevice =
            devices.find((d) => d.id === device.id) ||
            devices.find((d) => d.serial && device.serial && d.serial === device.serial) ||
            devices.find((d) => d.mac && device.mac && d.mac === device.mac) ||
            devices[0];
          setInventoryDetails(inventoryDevice || null);
        }
      } catch (error) {
        console.warn('Failed to load inventory details:', error);
      } finally {
        setLoadingInventory(false);
      }
    };

    loadInventoryDetails();
  }, [device.id, device.mac, siteId, queueService]);

  // Load client stats for AP devices
  useEffect(() => {
    if (!siteId || device.type !== 'ap') return;

    const loadClientStats = async () => {
      setLoadingClients(true);
      try {
        const response = await queueService.request<ApiResponse<{clients: ClientStats[]}>>(`/api/mist/sites/${siteId}/client-stats?apId=${device.id}&limit=100`);
        if (response.ok && response.data?.clients) {
          setClientStats(response.data.clients);
        }
      } catch (error) {
        console.warn('Failed to load client stats:', error);
      } finally {
        setLoadingClients(false);
      }
    };

    loadClientStats();
  }, [device.id, device.type, siteId, queueService]);

  const ipStat = asRecord(raw.ip_stat);
  const radioStat = asRecord(raw.radio_stat);
  const portStat = asRecord(raw.port_stat);
  const lldp = asRecord(raw.lldp_stat);
  const envStat = asRecord(raw.env_stat);
  const bleStat = asRecord(raw.ble_stat);
  const redundancy = asRecord(raw.switch_redundancy);

  /** Client count from AP stats payload (`num_clients`); may differ from rows in `/stats/clients`. */
  const numClientsFromApStats = num(raw.num_clients);
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
          <p className="mt-1 text-2xl font-bold">{numClientsFromApStats ?? "—"}</p>
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

      {/* Inventory Details Section */}
      {inventoryDetails && (
        <DeviceDetailSection title="Inventory Details" icon={Package}>
          <KvGrid
            rows={[
              { label: "Serial", value: inventoryDetails.serial || "—", mono: true },
              { 
                label: "Connected", 
                value: (
                  <Badge variant={inventoryDetails.connected ? "default" : "secondary"}>
                    {inventoryDetails.connected ? "Online" : "Offline"}
                  </Badge>
                )
              },
              { 
                label: "Last Seen", 
                value: inventoryDetails.modified_time 
                  ? formatUnixSeconds(inventoryDetails.modified_time) 
                  : "—" 
              },
              { 
                label: "Profile", 
                value: inventoryDetails.deviceprofile_id || "Default" 
              },
              { 
                label: "Created", 
                value: inventoryDetails.created_time 
                  ? formatUnixSeconds(inventoryDetails.created_time) 
                  : "—" 
              },
              { label: "Site ID", value: inventoryDetails.site_id || "—", mono: true },
            ]}
          />
        </DeviceDetailSection>
      )}

      {/* Connected Clients Section (for APs) */}
      {device.type === 'ap' && (
        <>
          <DeviceDetailSection title="Connected Clients" icon={Users}>
            {loadingClients ? (
              <div className="text-sm text-muted-foreground">Loading clients...</div>
            ) : clientStats.length > 0 ? (
              <div className="space-y-2">
                {clientStats.slice(0, 10).map(client => (
                  <div key={client.mac} className="flex justify-between text-sm border-b pb-2">
                    <div>
                      <div className="font-medium">{client.hostname || client.mac}</div>
                      <div className="text-xs text-muted-foreground">
                        {client.ip && <span className="mr-2">{client.ip}</span>}
                        {client.ssid && <span className="mr-2">SSID: {client.ssid}</span>}
                        {client.is_guest && <Badge variant="outline" className="text-xs">Guest</Badge>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {client.rssi && <div>{client.rssi} dBm</div>}
                      {client.band && <div>{client.band}</div>}
                      {client.last_seen && (
                        <div>{formatUnixSeconds(client.last_seen)}</div>
                      )}
                    </div>
                  </div>
                ))}
                {clientStats.length > 10 && (
                  <div className="text-xs text-muted-foreground text-center pt-2">
                    ... and {clientStats.length - 10} more clients
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>No devices connected</span>
                {numClientsFromApStats != null && numClientsFromApStats > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Why the client list can be empty"
                    onClick={() => setConnectedClientsInfoOpen(true)}
                  >
                    <Info className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            )}
          </DeviceDetailSection>

          <Modal
            isOpen={connectedClientsInfoOpen}
            onClose={() => setConnectedClientsInfoOpen(false)}
            title="Connected clients"
            contentOnly
            className="sm:max-w-lg"
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              Device stats report {numClientsFromApStats ?? 0} client(s) on this AP, but no rows matched this access point
              in Mist&apos;s <span className="font-mono text-xs">GET /sites/…/stats/clients</span> (after filtering by
              device id). Clients may be on another page of results, field names may differ in Mist, or stats may be
              briefly out of sync. Try again after a minute or check <strong>Clients → Wi‑Fi Clients</strong> in the Mist
              dashboard for this site.
            </p>
          </Modal>
        </>
      )}

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
