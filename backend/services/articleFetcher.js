/**
 * Article Fetcher Service
 * Fetches articles from all NewsAPI sources
 */

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const DISABLE_NEWSAPI_FALLBACK = process.env.DISABLE_NEWSAPI_FALLBACK === 'true';

/**
 * Fetch all available US sources from NewsAPI
 */
async function fetchAllSources() {
  if (!NEWSAPI_KEY) {
    throw new Error('NewsAPI key not configured');
  }

  try {
    const url = 'https://newsapi.org/v2/sources?country=us&language=en';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${NEWSAPI_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`NewsAPI sources endpoint returned ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !Array.isArray(data.sources)) {
      throw new Error('Invalid response from NewsAPI sources endpoint');
    }

    console.log(`[ARTICLE FETCHER] Found ${data.sources.length} US sources`);
    return data.sources.map(s => s.id);
  } catch (error) {
    console.error('[ARTICLE FETCHER] Error fetching sources:', error.message);
    
    // Fallback to known sources
    const fallbackSources = [
      'abc-news', 'associated-press', 'axios', 'bleacher-report', 'bloomberg',
      'breitbart-news', 'business-insider', 'buzzfeed', 'cbs-news', 'cnbc',
      'cnn', 'crypto-coins-news', 'engadget', 'entertainment-weekly', 'espn',
      'fortune', 'fox-news', 'fox-sports', 'google-news', 'hacker-news',
      'ign', 'mashable', 'msnbc', 'mtv-news', 'national-geographic',
      'national-review', 'nbc-news', 'new-scientist', 'newsweek', 'new-york-magazine',
      'nfl-news', 'nhl-news', 'politico', 'polygon', 'recode',
      'reddit-r-all', 'reuters', 'techcrunch', 'techradar', 'the-american-conservative',
      'the-hill', 'the-huffington-post', 'the-next-web', 'the-verge', 'the-wall-street-journal',
      'the-washington-post', 'the-washington-times', 'time', 'usa-today', 'vice-news',
      'wired'
    ];
    console.log(`[ARTICLE FETCHER] Using ${fallbackSources.length} fallback sources`);
    return fallbackSources;
  }
}

/**
 * Fetch articles from a group of sources
 * NewsAPI allows up to 20 sources per request
 */
async function fetchArticlesFromSources(sourceIds, pageSize = 20) {
  if (!NEWSAPI_KEY) {
    throw new Error('NewsAPI key not configured');
  }

  if (!sourceIds || sourceIds.length === 0) {
    return [];
  }

  try {
    const sourcesParam = sourceIds.join(',');
    const url = `https://newsapi.org/v2/top-headlines?sources=${sourcesParam}&pageSize=${pageSize}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${NEWSAPI_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[ARTICLE FETCHER] Error fetching from sources ${sourcesParam}: ${response.status} ${errorText}`);
      return [];
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !Array.isArray(data.articles)) {
      console.error(`[ARTICLE FETCHER] Invalid response for sources ${sourcesParam}`);
      return [];
    }

    console.log(`[ARTICLE FETCHER] Fetched ${data.articles.length} articles from ${sourceIds.length} sources`);
    return data.articles;
  } catch (error) {
    console.error(`[ARTICLE FETCHER] Error fetching articles:`, error.message);
    return [];
  }
}

/**
 * Fetch articles from all US sources
 * Batches requests to stay within NewsAPI limits (20 sources per request)
 */
async function fetchAllArticles() {
  // 🚨 EMERGENCY KILL SWITCH: Block categorization job if NewsAPI is disabled
  // This prevents the cron job from hitting rate limits
  if (DISABLE_NEWSAPI_FALLBACK) {
    console.error('🚫 [NEWSAPI DISABLED] Categorization job blocked. Set DISABLE_NEWSAPI_FALLBACK=false to re-enable.');
    console.error('   This prevents automatic cache refresh until you manually re-enable NewsAPI.');
    throw new Error('NewsAPI fallback is disabled. Cannot fetch articles for categorization.');
  }
  
  console.log('[ARTICLE FETCHER] Starting to fetch articles from all sources...');
  
  const sources = await fetchAllSources();
  
  if (sources.length === 0) {
    console.warn('[ARTICLE FETCHER] No sources available');
    return [];
  }

  // Split sources into groups of 20 (NewsAPI limit)
  const sourceGroups = [];
  for (let i = 0; i < sources.length; i += 20) {
    sourceGroups.push(sources.slice(i, i + 20));
  }

  console.log(`[ARTICLE FETCHER] Fetching from ${sources.length} sources in ${sourceGroups.length} batches...`);

  // Fetch articles from each group with delays to avoid rate limits
  const allArticles = [];
  
  for (let i = 0; i < sourceGroups.length; i++) {
    const group = sourceGroups[i];
    console.log(`[ARTICLE FETCHER] Batch ${i + 1}/${sourceGroups.length}: Fetching from ${group.length} sources...`);
    
    const articles = await fetchArticlesFromSources(group, 20);
    allArticles.push(...articles);
    
    // Delay between batches to avoid rate limiting (except for last batch)
    if (i < sourceGroups.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  console.log(`[ARTICLE FETCHER] ✅ Total articles fetched: ${allArticles.length}`);
  
  // Deduplicate by URL
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.url, article])).values()
  );
  
  console.log(`[ARTICLE FETCHER] ✅ Unique articles after deduplication: ${uniqueArticles.length}`);
  
  return uniqueArticles;
}

/**
 * Normalize article data from NewsAPI format
 */
function normalizeArticle(article) {
  return {
    title: article.title || '',
    description: article.description || '',
    url: article.url || '',
    publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
    source: {
      id: article.source?.id || '',
      name: article.source?.name || 'Unknown'
    },
    urlToImage: article.urlToImage || '',
    author: article.author || '',
    content: article.content || ''
  };
}

module.exports = {
  fetchAllSources,
  fetchArticlesFromSources,
  fetchAllArticles,
  normalizeArticle
};
