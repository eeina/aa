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

// --- Mongoose Schemas and Models ---

// 1. Content URLs (Pages)
const sitemapUrlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  parentSitemap: { type: String, default: null }, // The XML file this URL was found in
  extractedAt: { type: Date, default: Date.now },
  copied: { type: Boolean, default: false } // Track if the user has copied this URL
});

const SitemapUrl = mongoose.model('SitemapUrl', sitemapUrlSchema);

// 2. Sitemap XMLs (The sitemap files themselves)
const sitemapFileSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  foundAt: { type: Date, default: Date.now },
  type: { type: String, default: 'xml' } // Just to be explicit
});

const SitemapFile = mongoose.model('SitemapFile', sitemapFileSchema);

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
 * Recursively extracts content URLs AND sitemap URLs.
 * @param {string} sitemapUrl - The current XML file being processed
 * @param {Map<string, string>} extractedUrlMap - Map<ContentURL, ParentSitemapURL>
 * @param {Set<string>} extractedSitemapsSet - Set<SitemapURL>
 * @returns {Promise<void>}
 */
async function extractUrlsAndSitemaps(sitemapUrl, extractedUrlMap, extractedSitemapsSet) {
  try {
    const xmlContent = await fetchContent(sitemapUrl);
    const result = await parseStringPromise(xmlContent);

    // Check if it's a sitemap index file
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      for (const sitemapEntry of result.sitemapindex.sitemap) {
        const nestedSitemapUrl = sitemapEntry.loc?.[0];
        if (nestedSitemapUrl) {
          // It's a sitemap, add to set
          if (!extractedSitemapsSet.has(nestedSitemapUrl)) {
             extractedSitemapsSet.add(nestedSitemapUrl);
             // Recurse
             await extractUrlsAndSitemaps(nestedSitemapUrl, extractedUrlMap, extractedSitemapsSet);
          }
        }
      }
    } else if (result.urlset && result.urlset.url) { // Otherwise, it's a regular sitemap
      for (const urlEntry of result.urlset.url) {
        const loc = urlEntry.loc?.[0];
        if (loc && !extractedUrlMap.has(loc)) {
          // Map the URL to the sitemap that contained it
          extractedUrlMap.set(loc, sitemapUrl);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing sitemap ${sitemapUrl}:`, error.message);
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

  const allFoundUrlMap = new Map(); // Key: URL, Value: ParentSitemap
  const allFoundSitemaps = new Set(); // XML files
  
  // Add the root sitemap itself
  allFoundSitemaps.add(sitemapUrl);

  try {
    // 1. Extract all URLs and Sitemaps recursively
    await extractUrlsAndSitemaps(sitemapUrl, allFoundUrlMap, allFoundSitemaps);

    if (allFoundUrlMap.size === 0 && allFoundSitemaps.size === 0) {
      return res.status(404).json({ error: 'No content found in the provided sitemap.' });
    }

    // 2. Process Content URLs (Filter & Store)
    const newUrlsToStore = [];
    let patternSkippedCount = 0;
    let qualitySkippedCount = 0;

    const candidates = Array.from(allFoundUrlMap.keys());
    
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
            parentSitemap: allFoundUrlMap.get(res.url), // Add the parent sitemap association
            copied: false
          });
        } else if (res.status === 'pattern_skipped') {
          patternSkippedCount++;
        } else if (res.status === 'quality_skipped') {
          qualitySkippedCount++;
        }
      }
    }

    // 3. Store Content URLs
    let newUrlsStoredCount = 0;
    if (newUrlsToStore.length > 0) {
      try {
        const insertResult = await SitemapUrl.insertMany(newUrlsToStore, { ordered: false });
        newUrlsStoredCount = insertResult.length;
      } catch (bulkError) {
        if (bulkError.code === 11000) {
          newUrlsStoredCount = bulkError.result.nInserted;
        } else {
          throw bulkError;
        }
      }
    }

    // 4. Store Sitemap XMLs
    const newSitemapsToStore = Array.from(allFoundSitemaps).map(url => ({
      url,
      sourceDomain: websiteDomain
    }));

    let newSitemapsStoredCount = 0;
    if (newSitemapsToStore.length > 0) {
      try {
        const insertResult = await SitemapFile.insertMany(newSitemapsToStore, { ordered: false });
        newSitemapsStoredCount = insertResult.length;
      } catch (bulkError) {
        if (bulkError.code === 11000) {
          newSitemapsStoredCount = bulkError.result.nInserted;
        } 
      }
    }

    res.status(200).json({
      message: `Processed. Found ${allFoundUrlMap.size} URLs, ${allFoundSitemaps.size} Sitemaps. Stored ${newUrlsStoredCount} URLs.`,
      newUrlsStored: newUrlsStoredCount,
      newSitemapsStored: newSitemapsStoredCount,
      totalUrlsFound: allFoundUrlMap.size,
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
  const { domain, page = 1, limit = 50, status, search, parentSitemap } = req.query;
  
  const query = {};
  if (domain) query.sourceDomain = domain;
  if (parentSitemap) query.parentSitemap = parentSitemap;

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

// 2.5 Get Pending URLs as Text (Supports limit & search & parentSitemap)
app.get('/api/urls/pending', async (req, res) => {
  const { domain, limit, search, parentSitemap } = req.query;
  const query = { copied: false };
  
  if (domain) query.sourceDomain = domain;
  if (parentSitemap) query.parentSitemap = parentSitemap;

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
  const { urls, allPending, domain, search, parentSitemap } = req.body; 

  try {
    if (allPending) {
       // Mark ALL pending matching the query (including search if provided)
       const query = { copied: false };
       if (domain) query.sourceDomain = domain;
       if (parentSitemap) query.parentSitemap = parentSitemap;
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

// 3.5 Process Quality Check Batch
app.post('/api/sitemaps/process-quality', async (req, res) => {
  const { parentSitemap, limit } = req.body;

  if (!parentSitemap || !limit) {
    return res.status(400).json({ error: 'Sitemap URL and limit are required' });
  }

  try {
    // 1. Find pending URLs for this sitemap
    const candidates = await SitemapUrl.find({ 
      parentSitemap: parentSitemap, 
      copied: false 
    }).limit(parseInt(limit));

    if (candidates.length === 0) {
      return res.json({ text: '', count: 0, processedCount: 0 });
    }

    // 2. Run quality checks in parallel
    const results = await Promise.all(candidates.map(async (doc) => {
      const isQuality = await checkUrlQuality(doc.url);
      return { url: doc.url, isQuality };
    }));

    // 3. Filter passing URLs
    const passingUrls = results.filter(r => r.isQuality).map(r => r.url);
    
    // 4. Mark ALL candidates as copied (so we don't process failed ones again)
    // Note: User can always reset DB or we could add a 'skipped' status later, 
    // but per prompt requirements we just filter the output for copying.
    const allProcessedUrls = candidates.map(c => c.url);
    await SitemapUrl.updateMany(
      { url: { $in: allProcessedUrls } },
      { $set: { copied: true } }
    );

    const text = passingUrls.join('\n');
    res.json({ 
      text, 
      count: passingUrls.length, 
      processedCount: allProcessedUrls.length,
      urls: passingUrls
    });

  } catch (error) {
    console.error('Quality process error:', error);
    res.status(500).json({ error: 'Failed to process quality check' });
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
    await SitemapFile.deleteMany({});
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

// --- SITEMAP MANAGEMENT ENDPOINTS ---

// 7. Get Sitemaps (XML Files) with stats
app.get('/api/sitemaps', async (req, res) => {
  try {
    const sitemaps = await SitemapFile.find().sort({ foundAt: -1 }).lean();
    
    // Enrich with stats
    // Note: iterating and counting for each sitemap might be slow if there are hundreds of sitemaps.
    // Ideally use aggregation, but for simplicity/safety in this context we map.
    const data = await Promise.all(sitemaps.map(async (sm) => {
      const total = await SitemapUrl.countDocuments({ parentSitemap: sm.url });
      const pending = await SitemapUrl.countDocuments({ parentSitemap: sm.url, copied: false });
      return { 
        ...sm, 
        _id: sm._id.toString(), 
        stats: { total, pending, copied: total - pending } 
      };
    }));

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sitemaps' });
  }
});

// 8. Delete Sitemap
app.delete('/api/sitemaps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await SitemapFile.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete sitemap' });
  }
});

// 9. Get URLs belonging to a specific Sitemap
app.get('/api/sitemaps/:id/urls', async (req, res) => {
  try {
    const { id } = req.params;
    // Find the sitemap entry to get its URL string
    const sitemap = await SitemapFile.findById(id);
    
    if (!sitemap) {
      return res.status(404).json({ error: 'Sitemap not found' });
    }

    // Find all urls where parentSitemap equals the sitemap url
    const urls = await SitemapUrl.find({ parentSitemap: sitemap.url });
    const text = urls.map(u => u.url).join('\n');
    
    res.json({ 
      text, 
      count: urls.length, 
      urls: urls.map(u => u.url),
      sitemapUrl: sitemap.url
    });
  } catch (error) {
    console.error('Error fetching sitemap urls:', error);
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});


app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});