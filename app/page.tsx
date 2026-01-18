'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import RestaurantFilters, { FilterState } from './components/RestaurantFilters';
import RestaurantList from './components/RestaurantList';
import { useFilterPersistence } from '@/src/hooks/useFilterPersistence';
import LoadingSpinner from './components/LoadingSpinner';
import RestaurantCardSkeleton from './components/RestaurantCardSkeleton';
import StructuredData from './components/StructuredData';

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { filters, setFilters, isLoaded } = useFilterPersistence();

  useEffect(() => {
    console.log('[DEBUG] Home component mounted');
    console.log('[DEBUG] isLoaded:', isLoaded);
    console.log('[DEBUG] filters:', filters);
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const fetchRestaurants = useCallback(async () => {
    console.log('[DEBUG] fetchRestaurants called');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.suburb) params.append('suburb', filters.suburb);
      if (filters.cuisine) params.append('cuisine', filters.cuisine);
      if (filters.openNow) params.append('openNow', 'true');
      
      // Default: Show only restaurants with deals (happy hour, weekly specials, current deals, EatClub, or First Table)
      // User can still filter further using the checkboxes
      const hasAnyDealFilter = filters.hasHappyHour || filters.hasWeeklySpecials || filters.hasCurrentDeals || filters.hasEatClub || filters.hasFirstTable || filters.hasTopPicks;
      
      if (!hasAnyDealFilter) {
        // Default: show restaurants with any type of deal (happy hour, weekly specials, deals, EatClub, or First Table)
        params.append('hasDeals', 'true');
      } else {
        // User has selected specific filters, use those
        if (filters.hasHappyHour) params.append('hasHappyHour', 'true');
        if (filters.hasWeeklySpecials) params.append('hasWeeklySpecials', 'true');
        if (filters.hasCurrentDeals) params.append('hasCurrentDeals', 'true');
        if (filters.hasEatClub) params.append('hasEatClub', 'true');
        if (filters.hasFirstTable) params.append('hasFirstTable', 'true');
        if (filters.hasTopPicks) params.append('hasTopPicks', 'true');
      }

      // Add pagination parameters
      params.append('limit', '50');
      params.append('page', currentPage.toString());

      const url = `/api/restaurants?${params.toString()}`;
      console.log('[DEBUG] Fetching from:', url);
      const response = await fetch(url);
      console.log('[DEBUG] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[DEBUG] Response data:', data);
      console.log('[DEBUG] Response data type:', typeof data);
      console.log('[DEBUG] data.restaurants exists?', !!data.restaurants);
      console.log('[DEBUG] data.restaurants is array?', Array.isArray(data.restaurants));
      console.log('[DEBUG] data.restaurants length:', data.restaurants?.length);
      
      // Handle new paginated response format
      if (data.restaurants && Array.isArray(data.restaurants)) {
        console.log('[DEBUG] Setting restaurants state with', data.restaurants.length, 'items');
        setRestaurants(data.restaurants);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
        console.log('[DEBUG] State updated with', data.restaurants.length, 'restaurants');
        console.log('[DEBUG] Pagination:', data.pagination);
        console.log('[DEBUG] First restaurant:', data.restaurants[0]?.name);
      } else if (Array.isArray(data)) {
        // Fallback for old format (backward compatibility)
        console.log('[DEBUG] Using legacy format, setting', data.length, 'restaurants');
        setRestaurants(data);
        setTotalPages(1);
        setTotalCount(data.length);
        console.log('[DEBUG] State updated with', data.length, 'restaurants (legacy format)');
      } else {
        console.error('[DEBUG] ERROR: Invalid response format!', data);
        console.error('[DEBUG] Data keys:', Object.keys(data || {}));
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('[DEBUG] Error fetching restaurants:', error);
    } finally {
      console.log('[DEBUG] Setting loading to false');
      setLoading(false);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    // Only fetch restaurants after filters are loaded from localStorage
    console.log('[DEBUG] useEffect triggered - isLoaded:', isLoaded, 'filters:', filters, 'page:', currentPage);
    if (isLoaded) {
      console.log('[DEBUG] Calling fetchRestaurants');
      fetchRestaurants();
    } else {
      console.log('[DEBUG] Waiting for filters to load from localStorage');
      // Fallback: if isLoaded doesn't become true within 2 seconds, fetch anyway
      const timeout = setTimeout(() => {
        console.log('[DEBUG] Timeout: isLoaded still false, fetching anyway');
        if (!isLoaded) {
          fetchRestaurants();
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [filters, isLoaded, currentPage, fetchRestaurants]);

  // Scroll to restaurant when restaurantId is in URL (from map click)
  useEffect(() => {
    if (!loading && restaurants.length > 0 && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const restaurantId = urlParams.get('restaurantId');
      if (restaurantId) {
        console.log('[DEBUG] Found restaurantId in URL:', restaurantId);
        // Wait a bit for DOM to render
        setTimeout(() => {
          const element = document.getElementById(`restaurant-${restaurantId}`);
          if (element) {
            console.log('[DEBUG] Scrolling to restaurant element');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add highlight effect
            element.classList.add('ring-4', 'ring-blue-500', 'ring-offset-2', 'transition-all', 'duration-300');
            setTimeout(() => {
              element.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2');
            }, 3000);
            // Clean up URL
            window.history.replaceState({}, '', '/');
          } else {
            console.log('[DEBUG] Restaurant element not found, restaurant may not be in current filter results');
          }
        }, 500);
      }
    }
  }, [loading, restaurants]);

  console.log('[DEBUG] Rendering Home component - loading:', loading, 'restaurants:', restaurants.length, 'isLoaded:', isLoaded);

  // Generate structured data for SEO (memoized to prevent re-renders)
  const structuredData = useMemo(() => {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cheapeats-canberra.vercel.app';
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'CheapEats Canberra',
      description: 'Discover the best restaurant deals, happy hours, and weekly specials in Canberra, Australia',
      url: siteUrl,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
      publisher: {
        '@type': 'Organization',
        name: 'CheapEats Canberra',
        url: siteUrl,
      },
    };
  }, []);

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Debug indicator - should always be visible */}
        <div style={{ position: 'fixed', top: '10px', right: '10px', background: 'red', color: 'white', padding: '10px', zIndex: 9999, fontSize: '12px' }}>
          DEBUG: React is rendering | Loading: {loading ? 'YES' : 'NO'} | Restaurants: {restaurants.length} | isLoaded: {isLoaded ? 'YES' : 'NO'}
        </div>
        {/* Hero Section */}
        <header className="text-center mb-8 animate-fadeIn">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient">
            CheapEats Canberra
          </h1>
          <div className="inline-block bg-white/90 backdrop-blur-md px-6 py-3 rounded-lg shadow-xl border border-white/60 animate-fadeIn">
            <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient drop-shadow-sm">
              Discover the best restaurant deals, happy hours, and weekly specials in Canberra
            </p>
          </div>
        </header>

      {/* Filters */}
      <RestaurantFilters onFilterChange={setFilters} initialFilters={filters} />

      {/* Results */}
      {loading ? (
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-3 py-8">
            <LoadingSpinner size="lg" />
            <p className="text-gray-700 text-lg font-medium">Loading restaurants...</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <RestaurantCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-white/20 inline-block animate-fadeIn">
            <p className="text-gray-800 font-medium">
              Showing <span className="font-semibold text-blue-600">{restaurants.length}</span> of <span className="font-semibold text-blue-600">{totalCount}</span> restaurant{totalCount !== 1 ? 's' : ''} with great deals!
              {totalPages > 1 && (
                <span className="ml-2 text-sm text-gray-600">(Page {currentPage} of {totalPages})</span>
              )}
            </p>
          </div>
          <RestaurantList restaurants={restaurants} />
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  setCurrentPage(prev => Math.max(1, prev - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Previous
              </button>
              
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setCurrentPage(pageNum);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => {
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </>
  );
}
