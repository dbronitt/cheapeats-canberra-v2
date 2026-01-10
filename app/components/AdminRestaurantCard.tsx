'use client';

import { useState, useEffect } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import Image from 'next/image';

interface AdminRestaurantCardProps {
  restaurant: Restaurant;
  onUpdate: (id: number, updates: Partial<Restaurant>) => Promise<void>;
  initialEditMode?: boolean;
}

interface UnifiedDeal {
  id: string; // Unique ID for each deal
  dealType: 'Happy Hour' | 'Weekly Deal' | 'Current Deal';
  title?: string;
  description: string;
  days?: string[]; // For Happy Hour
  day?: string; // For Weekly Deal
  hours?: string; // For Happy Hour
  validUntil?: string | null; // For Current Deal
  source?: string | null; // For Current Deal
}

interface OpeningHour {
  day: string;
  hours: string;
}

interface HappyHour {
  days: string[];
  hours: string;
  description: string;
}

interface WeeklySpecial {
  day: string;
  description: string;
}

// Legacy Deal interface for backward compatibility
interface Deal {
  title: string;
  description: string;
  validUntil?: string | null;
  source?: string | null;
}

export default function AdminRestaurantCard({ restaurant, onUpdate, initialEditMode = false }: AdminRestaurantCardProps) {
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [editedData, setEditedData] = useState<Partial<Restaurant>>({});
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showAddImage, setShowAddImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [unifiedDeals, setUnifiedDeals] = useState<UnifiedDeal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]); // Keep for backward compatibility during transition
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [happyHour, setHappyHour] = useState<HappyHour>({ days: [], hours: '', description: '' }); // Keep for backward compatibility
  const [weeklySpecials, setWeeklySpecials] = useState<WeeklySpecial[]>([]); // Keep for backward compatibility
  const [cuisineOptions, setCuisineOptions] = useState<string[]>([]);
  
  const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Fetch cuisine options on mount
  useEffect(() => {
    const fetchCuisines = async () => {
      try {
        const response = await fetch('/api/admin/cuisines');
        if (response.ok) {
          const data = await response.json();
          setCuisineOptions(data.cuisines || []);
        }
      } catch (error) {
        console.error('Error fetching cuisines:', error);
      }
    };
    fetchCuisines();
  }, []);

  // Use editedData.imageUrls when editing, otherwise use restaurant.imageUrls
  const currentImageUrls = isEditing 
    ? ((editedData.imageUrls as string[] | null) || [])
    : ((restaurant.imageUrls as string[] | null) || []);
  const imageUrls = currentImageUrls;
  const hasImages = imageUrls.length > 0;

  // Helper function to initialize form data from restaurant
  const initializeFormData = () => {
    // Convert all deal types into unified deals format
    const unifiedDealsArray: UnifiedDeal[] = [];
    
    // Convert Happy Hour to unified deal
    const happyHourObj = restaurant.happyHour as HappyHour | null;
    if (happyHourObj && (happyHourObj.description || happyHourObj.hours || (Array.isArray(happyHourObj.days) && happyHourObj.days.length > 0))) {
      unifiedDealsArray.push({
        id: `hh-${Date.now()}`,
        dealType: 'Happy Hour',
        description: happyHourObj.description || '',
        days: Array.isArray(happyHourObj.days) ? happyHourObj.days : [],
        hours: happyHourObj.hours || '',
      });
    }
    
    // Convert Weekly Specials to unified deals
    const weeklySpecialsArray = Array.isArray(restaurant.weeklySpecials) ? restaurant.weeklySpecials : [];
    weeklySpecialsArray.forEach((special: any, index: number) => {
      if (special.day || special.description) {
        unifiedDealsArray.push({
          id: `ws-${Date.now()}-${index}`,
          dealType: 'Weekly Deal',
          description: special.description || '',
          day: special.day || '',
        });
      }
    });
    
    // Convert Current Deals to unified deals
    const dealsArray = Array.isArray(restaurant.deals) ? restaurant.deals : [];
    dealsArray.forEach((deal: any, index: number) => {
      if (deal.title || deal.description) {
        unifiedDealsArray.push({
          id: `deal-${Date.now()}-${index}`,
          dealType: 'Current Deal',
          title: deal.title || '',
          description: deal.description || '',
          validUntil: deal.validUntil || null,
          source: deal.source || null,
        });
      }
    });
    
    // Parse opening hours from JSON to array
    const hoursObj = restaurant.openingHours as Record<string, string> | null;
    const hoursArray: OpeningHour[] = hoursObj
      ? Object.entries(hoursObj).map(([day, hours]) => ({
          day,
          hours: hours || '',
        }))
      : DAYS_OF_WEEK.map(day => ({ day, hours: '' }));
    
    setUnifiedDeals(unifiedDealsArray);
    setOpeningHours(hoursArray);
    setEditedData({
      name: restaurant.name || '',
      address: restaurant.address || '',
      suburb: restaurant.suburb || '',
      phone: restaurant.phone || '',
      websiteUrl: restaurant.websiteUrl || '',
      cuisine: restaurant.cuisine || '',
      businessType: restaurant.businessType || '',
      eatClubUrl: restaurant.eatClubUrl || '',
      firstTableUrl: restaurant.firstTableUrl || '',
      happyHour: restaurant.happyHour,
      weeklySpecials: restaurant.weeklySpecials,
      deals: restaurant.deals,
      openingHours: restaurant.openingHours,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      status: restaurant.status || 'active',
      overallRating: restaurant.overallRating,
      imageUrls: restaurant.imageUrls,
    });
    setNewImageUrl('');
  };

  const handleEdit = () => {
    initializeFormData();
    setIsEditing(true);
  };

  // Auto-enter edit mode if initialEditMode is true
  useEffect(() => {
    if (initialEditMode && !isEditing) {
      initializeFormData();
      setIsEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditMode]);

  // Sync form data when restaurant prop changes (e.g., after update or when switching restaurants)
  useEffect(() => {
    if (isEditing) {
      // Only re-initialize if we're already in edit mode
      // This ensures form data stays in sync with the restaurant prop
      initializeFormData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id, isEditing]);

  // Helper function to get unified deals for display
  const getDisplayDeals = (): UnifiedDeal[] => {
    const displayDeals: UnifiedDeal[] = [];
    
    // Add Happy Hour
    if (restaurant.happyHour) {
      const happyHourObj = restaurant.happyHour as HappyHour;
      displayDeals.push({
        id: 'hh-display',
        dealType: 'Happy Hour',
        description: happyHourObj.description || '',
        days: Array.isArray(happyHourObj.days) ? happyHourObj.days : [],
        hours: happyHourObj.hours || '',
      });
    }
    
    // Add Weekly Specials
    if (restaurant.weeklySpecials && Array.isArray(restaurant.weeklySpecials)) {
      restaurant.weeklySpecials.forEach((special: any, index: number) => {
        displayDeals.push({
          id: `ws-display-${index}`,
          dealType: 'Weekly Deal',
          description: special.description || '',
          day: special.day || '',
        });
      });
    }
    
    // Add Current Deals
    if (restaurant.deals && Array.isArray(restaurant.deals)) {
      restaurant.deals.forEach((deal: any, index: number) => {
        displayDeals.push({
          id: `deal-display-${index}`,
          dealType: 'Current Deal',
          title: deal.title || '',
          description: deal.description || '',
          validUntil: deal.validUntil || null,
          source: deal.source || null,
        });
      });
    }
    
    return displayDeals;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validate and parse JSON fields
      const validatedData = { ...editedData };
      
      // Convert unified deals back to separate types
      const happyHourDeals = unifiedDeals.filter(d => d.dealType === 'Happy Hour');
      const weeklyDeals = unifiedDeals.filter(d => d.dealType === 'Weekly Deal');
      const currentDeals = unifiedDeals.filter(d => d.dealType === 'Current Deal');
      
      // Convert Happy Hour deals back to happyHour object
      if (happyHourDeals.length > 0) {
        const happyHourDeal = happyHourDeals[0]; // Take first happy hour deal
        if (happyHourDeal.hours?.trim() || happyHourDeal.description.trim() || (happyHourDeal.days && happyHourDeal.days.length > 0)) {
          validatedData.happyHour = {
            days: (happyHourDeal.days || []).filter((d: string) => d.trim()),
            hours: happyHourDeal.hours?.trim() || '',
            description: happyHourDeal.description.trim(),
          };
        } else {
          validatedData.happyHour = null;
        }
      } else {
        validatedData.happyHour = null;
      }
      
      // Convert Weekly Deals back to weeklySpecials array
      if (weeklyDeals.length > 0) {
        validatedData.weeklySpecials = weeklyDeals
          .filter(d => d.day?.trim() || d.description.trim())
          .map(d => ({
            day: d.day || '',
            description: d.description.trim(),
          }));
      } else {
        validatedData.weeklySpecials = null;
      }
      
      // Convert Current Deals back to deals array
      if (currentDeals.length > 0) {
        validatedData.deals = currentDeals
          .filter(d => (d.title?.trim() || d.description.trim()))
          .map(d => ({
            title: d.title || '',
            description: d.description.trim(),
            validUntil: d.validUntil || null,
            source: d.source || null,
          }));
      } else {
        validatedData.deals = null;
      }
      
      // Convert opening hours array to JSON object
      const hoursObj: Record<string, string> = {};
      openingHours.forEach(({ day, hours }) => {
        if (hours.trim()) {
          hoursObj[day.toLowerCase()] = hours.trim();
        }
      });
      validatedData.openingHours = Object.keys(hoursObj).length > 0 ? hoursObj : null;
      
      if (validatedData.openingHours !== undefined) {
        if (typeof validatedData.openingHours === 'string') {
          if (validatedData.openingHours.trim() === '') {
            validatedData.openingHours = null;
          } else {
            try {
              validatedData.openingHours = JSON.parse(validatedData.openingHours);
            } catch {
              alert('Invalid JSON in Opening Hours field. Please fix before saving.');
              setIsSaving(false);
              return;
            }
          }
        }
      }
      
      await onUpdate(restaurant.id, validatedData);
      
      // Check if restaurant still qualifies for main page after update
      // Merge current restaurant data with updates to determine final state
      const finalStatus = validatedData.status !== undefined ? validatedData.status : restaurant.status;
      const finalHappyHour = validatedData.happyHour !== undefined ? validatedData.happyHour : restaurant.happyHour;
      const finalWeeklySpecials = validatedData.weeklySpecials !== undefined ? validatedData.weeklySpecials : restaurant.weeklySpecials;
      const finalDeals = validatedData.deals !== undefined ? validatedData.deals : restaurant.deals;
      const finalEatClubUrl = validatedData.eatClubUrl !== undefined ? validatedData.eatClubUrl : restaurant.eatClubUrl;
      const finalFirstTableUrl = validatedData.firstTableUrl !== undefined ? validatedData.firstTableUrl : restaurant.firstTableUrl;
      
      const isActive = finalStatus === 'active';
      const hasHappyHour = finalHappyHour !== null && finalHappyHour !== undefined;
      const hasWeeklySpecials = Array.isArray(finalWeeklySpecials) && finalWeeklySpecials.length > 0;
      const hasDeals = Array.isArray(finalDeals) && finalDeals.length > 0;
      const hasEatClubUrl = finalEatClubUrl !== null && finalEatClubUrl !== undefined && finalEatClubUrl !== '';
      const hasFirstTableUrl = finalFirstTableUrl !== null && finalFirstTableUrl !== undefined && finalFirstTableUrl !== '';
      
      const hasAnyDeal = hasHappyHour || hasWeeklySpecials || hasDeals || hasEatClubUrl || hasFirstTableUrl;
      const qualifiesForMainPage = isActive && hasAnyDeal;
      
      if (!qualifiesForMainPage) {
        const reasons = [];
        if (!isActive) {
          reasons.push(`status is "${finalStatus}" (must be "active")`);
        }
        if (!hasAnyDeal) {
          reasons.push('no deals (needs at least one: Happy Hour, Weekly Specials, Current Deals, EatClub URL, or First Table URL)');
        }
        
        const warningMessage = `⚠️ Warning: This restaurant will NOT appear on the main page!\n\nReason:\n${reasons.map(r => `  • ${r}`).join('\n')}\n\nTo appear on the main page, the restaurant must:\n  • Have status = "active"\n  • Have at least one type of deal`;
        console.warn('[DEBUG] Restaurant does not qualify for main page:', warningMessage);
        alert(warningMessage);
      } else {
        console.log('[DEBUG] ✅ Restaurant still qualifies for main page after update');
      }
      
      // If a new cuisine was added, refresh cuisine options from the database
      if (validatedData.cuisine && validatedData.cuisine.trim() && !cuisineOptions.includes(validatedData.cuisine.trim())) {
        try {
          const response = await fetch('/api/admin/cuisines');
          if (response.ok) {
            const data = await response.json();
            setCuisineOptions(data.cuisines || []);
          }
        } catch (error) {
          console.error('Error refreshing cuisines:', error);
        }
      }
      
      setIsEditing(false);
      setEditedData({});
    } catch (error) {
      console.error('Error updating restaurant:', error);
      alert('Failed to update restaurant. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedData({});
  };

  const handleChange = (field: keyof Restaurant, value: any) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleDeleteImage = async (imageUrl: string) => {
    const updatedImages = imageUrls.filter(url => url !== imageUrl);
    await onUpdate(restaurant.id, { imageUrls: updatedImages.length > 0 ? updatedImages : null });
  };

  const handleAddImage = async () => {
    if (!newImageUrl.trim()) {
      alert('Please enter an image URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(newImageUrl);
    } catch {
      alert('Please enter a valid URL');
      return;
    }

    // Check if image already exists
    if (imageUrls.includes(newImageUrl)) {
      alert('This image is already added');
      return;
    }

    setIsAddingImage(true);
    try {
      const updatedImages = [...imageUrls, newImageUrl.trim()];
      await onUpdate(restaurant.id, { imageUrls: updatedImages });
      setNewImageUrl('');
      setShowAddImage(false);
    } catch (error) {
      console.error('Error adding image:', error);
      alert('Failed to add image. Please try again.');
    } finally {
      setIsAddingImage(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border-2 border-blue-500">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Name</label>
            <input
              type="text"
              value={editedData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Address</label>
              <input
                type="text"
                value={editedData.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Suburb</label>
              <input
                type="text"
                value={editedData.suburb || ''}
                onChange={(e) => handleChange('suburb', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Phone</label>
              <input
                type="text"
                value={editedData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Website</label>
              <input
                type="url"
                value={editedData.websiteUrl || ''}
                onChange={(e) => handleChange('websiteUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Cuisine</label>
              <div className="relative">
                <input
                  type="text"
                  list="cuisine-options"
                  value={editedData.cuisine || ''}
                  onChange={(e) => {
                    handleChange('cuisine', e.target.value);
                    // If new cuisine is entered, add it to options for future use
                    const newValue = e.target.value.trim();
                    if (newValue && !cuisineOptions.includes(newValue)) {
                      setCuisineOptions([...cuisineOptions, newValue].sort());
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Type or select cuisine..."
                />
                <datalist id="cuisine-options">
                  {cuisineOptions.map((cuisine) => (
                    <option key={cuisine} value={cuisine} />
                  ))}
                </datalist>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Type to search or create a new cuisine option
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">EatClub URL</label>
            <input
              type="url"
              value={editedData.eatClubUrl || ''}
              onChange={(e) => handleChange('eatClubUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">First Table URL</label>
            <input
              type="url"
              value={editedData.firstTableUrl || ''}
              onChange={(e) => handleChange('firstTableUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={editedData.latitude || ''}
                onChange={(e) => handleChange('latitude', e.target.value ? e.target.value : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., -35.2809"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={editedData.longitude || ''}
                onChange={(e) => handleChange('longitude', e.target.value ? e.target.value : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 149.1300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Business Type</label>
              <select
                value={editedData.businessType || ''}
                onChange={(e) => handleChange('businessType', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Cafe">Cafe</option>
                <option value="Bar">Bar</option>
                <option value="Pub">Pub</option>
                <option value="Bistro">Bistro</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Status</label>
              <select
                value={editedData.status || 'active'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Overall Rating</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={editedData.overallRating || ''}
              onChange={(e) => handleChange('overallRating', e.target.value ? e.target.value : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.0 - 5.0"
            />
          </div>

          {/* Unified Deals Table */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-900">Deals</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newDeal: UnifiedDeal = {
                      id: `deal-${Date.now()}-${Math.random()}`,
                      dealType: 'Happy Hour',
                      description: '',
                      days: [],
                      hours: '',
                    };
                    setUnifiedDeals([...unifiedDeals, newDeal]);
                  }}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                >
                  + Happy Hour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newDeal: UnifiedDeal = {
                      id: `deal-${Date.now()}-${Math.random()}`,
                      dealType: 'Weekly Deal',
                      description: '',
                      day: '',
                    };
                    setUnifiedDeals([...unifiedDeals, newDeal]);
                  }}
                  className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700"
                >
                  + Weekly Deal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newDeal: UnifiedDeal = {
                      id: `deal-${Date.now()}-${Math.random()}`,
                      dealType: 'Current Deal',
                      title: '',
                      description: '',
                      validUntil: null,
                      source: null,
                    };
                    setUnifiedDeals([...unifiedDeals, newDeal]);
                  }}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  + Current Deal
                </button>
              </div>
            </div>
            
            {unifiedDeals.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-300 rounded-md">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b w-32">Deal Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Title</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Days/Hours/Day</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Valid Until</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Source</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-900 border-b w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unifiedDeals.map((deal, index) => (
                      <tr key={deal.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 border-b">
                          <select
                            value={deal.dealType}
                            onChange={(e) => {
                              const updated = [...unifiedDeals];
                              const newType = e.target.value as 'Happy Hour' | 'Weekly Deal' | 'Current Deal';
                              updated[index].dealType = newType;
                              
                              // Reset fields based on type
                              if (newType === 'Happy Hour') {
                                updated[index] = {
                                  ...updated[index],
                                  dealType: 'Happy Hour',
                                  days: updated[index].days || [],
                                  hours: updated[index].hours || '',
                                  day: undefined,
                                  title: undefined,
                                  validUntil: undefined,
                                  source: undefined,
                                };
                              } else if (newType === 'Weekly Deal') {
                                updated[index] = {
                                  ...updated[index],
                                  dealType: 'Weekly Deal',
                                  day: updated[index].day || '',
                                  days: undefined,
                                  hours: undefined,
                                  title: undefined,
                                  validUntil: undefined,
                                  source: undefined,
                                };
                              } else {
                                updated[index] = {
                                  ...updated[index],
                                  dealType: 'Current Deal',
                                  title: updated[index].title || '',
                                  validUntil: updated[index].validUntil || null,
                                  source: updated[index].source || null,
                                  days: undefined,
                                  hours: undefined,
                                  day: undefined,
                                };
                              }
                              
                              setUnifiedDeals(updated);
                            }}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="Happy Hour">Happy Hour</option>
                            <option value="Weekly Deal">Weekly Deal</option>
                            <option value="Current Deal">Current Deal</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 border-b">
                          {deal.dealType === 'Current Deal' ? (
                            <input
                              type="text"
                              value={deal.title || ''}
                              onChange={(e) => {
                                const updated = [...unifiedDeals];
                                updated[index].title = e.target.value;
                                setUnifiedDeals(updated);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Deal title"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b">
                          <input
                            type="text"
                            value={deal.description}
                            onChange={(e) => {
                              const updated = [...unifiedDeals];
                              updated[index].description = e.target.value;
                              setUnifiedDeals(updated);
                            }}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Description"
                          />
                        </td>
                        <td className="px-3 py-2 border-b">
                          {deal.dealType === 'Happy Hour' ? (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Days:</label>
                                <div className="flex flex-wrap gap-1">
                                  {DAYS_OF_WEEK.map(day => (
                                    <label key={day} className="flex items-center">
                                      <input
                                        type="checkbox"
                                        checked={deal.days?.includes(day) || false}
                                        onChange={(e) => {
                                          const updated = [...unifiedDeals];
                                          if (!updated[index].days) updated[index].days = [];
                                          if (e.target.checked) {
                                            updated[index].days = [...(updated[index].days || []), day];
                                          } else {
                                            updated[index].days = (updated[index].days || []).filter(d => d !== day);
                                          }
                                          setUnifiedDeals(updated);
                                        }}
                                        className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                      />
                                      <span className="ml-1 text-xs text-gray-700">{day.substring(0, 3)}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={deal.hours || ''}
                                onChange={(e) => {
                                  const updated = [...unifiedDeals];
                                  updated[index].hours = e.target.value;
                                  setUnifiedDeals(updated);
                                }}
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Hours (e.g., 4-6pm)"
                              />
                            </div>
                          ) : deal.dealType === 'Weekly Deal' ? (
                            <select
                              value={deal.day || ''}
                              onChange={(e) => {
                                const updated = [...unifiedDeals];
                                updated[index].day = e.target.value;
                                setUnifiedDeals(updated);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Select day...</option>
                              {DAYS_OF_WEEK.map(day => (
                                <option key={day} value={day}>{day}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b">
                          {deal.dealType === 'Current Deal' ? (
                            <input
                              type="date"
                              value={deal.validUntil || ''}
                              onChange={(e) => {
                                const updated = [...unifiedDeals];
                                updated[index].validUntil = e.target.value || null;
                                setUnifiedDeals(updated);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b">
                          {deal.dealType === 'Current Deal' ? (
                            <select
                              value={deal.source || ''}
                              onChange={(e) => {
                                const updated = [...unifiedDeals];
                                updated[index].source = e.target.value || null;
                                setUnifiedDeals(updated);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Select source...</option>
                              <option value="EatClub">EatClub</option>
                              <option value="First Table">First Table</option>
                              <option value="Restaurant">Restaurant</option>
                              <option value="Facebook">Facebook</option>
                              <option value="Other">Other</option>
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setUnifiedDeals(unifiedDeals.filter((_, i) => i !== index));
                            }}
                            className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-700 italic py-2">No deals added. Click one of the buttons above to add a deal.</p>
            )}
          </div>

          {/* Opening Hours Table */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-900 mb-2">Opening Hours</label>
            
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 rounded-md">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b w-32">Day</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {openingHours.map((hour, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b">
                        <input
                          type="text"
                          value={hour.day}
                          readOnly
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100 font-medium text-gray-900"
                        />
                      </td>
                      <td className="px-3 py-2 border-b">
                        <input
                          type="text"
                          value={hour.hours}
                          onChange={(e) => {
                            const updated = [...openingHours];
                            updated[index].hours = e.target.value;
                            setOpeningHours(updated);
                          }}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="e.g., 9:00 AM - 5:00 PM or Closed"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-700 mt-2">
              Enter hours for each day (e.g., "9:00 AM - 5:00 PM") or leave empty/enter "Closed"
            </p>
          </div>

          {/* Image Management in Edit Mode */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-900 mb-2">Images</label>
            <div className="space-y-2">
              {/* Current Images */}
              {imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {imageUrls.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt={`${restaurant.name} ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded border border-gray-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = imageUrls.filter((_, i) => i !== idx);
                          handleChange('imageUrls', updated.length > 0 ? updated : null);
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Image Input */}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newImageUrl.trim()) {
                        try {
                          new URL(newImageUrl);
                          if (!imageUrls.includes(newImageUrl)) {
                            handleChange('imageUrls', [...imageUrls, newImageUrl.trim()]);
                            setNewImageUrl('');
                          } else {
                            alert('This image is already added');
                          }
                        } catch {
                          alert('Please enter a valid URL');
                        }
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newImageUrl.trim()) {
                      try {
                        new URL(newImageUrl);
                        if (!imageUrls.includes(newImageUrl)) {
                          handleChange('imageUrls', [...imageUrls, newImageUrl.trim()]);
                          setNewImageUrl('');
                        } else {
                          alert('This image is already added');
                        }
                      } catch {
                        alert('Please enter a valid URL');
                      }
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-700">
                Paste an image URL and click "Add" or press Enter
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Compute display deals for non-editing mode
  const displayDeals = getDisplayDeals();

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image Section */}
      {hasImages && (
        <div className="relative h-48 w-full bg-gray-200">
          <Image
            src={imageUrls[currentImageIndex]}
            alt={restaurant.name}
            fill
            className="object-cover"
            unoptimized
          />
          {imageUrls.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex((prev) => (prev - 1 + imageUrls.length) % imageUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
              >
                ‹
              </button>
              <button
                onClick={() => setCurrentImageIndex((prev) => (prev + 1) % imageUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
              >
                ›
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                {currentImageIndex + 1} / {imageUrls.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Content Section */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-semibold text-gray-900">{restaurant.name}</h3>
          <button
            onClick={handleEdit}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Edit
          </button>
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          {restaurant.address && (
            <p>📍 {restaurant.address}{restaurant.suburb && `, ${restaurant.suburb}`}</p>
          )}
          {restaurant.phone && <p>📞 {restaurant.phone}</p>}
          {restaurant.cuisine && <p>🍽️ {restaurant.cuisine}</p>}
          {restaurant.websiteUrl && (
            <p>
              🌐 <a href={restaurant.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Website
              </a>
            </p>
          )}
        </div>

        {/* Deal Information - Unified Table */}
        {displayDeals.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Deals</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 rounded-md text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Deal Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Title</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Details</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Valid Until</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-900 border-b">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {displayDeals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                          deal.dealType === 'Happy Hour' ? 'bg-purple-100 text-purple-800' :
                          deal.dealType === 'Weekly Deal' ? 'bg-teal-100 text-teal-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {deal.dealType === 'Happy Hour' ? '🍺 HH' : deal.dealType === 'Weekly Deal' ? '📅 WS' : '🎉 Deal'}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b text-gray-700">
                        {deal.title || '-'}
                      </td>
                      <td className="px-3 py-2 border-b text-gray-700">
                        {deal.description || '-'}
                      </td>
                      <td className="px-3 py-2 border-b text-gray-700">
                        {deal.dealType === 'Happy Hour' ? (
                          <div>
                            {deal.days && deal.days.length > 0 && (
                              <div className="text-xs">Days: {deal.days.join(', ')}</div>
                            )}
                            {deal.hours && <div className="text-xs">Hours: {deal.hours}</div>}
                          </div>
                        ) : deal.dealType === 'Weekly Deal' ? (
                          <div className="text-xs">{deal.day || '-'}</div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-2 border-b text-gray-700">
                        {deal.validUntil || '-'}
                      </td>
                      <td className="px-3 py-2 border-b text-gray-700">
                        {deal.source || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        
        {/* Opening Hours */}
        {restaurant.openingHours && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Opening Hours</h4>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded">
              {JSON.stringify(restaurant.openingHours, null, 2)}
            </pre>
          </div>
        )}
        
        {/* Location Coordinates */}
        {(restaurant.latitude || restaurant.longitude) && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              📍 Coordinates: {restaurant.latitude}, {restaurant.longitude}
            </p>
          </div>
        )}
        
        {/* Status and Rating */}
        <div className="mt-3 pt-3 border-t border-gray-200 flex gap-4 text-xs">
          <span className={`px-2 py-1 rounded ${
            restaurant.status === 'active' ? 'bg-green-100 text-green-800' :
            restaurant.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
            'bg-red-100 text-red-800'
          }`}>
            Status: {restaurant.status}
          </span>
          {restaurant.overallRating && (
            <span className="text-gray-600">
              ⭐ Rating: {restaurant.overallRating}
            </span>
          )}
        </div>

        {/* Platform Links */}
        {(restaurant.eatClubUrl || restaurant.firstTableUrl) && (
          <div className="flex gap-2 mt-3">
            {restaurant.eatClubUrl && (
              <a
                href={restaurant.eatClubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600"
              >
                EatClub
              </a>
            )}
            {restaurant.firstTableUrl && (
              <a
                href={restaurant.firstTableUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
              >
                First Table
              </a>
            )}
          </div>
        )}

        {/* Image Management */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-gray-500 font-medium">Images ({imageUrls.length})</p>
            <button
              onClick={() => setShowAddImage(!showAddImage)}
              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              {showAddImage ? 'Cancel' : '+ Add Image'}
            </button>
          </div>

          {/* Add Image Form */}
          {showAddImage && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddImage()}
                />
                <button
                  onClick={handleAddImage}
                  disabled={isAddingImage || !newImageUrl.trim()}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAddingImage ? 'Adding...' : 'Add'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Paste an image URL to add it to this restaurant
              </p>
            </div>
          )}

          {/* Image Thumbnails */}
          {hasImages ? (
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={url}
                    alt={`${restaurant.name} ${idx + 1}`}
                    className="w-16 h-16 object-cover rounded border border-gray-300"
                    onError={(e) => {
                      // Hide broken images
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <button
                    onClick={() => handleDeleteImage(url)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No images yet. Click "Add Image" to add one.</p>
          )}
        </div>
      </div>
    </div>
  );
}

