import 'dotenv/config'; 
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
app.use(express.json({ limit: '500mb' })); // Increased limit for large restores

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sitemap_db';
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
      headers: { 'User-Agent': 'SitemapExtractorBot/1.0' },
      timeout: 10000 
    });
    let data = response.data;
    if (response.headers['content-encoding'] === 'gzip') {
      data = await new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, dezipped) => err ? reject(err) : resolve(dezipped));
      });
    }
    return data.toString('utf8');
  } catch (error) { throw new Error(`Fetch failed: ${url}`); }
}

async function checkUrlQuality(url) {
  try {
    const html = await fetchContent(url);
    const $ = cheerio.load(html);
    const rating = parseFloat($('.mm-recipes-review-bar__rating').first().text().trim());
    const reviews = parseInt($('.mm-recipes-review-bar__comment-count').first().text().replace(/[^0-9]/g, ''), 10);
    return !isNaN(rating) && !isNaN(reviews) && rating >= 4.0 && reviews >= 50;
  } catch (error) { return false; }
}

async function extractUrlsAndSitemaps(sitemapUrl, extractedUrlMap, extractedSitemapsSet) {
  try {
    const xmlContent = await fetchContent(sitemapUrl);
    const result = await parseStringPromise(xmlContent);
    if (result.sitemapindex?.sitemap) {
      for (const entry of result.sitemapindex.sitemap) {
        const nested = entry.loc?.[0];
        if (nested && !extractedSitemapsSet.has(nested)) {
          extractedSitemapsSet.add(nested);
          await extractUrlsAndSitemaps(nested, extractedUrlMap, extractedSitemapsSet);
        }
      }
    } else if (result.urlset?.url) {
      for (const entry of result.urlset.url) {
        const loc = entry.loc?.[0];
        if (loc && !extractedUrlMap.has(loc)) extractedUrlMap.set(loc, sitemapUrl);
      }
    }
  } catch (e) {}
}

// --- API Endpoints ---
app.post('/api/extract-sitemap', async (req, res) => {
  const { sitemapUrl, filterPattern, enableQualityFilter } = req.body;
  try {
    const websiteDomain = new URL(sitemapUrl).origin;
    const allFoundUrlMap = new Map();
    const allFoundSitemaps = new Set([sitemapUrl]);
    await extractUrlsAndSitemaps(sitemapUrl, allFoundUrlMap, allFoundSitemaps);

    const candidates = Array.from(allFoundUrlMap.keys());
    const toStore = [];
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const results = await Promise.all(batch.map(async (url) => {
        if (filterPattern && !url.includes(filterPattern)) return null;
        if (enableQualityFilter && !(await checkUrlQuality(url))) return null;
        return { url, sourceDomain: websiteDomain, parentSitemap: allFoundUrlMap.get(url), copied: false };
      }));
      toStore.push(...results.filter(Boolean));
    }

    if (toStore.length) await SitemapUrl.insertMany(toStore, { ordered: false }).catch(() => {});
    const sitemaps = Array.from(allFoundSitemaps).map(url => ({ url, sourceDomain: websiteDomain }));
    if (sitemaps.length) await SitemapFile.insertMany(sitemaps, { ordered: false }).catch(() => {});

    res.json({ message: 'Success', totalUrlsFound: allFoundUrlMap.size, newUrlsStored: toStore.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/urls', async (req, res) => {
  const { page = 1, limit = 50, status, search, parentSitemap } = req.query;
  const query = {};
  if (parentSitemap) query.parentSitemap = parentSitemap;
  if (status === 'pending') query.copied = false;
  else if (status === 'copied') query.copied = true;
  if (search) query.url = { $regex: search, $options: 'i' };

  const [total, data, totalDb, pendingDb] = await Promise.all([
    SitemapUrl.countDocuments(query),
    SitemapUrl.find(query).sort({ url: 1 }).skip((page - 1) * limit).limit(limit),
    SitemapUrl.countDocuments({}),
    SitemapUrl.countDocuments({ copied: false })
  ]);

  res.json({ data, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }, stats: { totalUrls: totalDb, pending: pendingDb, copied: totalDb - pendingDb } });
});

app.get('/api/urls/pending', async (req, res) => {
  const { limit, search, parentSitemap } = req.query;
  const query = { copied: false };
  if (parentSitemap) query.parentSitemap = parentSitemap;
  if (search) query.url = { $regex: search, $options: 'i' };
  const docs = await SitemapUrl.find(query).select('url').sort({ url: 1 }).limit(parseInt(limit) || 0);
  res.json({ text: docs.map(d => d.url).join('\n'), count: docs.length, urls: docs.map(d => d.url) });
});

app.post('/api/mark-copied', async (req, res) => {
  const { urls, allPending, search, parentSitemap } = req.body;
  const query = { copied: false };
  if (allPending) {
    if (parentSitemap) query.parentSitemap = parentSitemap;
    if (search) query.url = { $regex: search, $options: 'i' };
    await SitemapUrl.updateMany(query, { $set: { copied: true } });
  } else {
    await SitemapUrl.updateMany({ url: { $in: urls } }, { $set: { copied: true } });
  }
  res.json({ success: true });
});

app.post('/api/sitemaps/process-quality', async (req, res) => {
  const { parentSitemap, limit } = req.body;
  const candidates = await SitemapUrl.find({ parentSitemap, copied: false }).limit(parseInt(limit));
  if (!candidates.length) return res.json({ count: 0 });

  const results = await Promise.all(candidates.map(async doc => ({ url: doc.url, isQuality: await checkUrlQuality(doc.url) })));
  const passing = results.filter(r => r.isQuality).map(r => r.url);
  await SitemapUrl.updateMany({ url: { $in: candidates.map(c => c.url) } }, { $set: { copied: true } });
  res.json({ text: passing.join('\n'), count: passing.length, processedCount: candidates.length });
});

app.delete('/api/urls/:id', async (req, res) => {
  await SitemapUrl.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post('/api/clear-database', async (req, res) => {
  await SitemapUrl.deleteMany({});
  await SitemapFile.deleteMany({});
  res.json({ success: true });
});

app.get('/api/sitemaps', async (req, res) => {
  const sitemaps = await SitemapFile.find().sort({ foundAt: -1 }).lean();
  const data = await Promise.all(sitemaps.map(async (sm) => {
    const total = await SitemapUrl.countDocuments({ parentSitemap: sm.url });
    const pending = await SitemapUrl.countDocuments({ parentSitemap: sm.url, copied: false });
    return { ...sm, stats: { total, pending, copied: total - pending } };
  }));
  res.json({ data });
});

app.get('/api/sitemaps/:id/urls', async (req, res) => {
  const sm = await SitemapFile.findById(req.params.id);
  const urls = await SitemapUrl.find({ parentSitemap: sm.url });
  res.json({ text: urls.map(u => u.url).join('\n'), count: urls.length });
});

// --- Backup & Restore (Handles 1M+ Records via Streaming) ---

app.get('/api/backup', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=sitemap_backup.json');
  
  res.write('{"sitemaps":');
  const sitemaps = await SitemapFile.find().lean();
  res.write(JSON.stringify(sitemaps));
  
  res.write(',"urls":[');
  const cursor = SitemapUrl.find().lean().cursor();
  let first = true;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!first) res.write(',');
    res.write(JSON.stringify(doc));
    first = false;
  }
  res.write(']}');
  res.end();
});

app.post('/api/restore', async (req, res) => {
  const { sitemaps, urls, clearFirst } = req.body;
  try {
    if (clearFirst) {
      await SitemapUrl.deleteMany({});
      await SitemapFile.deleteMany({});
    }

    if (sitemaps?.length) {
      await SitemapFile.insertMany(sitemaps, { ordered: false }).catch(() => {});
    }

    if (urls?.length) {
      // Process 1M URLs in chunks of 5000 to avoid Mongo payload limits
      const CHUNK = 5000;
      for (let i = 0; i < urls.length; i += CHUNK) {
        const batch = urls.slice(i, i + CHUNK).map(u => {
           const { _id, ...rest } = u; // Exclude original _id to avoid collisions if necessary
           return rest;
        });
        await SitemapUrl.insertMany(batch, { ordered: false }).catch(() => {});
      }
    }
    res.json({ success: true, count: urls?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`Backend: http://localhost:${port}`));
