export interface SitemapUrlItem {
  _id: string;
  url: string;
  copied: boolean;
  sourceDomain: string;
  qualityStatus: 'unchecked' | 'approved' | 'rejected';
  rating?: number;
  reviews?: number;
}