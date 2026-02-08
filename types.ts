export interface CrawlConfig {
  url: string;
  maxDepth: number;
  maxPages: number;
  delay: number;
  respectRobots: boolean;
  renderJS: boolean;
  includeAssets: boolean;
}

export type DiscoverySource = 'anchor' | 'img_src' | 'script_src' | 'link_tag' | 'form_action' | 'meta_tag' | 'api_call' | 'robots_txt' | 'sitemap';

export interface LinkNode {
  id: string; // URL
  url: string;
  title?: string;
  depth: number;
  parentId?: string;
  status: '200' | '301' | '302' | '403' | '404' | '500' | 'pending' | 'scanning';
  type: 'internal' | 'external' | 'resource';
  contentType: 'text/html' | 'application/json' | 'image/jpeg' | 'image/png' | 'text/css' | 'application/javascript' | 'application/pdf' | 'other';
  size?: number; // in KB
  responseTime?: number;
  errorReason?: string;
  headers?: Record<string, string>;
  detectedTech?: string[];
  discoverySource?: DiscoverySource;
  scanned?: boolean; // New: Tracks if we have entered this link and extracted its children
}

export interface CrawlStats {
  totalLinks: number;
  scannedPages: number;
  queuedPages: number;
  errors: number;
  assetsFound: number;
  totalSizeKB: number;
  startTime: number;
  currentUrl: string;
  depthReached: number;
}

export enum CrawlStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export type ScanStage = 'INIT' | 'DNS' | 'ROBOTS' | 'DOM_PARSE' | 'JS_EXEC' | 'ASSET_EXTRACT' | 'FINALIZE';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'system';
  details?: string;
}
