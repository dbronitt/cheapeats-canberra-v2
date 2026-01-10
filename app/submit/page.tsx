'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const submissionSchema = z.object({
  name: z.string().min(1, 'Restaurant name is required'),
  address: z.string().optional(),
  suburb: z.string().optional(),
  phone: z.string().optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  cuisine: z.string().optional(),
  businessType: z.string().optional(),
  description: z.string().optional(),
  submittedBy: z.string().optional(),
});

type SubmissionForm = z.infer<typeof submissionSchema>;

interface RestaurantSuggestion {
  id: string;
  name: string;
  address: string | null;
  suburb: string | null;
  phone: string | null;
  cuisine: string | null;
  priceRange: string | null;
  websiteUrl: string | null;
  businessType: string | null;
}

export default function SubmitPage() {
  console.log('[DEBUG] SubmitPage: Component rendering');
  
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [suggestions, setSuggestions] = useState<RestaurantSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantSuggestion | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<SubmissionForm>({
    resolver: zodResolver(submissionSchema),
  });

  const searchRestaurants = useCallback(async (query: string) => {
    try {
      console.log('[DEBUG] SubmitPage: Searching restaurants with query:', query);
      const response = await fetch(`/api/restaurants/search?q=${encodeURIComponent(query)}&limit=5`);
      console.log('[DEBUG] SubmitPage: Search response status:', response.status);
      
      if (!response.ok) {
        console.error('[DEBUG] SubmitPage: Search failed with status:', response.status);
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      
      const data = await response.json();
      console.log('[DEBUG] SubmitPage: Search results:', data, 'Count:', data.length);
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
      console.log('[DEBUG] SubmitPage: Suggestions set, showSuggestions:', data.length > 0);
    } catch (error) {
      console.error('[DEBUG] SubmitPage: Error searching restaurants:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // Watch restaurant name for autocomplete
  const watchedName = watch('name');

  useEffect(() => {
    // Don't search if a restaurant was just selected
    if (selectedRestaurant && watchedName === selectedRestaurant.name) {
      return;
    }
    
    // Clear selection if user changes the name
    if (selectedRestaurant && watchedName !== selectedRestaurant.name) {
      setSelectedRestaurant(null);
    }
    
    // Search when user types 2+ characters
    if (watchedName && watchedName.length >= 2) {
      const timeoutId = setTimeout(() => {
        console.log('[DEBUG] SubmitPage: Triggering search for:', watchedName);
        searchRestaurants(watchedName);
      }, 300); // Debounce search by 300ms
      
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      if (!watchedName || watchedName.length === 0) {
        setSelectedRestaurant(null);
      }
    }
  }, [watchedName, selectedRestaurant, searchRestaurants]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectRestaurant = (restaurant: RestaurantSuggestion) => {
    console.log('[DEBUG] SubmitPage: Selecting restaurant:', restaurant);
    
    // Set selected restaurant first to prevent re-search
    setSelectedRestaurant(restaurant);
    
    // Populate all fields when restaurant is selected
    setValue('name', restaurant.name || '', { shouldValidate: false, shouldDirty: true });
    setValue('address', restaurant.address || '', { shouldValidate: false, shouldDirty: true });
    setValue('suburb', restaurant.suburb || '', { shouldValidate: false, shouldDirty: true });
    setValue('phone', restaurant.phone || '', { shouldValidate: false, shouldDirty: true });
    setValue('cuisine', restaurant.cuisine || '', { shouldValidate: false, shouldDirty: true });
    setValue('websiteUrl', restaurant.websiteUrl || '', { shouldValidate: false, shouldDirty: true });
    setValue('businessType', restaurant.businessType || '', { shouldValidate: false, shouldDirty: true });
    
    // Hide suggestions dropdown
    setSuggestions([]);
    setShowSuggestions(false);
    
    console.log('[DEBUG] SubmitPage: Restaurant selected, all fields populated');
  };

  const onSubmit = async (data: SubmissionForm) => {
    try {
      setError(null);
      const response = await fetch('/api/submit/restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit');
      }

      setSubmitted(true);
      setSelectedRestaurant(null);
      reset();
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl bg-white rounded-lg shadow-lg my-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">Submit a Restaurant</h1>

      {submitted && (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-semibold">Thank you!</p>
          <p>Your submission has been received and will be reviewed soon.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Restaurant Name * <span className="text-xs text-gray-600">(start typing to search existing restaurants)</span>
          </label>
          <input
            {...register('name')}
            ref={(e) => {
              register('name').ref(e);
              inputRef.current = e;
            }}
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onFocus={() => {
              console.log('[DEBUG] SubmitPage: Name input focused, current value:', watchedName);
              // If there's a value and suggestions exist, show them
              const currentValue = watchedName;
              if (currentValue && currentValue.length >= 2) {
                if (suggestions.length > 0) {
                  setShowSuggestions(true);
                } else {
                  // Search if we don't have suggestions yet
                  searchRestaurants(currentValue);
                }
              }
            }}
            onBlur={(e) => {
              // Delay hiding suggestions to allow click on suggestion
              setTimeout(() => {
                // Check if the blur was caused by clicking a suggestion
                const activeElement = document.activeElement;
                if (!suggestionsRef.current?.contains(activeElement) && 
                    activeElement !== inputRef.current) {
                  console.log('[DEBUG] SubmitPage: Input blurred, hiding suggestions');
                  setShowSuggestions(false);
                }
              }, 250);
            }}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
          
          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute w-full bg-white rounded-lg shadow-2xl border-2 border-blue-200 max-h-72 overflow-y-auto"
              role="listbox"
              style={{ 
                top: '100%', 
                marginTop: '8px',
                zIndex: 9999,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              }}
            >
              <div className="py-2">
                {suggestions.map((restaurant) => (
                  <div
                    key={restaurant.id}
                    role="option"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[DEBUG] SubmitPage: Clicked on suggestion:', restaurant.name);
                      selectRestaurant(restaurant);
                    }}
                    onMouseDown={(e) => {
                      // Prevent input from losing focus when clicking suggestion
                      e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectRestaurant(restaurant);
                      }
                    }}
                    className="px-5 py-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 active:bg-blue-100 cursor-pointer transition-all duration-150 border-b border-gray-100 last:border-b-0 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-base group-hover:text-blue-700 transition-colors">
                          {restaurant.name}
                        </div>
                        {restaurant.suburb && (
                          <div className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                            <span className="text-gray-400">📍</span>
                            <span>{restaurant.suburb}</span>
                          </div>
                        )}
                        {restaurant.address && (
                          <div className="text-xs text-gray-500 mt-1.5 line-clamp-1">
                            {restaurant.address}
                          </div>
                        )}
                        {restaurant.cuisine && (
                          <div className="mt-2 inline-block">
                            <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                              {restaurant.cuisine}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Address
          </label>
          <input
            {...register('address')}
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Suburb
            </label>
            <input
              {...register('suburb')}
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Phone
            </label>
            <input
              {...register('phone')}
              type="tel"
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Website URL
          </label>
          <input
            {...register('websiteUrl')}
            type="url"
            placeholder="https://..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.websiteUrl && (
            <p className="mt-1 text-sm text-red-600">{errors.websiteUrl.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Cuisine
            </label>
            <input
              {...register('cuisine')}
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Your Email (optional)
          </label>
          <input
            {...register('submittedBy')}
            type="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Restaurant'}
        </button>
      </form>
    </div>
  );
}
