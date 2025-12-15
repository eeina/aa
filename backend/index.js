import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import cheerio from 'cheerio';
import zlib from 'zlib';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // For parsing application/json requests

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sitemap_db';

// Log the connection attempt (masking password for security)
const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
console.log(`Attempting to connect to MongoDB at: ${maskedUri}`);

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// --- Mongoose Schema and Model ---
const sitemapUrlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  extractedAt: { type: Date, default: Date.now },
});

const SitemapUrl = mongoose.model('SitemapUrl', sitemapUrlSchema);

// --- Helper Functions for Sitemap Processing ---

/**
 * Fetches content from a URL, handling gzipped responses and setting User-Agent.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchContent(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'SitemapExtractorBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const contentType = response.headers['content-type'];
    const contentEncoding = response.headers['content-encoding'];

    let data = response.data;

    if (contentEncoding === 'gzip' || contentType?.includes('application/x-gzip')) {
      data = await new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, dezipped) => {
          if (err) reject(err);
          resolve(dezipped);
        });
      });
    }
    return data.toString('utf8');
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error.message);
    throw new Error(`Failed to fetch content from ${url}`);
  }
}

/**
 * Extracts sitemap URLs from robots.txt content.
 * @param {string} robotsTxtContent
 * @returns {string[]}
 */
function getSitemapUrlsFromRobotsTxt(robotsTxtContent) {
  const sitemapUrls = [];
  const lines = robotsTxtContent.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith('sitemap:')) {
      const sitemapUrl = trimmedLine.substring('sitemap:'.length).trim();
      if (sitemapUrl) {
        sitemapUrls.push(sitemapUrl);
      }
    }
  }
  return sitemapUrls;
}

/**
 * Extracts sitemap URLs from HTML content by looking for <link rel="sitemap"> tags.
 * @param {string} htmlContent
 * @returns {string[]}
 */
function getSitemapUrlsFromHtml(htmlContent) {
  const sitemapUrls = [];
  const $ = cheerio.load(htmlContent);
  $('link[rel="sitemap"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      sitemapUrls.push(href);
    }
  });
  return sitemapUrls;
}

/**
 * Recursively extracts all URLs from a sitemap (or sitemap index).
 * @param {string} sitemapUrl
 * @param {Set<string>} extractedUrlsSet - A set to keep track of already extracted URLs to avoid duplicates in recursive calls.
 * @returns {Promise<string[]>}
 */
async function extractUrlsFromSitemap(sitemapUrl, extractedUrlsSet) {
  try {
    const xmlContent = await fetchContent(sitemapUrl);
    const result = await parseStringPromise(xmlContent);

    const urls = [];

    // Check if it's a sitemap index file
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      for (const sitemapEntry of result.sitemapindex.sitemap) {
        const nestedSitemapUrl = sitemapEntry.loc?.[0];
        if (nestedSitemapUrl) {
          const nestedUrls = await extractUrlsFromSitemap(nestedSitemapUrl, extractedUrlsSet);
          urls.push(...nestedUrls);
        }
      }
    } else if (result.urlset && result.urlset.url) { // Otherwise, it's a regular sitemap
      for (const urlEntry of result.urlset.url) {
        const loc = urlEntry.loc?.[0];
        if (loc && !extractedUrlsSet.has(loc)) {
          urls.push(loc);
          extractedUrlsSet.add(loc);
        }
      }
    }
    return urls;
  } catch (error) {
    console.error(`Error processing sitemap ${sitemapUrl}:`, error.message);
    return []; // Return empty array on error for this sitemap
  }
}

// --- API Endpoint ---
app.post('/api/extract-sitemap', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let websiteDomain;
  try {
    websiteDomain = new URL(url).origin;
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  const allFoundUrls = new Set();
  let sitemapDiscoveryUrls = [];

  try {
    // 1. Try to find sitemaps from robots.txt
    const robotsTxtUrl = `${websiteDomain}/robots.txt`;
    try {
      const robotsTxtContent = await fetchContent(robotsTxtUrl);
      sitemapDiscoveryUrls = getSitemapUrlsFromRobotsTxt(robotsTxtContent);
    } catch (robotsTxtError) {
      console.warn(`No robots.txt found or accessible for ${websiteDomain}`);
      // Continue to HTML parsing if robots.txt fails
    }

    // 2. If no sitemaps from robots.txt, try from HTML
    if (sitemapDiscoveryUrls.length === 0) {
      try {
        const htmlContent = await fetchContent(websiteDomain);
        sitemapDiscoveryUrls = getSitemapUrlsFromHtml(htmlContent);
      } catch (htmlFetchError) {
        console.warn(`Could not fetch HTML for ${websiteDomain}: ${htmlFetchError.message}`);
      }
    }

    if (sitemapDiscoveryUrls.length === 0) {
        return res.status(404).json({ error: 'No sitemaps found for the provided URL.' });
    }

    // 3. Extract URLs from discovered sitemaps
    const extractedIndividualUrls = [];
    const processedSitemaps = new Set(); // To avoid processing the same sitemap URL multiple times

    for (const sitemapEntryUrl of sitemapDiscoveryUrls) {
      if (!processedSitemaps.has(sitemapEntryUrl)) {
        const urlsFromThisSitemap = await extractUrlsFromSitemap(sitemapEntryUrl, allFoundUrls);
        extractedIndividualUrls.push(...urlsFromThisSitemap);
        processedSitemaps.add(sitemapEntryUrl);
      }
    }
    
    // Note: allFoundUrls is populated by reference inside extractUrlsFromSitemap

    // 4. Store new URLs in MongoDB
    const newUrlsToStore = [];
    for (const uniqueUrl of allFoundUrls) {
      newUrlsToStore.push({
        url: uniqueUrl,
        sourceDomain: websiteDomain,
      });
    }

    let newUrlsStoredCount = 0;
    if (newUrlsToStore.length > 0) {
      try {
        const insertResult = await SitemapUrl.insertMany(newUrlsToStore, { ordered: false });
        newUrlsStoredCount = insertResult.length;
      } catch (bulkError) {
        // Handle duplicate key errors gracefully
        if (bulkError.code === 11000) {
          newUrlsStoredCount = bulkError.result.nInserted;
          console.warn(`Encountered duplicate URLs, inserted ${newUrlsStoredCount} new ones.`);
        } else {
          throw bulkError; // Re-throw other errors
        }
      }
    }

    res.status(200).json({
      message: `Successfully processed sitemaps for ${websiteDomain}.`,
      newUrlsStored: newUrlsStoredCount,
      totalUrlsFound: allFoundUrls.size,
    });

  } catch (error) {
    console.error('Sitemap extraction API error:', error);
    res.status(500).json({ error: 'Failed to process sitemap.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});