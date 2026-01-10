/**
 * Foursquare Places API integration
 * Free tier: 100,000 API calls/month
 * Get API key at: https://developer.foursquare.com/
 */

const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || '';

export interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location: {
    address?: string;
    locality?: string; // suburb
    postcode?: string;
    region?: string;
    country?: string;
    formatted_address?: string;
    latitude?: number;
    longitude?: number;
  };
  geocodes: {
    main: {
      latitude: number;
      longitude: number;
    };
  };
  tel?: string;
  website?: string;
  rating?: number;
  price?: number; // 1-4
  categories: Array<{
    id: number;
    name: string;
    short_name?: string;
  }>;
  hours?: {
    display: string;
    is_open_now: boolean;
    open: Array<{
      day: number; // 0-6 (Sunday-Saturday)
      start: string; // "0900"
      end: string; // "1700"
    }>;
  };
  photos?: Array<{
    id: string;
    created_at: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
  }>;
}

export interface FoursquareSearchResponse {
  results: FoursquarePlace[];
  context: {
    geo_bounds: {
      circle: {
        center: {
          latitude: number;
          longitude: number;
        };
        radius: number;
      };
    };
  };
}

/**
 * Search for places near a location using Foursquare Places API
 */
export async function searchFoursquarePlaces(
  query: string,
  near: string = 'Canberra, ACT, Australia',
  limit: number = 50
): Promise<FoursquarePlace[]> {
  if (!FOURSQUARE_API_KEY) {
    console.warn('FOURSQUARE_API_KEY not set, skipping Foursquare search');
    return [];
  }

  const url = new URL('https://api.foursquare.com/v3/places/search');
  url.searchParams.set('query', query);
  url.searchParams.set('near', near);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('fields', 'fsq_id,name,location,geocodes,tel,website,rating,price,categories,hours,photos');

  try {
    if (!FOURSQUARE_API_KEY) {
      console.warn('FOURSQUARE_API_KEY is empty');
      return [];
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': FOURSQUARE_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Foursquare API error (${response.status}): ${response.statusText}`, errorText);
      throw new Error(`Foursquare API error: ${response.statusText}`);
    }

    const data: FoursquareSearchResponse = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching Foursquare places:', error);
    return [];
  }
}

/**
 * Get place details by Foursquare ID
 */
export async function getFoursquarePlaceDetails(
  fsqId: string
): Promise<FoursquarePlace | null> {
  if (!FOURSQUARE_API_KEY) {
    return null;
  }

  const url = new URL(`https://api.foursquare.com/v3/places/${fsqId}`);
  url.searchParams.set('fields', 'fsq_id,name,location,geocodes,tel,website,rating,price,categories,hours,photos');
  
  // Request larger photos for better quality
  url.searchParams.set('photos', '5'); // Get up to 5 photos

  try {
    if (!FOURSQUARE_API_KEY) {
      return null;
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': FOURSQUARE_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Foursquare API error (${response.status}): ${response.statusText}`, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Foursquare place details:', error);
    return null;
  }
}

/**
 * Convert Foursquare place to restaurant format
 */
export function foursquareToRestaurant(place: FoursquarePlace) {
  const cuisine = place.categories?.[0]?.name || null;
  const priceRange = place.price 
    ? '$'.repeat(place.price) 
    : null;

  // Convert hours format
  const openingHours: Record<string, string> = {};
  if (place.hours?.open) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    place.hours.open.forEach((hour) => {
      const dayName = days[hour.day];
      const start = formatTime(hour.start);
      const end = formatTime(hour.end);
      openingHours[dayName] = `${start} - ${end}`;
    });
  }

  // Get photos - use larger size for better quality (original or 800x800)
  const imageUrls = place.photos?.slice(0, 5).map(photo => {
    // Use original dimensions if available, otherwise use 800x800 for good quality
    const width = photo.width || 800;
    const height = photo.height || 800;
    return `${photo.prefix}${width}x${height}${photo.suffix}`;
  }) || [];

  return {
    name: place.name,
    address: place.location.formatted_address || place.location.address || null,
    suburb: place.location.locality || null,
    latitude: place.geocodes.main.latitude.toString(),
    longitude: place.geocodes.main.longitude.toString(),
    phone: place.tel || null,
    websiteUrl: place.website || null,
    priceRange,
    cuisine,
    openingHours: Object.keys(openingHours).length > 0 ? openingHours : null,
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    overallRating: place.rating ? place.rating.toFixed(2) : null,
    foursquarePlaceId: place.fsq_id,
  };
}

function formatTime(timeString: string): string {
  // Convert "0900" to "9:00 AM"
  const hours = parseInt(timeString.slice(0, 2));
  const minutes = timeString.slice(2, 4);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

