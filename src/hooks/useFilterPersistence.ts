import { useState, useEffect } from 'react';
import { FilterState } from '@/app/components/RestaurantFilters';

const FILTER_STORAGE_KEY = 'cheapeats_filters';

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
  hasTopPicks: false,
};

/**
 * Hook to persist filter state across page navigation using localStorage
 */
export function useFilterPersistence() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load filters from localStorage on mount
  useEffect(() => {
    console.log('[DEBUG] useFilterPersistence: Loading filters from localStorage');
    if (typeof window === 'undefined') {
      console.log('[DEBUG] useFilterPersistence: window is undefined (SSR), setting isLoaded to true');
      setIsLoaded(true);
      return;
    }

    try {
      const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
      console.log('[DEBUG] useFilterPersistence: savedFilters from localStorage:', savedFilters);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        console.log('[DEBUG] useFilterPersistence: parsed filters:', parsed);
        // Validate and merge with defaults to handle schema changes
        const mergedFilters: FilterState = {
          ...defaultFilters,
          ...parsed,
        };
        console.log('[DEBUG] useFilterPersistence: merged filters:', mergedFilters);
        setFilters(mergedFilters);
      } else {
        console.log('[DEBUG] useFilterPersistence: No saved filters, using defaults');
        setFilters(defaultFilters);
      }
    } catch (error) {
      console.error('[DEBUG] useFilterPersistence: Error loading filters from localStorage:', error);
      // Use defaults if there's an error
      setFilters(defaultFilters);
    } finally {
      console.log('[DEBUG] useFilterPersistence: Setting isLoaded to true');
      setIsLoaded(true);
    }
  }, []);

  // Save filters to localStorage whenever they change
  const updateFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(newFilters));
      } catch (error) {
        console.error('Error saving filters to localStorage:', error);
      }
    }
  };

  return {
    filters,
    setFilters: updateFilters,
    isLoaded,
  };
}

