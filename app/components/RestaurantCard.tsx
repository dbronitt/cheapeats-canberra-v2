'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import { isRestaurantOpen } from '@/src/lib/utils';
import Link from 'next/link';

interface RestaurantCardProps {
  restaurant: Restaurant;
}

/**
 * Format EatClub deal descriptions that have concatenated day abbreviations
 * Example: "Today25% Offfri25% Offsat25% Off" -> "Today: 25% Off\nFriday: 25% Off\nSaturday: 25% Off"
 */
function formatDealDescription(description: string): string {
  if (!description) return description;
  
  // Only process if it looks like concatenated format (day abbreviations followed immediately by text without spaces)
  // Pattern: day abbreviation immediately followed by text (no space), repeated multiple times
  // Must have at least 2 day patterns that are NOT part of normal words (word boundaries)
  const concatenatedPattern = /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today)\b[a-z0-9$%]/gi;
  const initialMatches = description.match(concatenatedPattern);
  
  // Only format if we have multiple day matches that suggest concatenation
  // AND the description doesn't contain normal sentence structure (spaces after days)
  if (!initialMatches || initialMatches.length < 2) {
    // Not a concatenated format, return as-is
    return description;
  }
  
  // Check if days are followed by spaces (normal text) vs immediately by text (concatenated)
  // If we see patterns like "Monday " or "Monday:" it's probably normal text, not concatenated
  const hasNormalSpacing = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|today)\b[\s:]/i.test(description);
  if (hasNormalSpacing) {
    // This looks like normal text with days mentioned, not concatenated format
    return description;
  }
  
  // Day abbreviation mapping (order matters - longer matches first)
  const dayPatterns = [
    { pattern: /\btoday\b/gi, name: 'Today' },
    { pattern: /\bmonday\b/gi, name: 'Monday' },
    { pattern: /\btuesday\b/gi, name: 'Tuesday' },
    { pattern: /\bwednesday\b/gi, name: 'Wednesday' },
    { pattern: /\bthursday\b/gi, name: 'Thursday' },
    { pattern: /\bfriday\b/gi, name: 'Friday' },
    { pattern: /\bsaturday\b/gi, name: 'Saturday' },
    { pattern: /\bsunday\b/gi, name: 'Sunday' },
    { pattern: /\bmon(?!day)\b/gi, name: 'Monday' },
    { pattern: /\btue(?!sday)\b/gi, name: 'Tuesday' },
    { pattern: /\bwed(?!nesday)\b/gi, name: 'Wednesday' },
    { pattern: /\bthu(?!rsday)\b/gi, name: 'Thursday' },
    { pattern: /\bfri(?!day)\b/gi, name: 'Friday' },
    { pattern: /\bsat(?!urday)\b/gi, name: 'Saturday' },
    { pattern: /\bsun(?!day)\b/gi, name: 'Sunday' },
  ];
  
  // Find all day matches with their positions
  const dayMatches: Array<{ index: number; day: string; length: number }> = [];
  
  dayPatterns.forEach(({ pattern, name }) => {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(description)) !== null) {
      // Check that the character after the match is NOT a space or colon (normal text)
      const charAfter = description[match.index + match[0].length];
      if (charAfter && charAfter !== ' ' && charAfter !== ':') {
        dayMatches.push({
          index: match.index,
          day: name,
          length: match[0].length,
        });
      }
    }
  });
  
  // Sort by index
  dayMatches.sort((a, b) => a.index - b.index);
  
  // Remove duplicates (same index)
  const uniqueMatches = dayMatches.filter((match, index, self) => 
    index === self.findIndex(m => m.index === match.index)
  );
  
  if (uniqueMatches.length < 2) {
    // Need at least 2 day matches to be concatenated format
    return description;
  }
  
  // Extract deal text for each day
  const parts: Array<{ day: string; text: string }> = [];
  
  for (let i = 0; i < uniqueMatches.length; i++) {
    const currentMatch = uniqueMatches[i];
    const nextMatch = uniqueMatches[i + 1];
    
    const startIndex = currentMatch.index + currentMatch.length;
    const endIndex = nextMatch ? nextMatch.index : description.length;
    
    const dealText = description.substring(startIndex, endIndex).trim();
    
    if (dealText) {
      parts.push({
        day: currentMatch.day,
        text: dealText,
      });
    }
  }
  
  // Format with line breaks
  if (parts.length > 0) {
    return parts.map(p => `${p.day}: ${p.text}`).join('\n');
  }
  
  return description;
}

export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
  console.log('[DEBUG] RestaurantCard rendering for:', restaurant.name, 'ID:', restaurant.id);
  
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<string[]>([]);
  const [removingImage, setRemovingImage] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  
  // Initialize images and filter out incorrect ones
  useEffect(() => {
    const initialImages = (restaurant.imageUrls as string[] | null) || 
                         (restaurant.imageUrl ? [restaurant.imageUrl] : []);
    
    // Filter out images that failed to load
    const validImages = initialImages.filter((_, idx) => !imageErrors.has(idx));
    setImages(validImages);
    
    // Reset current index if it's out of bounds
    setCurrentImageIndex(prev => {
      if (prev >= validImages.length) {
        return 0;
      }
      return prev;
    });
    
    // Reset loading state when images change
    if (validImages.length > 0) {
      setImageLoading(true);
    } else {
      setImageLoading(false);
    }
  }, [restaurant.imageUrls, restaurant.imageUrl, imageErrors]);
  
  // Reset loading when image index changes
  useEffect(() => {
    if (images.length > 0 && currentImageIndex < images.length) {
      setImageLoading(true);
    }
  }, [currentImageIndex]);
  
  const openingHours = restaurant.openingHours as Record<string, string> | null;
  const hasOpeningHours = openingHours && typeof openingHours === 'object' && Object.keys(openingHours).length > 0;
  const isOpen = hasOpeningHours ? isRestaurantOpen(openingHours) : null; // null means unknown
  const rawHappyHour = restaurant.happyHour as { days?: string[]; hours?: string; description?: string } | null;
  const weeklySpecials = restaurant.weeklySpecials as Array<{ day: string; description: string }> | null;
  const rawDeals = restaurant.deals as Array<{ title?: string; description?: string; validUntil?: string; source?: string }> | null;

  // Validate if happy hour is actually about drinks (not food deals)
  const isDrinkDeal = (description: string): boolean => {
    if (!description) return false;
    const text = description.toLowerCase();
    
    // Keywords that indicate drinks (valid for happy hour)
    const drinkKeywords = [
      'beer', 'wine', 'cocktail', 'spirit', 'drink', 'beers', 'wines',
      'schooner', 'pint', 'glass', 'shot', 'mixed', 'house wine',
      'tap', 'taps', 'draft', 'bottle', 'jug', 'pot', 'schnapps',
      'happy hour', 'drinks', 'alcohol', 'bar', 'pub', 'wine bar'
    ];
    
    // Keywords that indicate food (NOT valid for happy hour)
    const foodKeywords = [
      'kids meal', 'kid meal', 'children meal', 'free kids', 'kids eat free',
      'schnitzel', 'schnitty', 'burger', 'pizza', 'pasta', 'taco', 'tacos',
      'steak', 'roast', 'lunch', 'dinner', 'meal', 'food', 'breakfast',
      'chicken', 'fish', 'beef', 'pork', 'lamb', 'veggie', 'vegetarian',
      'salad', 'wings', 'nuggets', 'sliders', 'sandwich', 'wrap',
      'curry', 'parma', 'parmigiana', 'risotto', 'soup', 'appetizer',
      'entree', 'main', 'mains', 'dessert', 'pie', 'cake',
      'special', 'specials', 'discount', '20% off', 'half-priced', 'half-price',
      '2 for 1', '2-for-1', 'sirloin', 'chips', 'schnitzels'
    ];
    
    const hasFoodKeywords = foodKeywords.some(keyword => text.includes(keyword));
    const hasDrinkKeywords = drinkKeywords.some(keyword => text.includes(keyword));
    
    // Only consider it a drink deal if it has drink keywords and no food keywords
    return hasDrinkKeywords && !hasFoodKeywords;
  };

  // Check if happy hour contains food deals and convert to weekly specials if needed
  let happyHour = rawHappyHour;
  let enhancedWeeklySpecials = weeklySpecials ? [...weeklySpecials] : [];
  let enhancedDeals = rawDeals ? [...rawDeals] : [];
  
  try {
    if (rawHappyHour && rawHappyHour.description) {
      const description = rawHappyHour.description;
      if (!isDrinkDeal(description)) {
        // This is a food deal, not a drink deal - convert to weekly specials or deals
        console.log('[DEBUG] Happy Hour contains food deals, converting:', description.substring(0, 100));
        
        const dayMap: Record<string, string> = {
          'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday',
          'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday',
          'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
          'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'
        };
        
        // Parse day-specific specials from description
        // Find all day mentions and extract text until next day
        const dayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi;
        const matches: Array<{ day: string; text: string; index: number }> = [];
        
        // Find all day positions first
        const dayPositions: Array<{ index: number; day: string; length: number }> = [];
        let dayMatch;
        const dayRegex = new RegExp(dayPattern.source, dayPattern.flags);
        while ((dayMatch = dayRegex.exec(description)) !== null) {
          dayPositions.push({
            index: dayMatch.index,
            day: dayMatch[0],
            length: dayMatch[0].length
          });
        }
        
        // Extract text for each day
        for (let i = 0; i < dayPositions.length; i++) {
          const currentDay = dayPositions[i];
          const nextDay = dayPositions[i + 1];
          const startIndex = currentDay.index + currentDay.length;
          const endIndex = nextDay ? nextDay.index : description.length;
          
          let specialText = description.substring(startIndex, endIndex).trim();
          specialText = specialText.replace(/^:\s*/, '').trim();
          specialText = specialText.replace(/\s*\([^)]*\)\s*$/, '').trim();
          
          if (specialText && specialText.length > 5) {
            const dayKey = currentDay.day.toLowerCase();
            const dayName = dayMap[dayKey] || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
            matches.push({
              day: dayName,
              text: specialText,
              index: currentDay.index
            });
          }
        }
        
        // Add parsed specials to weekly specials
        for (const match of matches) {
          const exists = enhancedWeeklySpecials.some(s => 
            s.day.toLowerCase() === match.day.toLowerCase() && 
            s.description.toLowerCase().includes(match.text.substring(0, 30).toLowerCase())
          );
          
          if (!exists) {
            enhancedWeeklySpecials.push({
              day: match.day,
              description: match.text
            });
          }
        }
        
        // Always hide happy hour if it contains food deals
        happyHour = null;
        
        // If we couldn't parse into weekly specials, add as a general deal
        const parsedSpecials = enhancedWeeklySpecials.length > (weeklySpecials?.length || 0);
        if (!parsedSpecials) {
          const foodDeal: { title?: string; description?: string; validUntil?: string; source?: string } = {
            title: 'Special Deal',
            description: rawHappyHour.description,
            source: 'Manual'
          };
          
          const dealExists = enhancedDeals.some(d => 
            d.description?.toLowerCase() === rawHappyHour.description?.toLowerCase()
          );
          
          if (!dealExists) {
            enhancedDeals.push(foodDeal);
          }
        }
      }
    }
  } catch (error) {
    console.error('[DEBUG] Error processing happy hour:', error);
    // On error, just use the original values
    happyHour = rawHappyHour;
    enhancedWeeklySpecials = weeklySpecials ? [...weeklySpecials] : [];
    enhancedDeals = rawDeals ? [...rawDeals] : [];
  }
  
  // Check Current Deals for day-of-week mentions and move to Weekly Specials
  try {
    const dayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi;
    const dayMap: Record<string, string> = {
      'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday',
      'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday',
      'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
      'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'
    };
    
    const dealsToMove: Array<{ day: string; description: string }> = [];
    const dealsToKeep: typeof enhancedDeals = [];
    
    for (const deal of enhancedDeals) {
      const title = (deal.title || '').toLowerCase();
      const description = (deal.description || '').toLowerCase();
      const fullText = `${title} ${description}`;
      
      // Check if deal contains a day of the week
      const dayMatch = fullText.match(dayPattern);
      
      if (dayMatch) {
        // Extract the day and description
        const dayKey = dayMatch[0].toLowerCase();
        const dayName = dayMap[dayKey] || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
        
        // Try to extract the description part (after the day)
        let dealDescription = '';
        
        // If title contains the day, extract description from title and description
        if (title.includes(dayKey)) {
          // Remove day from title and combine with description
          const titleWithoutDay = title.replace(new RegExp(`\\b${dayKey}\\b`, 'gi'), '').trim();
          const cleanTitle = titleWithoutDay.replace(/^:\s*/, '').replace(/^\s*-\s*/, '').trim();
          
          if (deal.description) {
            // If we have both title (without day) and description, combine them
            dealDescription = cleanTitle ? `${cleanTitle}: ${deal.description}` : deal.description;
          } else {
            // Just use the cleaned title
            dealDescription = cleanTitle || deal.title || '';
          }
        } else {
          // Day is in description, combine title and description
          dealDescription = `${deal.title ? deal.title + ': ' : ''}${deal.description || ''}`.trim();
          // Remove day from description
          dealDescription = dealDescription.replace(new RegExp(`\\b${dayMatch[0]}\\b\\s*:?\\s*`, 'gi'), '').trim();
        }
        
        // Clean up: remove leading colons, dashes, and extra spaces
        dealDescription = dealDescription.replace(/^[:-\s]+/, '').trim();
        
        if (dealDescription) {
          dealsToMove.push({
            day: dayName,
            description: dealDescription
          });
        }
      } else {
        // Keep deals that don't have days
        dealsToKeep.push(deal);
      }
    }
    
    // Add moved deals to weekly specials (avoid duplicates)
    for (const movedDeal of dealsToMove) {
      const exists = enhancedWeeklySpecials.some(s => 
        s.day.toLowerCase() === movedDeal.day.toLowerCase() && 
        s.description.toLowerCase().includes(movedDeal.description.substring(0, 50).toLowerCase())
      );
      
      if (!exists) {
        enhancedWeeklySpecials.push(movedDeal);
      }
    }
    
    // Update enhancedDeals to only keep deals without days
    enhancedDeals = dealsToKeep;
    
    // Remove duplicates between weekly specials and remaining deals
    // Check if any weekly special description matches a deal description
    enhancedDeals = enhancedDeals.filter(deal => {
      const dealText = `${deal.title || ''} ${deal.description || ''}`.toLowerCase().trim();
      return !enhancedWeeklySpecials.some(special => {
        const specialText = `${special.day} ${special.description}`.toLowerCase();
        // Check if they're similar (one contains the other or vice versa)
        return dealText.includes(specialText.substring(0, 30)) || specialText.includes(dealText.substring(0, 30));
      });
    });
    
    // Deduplicate within weekly specials (same day + similar description)
    const uniqueWeeklySpecials: Array<{ day: string; description: string }> = [];
    for (const special of enhancedWeeklySpecials) {
      const exists = uniqueWeeklySpecials.some(existing => {
        const sameDay = existing.day.toLowerCase() === special.day.toLowerCase();
        const similarDesc = existing.description.toLowerCase().includes(special.description.substring(0, 30).toLowerCase()) ||
                           special.description.toLowerCase().includes(existing.description.substring(0, 30).toLowerCase());
        return sameDay && similarDesc;
      });
      
      if (!exists) {
        uniqueWeeklySpecials.push(special);
      }
    }
    enhancedWeeklySpecials = uniqueWeeklySpecials;
    
  } catch (error) {
    console.error('[DEBUG] Error processing deals for day detection:', error);
  }
  
  // Deduplicate deals by comparing title and description (normalized)
  const normalizeDealText = (text: string): string => {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 100);
  };
  
  const areDealsDuplicate = (deal1: any, deal2: any): boolean => {
    const title1 = normalizeDealText(deal1.title || '');
    const title2 = normalizeDealText(deal2.title || '');
    const desc1 = normalizeDealText(deal1.description || '');
    const desc2 = normalizeDealText(deal2.description || '');
    
    // Exact match
    if (title1 === title2 && desc1 === desc2) return true;
    
    // If one title contains the other and descriptions match
    if (title1 && title2 && desc1 === desc2) {
      if (title1.includes(title2) || title2.includes(title1)) return true;
    }
    
    // If one deal's full text is contained in another's
    const full1 = `${title1} ${desc1}`.trim();
    const full2 = `${title2} ${desc2}`.trim();
    if (full1 && full2 && (full1.includes(full2) || full2.includes(full1))) {
      // Only if they have enough words to be meaningful
      const words1 = full1.split(/\s+/).length;
      const words2 = full2.split(/\s+/).length;
      if (words1 >= 3 && words2 >= 3) return true;
    }
    
    return false;
  };
  
  const allDeals = enhancedDeals.length > 0 ? enhancedDeals.filter((deal, index, self) => {
    // Check if this deal is a duplicate of any earlier deal
    return !self.slice(0, index).some(earlierDeal => areDealsDuplicate(deal, earlierDeal));
  }) : null;

  // Separate EatClub deals and First Table deals from in-house deals
  const eatClubDeals = allDeals ? allDeals.filter(deal => 
    deal.title === 'EatClub Deal Available' || deal.source === 'eatclub'
  ) : null;
  
  const inHouseDeals = allDeals ? allDeals.filter(deal => {
    // Exclude EatClub deals
    const isEatClub = deal.title === 'EatClub Deal Available' || deal.source === 'eatclub';
    // Exclude First Table deals
    const isFirstTable = deal.source === 'firsttable' || 
                        deal.source === 'FirstTable' ||
                        deal.source === 'first_table' ||
                        (deal.title && deal.title.toLowerCase().includes('first table'));
    return !isEatClub && !isFirstTable;
  }) : null;

  const hasDeals = happyHour || (enhancedWeeklySpecials && enhancedWeeklySpecials.length > 0) || (inHouseDeals && inHouseDeals.length > 0) || (eatClubDeals && eatClubDeals.length > 0);

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
    setImageLoading(false);
  };

  const handleRemoveImage = async (imageUrl: string, index: number) => {
    if (removingImage !== null) return;
    
    setRemovingImage(index);
    try {
      const response = await fetch('/api/images/mark-incorrect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          reason: 'User marked as incorrect'
        }),
      });

      if (response.ok) {
        // Remove from local state
        setImageErrors(prev => new Set(prev).add(index));
        // Update images array
        setImages(prev => prev.filter((_, idx) => idx !== index));
        // Adjust current index if needed
        if (currentImageIndex >= images.length - 1) {
          setCurrentImageIndex(Math.max(0, images.length - 2));
        }
      } else {
        console.error('Failed to remove image');
      }
    } catch (error) {
      console.error('Error removing image:', error);
    } finally {
      setRemovingImage(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      {/* Image Slideshow */}
      {images.length > 0 ? (
        <div className="relative h-48 w-full group overflow-hidden">
          {imageLoading && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse z-0" />
          )}
          <Image
            src={images[currentImageIndex]}
            alt={restaurant.name}
            fill
            className={`object-cover transition-transform duration-500 group-hover:scale-110 ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            unoptimized
            onError={() => {
              handleImageError(currentImageIndex);
              setImageLoading(false);
            }}
            onLoad={() => {
              setImageLoading(false);
            }}
          />
          
          {/* Remove Image Button */}
          <button
            onClick={() => handleRemoveImage(images[currentImageIndex], currentImageIndex)}
            disabled={removingImage === currentImageIndex}
            className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            title="Remove incorrect image"
            aria-label="Remove incorrect image"
          >
            {removingImage === currentImageIndex ? (
              <span className="text-xs">...</span>
            ) : (
              <span className="text-xs">✕</span>
            )}
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-2 rounded-full hover:bg-black/80 z-10 transition-all duration-200 hover:scale-110 backdrop-blur-sm"
                aria-label="Previous image"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentImageIndex((prev) => (prev + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-2 rounded-full hover:bg-black/80 z-10 transition-all duration-200 hover:scale-110 backdrop-blur-sm"
                aria-label="Next image"
              >
                →
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full ${
                      idx === currentImageIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="h-48 w-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center animate-gradient">
          <span className="text-white text-4xl font-bold drop-shadow-lg">{restaurant.name.charAt(0)}</span>
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-bold text-gray-900">{restaurant.name}</h3>
          {isOpen !== null ? (
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${
                isOpen
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {isOpen ? 'Open' : 'Closed'}
            </span>
          ) : (
            <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600">
              Hours Unknown
            </span>
          )}
        </div>

        {/* Cuisine & Price */}
        <div className="flex items-center gap-2 mb-2">
          {restaurant.cuisine && (
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
              {restaurant.cuisine}
            </span>
          )}
          {restaurant.overallRating && (
            <span className="text-yellow-500 text-sm">⭐ {restaurant.overallRating}</span>
          )}
        </div>

        {/* Location */}
        {(restaurant.address || restaurant.suburb) && (
          <p className="text-gray-600 text-sm mb-2">
            {restaurant.address && `${restaurant.address}, `}
            {restaurant.suburb}
          </p>
        )}

        {/* Deals Badges */}
        {hasDeals && (
          <div className="flex flex-wrap gap-2 mb-3">
            {happyHour && (
              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                🍺 Happy Hour
              </span>
            )}
            {enhancedWeeklySpecials && enhancedWeeklySpecials.length > 0 && (
              <span className="px-2 py-1 bg-teal-100 text-teal-800 rounded text-xs font-medium">
                📅 Weekly Specials
              </span>
            )}
            {(eatClubDeals && eatClubDeals.length > 0) || (inHouseDeals && inHouseDeals.length > 0) ? (
              <>
                {eatClubDeals && eatClubDeals.length > 0 && (
                  <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                    🍽️ Eat Club Deals
                  </span>
                )}
                {inHouseDeals && inHouseDeals.length > 0 && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                    💰 Current Deals
                  </span>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* EatClub & First Table Links - Always show for consistent sizing */}
        <div className="flex gap-2 mb-3 min-h-[2.5rem]">
          {restaurant.eatClubUrl ? (
            <a
              href={restaurant.eatClubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              🍽️ EatClub
            </a>
          ) : (
            <div className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed">
              🍽️ EatClub
            </div>
          )}
          {restaurant.firstTableUrl ? (
            <a
              href={restaurant.firstTableUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              🍴 First Table
            </a>
          ) : (
            <div className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed">
              🍴 First Table
            </div>
          )}
        </div>

        {/* Opening Hours */}
        {openingHours && (
          <details className="mb-3">
            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
              Opening Hours
            </summary>
            <div className="mt-2 text-sm text-gray-600">
              {Object.entries(openingHours).map(([day, hours]) => (
                <div key={day} className="flex justify-between">
                  <span className="capitalize">{day}:</span>
                  <span>{hours}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Deals Details */}
        {hasDeals && (
          <details className="mb-3 border-t pt-3">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
              View Deals & Specials
            </summary>
            <div className="mt-2 space-y-2 text-sm">
              {happyHour && (
                <div className="bg-purple-50 p-2 rounded">
                  <p className="font-semibold text-purple-900">🍺 Happy Hour</p>
                  {happyHour.days && (
                    <p className="text-purple-700">
                      Days: {(() => {
                        // Deduplicate and normalize days
                        const dayMap: Record<string, string> = {
                          'monday': 'Monday',
                          'tuesday': 'Tuesday',
                          'wednesday': 'Wednesday',
                          'thursday': 'Thursday',
                          'friday': 'Friday',
                          'saturday': 'Saturday',
                          'sunday': 'Sunday'
                        };
                        const uniqueDays = [...new Set(
                          happyHour.days.map(day => {
                            const lower = day.toLowerCase();
                            return dayMap[lower] || day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
                          })
                        )];
                        return uniqueDays.join(', ');
                      })()}
                    </p>
                  )}
                  {happyHour.hours && <p className="text-purple-700">Hours: {happyHour.hours}</p>}
                  {happyHour.description && <p className="text-purple-600">{happyHour.description}</p>}
                </div>
              )}
              {enhancedWeeklySpecials && enhancedWeeklySpecials.length > 0 && (
                <div className="bg-teal-50 p-2 rounded border border-teal-200">
                  <p className="font-semibold text-teal-900">📅 Weekly Specials</p>
                  {enhancedWeeklySpecials.map((special, idx) => (
                    <p key={idx} className="text-teal-700">
                      <span className="font-medium">{special.day}:</span> {special.description}
                    </p>
                  ))}
                </div>
              )}
              {/* EatClub Deals - Orange Background */}
              {eatClubDeals && eatClubDeals.length > 0 && (
                <div className="bg-orange-50 p-2 rounded border border-orange-200">
                  <p className="font-semibold text-orange-900">🍽️ Eat Club Deals</p>
                  {eatClubDeals.map((deal, idx) => {
                    // Only show the standard EatClub message, remove any other EatClub mentions
                    let description = deal.description || '';
                    const normalizedDesc = description.toLowerCase().trim();
                    // If description contains EatClub but isn't exactly the standard message,
                    // replace with standard message
                    if (normalizedDesc.includes('eatclub') && 
                        normalizedDesc !== 'check out our eatclub deals!') {
                      description = 'Check out our EatClub deals!';
                    }
                    const formattedDescription = formatDealDescription(description);
                    return (
                      <div key={idx} className="text-orange-700 mt-2 first:mt-0">
                        {/* Don't show title for EatClub deals - only show the button badge and description */}
                        <p className="whitespace-pre-line text-sm">{formattedDescription}</p>
                        {deal.validUntil && (
                          <p className="text-xs text-orange-600 mt-1">Valid until: {deal.validUntil}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* In-House Current Deals - Green Background */}
              {inHouseDeals && inHouseDeals.length > 0 && (
                <div className="bg-green-50 p-2 rounded border border-green-200">
                  <p className="font-semibold text-green-900">💰 Current Deals</p>
                  {inHouseDeals.map((deal, idx) => {
                    const formattedDescription = formatDealDescription(deal.description || '');
                    return (
                      <div key={idx} className="text-green-700 mt-2 first:mt-0">
                        {deal.title && (
                          <p className="font-medium mb-1">{deal.title}</p>
                        )}
                        <p className="whitespace-pre-line text-sm">{formattedDescription}</p>
                        {deal.validUntil && (
                          <p className="text-xs text-green-600 mt-1">Valid until: {deal.validUntil}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          {restaurant.websiteUrl && (
            <a
              href={restaurant.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center text-sm font-medium transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              Website
            </a>
          )}
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              Call
            </a>
          )}
          {restaurant.latitude && restaurant.longitude && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${restaurant.latitude},${restaurant.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              Directions
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
