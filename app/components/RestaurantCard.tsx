'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import { isRestaurantOpen } from '@/src/lib/utils';
import Link from 'next/link';
import ReportDealModal from './ReportDealModal';
import ReportRestaurantModal from './ReportRestaurantModal';

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
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingDeal, setReportingDeal] = useState<{
    dealType: string;
    dealDescription: string;
  } | null>(null);
  const [restaurantReportModalOpen, setRestaurantReportModalOpen] = useState(false);
  const [reportingIssueType, setReportingIssueType] = useState<string | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportButtonRef, setReportButtonRef] = useState<HTMLButtonElement | null>(null);
  
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
  const happyHour = restaurant.happyHour as { days?: string[]; hours?: string; description?: string } | null;
  const weeklySpecials = restaurant.weeklySpecials as Array<{ day: string; description: string }> | null;
  const rawDeals = restaurant.deals as Array<{ title?: string; description?: string; validUntil?: string; source?: string }> | null;

  // Use deal types exactly as stored in database - no automatic conversion
  const enhancedWeeklySpecials = weeklySpecials || [];
  
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
  
  const allDeals = rawDeals && rawDeals.length > 0 ? rawDeals.filter((deal, index, self) => {
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


  const isTopPick = restaurant.curatorsTopPick === 'true' || restaurant.curatorsTopPick === true;

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow ${
      isTopPick ? 'ring-4 ring-yellow-400 ring-opacity-75 border-2 border-yellow-400' : ''
    }`}>
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
          <h3 className="text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">{restaurant.name}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowReportMenu(!showReportMenu)}
                className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-gray-100"
                title="Report issue"
                aria-label="Report restaurant issue"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              {showReportMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowReportMenu(false)}
                  />
                  <div className="absolute right-0 top-6 z-[9999] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]">
                    <button
                      onClick={() => {
                        setReportingIssueType('Restaurant now closed');
                        setRestaurantReportModalOpen(true);
                        setShowReportMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Restaurant now closed
                    </button>
                    <button
                      onClick={() => {
                        setReportingIssueType('Hours are wrong');
                        setRestaurantReportModalOpen(true);
                        setShowReportMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Hours are wrong
                    </button>
                    <button
                      onClick={() => {
                        setReportingIssueType('Cuisine is wrong');
                        setRestaurantReportModalOpen(true);
                        setShowReportMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Cuisine is wrong
                    </button>
                    <button
                      onClick={() => {
                        setReportingIssueType('Other');
                        setRestaurantReportModalOpen(true);
                        setShowReportMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Other
                    </button>
                  </div>
                </>
              )}
            </div>
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
                <div className="bg-purple-50 p-2 rounded relative">
                  <button
                    onClick={() => {
                      setReportingDeal({
                        dealType: 'Happy Hour',
                        dealDescription: `${happyHour.days ? `Days: ${happyHour.days.join(', ')}. ` : ''}${happyHour.hours ? `Hours: ${happyHour.hours}. ` : ''}${happyHour.description || ''}`,
                      });
                      setReportModalOpen(true);
                    }}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-800 text-xs font-medium"
                    title="Report incorrect deal"
                  >
                    ⚠️ Report
                  </button>
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
                <div className="bg-teal-50 p-2 rounded border border-teal-200 relative">
                  <button
                    onClick={() => {
                      setReportingDeal({
                        dealType: 'Weekly Specials',
                        dealDescription: enhancedWeeklySpecials.map(s => `${s.day}: ${s.description}`).join('\n'),
                      });
                      setReportModalOpen(true);
                    }}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-800 text-xs font-medium"
                    title="Report incorrect deal"
                  >
                    ⚠️ Report
                  </button>
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
                <div className="bg-orange-50 p-2 rounded border border-orange-200 relative">
                  <button
                    onClick={() => {
                      const dealDescriptions = eatClubDeals.map(d => {
                        let desc = d.description || '';
                        const normalizedDesc = desc.toLowerCase().trim();
                        if (normalizedDesc.includes('eatclub') && 
                            normalizedDesc !== 'check out our eatclub deals!') {
                          desc = 'Check out our EatClub deals!';
                        }
                        return `${d.title ? d.title + ': ' : ''}${formatDealDescription(desc)}${d.validUntil ? ` (Valid until: ${d.validUntil})` : ''}`;
                      }).join('\n');
                      setReportingDeal({
                        dealType: 'EatClub Deals',
                        dealDescription: dealDescriptions,
                      });
                      setReportModalOpen(true);
                    }}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-800 text-xs font-medium"
                    title="Report incorrect deal"
                  >
                    ⚠️ Report
                  </button>
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
                <div className="bg-green-50 p-2 rounded border border-green-200 relative">
                  <button
                    onClick={() => {
                      const dealDescriptions = inHouseDeals.map(d => {
                        const formattedDesc = formatDealDescription(d.description || '');
                        return `${d.title ? d.title + ': ' : ''}${formattedDesc}${d.validUntil ? ` (Valid until: ${d.validUntil})` : ''}`;
                      }).join('\n');
                      setReportingDeal({
                        dealType: 'Current Deals',
                        dealDescription: dealDescriptions,
                      });
                      setReportModalOpen(true);
                    }}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-800 text-xs font-medium"
                    title="Report incorrect deal"
                  >
                    ⚠️ Report
                  </button>
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

      {/* Report Deal Modal */}
      {reportingDeal && (
        <ReportDealModal
          isOpen={reportModalOpen}
          onClose={() => {
            setReportModalOpen(false);
            setReportingDeal(null);
          }}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          dealType={reportingDeal.dealType}
          dealDescription={reportingDeal.dealDescription}
          onReportSubmitted={() => {
            console.log('[DEBUG] Report submitted successfully');
          }}
        />
      )}

      {/* Report Restaurant Modal */}
      {reportingIssueType && (
        <ReportRestaurantModal
          isOpen={restaurantReportModalOpen}
          onClose={() => {
            setRestaurantReportModalOpen(false);
            setReportingIssueType(null);
          }}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          issueType={reportingIssueType}
          onReportSubmitted={() => {
            console.log('[DEBUG] Restaurant report submitted successfully');
          }}
        />
      )}
    </div>
  );
}
