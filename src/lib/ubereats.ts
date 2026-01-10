/**
 * Uber Eats integration for restaurant image search
 * Searches Uber Eats for restaurant images
 */

import * as cheerio from 'cheerio';

/**
 * Check if an image URL is an Uber Eats logo
 */
export function isUberEatsLogo(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Check for Uber Eats domain with logo-related paths
  if (lowerUrl.includes('ubereats')) {
    const logoKeywords = ['logo', 'icon', 'brand', 'mark', 'symbol'];
    if (logoKeywords.some(keyword => lowerUrl.includes(keyword))) {
      return true;
    }
    // Check if URL path suggests it's a logo
    if (lowerUrl.match(/\/logos?\//) || 
        lowerUrl.match(/\/branding\//) || 
        lowerUrl.match(/\/assets\/.*logo/) ||
        lowerUrl.match(/\/images\/.*logo/)) {
      return true;
    }
  }
  
  // Check for common logo filename patterns
  const logoPatterns = [
    /ubereats.*logo/i,
    /logo.*ubereats/i,
    /ubereats-logo/i,
    /logo-ubereats/i,
    /ubereats-icon/i,
    /icon-ubereats/i,
    /ubereats.*brand/i,
    /brand.*ubereats/i,
  ];
  
  return logoPatterns.some(pattern => pattern.test(lowerUrl));
}

/**
 * Filter out Uber Eats logo images from an array of image URLs
 */
export function filterUberEatsLogos(imageUrls: string[]): string[] {
  return imageUrls.filter(url => !isUberEatsLogo(url));
}

export interface UberEatsRestaurant {
  name: string;
  imageUrls: string[];
  address?: string;
  suburb?: string;
}

/**
 * Search Uber Eats for a restaurant in Canberra
 */
export async function searchUberEatsRestaurant(
  restaurantName: string,
  suburb?: string | null
): Promise<UberEatsRestaurant | null> {
  try {
    // Build search query
    const location = suburb 
      ? `${suburb}, Canberra, ACT, Australia`
      : 'Canberra, ACT, Australia';
    
    // Uber Eats search URL
    const searchUrl = `https://www.ubereats.com/au/search?q=${encodeURIComponent(restaurantName)}&location=${encodeURIComponent(location)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const imageUrls: string[] = [];
    let matchedName = '';
    let address = '';
    let suburbName = '';

    // Try to find restaurant in search results
    // Uber Eats uses various selectors for restaurant cards
    const restaurantSelectors = [
      '[data-testid*="restaurant"]',
      '[data-testid*="store"]',
      'a[href*="/store/"]',
      '.restaurant-card',
      '.store-card',
    ];

    let restaurantFound = false;

    for (const selector of restaurantSelectors) {
      $(selector).each((_, el) => {
        if (restaurantFound) return;

        const card = $(el);
        const nameElement = card.find('h3, h4, [data-testid*="name"], .restaurant-name, .store-name').first();
        const name = nameElement.text().trim();

        if (name) {
          // Normalize names for comparison
          const normalize = (str: string) => 
            str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
          
          const normalizedSearch = normalize(restaurantName);
          const normalizedFound = normalize(name);

          // Check if names match (exact or partial)
          if (
            normalizedFound === normalizedSearch ||
            normalizedFound.includes(normalizedSearch) ||
            normalizedSearch.includes(normalizedFound)
          ) {
            matchedName = name;
            restaurantFound = true;

            // Extract images
            // Try multiple image sources
            const imageSelectors = [
              'img[src*="cloudfront"], img[src*="ubereats"], img[src*="cdn"]',
              'img[data-src*="cloudfront"], img[data-src*="ubereats"]',
              'picture img',
              '.restaurant-image img, .store-image img',
            ];

            for (const imgSelector of imageSelectors) {
              card.find(imgSelector).each((_, imgEl) => {
                const src = $(imgEl).attr('src') || $(imgEl).attr('data-src');
                if (src && !src.includes('logo') && !src.includes('icon')) {
                  // Clean up image URL (remove size parameters if needed)
                  let cleanUrl = src;
                  // Remove query parameters that might limit size
                  if (cleanUrl.includes('?')) {
                    cleanUrl = cleanUrl.split('?')[0];
                  }
                  // Ensure full URL
                  if (cleanUrl.startsWith('//')) {
                    cleanUrl = 'https:' + cleanUrl;
                  } else if (cleanUrl.startsWith('/')) {
                    cleanUrl = 'https://www.ubereats.com' + cleanUrl;
                  }
                  
                  if (cleanUrl && !imageUrls.includes(cleanUrl)) {
                    imageUrls.push(cleanUrl);
                  }
                }
              });
            }

            // Extract address if available
            const addressElement = card.find('[data-testid*="address"], .address, .location').first();
            const addressText = addressElement.text().trim();
            if (addressText) {
              address = addressText;
              // Try to extract suburb
              const suburbMatch = addressText.match(/([A-Z][a-z]+),?\s*ACT/i);
              if (suburbMatch) {
                suburbName = suburbMatch[1];
              }
            }

            return false; // Stop iterating
          }
        }
      });

      if (restaurantFound) break;
    }

    // Also try to find images in meta tags or JSON-LD
    if (!restaurantFound) {
      // Try og:image
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage && !ogImage.includes('logo')) {
        imageUrls.push(ogImage);
      }

      // Try JSON-LD structured data
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const jsonData = JSON.parse($(el).html() || '{}');
          if (jsonData['@type'] === 'Restaurant' || jsonData['@type'] === 'FoodEstablishment') {
            if (jsonData.image) {
              const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
              images.forEach((img: string) => {
                if (!imageUrls.includes(img) && !img.includes('logo')) {
                  imageUrls.push(img);
                }
              });
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      });
    }

    // Filter out logos
    const filteredImages = filterUberEatsLogos(imageUrls);
    
    if (filteredImages.length === 0) {
      return null;
    }

    return {
      name: matchedName || restaurantName,
      imageUrls: filteredImages.slice(0, 5), // Limit to 5 images
      address: address || undefined,
      suburb: suburbName || suburb || undefined,
    };
  } catch (error) {
    console.error(`Error searching Uber Eats for ${restaurantName}:`, error);
    return null;
  }
}

/**
 * Get restaurant images from Uber Eats by direct store URL
 * If you have a specific Uber Eats store URL, this is more reliable
 */
export async function getUberEatsStoreImages(storeUrl: string): Promise<string[]> {
  try {
    const response = await fetch(storeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const imageUrls: string[] = [];

    // Extract images from the store page
    $('img[src*="cloudfront"], img[src*="ubereats"], img[src*="cdn"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        let cleanUrl = src;
        if (cleanUrl.includes('?')) {
          cleanUrl = cleanUrl.split('?')[0];
        }
        if (cleanUrl.startsWith('//')) {
          cleanUrl = 'https:' + cleanUrl;
        } else if (cleanUrl.startsWith('/')) {
          cleanUrl = 'https://www.ubereats.com' + cleanUrl;
        }
        
        if (cleanUrl && !imageUrls.includes(cleanUrl)) {
          imageUrls.push(cleanUrl);
        }
      }
    });

    // Try og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && !isUberEatsLogo(ogImage)) {
      imageUrls.push(ogImage);
    }

    // Filter out logos
    const filteredImages = filterUberEatsLogos(imageUrls);
    return filteredImages.slice(0, 5);
  } catch (error) {
    console.error(`Error fetching Uber Eats store images from ${storeUrl}:`, error);
    return [];
  }
}

