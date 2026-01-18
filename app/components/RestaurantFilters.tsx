'use client';

import { useState, useEffect } from 'react';

interface RestaurantFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: FilterState;
}

export interface FilterState {
  search: string;
  suburb: string;
  cuisine: string;
  openNow: boolean;
  hasHappyHour: boolean;
  hasWeeklySpecials: boolean;
  hasCurrentDeals: boolean;
  hasEatClub: boolean;
  hasFirstTable: boolean;
}

const SUBURBS = [
  'City', 'Braddon', 'Dickson', 'Kingston', 'Manuka', 'NewActon', 'Civic',
  'Belconnen', 'Tuggeranong', 'Woden', 'Gungahlin', 'Weston Creek'
];

export default function RestaurantFilters({ onFilterChange, initialFilters }: RestaurantFiltersProps) {
  const defaultFilters: FilterState = {
    search: '',
    suburb: '',
    cuisine: '',
    openNow: false,
    hasHappyHour: false,
    hasWeeklySpecials: false,
    hasCurrentDeals: false,
    hasEatClub: false,
    hasFirstTable: false,
  };

  const [filters, setFilters] = useState<FilterState>(initialFilters || defaultFilters);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [cuisinesLoading, setCuisinesLoading] = useState(true);

  // Fetch cuisines from API on component mount
  useEffect(() => {
    const fetchCuisines = async () => {
      try {
        console.log('[DEBUG] Fetching cuisines from API...');
        const response = await fetch('/api/admin/cuisines');
        if (!response.ok) {
          throw new Error(`Failed to fetch cuisines: ${response.status}`);
        }
        const data = await response.json();
        console.log('[DEBUG] Received cuisines:', data.cuisines);
        if (data.cuisines && Array.isArray(data.cuisines)) {
          setCuisines(data.cuisines.sort());
        }
      } catch (error) {
        console.error('[DEBUG] Error fetching cuisines:', error);
        // Fallback to empty array if API fails
        setCuisines([]);
      } finally {
        setCuisinesLoading(false);
      }
    };

    fetchCuisines();
  }, []);

  // Sync with initialFilters when they change (e.g., loaded from localStorage)
  useEffect(() => {
    if (initialFilters) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const updateFilter = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    const resetFilters: FilterState = {
      search: '',
      suburb: '',
      cuisine: '',
      openNow: false,
      hasHappyHour: false,
      hasWeeklySpecials: false,
      hasCurrentDeals: false,
      hasEatClub: false,
      hasFirstTable: false,
    };
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  return (
    <div className="p-4 rounded-lg mb-6" style={{ background: 'transparent' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Search
          </label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="Restaurant name or suburb..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Suburb */}
        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Suburb
          </label>
          <select
            value={filters.suburb}
            onChange={(e) => updateFilter('suburb', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Suburbs</option>
            {SUBURBS.map(suburb => (
              <option key={suburb} value={suburb}>{suburb}</option>
            ))}
          </select>
        </div>

        {/* Cuisine */}
        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Cuisine
          </label>
          <select
            value={filters.cuisine}
            onChange={(e) => updateFilter('cuisine', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={cuisinesLoading}
          >
            <option value="">All Cuisines</option>
            {cuisinesLoading ? (
              <option value="">Loading cuisines...</option>
            ) : (
              cuisines.map(cuisine => (
                <option key={cuisine} value={cuisine}>{cuisine}</option>
              ))
            )}
          </select>
        </div>

        {/* Open Now */}
        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20 flex items-end">
          <label className="flex items-center cursor-pointer w-full">
            <input
              type="checkbox"
              checked={filters.openNow}
              onChange={(e) => updateFilter('openNow', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              Open Now
            </span>
          </label>
        </div>
      </div>

      {/* Deal Type Filters */}
      <div className="mt-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20">
        <label className="block text-sm font-medium text-gray-800 mb-2">
          Deal Types <span className="text-xs text-gray-600">(select multiple - shows restaurants with any selected type)</span>
        </label>
        <div className="flex gap-4 flex-wrap">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasHappyHour}
              onChange={(e) => updateFilter('hasHappyHour', e.target.checked)}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              🍺 Happy Hour
            </span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasWeeklySpecials}
              onChange={(e) => updateFilter('hasWeeklySpecials', e.target.checked)}
              className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              📅 Weekly Specials
            </span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasCurrentDeals}
              onChange={(e) => updateFilter('hasCurrentDeals', e.target.checked)}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              💰 Current Deals
            </span>
          </label>
        </div>
      </div>

      {/* Deal Platform Filters */}
      <div className="mt-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20">
        <label className="block text-sm font-medium text-gray-800 mb-2">
          Deal Platforms
        </label>
        <div className="flex gap-4 flex-wrap">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasEatClub}
              onChange={(e) => updateFilter('hasEatClub', e.target.checked)}
              className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              🍽️ EatClub
            </span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasFirstTable}
              onChange={(e) => updateFilter('hasFirstTable', e.target.checked)}
              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-800">
              🍴 First Table
            </span>
          </label>
        </div>
      </div>

      {/* Reset Button */}
      <div className="mt-4">
        <button
          onClick={resetFilters}
          className="px-4 py-2 bg-white/90 backdrop-blur-sm text-gray-700 rounded-lg hover:bg-white shadow-md border border-white/20 text-sm font-medium transition-all duration-200 hover:shadow-lg hover:scale-105"
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
}
