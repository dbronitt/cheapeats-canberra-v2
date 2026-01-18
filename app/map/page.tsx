'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Restaurant } from '@/src/lib/schema/restaurants';
import RestaurantFilters, { FilterState } from '../components/RestaurantFilters';
import { useFilterPersistence } from '@/src/hooks/useFilterPersistence';

// Dynamically import map to avoid SSR issues
const RestaurantMap = dynamic(() => import('../components/RestaurantMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-0">Loading map...</div>,
});

export default function MapPage() {
  console.log('[DEBUG] MapPage: Component rendering');
  
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHeight, setFilterHeight] = useState(200); // Initial filter section height in pixels
  const [isDragging, setIsDragging] = useState(false);
  const { filters, setFilters, isLoaded } = useFilterPersistence();

  useEffect(() => {
    // Only fetch restaurants after filters are loaded from localStorage
    console.log('[DEBUG] MapPage useEffect - isLoaded:', isLoaded, 'filters:', filters);
    if (isLoaded) {
      console.log('[DEBUG] MapPage: Calling fetchRestaurants');
      fetchRestaurants();
    } else {
      console.log('[DEBUG] MapPage: Waiting for filters to load from localStorage');
      // Fallback: if isLoaded doesn't become true within 2 seconds, fetch anyway
      const timeout = setTimeout(() => {
        console.log('[DEBUG] MapPage: Timeout - isLoaded still false, fetching anyway');
        if (!isLoaded) {
          fetchRestaurants();
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [filters, isLoaded]);

  const fetchRestaurants = async () => {
    console.log('[DEBUG] MapPage: fetchRestaurants called');
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

      // Map page should show ALL restaurants (no pagination limit)
      params.append('limit', '10000'); // Very high limit to get all restaurants
      params.append('page', '1');

      const url = `/api/restaurants?${params.toString()}`;
      console.log('[DEBUG] MapPage: Fetching from:', url);
      const response = await fetch(url);
      console.log('[DEBUG] MapPage: Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[DEBUG] MapPage: Response data:', data);
      
      // Handle paginated response format
      if (data.restaurants && Array.isArray(data.restaurants)) {
        console.log('[DEBUG] MapPage: Received', data.restaurants.length, 'restaurants (paginated format)');
        setRestaurants(data.restaurants);
      } else if (Array.isArray(data)) {
        // Fallback for old format (backward compatibility)
        console.log('[DEBUG] MapPage: Received', data.length, 'restaurants (legacy format)');
        setRestaurants(data);
      } else {
        console.error('[DEBUG] MapPage: ERROR: Invalid response format!', data);
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('[DEBUG] MapPage: Error fetching restaurants:', error);
    } finally {
      console.log('[DEBUG] MapPage: Setting loading to false');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Hide footer on map page
    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = 'none';
    }
    
    return () => {
      // Show footer again when leaving map page
      if (footer) {
        footer.style.display = '';
      }
    };
  }, []);

  // Handle drag to resize map
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : 80;
      const viewportHeight = window.innerHeight;
      const availableHeight = viewportHeight - headerHeight;
      
      // Calculate new filter height based on mouse position
      const mouseY = e.clientY - headerHeight;
      const newFilterHeight = Math.max(100, Math.min(availableHeight - 200, mouseY));
      
      setFilterHeight(newFilterHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Trigger map resize when filter height changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const mapContainer = document.querySelector('.leaflet-container');
      if (mapContainer) {
        window.dispatchEvent(new Event('resize'));
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [filterHeight]);

  // Calculate header height dynamically
  const [headerHeight, setHeaderHeight] = useState(80); // Default header height
  
  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };
    
    // Set initial height
    updateHeaderHeight();
    
    // Update on resize
    window.addEventListener('resize', updateHeaderHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  return (
    <div 
      className="fixed flex flex-col" 
      style={{ 
        top: `${headerHeight}px`, 
        left: 0, 
        right: 0, 
        bottom: 0,
        height: `calc(100vh - ${headerHeight}px)`,
        width: '100vw',
        zIndex: 1000
      }}
    >
      {/* Map Container - Takes remaining space, on top */}
      <div 
        className="flex-1 relative" 
        style={{ 
          flex: '1 1 0%',
          minHeight: 0,
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      >
        {loading ? (
          <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-10">
            <p className="text-gray-600">Loading map...</p>
          </div>
        ) : (
          <RestaurantMap 
            restaurants={restaurants}
            center={[-35.2809, 149.1300]}
            zoom={13}
          />
        )}
      </div>

      {/* Draggable Resizer */}
      <div
        className="flex-shrink-0 w-full cursor-row-resize bg-gray-300 hover:bg-blue-500 transition-colors relative"
        style={{ 
          height: '4px'
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-1 bg-gray-400 rounded-full"></div>
        </div>
      </div>

      {/* Filters Section - Below map, resizable */}
      <div 
        data-filters-section
        className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-sm overflow-y-auto"
        style={{ 
          height: `${filterHeight}px`,
          minHeight: '100px',
          maxHeight: 'calc(100vh - 300px)'
        }}
      >
        <div className="container mx-auto px-4 py-2">
          <h1 className="text-xl font-bold mb-2 text-gray-900">Restaurant Map</h1>
          <RestaurantFilters onFilterChange={setFilters} initialFilters={filters} />
        </div>
      </div>
    </div>
  );
}
