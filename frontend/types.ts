export interface SitemapUrlItem {
  _id: string;
  url: string;
  copied: boolean;
  sourceDomain: string;
}

export interface SitemapFileItem {
  _id: string;
  url: string;
  sourceDomain: string;
  foundAt: string;
  stats?: {
    total: number;
    pending: number;
    copied: number;
  }
}