import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
import zlib from 'zlib';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import JSONStream from 'JSONStream';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });

app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '100mb' })); // Increased limit for JSON bodies

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sitemap_db';

const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
console.log(`Attempting to connect to MongoDB at: ${maskedUri}`);

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// --- Mongoose Schemas and Models ---

const sitemapUrlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  parentSitemap: { type: String, default: null },
  extractedAt: { type: Date, default: Date.now },
  copied: { type: Boolean, default: false }
});

const SitemapUrl = mongoose.model('SitemapUrl', sitemapUrlSchema);

const sitemapFileSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  foundAt: { type: Date, default: Date.now },
  type: { type: String, default: 'xml' }
});

const SitemapFile = mongoose.model('SitemapFile', sitemapFileSchema);

// --- Helper Functions ---

async function fetchContent(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'SitemapExtractorBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
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
    throw new Error(`Failed to fetch content from ${url}`);
  }
}

async function checkUrlQuality(url) {
  try {
    const html = await fetchContent(url);
    const $ = cheerio.load(html);
    
    const ratingText = $('.mm-recipes-review-bar__rating').first().text().trim();
    const reviewText = $('.mm-recipes-review-bar__comment-count').first().text().trim();

    const rating = parseFloat(ratingText);
    const reviews = parseInt(reviewText.replace(/[^0-9]/g, ''), 10);

    if (!isNaN(rating) && !isNaN(reviews) && rating >= 4.0 && reviews >= 50) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function extractUrlsAndSitemaps(sitemapUrl, extractedUrlMap, extractedSitemapsSet) {
  try {
    const xmlContent = await fetchContent(sitemapUrl);
    const result = await parseStringPromise(xmlContent);

    if (result.sitemapindex && result.sitemapindex.sitemap) {
      for (const sitemapEntry of result.sitemapindex.sitemap) {
        const nestedSitemapUrl = sitemapEntry.loc?.[0];
        if (nestedSitemapUrl) {
          if (!extractedSitemapsSet.has(nestedSitemapUrl)) {
             extractedSitemapsSet.add(nestedSitemapUrl);
             await extractUrlsAndSitemaps(nestedSitemapUrl, extractedUrlMap, extractedSitemapsSet);
          }
        }
      }
    } else if (result.urlset && result.urlset.url) {
      for (const urlEntry of result.urlset.url) {
        const loc = urlEntry.loc?.[0];
        if (loc && !extractedUrlMap.has(loc)) {
          extractedUrlMap.set(loc, sitemapUrl);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing sitemap ${sitemapUrl}:`, error.message);
  }
}

// --- API Endpoints ---

// 1. Extract URLs
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

  const allFoundUrlMap = new Map(); 
  const allFoundSitemaps = new Set(); 
  
  allFoundSitemaps.add(sitemapUrl);

  try {
    await extractUrlsAndSitemaps(sitemapUrl, allFoundUrlMap, allFoundSitemaps);

    if (allFoundUrlMap.size === 0 && allFoundSitemaps.size === 0) {
      return res.status(404).json({ error: 'No content found in the provided sitemap.' });
    }

    const newUrlsToStore = [];
    let patternSkippedCount = 0;
    let qualitySkippedCount = 0;

    const candidates = Array.from(allFoundUrlMap.keys());
    const BATCH_SIZE = 10; 
    
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (uniqueUrl) => {
        if (filterPattern && filterPattern.trim() !== '' && !uniqueUrl.includes(filterPattern)) {
          return { status: 'pattern_skipped', url: uniqueUrl };
        }
        if (enableQualityFilter) {
          const meetsQuality = await checkUrlQuality(uniqueUrl);
          if (!meetsQuality) {
            return { status: 'quality_skipped', url: uniqueUrl };
          }
        }
        return { status: 'keep', url: uniqueUrl };
      });

      const results = await Promise.all(batchPromises);

      for (const res of results) {
        if (res.status === 'keep') {
          newUrlsToStore.push({
            url: res.url,
            sourceDomain: websiteDomain,
            parentSitemap: allFoundUrlMap.get(res.url),
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
        } else {
          throw bulkError;
        }
      }
    }

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

// 2. Get URLs
app.get('/api/urls', async (req, res) => {
  const { domain, page = 1, limit = 50, status, search, parentSitemap } = req.query;
  
  const query = {};
  if (domain) query.sourceDomain = domain;
  if (parentSitemap) query.parentSitemap = parentSitemap;

  if (status === 'pending') {
    query.copied = false;
  } else if (status === 'copied') {
    query.copied = true;
  }

  if (search) {
    query.url = { $regex: search, $options: 'i' };
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  try {
    const total = await SitemapUrl.countDocuments(query);
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

// 2.5 Get Pending URLs
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
       const query = { copied: false };
       if (domain) query.sourceDomain = domain;
       if (parentSitemap) query.parentSitemap = parentSitemap;
       if (search) query.url = { $regex: search, $options: 'i' };
       
       await SitemapUrl.updateMany(query, { $set: { copied: true } });
    } else if (urls && Array.isArray(urls)) {
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
    const candidates = await SitemapUrl.find({ 
      parentSitemap: parentSitemap, 
      copied: false 
    }).limit(parseInt(limit));

    if (candidates.length === 0) {
      return res.json({ text: '', count: 0, processedCount: 0 });
    }

    const results = await Promise.all(candidates.map(async (doc) => {
      const isQuality = await checkUrlQuality(doc.url);
      return { url: doc.url, isQuality };
    }));

    const passingUrls = results.filter(r => r.isQuality).map(r => r.url);
    
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

// 7. Get Sitemaps
app.get('/api/sitemaps', async (req, res) => {
  try {
    const sitemaps = await SitemapFile.find().sort({ foundAt: -1 }).lean();
    
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
    const sitemap = await SitemapFile.findById(id);
    
    if (!sitemap) {
      return res.status(404).json({ error: 'Sitemap not found' });
    }

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

// --- BACKUP & RESTORE SYSTEM (Streaming) ---

// 10. Streaming Backup (Download JSON)
app.get('/api/backup', async (req, res) => {
  try {
    // Increase timeout for large backups
    req.setTimeout(600000); // 10 minutes

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="sitemap_manager_backup.json"');

    // Start JSON Object
    res.write('{"sitemaps":[');

    // Stream Sitemaps
    let isFirst = true;
    for await (const doc of SitemapFile.find().lean().cursor()) {
      if (!isFirst) res.write(',');
      isFirst = false;
      res.write(JSON.stringify(doc));
    }

    res.write('],"urls":[');

    // Stream URLs
    isFirst = true;
    for await (const doc of SitemapUrl.find().lean().cursor()) {
      if (!isFirst) res.write(',');
      isFirst = false;
      res.write(JSON.stringify(doc));
    }

    // End JSON Object
    res.write(']}');
    res.end();

  } catch (error) {
    console.error('Backup error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
    else res.end();
  }
});

// 11. Streaming Restore (Upload JSON)
app.post('/api/restore', upload.single('backupFile'), async (req, res) => {
  // Disable timeout for this request to handle large files (30 minutes)
  req.setTimeout(1800000); 

  const { clearBefore } = req.body;
  const filePath = req.file?.path;

  if (!filePath) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Use native MongoDB collection for bulk inserts to avoid Mongoose overhead/OOM on large datasets
  const handleInsert = async (Model, batch) => {
    try {
        if (!batch || batch.length === 0) return 0;
        // insertMany with ordered: false allows continuing even if duplicates exist
        const result = await Model.collection.insertMany(batch, { ordered: false });
        return result.insertedCount;
    } catch (err) {
        // 11000 is duplicate key error
        if (err.code === 11000) {
           return err.result?.nInserted || 0;
        }
        // Check for bulk write errors where some operations might have succeeded
        if (err.writeErrors) {
            return err.result?.nInserted || 0;
        }
        console.error('Bulk insert critical error:', err.message);
        return 0;
    }
  };

  try {
    if (clearBefore === 'true') {
      console.log('Clearing database...');
      await SitemapUrl.deleteMany({});
      await SitemapFile.deleteMany({});
      console.log('Database cleared.');
    }

    const stats = { sitemaps: 0, urls: 0 };

    console.log('Starting restore process...');

    // --- PHASE 1: SITEMAPS ---
    console.log('Restoring sitemaps...');
    const sitemapStream = fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(JSONStream.parse('sitemaps.*'));

    let sitemapBatch = [];
    const SITEMAP_BATCH_SIZE = 500;

    for await (const doc of sitemapStream) {
       delete doc._id; // Let Mongo generate new IDs or use existing if provided and valid, but safer to regenerate if schema mismatch
       sitemapBatch.push(doc);
       if (sitemapBatch.length >= SITEMAP_BATCH_SIZE) {
         stats.sitemaps += await handleInsert(SitemapFile, sitemapBatch);
         sitemapBatch = [];
       }
    }
    if (sitemapBatch.length > 0) {
      stats.sitemaps += await handleInsert(SitemapFile, sitemapBatch);
    }
    console.log(`Restored ${stats.sitemaps} sitemaps.`);

    // --- PHASE 2: URLS ---
    console.log('Restoring URLs...');
    // Create a NEW stream for the second pass
    const urlStream = fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(JSONStream.parse('urls.*'));
    
    let urlBatch = [];
    // Increase batch size for native driver performance
    const URL_BATCH_SIZE = 10000; 

    for await (const doc of urlStream) {
      delete doc._id;
      urlBatch.push(doc);
      if (urlBatch.length >= URL_BATCH_SIZE) {
        stats.urls += await handleInsert(SitemapUrl, urlBatch);
        urlBatch = [];
        console.log(`Processed ${stats.urls} URLs so far...`);
      }
    }
    if (urlBatch.length > 0) {
      stats.urls += await handleInsert(SitemapUrl, urlBatch);
    }

    // Clean up temp file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    console.log(`Restore complete. Sitemaps: ${stats.sitemaps}, URLs: ${stats.urls}`);
    res.json({ success: true, message: `Restore complete. Imported ${stats.sitemaps} sitemaps and ${stats.urls} URLs.` });

  } catch (error) {
    console.error('Restore critical error:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Restore failed: ' + error.message });
  }
});


app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});