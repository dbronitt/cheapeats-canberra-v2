/**
 * Utility functions for processing restaurant submissions
 */

import { RestaurantSubmission } from './schema/submissions';
import { Restaurant } from './schema/restaurants';
import { createSlug } from './utils';

export interface AutoApprovalResult {
  canAutoApprove: boolean;
  reason: string;
  confidence: number; // 0-100
  action: 'approve' | 'flag' | 'reject';
  matchingRestaurant?: Restaurant;
}

export interface DealExtractionResult {
  deals: Array<{
    dealType: 'happy_hour' | 'weekly_special' | 'deal';
    title: string;
    description: string;
    days?: string[];
    hours?: string;
    validUntil?: string;
  }>;
  confidence: number;
}

/**
 * Check if a submission can be auto-approved
 */
export function checkAutoApproval(
  submission: RestaurantSubmission,
  existingRestaurants: Restaurant[]
): AutoApprovalResult {
  // Check for exact duplicate submissions (same name, same address)
  const exactDuplicate = existingRestaurants.find(r => {
    const nameMatch = r.name.toLowerCase().trim() === submission.name.toLowerCase().trim();
    const addressMatch = submission.address && r.address 
      ? r.address.toLowerCase().trim() === submission.address.toLowerCase().trim()
      : false;
    return nameMatch && addressMatch;
  });

  if (exactDuplicate) {
    return {
      canAutoApprove: true,
      reason: 'Exact match with existing restaurant - will merge data',
      confidence: 95,
      action: 'approve',
      matchingRestaurant: exactDuplicate,
    };
  }

  // Check for fuzzy name match (likely same restaurant)
  const fuzzyMatch = existingRestaurants.find(r => {
    const submissionName = submission.name.toLowerCase().trim();
    const restaurantName = r.name.toLowerCase().trim();
    
    // Exact match
    if (submissionName === restaurantName) return true;
    
    // Check if one contains the other (e.g., "Joe's Pizza" vs "Joes Pizza")
    const normalizedSubmission = submissionName.replace(/[^a-z0-9]/g, '');
    const normalizedRestaurant = restaurantName.replace(/[^a-z0-9]/g, '');
    if (normalizedSubmission === normalizedRestaurant) return true;
    
    // Check similarity (simple Levenshtein-like check)
    const similarity = calculateSimilarity(submissionName, restaurantName);
    if (similarity > 0.85) return true;
    
    return false;
  });

  if (fuzzyMatch) {
    return {
      canAutoApprove: true,
      reason: 'Similar name match - will merge with existing restaurant',
      confidence: 80,
      action: 'approve',
      matchingRestaurant: fuzzyMatch,
    };
  }

  // Check if submission has all required fields
  const hasName = !!submission.name?.trim();
  const hasAddress = !!submission.address?.trim();
  const hasSuburb = !!submission.suburb?.trim();
  const hasPhone = !!submission.phone?.trim();
  const hasWebsite = !!submission.websiteUrl?.trim();

  const completenessScore = 
    (hasName ? 20 : 0) +
    (hasAddress ? 20 : 0) +
    (hasSuburb ? 15 : 0) +
    (hasPhone ? 15 : 0) +
    (hasWebsite ? 10 : 0) +
    (submission.cuisine ? 10 : 0) +
    (submission.description ? 10 : 0);

  // Auto-approve if has name + address + suburb (minimum viable)
  if (hasName && hasAddress && hasSuburb && completenessScore >= 55) {
    return {
      canAutoApprove: true,
      reason: 'Complete submission with all essential information',
      confidence: completenessScore,
      action: 'approve',
    };
  }

  // Flag for review if missing critical info
  if (hasName && !hasAddress) {
    return {
      canAutoApprove: false,
      reason: 'Missing address - needs manual review',
      confidence: 30,
      action: 'flag',
    };
  }

  // Reject obvious spam/incomplete
  if (!hasName || (!hasAddress && !hasSuburb && !hasPhone)) {
    return {
      canAutoApprove: false,
      reason: 'Incomplete submission - missing essential information',
      confidence: 10,
      action: 'reject',
    };
  }

  // Default: flag for review
  return {
    canAutoApprove: false,
    reason: 'Needs manual review',
    confidence: 50,
    action: 'flag',
  };
}

/**
 * Extract deal information from description text
 */
export function extractDealsFromDescription(description: string): DealExtractionResult {
  if (!description || !description.trim()) {
    return { deals: [], confidence: 0 };
  }

  const deals: DealExtractionResult['deals'] = [];
  const text = description.toLowerCase();
  
  // Happy Hour patterns
  const happyHourPatterns = [
    /happy\s*hour/i,
    /h\.?h\.?/i,
    /\d+%?\s*off\s*(drinks?|beer|wine|cocktails?|alcohol)/i,
    /\$\d+\s*(drinks?|beers?|wines?|cocktails?)/i,
    /(daily|everyday|mon-fri|monday-friday).*?\d+[ap]m.*?\d+[ap]m/i,
  ];

  // Weekly Special patterns
  const weeklySpecialPatterns = [
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday).*?(special|deal|discount)/i,
    /weekly\s*special/i,
    /\d+\s*for\s*\d+/i, // e.g., "2 for 1"
  ];

  // General deal patterns
  const dealPatterns = [
    /\d+%?\s*off/i,
    /(discount|deal|special|offer)/i,
    /free\s*(delivery|dessert|appetizer)/i,
    /\$\d+\s*(off|discount)/i,
  ];

  // Check for Happy Hour
  const hasHappyHour = happyHourPatterns.some(pattern => pattern.test(text));
  if (hasHappyHour) {
    // Try to extract days and hours
    const daysMatch = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|daily|everyday|mon-fri)/i);
    const hoursMatch = text.match(/(\d+[ap]m\s*-\s*\d+[ap]m|\d+:\d+\s*-\s*\d+:\d+)/i);
    
    deals.push({
      dealType: 'happy_hour',
      title: 'Happy Hour',
      description: description.trim(),
      days: daysMatch ? [daysMatch[0]] : undefined,
      hours: hoursMatch ? hoursMatch[0] : undefined,
    });
  }

  // Check for Weekly Specials
  const hasWeeklySpecial = weeklySpecialPatterns.some(pattern => pattern.test(text));
  if (hasWeeklySpecial && !hasHappyHour) {
    const dayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    deals.push({
      dealType: 'weekly_special',
      title: dayMatch ? `${dayMatch[0]} Special` : 'Weekly Special',
      description: description.trim(),
      days: dayMatch ? [dayMatch[0]] : undefined,
    });
  }

  // Check for general deals
  const hasDeal = dealPatterns.some(pattern => pattern.test(text));
  if (hasDeal && !hasHappyHour && !hasWeeklySpecial) {
    // Try to extract percentage or amount
    const percentMatch = text.match(/(\d+)%?\s*off/i);
    const amountMatch = text.match(/\$(\d+)/i);
    
    let title = 'Special Deal';
    if (percentMatch) {
      title = `${percentMatch[1]}% Off`;
    } else if (amountMatch) {
      title = `$${amountMatch[1]} Off`;
    }

    deals.push({
      dealType: 'deal',
      title,
      description: description.trim(),
    });
  }

  // Calculate confidence based on pattern matches
  let confidence = 0;
  if (hasHappyHour) confidence = 85;
  else if (hasWeeklySpecial) confidence = 75;
  else if (hasDeal) confidence = 60;
  else confidence = 0;

  return { deals, confidence };
}

/**
 * Simple string similarity calculation (Levenshtein distance normalized)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check for duplicate submissions
 */
export function findDuplicateRestaurants(
  submission: RestaurantSubmission,
  existingRestaurants: Restaurant[]
): Restaurant[] {
  const matches: Restaurant[] = [];
  const submissionName = submission.name.toLowerCase().trim();
  const submissionSlug = createSlug(submission.name);

  for (const restaurant of existingRestaurants) {
    const restaurantName = restaurant.name.toLowerCase().trim();
    const restaurantSlug = restaurant.slug.toLowerCase().trim();

    // Exact slug match
    if (restaurantSlug === submissionSlug) {
      matches.push(restaurant);
      continue;
    }

    // Name similarity
    const similarity = calculateSimilarity(submissionName, restaurantName);
    if (similarity > 0.7) {
      matches.push(restaurant);
      continue;
    }

    // Address match (if both have addresses)
    if (submission.address && restaurant.address) {
      const submissionAddr = submission.address.toLowerCase().trim();
      const restaurantAddr = restaurant.address.toLowerCase().trim();
      if (submissionAddr === restaurantAddr) {
        matches.push(restaurant);
        continue;
      }
    }
  }

  return matches;
}
