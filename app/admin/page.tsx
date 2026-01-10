'use client';

import { useEffect, useState } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import RestaurantFilters, { FilterState } from '../components/RestaurantFilters';
import AdminRestaurantTable from '../components/AdminRestaurantTable';
import LoadingSpinner from '../components/LoadingSpinner';
import RestaurantCardSkeleton from '../components/RestaurantCardSkeleton';

const ADMIN_PASSWORD_KEY = 'admin_authenticated';

export default function AdminPage() {
  console.log('[DEBUG] AdminPage: Component rendering');
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    suburb: '',
    cuisine: '',
    openNow: false,
    hasHappyHour: false,
    hasWeeklySpecials: false,
    hasCurrentDeals: false,
    hasEatClub: false,
    hasFirstTable: false,
  });

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = () => {
      if (typeof window === 'undefined') return;
      
      const authData = localStorage.getItem(ADMIN_PASSWORD_KEY);
      if (authData) {
        try {
          const { password: storedPassword } = JSON.parse(authData);
          
          // Verify password is still correct (in case it changed)
          const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';
          if (storedPassword === correctPassword) {
            console.log('[DEBUG] AdminPage: User is already authenticated, keeping signed in');
            setIsAuthenticated(true);
            setCheckingAuth(false);
            return;
          } else {
            // Password changed, clear old session
            console.log('[DEBUG] AdminPage: Password changed, clearing old session');
            localStorage.removeItem(ADMIN_PASSWORD_KEY);
          }
        } catch (e) {
          console.error('[DEBUG] AdminPage: Error parsing auth data:', e);
          localStorage.removeItem(ADMIN_PASSWORD_KEY);
        }
      }
      setCheckingAuth(false);
    };
    
    checkAuth();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';
    
    if (password === correctPassword) {
      // Store authentication (persists until logout or password change)
      const authData = {
        password: correctPassword
      };
      localStorage.setItem(ADMIN_PASSWORD_KEY, JSON.stringify(authData));
      console.log('[DEBUG] AdminPage: Login successful, user will stay signed in');
      setIsAuthenticated(true);
      setPassword('');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
    setIsAuthenticated(false);
    setRestaurants([]);
  };

  useEffect(() => {
    console.log('[DEBUG] AdminPage: useEffect triggered, fetching restaurants');
    fetchRestaurants();
  }, [filters]);

  const fetchRestaurants = async () => {
    console.log('[DEBUG] AdminPage: fetchRestaurants called');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.suburb) params.append('suburb', filters.suburb);
      if (filters.cuisine) params.append('cuisine', filters.cuisine);
      if (filters.openNow) params.append('openNow', 'true');
      
      // Default: Show only restaurants with deals
      const hasAnyDealFilter = filters.hasHappyHour || filters.hasWeeklySpecials || filters.hasCurrentDeals || filters.hasEatClub || filters.hasFirstTable;
      
      if (!hasAnyDealFilter) {
        params.append('hasDeals', 'true');
      } else {
        if (filters.hasHappyHour) params.append('hasHappyHour', 'true');
        if (filters.hasWeeklySpecials) params.append('hasWeeklySpecials', 'true');
        if (filters.hasCurrentDeals) params.append('hasCurrentDeals', 'true');
        if (filters.hasEatClub) params.append('hasEatClub', 'true');
        if (filters.hasFirstTable) params.append('hasFirstTable', 'true');
      }

      // Admin page should show ALL restaurants (no pagination limit)
      params.append('limit', '10000'); // Very high limit to get all restaurants
      params.append('page', '1');

      const url = `/api/restaurants?${params.toString()}`;
      console.log('[DEBUG] AdminPage: Fetching from:', url);
      const response = await fetch(url);
      console.log('[DEBUG] AdminPage: Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[DEBUG] AdminPage: Response data:', data);
      
      // Handle paginated response format
      if (data.restaurants && Array.isArray(data.restaurants)) {
        console.log('[DEBUG] AdminPage: Received', data.restaurants.length, 'restaurants (paginated format)');
        setRestaurants(data.restaurants);
      } else if (Array.isArray(data)) {
        // Fallback for old format (backward compatibility)
        console.log('[DEBUG] AdminPage: Received', data.length, 'restaurants (legacy format)');
        setRestaurants(data);
      } else {
        console.error('[DEBUG] AdminPage: ERROR: Invalid response format!', data);
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('[DEBUG] AdminPage: Error fetching restaurants:', error);
    } finally {
      console.log('[DEBUG] AdminPage: Setting loading to false');
      setLoading(false);
    }
  };

  const handleUpdateRestaurant = async (id: number, updates: Partial<Restaurant>) => {
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update restaurant');
      }

      const result = await response.json();
      
      // Update the restaurant in the local state
      setRestaurants(prev =>
        prev.map(restaurant =>
          restaurant.id === id ? { ...restaurant, ...result.restaurant } : restaurant
        )
      );

      return result;
    } catch (error) {
      console.error('Error updating restaurant:', error);
      throw error;
    }
  };

  // Show loading while checking authentication
  if (checkingAuth) {
    return (
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="max-w-md mx-auto mt-16">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent text-center">
              Admin Access
            </h1>
            <p className="text-gray-600 text-center mb-6">Please enter the password to access the admin panel</p>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Enter admin password"
                  autoFocus
                />
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 relative z-10 bg-white rounded-lg shadow-lg my-8">
      {/* Admin Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
              Admin Panel
            </h1>
            <p className="text-gray-900">Manage restaurants and deals</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Filters */}
      <RestaurantFilters onFilterChange={setFilters} />

      {/* Results */}
      {loading ? (
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-3 py-8">
            <LoadingSpinner size="lg" />
            <p className="text-gray-900 text-lg font-medium">Loading restaurants...</p>
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
              Found <span className="font-semibold text-blue-600">{restaurants.length}</span> restaurant{restaurants.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Restaurant Table */}
          <AdminRestaurantTable
            restaurants={restaurants}
            onUpdate={handleUpdateRestaurant}
          />
        </>
      )}
    </div>
  );
}
