import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Format Australian phone numbers
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

// Check if an image URL is marked as incorrect
export async function isImageIncorrect(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/images/mark-incorrect?url=${encodeURIComponent(imageUrl)}`);
    if (response.ok) {
      const data = await response.json();
      return data.isIncorrect || false;
    }
    return false;
  } catch (error) {
    console.error('Error checking image:', error);
    return false;
  }
}

export function isRestaurantOpen(openingHours: Record<string, string> | null): boolean {
  if (!openingHours || typeof openingHours !== 'object') return false;

  try {
    // Get current time in Canberra timezone using Intl.DateTimeFormat
    const now = new Date();
    
    // Get day name in Canberra timezone
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Australia/Canberra',
      weekday: 'long'
    });
    const dayName = dayFormatter.format(now).toLowerCase();
    
    // Get time components in Canberra timezone using formatToParts for reliability
    const timeFormatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Canberra',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric'
    });
    
    const timeParts = timeFormatter.formatToParts(now);
    let hour = 0;
    let minute = 0;
    
    for (const part of timeParts) {
      if (part.type === 'hour') {
        hour = parseInt(part.value, 10);
      }
      if (part.type === 'minute') {
        minute = parseInt(part.value, 10);
      }
    }
    
    const currentTime = hour * 60 + minute; // Convert to minutes since midnight
    
    // Debug logging (can be removed later)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('Checking restaurant hours:', {
        dayName,
        currentTime: `${hour}:${minute.toString().padStart(2, '0')}`,
        openingHoursKeys: Object.keys(openingHours),
      });
    }
    
    // Try to find the day in openingHours (case-insensitive)
    let hours: string | undefined;
    
    // Try lowercase first (most common format: "monday", "tuesday", etc.)
    hours = openingHours[dayName];
    
    // If not found, try capitalized version ("Monday", "Tuesday", etc.)
    if (!hours && dayName) {
      const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      hours = openingHours[capitalized];
    }
    
    // If still not found, try all keys case-insensitively
    if (!hours) {
      for (const key in openingHours) {
        if (key.toLowerCase() === dayName) {
          hours = openingHours[key];
          break;
        }
      }
    }
    
    if (!hours || typeof hours !== 'string') {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('No hours found for day:', dayName, 'Available keys:', Object.keys(openingHours));
      }
      return false;
    }
    
    const hoursLower = hours.toLowerCase().trim();
    if (hoursLower === 'closed' || hoursLower === '') {
      return false;
    }
    
    // Don't treat "closed" as a substring match - only exact match or empty
    // Some hours might contain "closed" in a description like "Closed for renovations"
    if (hoursLower === 'closed') {
      return false;
    }

    // Parse hours like "9:00 AM - 5:00 PM" or "09:00 - 17:00" or "9:00am-5:00pm" or "9am-5pm"
    let startMinutes = 0;
    let endMinutes = 0;
    
    // Format 1: "9:00 AM - 5:00 PM" or "9:00AM - 5:00PM" (with spaces and colons)
    let match = hours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      const [, startH, startM, startP, endH, endM, endP] = match;
      let startH24 = parseInt(startH);
      let startM24 = parseInt(startM);
      let endH24 = parseInt(endH);
      let endM24 = parseInt(endM);
      
      // Convert to 24-hour format
      if (startP.toUpperCase() === 'PM' && startH24 !== 12) startH24 += 12;
      if (startP.toUpperCase() === 'AM' && startH24 === 12) startH24 = 0;
      if (endP.toUpperCase() === 'PM' && endH24 !== 12) endH24 += 12;
      if (endP.toUpperCase() === 'AM' && endH24 === 12) endH24 = 0;
      
      startMinutes = startH24 * 60 + startM24;
      endMinutes = endH24 * 60 + endM24;
    } else {
      // Format 2: "09:00 - 17:00" (24-hour format with colon)
      match = hours.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
      if (match) {
        const [, startH, startM, endH, endM] = match;
        startMinutes = parseInt(startH) * 60 + parseInt(startM);
        endMinutes = parseInt(endH) * 60 + parseInt(endM);
      } else {
        // Format 3: "9am-5pm" or "9:00am-5:00pm" (no spaces, with or without colons)
        match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (match) {
          const [, startH, startM = '0', startP, endH, endM = '0', endP] = match;
          let startH24 = parseInt(startH);
          let endH24 = parseInt(endH);
          
          if (startP.toUpperCase() === 'PM' && startH24 !== 12) startH24 += 12;
          if (startP.toUpperCase() === 'AM' && startH24 === 12) startH24 = 0;
          if (endP.toUpperCase() === 'PM' && endH24 !== 12) endH24 += 12;
          if (endP.toUpperCase() === 'AM' && endH24 === 12) endH24 = 0;
          
          startMinutes = startH24 * 60 + parseInt(startM);
          endMinutes = endH24 * 60 + parseInt(endM);
        } else {
          // Format 4: "9am to 5pm" or "9:00am to 5:00pm" (using "to" instead of dash)
          match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (match) {
            const [, startH, startM = '0', startP, endH, endM = '0', endP] = match;
            let startH24 = parseInt(startH);
            let endH24 = parseInt(endH);
            
            if (startP.toUpperCase() === 'PM' && startH24 !== 12) startH24 += 12;
            if (startP.toUpperCase() === 'AM' && startH24 === 12) startH24 = 0;
            if (endP.toUpperCase() === 'PM' && endH24 !== 12) endH24 += 12;
            if (endP.toUpperCase() === 'AM' && endH24 === 12) endH24 = 0;
            
            startMinutes = startH24 * 60 + parseInt(startM);
            endMinutes = endH24 * 60 + parseInt(endM);
          } else {
            // Can't parse the format - log and return false
            if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
              console.warn('Could not parse hours format:', hours);
            }
            return false;
          }
        }
      }
    }
    
    // Debug logging
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('Parsed hours:', {
        hoursString: hours,
        startMinutes,
        endMinutes,
        startTime: `${Math.floor(startMinutes / 60)}:${(startMinutes % 60).toString().padStart(2, '0')}`,
        endTime: `${Math.floor(endMinutes / 60)}:${(endMinutes % 60).toString().padStart(2, '0')}`,
        currentTime,
        isOpen: currentTime >= startMinutes && currentTime <= endMinutes,
      });
    }

    // Handle restaurants that are open past midnight (e.g., 10 PM - 2 AM)
    if (endMinutes < startMinutes) {
      // Restaurant closes the next day
      const isOpen = currentTime >= startMinutes || currentTime <= endMinutes;
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('Restaurant open past midnight:', { startMinutes, endMinutes, currentTime, isOpen });
      }
      return isOpen;
    }

    // Normal case: restaurant closes same day
    const isOpen = currentTime >= startMinutes && currentTime <= endMinutes;
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('Restaurant hours check result:', {
        startMinutes,
        endMinutes,
        currentTime,
        isOpen,
        startTime: `${Math.floor(startMinutes / 60)}:${(startMinutes % 60).toString().padStart(2, '0')}`,
        endTime: `${Math.floor(endMinutes / 60)}:${(endMinutes % 60).toString().padStart(2, '0')}`,
        currentTimeFormatted: `${Math.floor(currentTime / 60)}:${(currentTime % 60).toString().padStart(2, '0')}`,
      });
    }
    return isOpen;
  } catch (error) {
    console.error('Error checking restaurant hours:', error, openingHours);
    return false;
  }
}

