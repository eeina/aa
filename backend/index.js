import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
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
      },
      timeout: 10000 // 10s timeout per request
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
    // console.error(`Error fetching content from ${url}:`, error.message);
    throw new Error(`Failed to fetch content from ${url}`);
  }
}

/**
 * Checks if a URL meets the quality criteria: Rating >= 4.0 and Reviews >= 50
 * @param {string} url 
 * @returns {Promise<boolean>}
 */
async function checkUrlQuality(url) {
  try {
    const html = await fetchContent(url);
    const $ = cheerio.load(html);

    // Selectors based on provided HTML:
    // Rating class: .mm-recipes-review-bar__rating
    // Review count class: .mm-recipes-review-bar__comment-count
    
    const ratingText = $('.mm-recipes-review-bar__rating').first().text().trim();
    const reviewText = $('.mm-recipes-review-bar__comment-count').first().text().trim();

    // Parse Rating (e.g. "5.0")
    const rating = parseFloat(ratingText);

    // Parse Reviews (e.g. "6 Reviews" -> 6)
    const reviews = parseInt(reviewText.replace(/[^0-9]/g, ''), 10);

    // Criteria: Rating >= 4.0 AND Reviews >= 50
    if (!isNaN(rating) && !isNaN(reviews) && rating >= 4.0 && reviews >= 50) {
      return true;
    }

    return false;
  } catch (error) {
    // If we can't fetch or parse, we assume it doesn't meet criteria (or is broken)
    return false;
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
  const { sitemapUrl, filterPattern, enableQualityFilter } = req.body;

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
    // 1. Extract all URLs from sitemap structure first
    await extractUrlsFromSitemap(sitemapUrl, allFoundUrls);

    if (allFoundUrls.size === 0) {
      return res.status(404).json({ error: 'No URLs found in the provided sitemap.' });
    }

    // 2. Filter Process
    const newUrlsToStore = [];
    let patternSkippedCount = 0;
    let qualitySkippedCount = 0;

    // Convert Set to Array for processing
    const candidates = Array.from(allFoundUrls);

    // We process sequentially or in small batches to check quality if enabled
    // because checking 1000 URLs at once will crash/timeout.
    
    // Batch size for quality check
    const BATCH_SIZE = 10; 
    
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (uniqueUrl) => {
        // A. Basic Pattern Filter
        if (filterPattern && filterPattern.trim() !== '' && !uniqueUrl.includes(filterPattern)) {
          return { status: 'pattern_skipped', url: uniqueUrl };
        }

        // B. Content Quality Filter (Optional)
        if (enableQualityFilter) {
          const meetsQuality = await checkUrlQuality(uniqueUrl);
          if (!meetsQuality) {
            return { status: 'quality_skipped', url: uniqueUrl };
          }
        }

        // C. Success
        return { status: 'keep', url: uniqueUrl };
      });

      const results = await Promise.all(batchPromises);

      for (const res of results) {
        if (res.status === 'keep') {
          newUrlsToStore.push({
            url: res.url,
            sourceDomain: websiteDomain,
            copied: false
          });
        } else if (res.status === 'pattern_skipped') {
          patternSkippedCount++;
        } else if (res.status === 'quality_skipped') {
          qualitySkippedCount++;
        }
      }
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
      message: `Processed. Found ${allFoundUrls.size}. Stored ${newUrlsStoredCount}.`,
      newUrlsStored: newUrlsStoredCount,
      totalUrlsFound: allFoundUrls.size,
      skipped: patternSkippedCount + qualitySkippedCount,
      details: {
        patternSkipped: patternSkippedCount,
        qualitySkipped: qualitySkippedCount
      },
      domain: websiteDomain
    });

  } catch (error) {
    console.error('Sitemap extraction API error:', error);
    res.status(500).json({ error: 'Failed to process sitemap.', details: error.message });
  }
});

// 2. Get URLs (Paginated & Filtered)
app.get('/api/urls', async (req, res) => {
  const { domain, page = 1, limit = 50, status, search } = req.query;
  
  const query = {};
  if (domain) {
    query.sourceDomain = domain;
  }

  // Status Filter
  if (status === 'pending') {
    query.copied = false;
  } else if (status === 'copied') {
    query.copied = true;
  }

  // Search Filter (Regex)
  if (search) {
    query.url = { $regex: search, $options: 'i' };
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  try {
    const total = await SitemapUrl.countDocuments(query);
    // Get total stats for the whole DB regardless of filter, so the boxes remain accurate
    const totalDb = await SitemapUrl.countDocuments({});
    const pendingDb = await SitemapUrl.countDocuments({ copied: false });
    
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
        totalUrls: totalDb,
        pending: pendingDb,
        copied: totalDb - pendingDb
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});

// 2.5 Get Pending URLs as Text (Supports limit & search)
app.get('/api/urls/pending', async (req, res) => {
  const { domain, limit, search } = req.query;
  const query = { copied: false };
  
  if (domain) {
    query.sourceDomain = domain;
  }

  if (search) {
    query.url = { $regex: search, $options: 'i' };
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
  const { urls, allPending, domain, search } = req.body; 

  try {
    if (allPending) {
       // Mark ALL pending matching the query (including search if provided)
       const query = { copied: false };
       if (domain) query.sourceDomain = domain;
       if (search) query.url = { $regex: search, $options: 'i' };
       
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

// 4. Delete Single URL
app.delete('/api/urls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await SitemapUrl.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete URL' });
  }
});

// 5. Clear Database
app.post('/api/clear-database', async (req, res) => {
  try {
    await SitemapUrl.deleteMany({});
    res.json({ success: true, message: 'Database cleared successfully' });
  } catch (error) {
    console.error('Clear database error:', error);
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

// 6. Get Last Active Domain
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