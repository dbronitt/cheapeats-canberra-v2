/**
 * EatClub integration
 * Scrapes deals and images from EatClub website
 * https://eatclub.com.au
 */

import * as cheerio from 'cheerio';

export interface EatClubVenue {
  name: string;
  url: string;
  slug: string;
  imageUrl?: string;
  imageUrls?: string[];
  dealTitle?: string;
  dealDescription?: string;
  dealValidUntil?: string;
  address?: string;
  suburb?: string;
  cuisine?: string;
}

/**
 * Extract venue slug from EatClub URL
 * Example: https://eatclub.com.au/venue/zaiqah -> zaiqah
 */
export function extractEatClubSlug(url: string): string | null {
  try {
    const match = url.match(/eatclub\.com\.au\/venue\/([^\/\?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if an image URL is an EatClub logo
 */
export function isEatClubLogo(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Check for EatClub domain with logo-related paths
  if (lowerUrl.includes('eatclub')) {
    const logoKeywords = ['logo', 'icon', 'brand', 'mark', 'symbol'];
    if (logoKeywords.some(keyword => lowerUrl.includes(keyword))) {
      return true;
    }
    // Check if URL path suggests it's a logo (e.g., /logos/, /branding/, /assets/logo)
    if (lowerUrl.match(/\/logos?\//) || 
        lowerUrl.match(/\/branding\//) || 
        lowerUrl.match(/\/assets\/.*logo/) ||
        lowerUrl.match(/\/images\/.*logo/)) {
      return true;
    }
  }
  
  // Check for common logo filename patterns
  const logoPatterns = [
    /eatclub.*logo/i,
    /logo.*eatclub/i,
    /eatclub-logo/i,
    /logo-eatclub/i,
    /eatclub-icon/i,
    /icon-eatclub/i,
    /eatclub.*brand/i,
    /brand.*eatclub/i,
  ];
  
  return logoPatterns.some(pattern => pattern.test(lowerUrl));
}

/**
 * Filter out EatClub logo images from an array of image URLs
 */
export function filterEatClubLogos(imageUrls: string[]): string[] {
  return imageUrls.filter(url => !isEatClubLogo(url));
}

/**
 * Scrape EatClub venue page for deals and images
 * Includes retry logic and better headers to avoid 403 errors
 */
export async function scrapeEatClubVenue(venueUrl: string, retries: number = 3): Promise<EatClubVenue | null> {
  const maxRetries = retries;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      attempt++;
      
      // More realistic browser headers to avoid 403 errors
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://eatclub.com.au/',
      };

      console.log(`   📡 [DEBUG] Attempt ${attempt}/${maxRetries}: Fetching EatClub venue: ${venueUrl}`);
      
      const response = await fetch(venueUrl, {
        headers,
        redirect: 'follow',
      });

      console.log(`   📊 [DEBUG] HTTP Response Status: ${response.status} ${response.statusText}`);

      if (response.status === 403) {
        console.log(`   ⚠️  [DEBUG] HTTP 403 Forbidden on attempt ${attempt}`);
        if (attempt < maxRetries) {
          // Exponential backoff: wait 2s, 4s, 8s
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          console.log(`   ⏸️  [DEBUG] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          console.log(`   ❌ [DEBUG] Max retries reached. EatClub blocked the request.`);
          return null;
        }
      }

      if (!response.ok) {
        console.log(`   ⚠️  [DEBUG] HTTP ${response.status}: ${response.statusText}`);
        if (response.status >= 500 && attempt < maxRetries) {
          // Retry on server errors
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          console.log(`   ⏸️  [DEBUG] Server error, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      const imageUrls: string[] = [];
      let name = '';
      let dealTitle: string | undefined;
      let dealDescription: string | undefined;
      let address: string | undefined;
      let suburb: string | undefined;
      let cuisine: string | undefined;

      // Extract name from title or h1
      const title = $('title').text() || $('h1').first().text();
      name = title.replace(/\s*[-|]\s*EatClub.*$/i, '').trim();

      // Extract images
      // Try og:image meta tag
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage && !isEatClubLogo(ogImage)) {
        imageUrls.push(ogImage);
      }

      // Try to find images in the page
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !src.includes('logo') && !src.includes('icon')) {
          const fullUrl = src.startsWith('http') ? src : new URL(src, venueUrl).toString();
          if (!isEatClubLogo(fullUrl) && !imageUrls.includes(fullUrl)) {
            imageUrls.push(fullUrl);
          }
        }
      });

      // Extract deal information
      // Look for deal-related elements
      $('[class*="deal"], [class*="offer"], [class*="special"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          if (!dealTitle) {
            dealTitle = text.substring(0, 100);
          }
          if (!dealDescription) {
            dealDescription = text;
          }
        }
      });

      // Try to find deal in structured data
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const jsonData = JSON.parse($(el).html() || '{}');
          if (jsonData['@type'] === 'Restaurant' || jsonData['@type'] === 'FoodEstablishment') {
            if (jsonData.name && !name) {
              name = jsonData.name;
            }
            if (jsonData.image) {
              const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
              images.forEach((img: string) => {
                if (!isEatClubLogo(img) && !imageUrls.includes(img)) {
                  imageUrls.push(img);
                }
              });
            }
            if (jsonData.address) {
              if (typeof jsonData.address === 'string') {
                address = jsonData.address;
              } else {
                address = jsonData.address.streetAddress;
                suburb = jsonData.address.addressLocality;
              }
            }
            if (jsonData.servesCuisine) {
              cuisine = Array.isArray(jsonData.servesCuisine) 
                ? jsonData.servesCuisine[0] 
                : jsonData.servesCuisine;
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      });

      // Look for deal text in common locations
      const dealSelectors = [
        '.deal', '.offer', '.special', '[data-deal]',
        '.promotion', '.discount', '.voucher'
      ];
      
      for (const selector of dealSelectors) {
        const dealEl = $(selector).first();
        if (dealEl.length) {
          const dealText = dealEl.text().trim();
          if (dealText && dealText.length > 5) {
            dealDescription = dealText;
            if (!dealTitle) {
              dealTitle = dealText.substring(0, 50);
            }
            break;
          }
        }
      }

      const slug = extractEatClubSlug(venueUrl);
      
      // Filter out any remaining logo images
      const filteredImageUrls = filterEatClubLogos(imageUrls);
      
      console.log(`   ✅ [DEBUG] Successfully scraped EatClub venue page`);
      
      return {
        name: name || 'Unknown',
        url: venueUrl,
        slug: slug || '',
        imageUrls: filteredImageUrls.length > 0 ? filteredImageUrls : undefined,
        imageUrl: filteredImageUrls[0],
        dealTitle: dealTitle || undefined,
        dealDescription: dealDescription || undefined,
        address,
        suburb,
        cuisine,
      };
    } catch (error) {
      console.error(`   ❌ [DEBUG] Error scraping EatClub venue ${venueUrl} (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        // Retry on network errors
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`   ⏸️  [DEBUG] Network error, waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      } else {
        console.error(`   ❌ [DEBUG] Max retries reached. Failed to scrape EatClub venue.`);
        return null;
      }
    }
  }
  
  // If we exit the loop without returning, all retries failed
  console.error(`   ❌ [DEBUG] All ${maxRetries} attempts failed for ${venueUrl}`);
  return null;
}

/**
 * Search EatClub for restaurants in Canberra using Puppeteer
 * This uses browser automation to handle JavaScript-rendered content
 */
export async function searchEatClubCanberra(): Promise<EatClubVenue[]> {
  let browser: any = null;
  
  try {
    // Dynamically import Puppeteer (only when needed)
    const puppeteer = await import('puppeteer');
    
    // EatClub venues URL for Canberra
    const searchUrl = 'https://eatclub.com.au/venues/canberra';
    
    console.log('   🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Intercept network requests to find API endpoints
    const apiUrls: string[] = [];
    page.on('response', (response: any) => {
      const url = response.url();
      // Look for API calls that might return restaurant data
      if (url.includes('api') || url.includes('venue') || url.includes('restaurant') || 
          url.includes('search') || response.headers()['content-type']?.includes('json')) {
        apiUrls.push(url);
      }
    });
    
    console.log('   📍 Navigating to EatClub search page...');
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for page to fully load - try multiple strategies
    console.log('   ⏳ Waiting for content to load...');
    
    // Wait for network requests to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if we found any API endpoints
    if (apiUrls.length > 0) {
      console.log(`   🔌 Found ${apiUrls.length} potential API endpoints`);
      console.log(`   Sample APIs: ${apiUrls.slice(0, 3).join(', ')}`);
    }
    
    // Strategy 2: Wait for specific content selectors that might appear
    const contentSelectors = [
      'a[href*="/venue/"]',
      '[data-testid*="restaurant"]',
      '[data-testid*="venue"]',
      '.restaurant',
      '.venue',
      '[class*="restaurant"]',
      '[class*="venue"]',
      'article',
      '[role="article"]',
      '[class*="card"]',
      'img[src*="eatclub"]', // Restaurant images
    ];
    
    let contentFound = false;
    for (const selector of contentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        console.log(`   ✅ Found content with selector: ${selector}`);
        contentFound = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!contentFound) {
      console.log('   ⏳ Waiting additional time for dynamic content...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Navigate through pages using URL parameters
    // The page shows "Displaying 20 of 160" so we need to go through multiple pages
    const allVenueUrls = new Set<string>();
    let currentPage = 1;
    const maxPages = 10; // 160 restaurants / 20 per page = 8 pages max, but we'll check up to 10
    
    // Extract URLs from first page
    console.log(`   📄 Extracting restaurants from page ${currentPage}...`);
    let pageVenueUrls = await page.evaluate(() => {
      const urls = new Set<string>();
      const allLinks = document.querySelectorAll('a[href*="/venue/"]');
      allLinks.forEach((link: any) => {
        const href = link.getAttribute('href');
        if (href) {
          const venueMatch = href.match(/\/venue\/([a-z0-9-]+)(?:\/|$|\?|#)/i);
          if (venueMatch && venueMatch[1]) {
            const slug = venueMatch[1];
            const categoryWords = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'canberra', 
                                   'cuisine', 'category', 'venues', 'venue', 'search', 'location'];
            if (!categoryWords.includes(slug.toLowerCase())) {
              let fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `https://eatclub.com.au${href}` : `https://eatclub.com.au/${href}`);
              const cleanMatch = fullUrl.match(/(https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+)/i);
              if (cleanMatch && cleanMatch[1]) {
                urls.add(cleanMatch[1]);
              }
            }
          }
        }
      });
      return Array.from(urls);
    });
    
    pageVenueUrls.forEach(url => allVenueUrls.add(url));
    console.log(`   ✅ Found ${pageVenueUrls.length} restaurants on page ${currentPage} (total so far: ${allVenueUrls.size})`);
    
    // Navigate through additional pages
    while (currentPage < maxPages) {
      currentPage++;
      const nextPageUrl = `${searchUrl}?page=${currentPage}`;
      
      console.log(`   📄 Navigating to page ${currentPage}: ${nextPageUrl}`);
      try {
        await page.goto(nextPageUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract URLs from this page
        try {
          pageVenueUrls = await page.evaluate(() => {
            const urls = new Set<string>();
            const allLinks = document.querySelectorAll('a[href*="/venue/"]');
            allLinks.forEach((link: any) => {
              const href = link.getAttribute('href');
              if (href) {
                const venueMatch = href.match(/\/venue\/([a-z0-9-]+)(?:\/|$|\?|#)/i);
                if (venueMatch && venueMatch[1]) {
                  const slug = venueMatch[1];
                  const categoryWords = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'canberra', 
                                         'cuisine', 'category', 'venues', 'venue', 'search', 'location'];
                  if (!categoryWords.includes(slug.toLowerCase())) {
                    let fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `https://eatclub.com.au${href}` : `https://eatclub.com.au/${href}`);
                    const cleanMatch = fullUrl.match(/(https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+)/i);
                    if (cleanMatch && cleanMatch[1]) {
                      urls.add(cleanMatch[1]);
                    }
                  }
                }
              }
            });
            return Array.from(urls);
          });
        } catch (error) {
          console.log(`   ⚠️  Error extracting from page ${currentPage}: ${error}`);
          pageVenueUrls = [];
        }
        
        if (pageVenueUrls.length === 0) {
          console.log(`   ⚠️  No restaurants found on page ${currentPage}, stopping pagination`);
          break;
        }
        
        pageVenueUrls.forEach(url => allVenueUrls.add(url));
        console.log(`   ✅ Found ${pageVenueUrls.length} restaurants on page ${currentPage} (total so far: ${allVenueUrls.size})`);
        
        // Rate limiting between pages
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`   ⚠️  Error loading page ${currentPage}: ${error}`);
        break;
      }
    }
    
    console.log(`   📊 Finished pagination. Total unique restaurants found: ${allVenueUrls.size}`);
    
    // Try switching from map to list view if available
    try {
      const listViewButton = await page.$('button:has-text("List"), button:has-text("List View"), [aria-label*="list"]');
      if (listViewButton) {
        console.log('   📋 Switching to list view...');
        await listViewButton.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (e) {
      // No list view button
    }
    
    // Note: venueUrls will be extracted below using page.evaluate()
    
    // Scroll down to trigger lazy loading
    console.log('   📜 Scrolling page to load more content...');
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 5000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Wait after scrolling for lazy-loaded content
    console.log('   ⏸️  Pausing again for 5 seconds after scrolling...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Debug: Check what's actually on the page
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`   📄 Page title: ${pageTitle}`);
    console.log(`   🔗 Current URL: ${pageUrl}`);
    
    // Debug: Check page content and look for restaurant cards
    const pageContent = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const allHrefs = links.map((link: any) => link.getAttribute('href')).filter(Boolean);
      
      // Look for individual restaurant venue links (not category pages)
      const restaurantLinks = allHrefs.filter((href: string) => {
        // Pattern: /venue/{restaurant-slug} (not /venues/...)
        return /\/venue\/[a-z0-9-]+$/i.test(href) && !href.includes('/venues/');
      });
      
      // Also check for restaurant names/cards in the DOM
      const possibleRestaurantElements = document.querySelectorAll(
        '[class*="restaurant"], [class*="venue"], [class*="card"], article, [data-testid*="restaurant"], [data-testid*="venue"]'
      );
      
      return {
        totalLinks: links.length,
        restaurantLinks: restaurantLinks.length,
        sampleRestaurantLinks: restaurantLinks.slice(0, 10),
        restaurantElements: possibleRestaurantElements.length,
        bodyText: document.body.textContent?.substring(0, 300),
      };
    });
    
    console.log(`   📊 Page stats: ${pageContent.totalLinks} total links`);
    console.log(`   🍽️  Found ${pageContent.restaurantLinks} individual restaurant links`);
    console.log(`   📦 Found ${pageContent.restaurantElements} possible restaurant elements`);
    if (pageContent.restaurantLinks > 0) {
      console.log(`   ✅ Sample restaurant links: ${pageContent.sampleRestaurantLinks.slice(0, 5).join(', ')}`);
    }
    
    // venueUrls will be set from pagination above, but we need to convert Set to Array
    const venueUrls = Array.from(allVenueUrls);
    
    // Also extract from raw HTML as backup (from last page loaded)
    const fullHtml = await page.content();
    const htmlMatches = fullHtml.match(/https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+/gi);
    if (htmlMatches) {
      console.log(`   🔍 Found ${htmlMatches.length} venue URLs in raw HTML (adding any missing ones)`);
      const categoryWords = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'canberra'];
      htmlMatches.forEach((url: string) => {
        const cleanUrl = url.split('?')[0].split('#')[0];
        const slug = cleanUrl.split('/venue/')[1];
        if (slug && !categoryWords.includes(slug.toLowerCase()) && !venueUrls.includes(cleanUrl)) {
          venueUrls.push(cleanUrl);
        }
      });
    }
    
    // Legacy extraction code (kept as backup but should already be covered by pagination)
    const legacyUrls = await page.evaluate(() => {
      const urls = new Set<string>();
      
      // Strategy 1: Find links with href attributes pointing to /venue/
      const allLinks = document.querySelectorAll('a[href*="/venue/"]');
      allLinks.forEach((link: any) => {
        const href = link.getAttribute('href');
        if (href) {
          const venueMatch = href.match(/\/venue\/([a-z0-9-]+)(?:\/|$|\?|#)/i);
          if (venueMatch && venueMatch[1]) {
            const slug = venueMatch[1];
            // Skip category/region slugs
            const categoryWords = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'canberra', 
                                   'cuisine', 'category', 'venues', 'venue', 'search', 'location'];
            if (!categoryWords.includes(slug.toLowerCase())) {
              let fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `https://eatclub.com.au${href}` : `https://eatclub.com.au/${href}`);
              const cleanMatch = fullUrl.match(/(https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+)/i);
              if (cleanMatch && cleanMatch[1]) {
                urls.add(cleanMatch[1]);
              }
            }
          }
        }
      });
      
      // Strategy 1b: Also check restaurant card links (they might be in article tags or divs)
      const restaurantCards = document.querySelectorAll('article a, [class*="card"] a, [class*="restaurant"] a, [class*="venue"] a');
      restaurantCards.forEach((link: any) => {
        const href = link.getAttribute('href');
        if (href && href.includes('/venue/')) {
          const venueMatch = href.match(/\/venue\/([a-z0-9-]+)(?:\/|$|\?|#)/i);
          if (venueMatch && venueMatch[1]) {
            let fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `https://eatclub.com.au${href}` : `https://eatclub.com.au/${href}`);
            const cleanMatch = fullUrl.match(/(https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+)/i);
            if (cleanMatch && cleanMatch[1]) {
              urls.add(cleanMatch[1]);
            }
          }
        }
      });
      
      // Strategy 2: Check data attributes on clickable elements
      const clickableElements = document.querySelectorAll('[onclick], [data-venue], [data-restaurant], [data-slug], [data-href]');
      clickableElements.forEach((el: any) => {
        const venueUrl = el.getAttribute('data-venue') || 
                        el.getAttribute('data-restaurant') ||
                        el.getAttribute('data-href');
        const slug = el.getAttribute('data-slug');
        
        if (venueUrl && venueUrl.includes('/venue/')) {
          let fullUrl = venueUrl.startsWith('http') ? venueUrl : `https://eatclub.com.au${venueUrl}`;
          const cleanMatch = fullUrl.match(/(https?:\/\/eatclub\.com\.au\/venue\/[a-z0-9-]+)/i);
          if (cleanMatch && cleanMatch[1]) {
            urls.add(cleanMatch[1]);
          }
        } else if (slug && !categoryWords.includes(slug.toLowerCase())) {
          urls.add(`https://eatclub.com.au/venue/${slug}`);
        }
      });
      
      // Strategy 3: Look for venue URLs in onclick handlers
      const onclickElements = document.querySelectorAll('[onclick]');
      onclickElements.forEach((el: any) => {
        const onclick = el.getAttribute('onclick') || '';
        const matches = onclick.match(/\/venue\/([a-z0-9-]+)/gi);
        if (matches) {
          matches.forEach((match: string) => {
            const slug = match.split('/venue/')[1]?.split(/[^a-z0-9-]/)[0];
            if (slug && !categoryWords.includes(slug.toLowerCase())) {
              urls.add(`https://eatclub.com.au/venue/${slug}`);
            }
          });
        }
      });
      
      // Also check data attributes
      const dataSelectors = [
        '[data-venue-url]',
        '[data-url]',
        '[data-href]',
        '[data-link]',
        '[data-restaurant-url]',
      ];
      
      dataSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el: any) => {
            const url = el.getAttribute('data-venue-url') || 
                       el.getAttribute('data-url') || 
                       el.getAttribute('data-href') ||
                       el.getAttribute('data-link') ||
                       el.getAttribute('data-restaurant-url');
            if (url && url.includes('venue')) {
              let fullUrl = url;
              if (!url.startsWith('http')) {
                fullUrl = url.startsWith('/') 
                  ? `https://eatclub.com.au${url}`
                  : `https://eatclub.com.au/${url}`;
              }
              if (fullUrl.includes('/venue/')) {
                urls.add(fullUrl.split('?')[0]);
              }
            }
          });
        } catch (e) {
          // Ignore selector errors
        }
      });
      
      // Check for URLs in script tags (JSON data)
      const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
      scripts.forEach((script: any) => {
        const content = script.textContent || script.innerHTML || '';
        // Look for various URL patterns
        const patterns = [
          /https?:\/\/eatclub\.com\.au\/venue\/[^"'\s\)\?]+/g,
          /"\/venue\/[^"'\s\)\?]+"/g,
          /'\/venue\/[^"'\s\)\?]+'/g,
          /\/venue\/[a-z0-9-]+/gi,
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach((match: string) => {
              let url = match.replace(/["']/g, '');
              if (!url.startsWith('http')) {
                url = url.startsWith('/') 
                  ? `https://eatclub.com.au${url}`
                  : `https://eatclub.com.au/${url}`;
              }
              if (url.includes('/venue/')) {
                urls.add(url.split('?')[0]);
              }
            });
          }
        });
      });
      
      // Strategy 4: Check window.__NEXT_DATA__ or similar React/Vue data
      try {
        const nextData = (window as any).__NEXT_DATA__;
        if (nextData) {
          const dataStr = JSON.stringify(nextData);
          const matches = dataStr.match(/https?:\/\/eatclub\.com\.au\/venue\/[^"'\s\)\?]+/g);
          if (matches) {
            matches.forEach((url: string) => urls.add(url.split('?')[0]));
          }
          
          // Also look for venue slugs in the data
          const slugMatches = dataStr.match(/"slug":\s*"([a-z0-9-]+)"/gi);
          if (slugMatches) {
            slugMatches.forEach((match: string) => {
              const slug = match.match(/"slug":\s*"([a-z0-9-]+)"/i)?.[1];
              if (slug && slug.length > 3) { // Valid restaurant slugs are usually longer
                urls.add(`https://eatclub.com.au/venue/${slug}`);
              }
            });
          }
        }
      } catch (e) {
        // Ignore
      }
      
      // Strategy 5: Look for restaurant data in any script tags with JSON
      const jsonScripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
      jsonScripts.forEach((script: any) => {
        try {
          const content = script.textContent || script.innerHTML || '';
          // Look for venue objects or arrays
          const jsonMatch = content.match(/\{[^}]*"venue"[^}]*\}/gi);
          if (jsonMatch) {
            jsonMatch.forEach((objStr: string) => {
              const slugMatch = objStr.match(/"slug":\s*"([a-z0-9-]+)"/i);
              const urlMatch = objStr.match(/https?:\/\/eatclub\.com\.au\/venue\/[^"'\s\)\?]+/gi);
              if (slugMatch && slugMatch[1]) {
                urls.add(`https://eatclub.com.au/venue/${slugMatch[1]}`);
              }
              if (urlMatch) {
                urlMatch.forEach((url: string) => urls.add(url.split('?')[0]));
              }
            });
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      });
      
      return Array.from(urls);
    });
    
    // Add any legacy URLs we found that weren't already in venueUrls
    legacyUrls.forEach((url: string) => {
      if (!venueUrls.includes(url)) {
        venueUrls.push(url);
      }
    });
    
    // If still no URLs found, try calling the API endpoint directly
    if (venueUrls.length === 0) {
      console.log('   🔌 Trying to fetch from API endpoints...');
      try {
        // Try the venues API endpoint
        const apiResponse = await page.evaluate(async () => {
          try {
            const response = await fetch('https://eatclub.com.au/api/venues?location=Canberra', {
              headers: {
                'Accept': 'application/json',
              },
            });
            if (response.ok) {
              return await response.json();
            }
          } catch (e) {
            return null;
          }
        });
        
        if (apiResponse && Array.isArray(apiResponse)) {
          apiResponse.forEach((venue: any) => {
            if (venue.slug || venue.url) {
              const url = venue.url || `https://eatclub.com.au/venue/${venue.slug}`;
              venueUrls.push(url);
            }
          });
        }
      } catch (e) {
        console.log('   ⚠️  API endpoint not accessible');
      }
    }
    
    await browser.close();
    browser = null;
    
    // Remove duplicates
    const uniqueUrls = Array.from(new Set(venueUrls));
    
    if (uniqueUrls.length === 0) {
      console.log(`   ⚠️  No venue URLs found. The page structure might have changed.`);
      console.log(`   💡 Try checking the EatClub search page manually: ${searchUrl}`);
      console.log(`   💡 Alternative: Use existing EatClub URLs from database with sync script`);
      return [];
    }
    
    console.log(`   ✅ Found ${uniqueUrls.length} unique venue URLs`);
    console.log(`   📥 Scraping venue details...`);
    
    const venues: EatClubVenue[] = [];
    const urlsArray = uniqueUrls.slice(0, 100); // Limit to first 100
    
    // Scrape each venue page
    for (let i = 0; i < urlsArray.length; i++) {
      const url = urlsArray[i];
      const venue = await scrapeEatClubVenue(url);
      if (venue) {
        venues.push(venue);
      }
      // Rate limiting - wait 1 second between requests
      if (i < urlsArray.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return venues;
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Error searching EatClub:', error);
    return [];
  }
}

/**
 * Match EatClub venue to restaurant by name and location
 */
export function matchEatClubToRestaurant(
  eatClubVenue: EatClubVenue,
  restaurantName: string,
  restaurantSuburb?: string | null
): boolean {
  // Normalize names for comparison
  const normalize = (str: string) => 
    str.toLowerCase()
       .replace(/[^a-z0-9]/g, '')
       .trim();

  const eatClubName = normalize(eatClubVenue.name);
  const restName = normalize(restaurantName);

  // Check if names match (allowing for partial matches)
  const nameMatch = 
    eatClubName === restName ||
    eatClubName.includes(restName) ||
    restName.includes(eatClubName);

  // If suburbs match, that's a bonus
  const suburbMatch = 
    !restaurantSuburb ||
    !eatClubVenue.suburb ||
    normalize(restaurantSuburb) === normalize(eatClubVenue.suburb);

  return nameMatch && suburbMatch;
}
