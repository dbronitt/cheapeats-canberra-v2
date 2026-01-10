'use client';

import { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  
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

  // Watch restaurant name for autocomplete
  const watchedName = watch('name');

  useEffect(() => {
    if (watchedName && watchedName.length >= 2) {
      searchRestaurants(watchedName);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [watchedName]);

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

  const searchRestaurants = async (query: string) => {
    try {
      const response = await fetch(`/api/restaurants/search?q=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error('Error searching restaurants:', error);
    }
  };

  const selectRestaurant = (restaurant: RestaurantSuggestion) => {
    setSelectedRestaurant(restaurant);
    setValue('name', restaurant.name);
    if (restaurant.address) setValue('address', restaurant.address);
    if (restaurant.suburb) setValue('suburb', restaurant.suburb);
    if (restaurant.phone) setValue('phone', restaurant.phone);
    if (restaurant.cuisine) setValue('cuisine', restaurant.cuisine);
    if (restaurant.priceRange) setValue('priceRange', restaurant.priceRange);
    setSuggestions([]);
    setShowSuggestions(false);
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
            ref={inputRef}
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
          
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
            >
              {suggestions.map((restaurant) => (
                <div
                  key={restaurant.id}
                  onClick={() => selectRestaurant(restaurant)}
                  className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-200 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{restaurant.name}</div>
                  {restaurant.suburb && (
                    <div className="text-sm text-gray-700">{restaurant.suburb}</div>
                  )}
                  {restaurant.address && (
                    <div className="text-xs text-gray-600">{restaurant.address}</div>
                  )}
                </div>
              ))}
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
