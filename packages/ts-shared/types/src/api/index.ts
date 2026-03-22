// API route and controller types
import type { Request, Response } from 'express';
import type { ApiResponse, PaginationMeta } from '../common/index.js';
import type {
  MistOrgSite,
  MistDeviceDetail,
  MistSiteSummary,
  InventoryDevice,
  ClientStats,
  ClientSummary,
} from '../mist/index.js';

// Express controller types
export type ControllerFunction = (req: Request, res: Response) => Promise<void>;

// API response types for specific endpoints
export interface SitesApiResponse extends ApiResponse<MistOrgSite[]> {
  meta: PaginationMeta;
}

export interface SiteSummaryApiResponse extends ApiResponse<MistSiteSummary> { }

export interface DevicesApiResponse extends ApiResponse<MistDeviceDetail[]> { }

export interface DeviceDetailApiResponse extends ApiResponse<MistDeviceDetail> { }

export interface InventoryApiResponse extends ApiResponse<InventoryDevice[]> {
  meta: PaginationMeta;
}

export interface ClientStatsApiResponse extends ApiResponse<{
  clients: ClientStats[];
  summary: ClientSummary;
}> { }

// Request parameter types
export interface SiteParams {
  siteId: string;
}

export interface DeviceParams extends SiteParams {
  deviceId: string;
}

// Query parameter types
export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface DeviceQuery {
  type?: string;
  status?: string;
}

export interface InventoryQuery extends PaginationQuery {
  siteId?: string;
  type?: string;
  connected?: string;
}

export interface ClientStatsQuery {
  duration?: string;
  limit?: string;
  apId?: string;
}

// Service method return types (for type inference)
export type GetOrgSitesReturn = Promise<{
  sites: MistOrgSite[];
  meta: PaginationMeta;
}>;

export type GetSiteSummaryReturn = Promise<MistSiteSummary>;

export type GetDeviceListReturn = Promise<MistDeviceDetail[]>;

export type GetDeviceDetailReturn = Promise<MistDeviceDetail | null>;

export type GetOrgInventoryReturn = Promise<{
  devices: InventoryDevice[];
  meta: PaginationMeta;
}>;

export type GetSiteClientStatsReturn = Promise<{
  clients: ClientStats[];
  summary: ClientSummary;
}>;