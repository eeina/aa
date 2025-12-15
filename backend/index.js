import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
import zlib from 'zlib';
import cors from 'cors';

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sitemap_db';
const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
console.log(`Attempting to connect to MongoDB at: ${maskedUri}`);

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// --- Mongoose Schema ---
const sitemapUrlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  sourceDomain: { type: String, required: true },
  extractedAt: { type: Date, default: Date.now },
  copied: { type: Boolean, default: false },
  // Status flow: 'unchecked' -> 'approved' (Pending) OR 'rejected'
  qualityStatus: { type: String, enum: ['unchecked', 'approved', 'rejected'], default: 'unchecked' },
  rating: { type: Number },
  reviews: { type: Number }
});

const SitemapUrl = mongoose.model('SitemapUrl', sitemapUrlSchema);

// --- Helpers ---

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

    // Selectors matching user provided HTML
    const ratingText = $('.mm-recipes-review-bar__rating').first().text().trim();
    const reviewText = $('.mm-recipes-review-bar__comment-count').first().text().trim();

    const rating = parseFloat(ratingText);
    const reviews = parseInt(reviewText.replace(/[^0-9]/g, ''), 10);

    const valid = !isNaN(rating) && !isNaN(reviews) && rating >= 4.0 && reviews >= 50;
    
    return { valid, rating, reviews };
  } catch (error) {
    return { valid: false, rating: 0, reviews: 0 };
  }
}

async function extractUrlsFromSitemap(sitemapUrl, extractedUrlsSet) {
  try {
    const xmlContent = await fetchContent(sitemapUrl);
    const result = await parseStringPromise(xmlContent);
    const urls = [];

    if (result.sitemapindex && result.sitemapindex.sitemap) {
      for (const sitemapEntry of result.sitemapindex.sitemap) {
        const nestedSitemapUrl = sitemapEntry.loc?.[0];
        if (nestedSitemapUrl) {
          const nestedUrls = await extractUrlsFromSitemap(nestedSitemapUrl, extractedUrlsSet);
          urls.push(...nestedUrls);
        }
      }
    } else if (result.urlset && result.urlset.url) {
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
    return [];
  }
}

// --- Endpoints ---

// 1. Extract (No quality check here, just storage)
app.post('/api/extract-sitemap', async (req, res) => {
  const { sitemapUrl, filterPattern } = req.body;

  if (!sitemapUrl) return res.status(400).json({ error: 'Sitemap URL is required' });

  let websiteDomain;
  try {
    websiteDomain = new URL(sitemapUrl).origin;
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  const allFoundUrls = new Set();

  try {
    await extractUrlsFromSitemap(sitemapUrl, allFoundUrls);

    if (allFoundUrls.size === 0) {
      return res.status(404).json({ error: 'No URLs found in the provided sitemap.' });
    }

    const newUrlsToStore = [];
    let patternSkippedCount = 0;

    for (const uniqueUrl of allFoundUrls) {
      if (filterPattern && filterPattern.trim() !== '' && !uniqueUrl.includes(filterPattern)) {
        patternSkippedCount++;
        continue;
      }
      newUrlsToStore.push({
        url: uniqueUrl,
        sourceDomain: websiteDomain,
        copied: false,
        qualityStatus: 'unchecked' // Default state
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
      message: `Processed. Found ${allFoundUrls.size}. Stored ${newUrlsStoredCount}.`,
      newUrlsStored: newUrlsStoredCount,
      totalUrlsFound: allFoundUrls.size,
      skipped: patternSkippedCount,
      domain: websiteDomain
    });

  } catch (error) {
    console.error('Sitemap extraction API error:', error);
    res.status(500).json({ error: 'Failed to process sitemap.', details: error.message });
  }
});

// 2. Scan Batch for Quality
app.post('/api/scan-quality-batch', async (req, res) => {
  const { limit = 10 } = req.body;
  
  try {
    // Find unchecked URLs
    const urlsToScan = await SitemapUrl.find({ qualityStatus: 'unchecked' }).limit(limit);
    
    if (urlsToScan.length === 0) {
      return res.json({ processed: 0, remaining: 0 });
    }

    let approved = 0;
    let rejected = 0;

    const results = await Promise.all(urlsToScan.map(async (doc) => {
      const { valid, rating, reviews } = await checkUrlQuality(doc.url);
      return {
        id: doc._id,
        status: valid ? 'approved' : 'rejected',
        rating,
        reviews
      };
    }));

    // Bulk update results
    const operations = results.map(r => ({
      updateOne: {
        filter: { _id: r.id },
        update: { 
          $set: { 
            qualityStatus: r.status,
            rating: r.rating,
            reviews: r.reviews
          } 
        }
      }
    }));

    await SitemapUrl.bulkWrite(operations);

    approved = results.filter(r => r.status === 'approved').length;
    rejected = results.filter(r => r.status === 'rejected').length;

    const remaining = await SitemapUrl.countDocuments({ qualityStatus: 'unchecked' });

    res.json({
      processed: urlsToScan.length,
      approved,
      rejected,
      remaining
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// 3. Get URLs
app.get('/api/urls', async (req, res) => {
  const { domain, page = 1, limit = 50, status, search } = req.query;
  
  const query = {};
  if (domain) query.sourceDomain = domain;

  // VIEW FILTERS
  if (status === 'unchecked') {
    query.qualityStatus = 'unchecked';
  } else if (status === 'pending') {
    // Pending means: Approved Quality AND Not Copied
    query.qualityStatus = 'approved';
    query.copied = false;
  } else if (status === 'rejected') {
    query.qualityStatus = 'rejected';
  } else if (status === 'copied') {
    query.copied = true;
  } else {
    // 'all' view: Show everything except rejected usually, but let's just show valid stuff
    // Or simpler: Show everything
  }

  if (search) query.url = { $regex: search, $options: 'i' };

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  try {
    const total = await SitemapUrl.countDocuments(query);
    
    // Global Stats
    const totalDb = await SitemapUrl.countDocuments({});
    const uncheckedDb = await SitemapUrl.countDocuments({ qualityStatus: 'unchecked' });
    const approvedPendingDb = await SitemapUrl.countDocuments({ qualityStatus: 'approved', copied: false });
    const rejectedDb = await SitemapUrl.countDocuments({ qualityStatus: 'rejected' });
    const copiedDb = await SitemapUrl.countDocuments({ copied: true });

    const urls = await SitemapUrl.find(query)
      .sort({ url: 1 }) 
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      data: urls,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      stats: {
        totalUrls: totalDb,
        unchecked: uncheckedDb,
        pending: approvedPendingDb, // "Pending" for user actions
        rejected: rejectedDb,
        copied: copiedDb
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});

// 4. Get Pending (Approved & Uncopied) URLs as Text
app.get('/api/urls/pending', async (req, res) => {
  const { domain, limit, search } = req.query;
  
  // Pending for Copying = Approved + Not Copied
  // (We assume user doesn't want to copy Unchecked ones unless they check them first)
  const query = { copied: false, qualityStatus: 'approved' };
  
  if (domain) query.sourceDomain = domain;
  if (search) query.url = { $regex: search, $options: 'i' };

  try {
    let queryBuilder = SitemapUrl.find(query).select('url').sort({ url: 1 });
    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) queryBuilder = queryBuilder.limit(limitNum);
    }
    const urls = await queryBuilder;
    const text = urls.map(u => u.url).join('\n');
    res.json({ text, count: urls.length, urls: urls.map(u => u.url) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending URLs' });
  }
});

// 5. Mark Copied
app.post('/api/mark-copied', async (req, res) => {
  const { urls, allPending, domain, search } = req.body; 

  try {
    if (allPending) {
       const query = { copied: false, qualityStatus: 'approved' };
       if (domain) query.sourceDomain = domain;
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

app.post('/api/clear-database', async (req, res) => {
  try {
    await SitemapUrl.deleteMany({});
    res.json({ success: true, message: 'Database cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});