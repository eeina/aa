import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import zlib from 'zlib';
import cors from 'cors';

const app = express();
const port = 5000; // Changed to 5000 to avoid conflict with Frontend (Vite)

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
  copied: { type: Boolean, default: false } // Track if the user has copied this URL
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
 * Recursively extracts all URLs from a sitemap (or sitemap index).
 * @param {string} sitemapUrl
 * @param {Set<string>} extractedUrlsSet - A set to keep track of already extracted URLs to avoid duplicates.
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

// --- API Endpoints ---

// 1. Extract URLs from a specific Sitemap XML
app.post('/api/extract-sitemap', async (req, res) => {
  const { sitemapUrl } = req.body;

  if (!sitemapUrl) {
    return res.status(400).json({ error: 'Sitemap URL is required' });
  }

  let websiteDomain;
  try {
    websiteDomain = new URL(sitemapUrl).origin;
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  const allFoundUrls = new Set();

  try {
    // Directly process the provided sitemap URL
    await extractUrlsFromSitemap(sitemapUrl, allFoundUrls);

    if (allFoundUrls.size === 0) {
      return res.status(404).json({ error: 'No URLs found in the provided sitemap.' });
    }

    // Store new URLs in MongoDB
    const newUrlsToStore = [];
    for (const uniqueUrl of allFoundUrls) {
      newUrlsToStore.push({
        url: uniqueUrl,
        sourceDomain: websiteDomain,
        copied: false
      });
    }

    let newUrlsStoredCount = 0;
    if (newUrlsToStore.length > 0) {
      try {
        const insertResult = await SitemapUrl.insertMany(newUrlsToStore, { ordered: false });
        newUrlsStoredCount = insertResult.length;
      } catch (bulkError) {
        if (bulkError.code === 11000) {
          newUrlsStoredCount = bulkError.result.nInserted;
          console.warn(`Encountered duplicate URLs, inserted ${newUrlsStoredCount} new ones.`);
        } else {
          throw bulkError;
        }
      }
    }

    res.status(200).json({
      message: `Processed sitemap. Found ${allFoundUrls.size} URLs.`,
      newUrlsStored: newUrlsStoredCount,
      totalUrlsFound: allFoundUrls.size,
      domain: websiteDomain
    });

  } catch (error) {
    console.error('Sitemap extraction API error:', error);
    res.status(500).json({ error: 'Failed to process sitemap.', details: error.message });
  }
});

// 2. Get URLs (Paginated)
app.get('/api/urls', async (req, res) => {
  const { domain, page = 1, limit = 50 } = req.query;
  
  const query = {};
  if (domain) {
    query.sourceDomain = domain;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  try {
    const total = await SitemapUrl.countDocuments(query);
    const pending = await SitemapUrl.countDocuments({ ...query, copied: false });
    
    // Sort by _id descending to show newest first, or url ascending. 
    // Showing newest first helps user see "added" urls.
    // However, users usually like lists alphabetized. Let's do URL asc for consistency 
    // but the user asked to "add the url with them", implying aggregation.
    // Let's stick to alphabetical URL sort which is standard for sitemaps.
    const urls = await SitemapUrl.find(query)
      .sort({ url: 1 }) 
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      data: urls,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      },
      stats: {
        totalUrls: total,
        pending: pending,
        copied: total - pending
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});

// 2.5 Get Pending URLs as Text (Supports limit)
app.get('/api/urls/pending', async (req, res) => {
  const { domain, limit } = req.query;
  const query = { copied: false };
  if (domain) {
    query.sourceDomain = domain;
  }

  try {
    let queryBuilder = SitemapUrl.find(query).select('url').sort({ url: 1 });
    
    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        queryBuilder = queryBuilder.limit(limitNum);
      }
    }

    const urls = await queryBuilder;
    const text = urls.map(u => u.url).join('\n');
    res.json({ text, count: urls.length, urls: urls.map(u => u.url) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending URLs' });
  }
});

// 3. Mark URLs as copied
app.post('/api/mark-copied', async (req, res) => {
  const { urls, allPending, domain } = req.body; 

  try {
    if (allPending) {
       // Mark ALL pending matching the query
       const query = { copied: false };
       if (domain) query.sourceDomain = domain;
       await SitemapUrl.updateMany(query, { $set: { copied: true } });
    } else if (urls && Array.isArray(urls)) {
       // Mark specific list
       await SitemapUrl.updateMany(
        { url: { $in: urls } },
        { $set: { copied: true } }
      );
    } else {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update URL status' });
  }
});

// 4. Clear Database
app.post('/api/clear-database', async (req, res) => {
  try {
    await SitemapUrl.deleteMany({});
    res.json({ success: true, message: 'Database cleared successfully' });
  } catch (error) {
    console.error('Clear database error:', error);
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

// 5. Get Last Active Domain
app.get('/api/last-active-domain', async (req, res) => {
  try {
    const lastEntry = await SitemapUrl.findOne().sort({ extractedAt: -1 });
    if (lastEntry) {
      res.json({ domain: lastEntry.sourceDomain });
    } else {
      res.json({ domain: null });
    }
  } catch (error) {
    console.error('Error fetching last domain:', error);
    res.status(500).json({ error: 'Failed to fetch last domain' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});