'use client';

import { useEffect, useState } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import { RestaurantSubmission } from '@/src/lib/schema/submissions';
import RestaurantFilters, { FilterState } from '../components/RestaurantFilters';
import AdminRestaurantTable from '../components/AdminRestaurantTable';
import SubmissionsTable from '../components/SubmissionsTable';
import RecentChanges from '../components/RecentChanges';
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
  const [submissions, setSubmissions] = useState<RestaurantSubmission[]>([]);
  const [submissionsCount, setSubmissionsCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'restaurants' | 'submissions' | 'changes'>('restaurants');
  const [editingRestaurantId, setEditingRestaurantId] = useState<number | null>(null);
  const [updating, setUpdating] = useState<{
    findEatClub: boolean;
    syncEatClub: boolean;
    searchImages: boolean;
  }>({
    findEatClub: false,
    syncEatClub: false,
    searchImages: false,
  });
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateResults, setUpdateResults] = useState<{
    type: 'find-eatclub' | 'sync-eatclub' | 'search-images' | null;
    success: boolean;
    message: string;
    stats?: any;
    data?: any; // Full response data
    error?: string;
  } | null>(null);
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

  // Fetch submissions count on mount and when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSubmissionsCount();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    console.log('[DEBUG] AdminPage: useEffect triggered, fetching restaurants');
    if (activeTab === 'restaurants') {
      fetchRestaurants();
    } else {
      fetchSubmissions();
    }
  }, [filters, activeTab]);

  const fetchSubmissionsCount = async () => {
    try {
      const response = await fetch('/api/admin/submissions?status=all');
      if (response.ok) {
        const data = await response.json();
        if (data.submissions && Array.isArray(data.submissions)) {
          setSubmissionsCount(data.submissions.length);
          setPendingCount(data.submissions.filter((s: RestaurantSubmission) => s.status === 'pending').length);
        }
      }
    } catch (error) {
      console.error('Error fetching submissions count:', error);
    }
  };

  const fetchSubmissions = async () => {
    console.log('[DEBUG] AdminPage: fetchSubmissions called');
    setSubmissionsLoading(true);
    try {
      const response = await fetch('/api/admin/submissions?status=all');
      console.log('[DEBUG] AdminPage: Submissions response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[DEBUG] AdminPage: Submissions data:', data);
      
      if (data.submissions && Array.isArray(data.submissions)) {
        console.log('[DEBUG] AdminPage: Received', data.submissions.length, 'submissions');
        setSubmissions(data.submissions);
        setSubmissionsCount(data.submissions.length);
        setPendingCount(data.submissions.filter((s: RestaurantSubmission) => s.status === 'pending').length);
      } else {
        console.error('[DEBUG] AdminPage: ERROR: Invalid submissions response format!', data);
        setSubmissions([]);
        setSubmissionsCount(0);
        setPendingCount(0);
      }
    } catch (error) {
      console.error('[DEBUG] AdminPage: Error fetching submissions:', error);
      setSubmissions([]);
    } finally {
      console.log('[DEBUG] AdminPage: Setting submissions loading to false');
      setSubmissionsLoading(false);
    }
  };

  const fetchRestaurants = async () => {
    console.log('[DEBUG] AdminPage: fetchRestaurants called');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.suburb) params.append('suburb', filters.suburb);
      if (filters.cuisine) params.append('cuisine', filters.cuisine);
      if (filters.openNow) params.append('openNow', 'true');
      
      // Apply deal filters only if explicitly selected (admin should see all restaurants by default)
      const hasAnyDealFilter = filters.hasHappyHour || filters.hasWeeklySpecials || filters.hasCurrentDeals || filters.hasEatClub || filters.hasFirstTable;
      
      if (hasAnyDealFilter) {
        if (filters.hasHappyHour) params.append('hasHappyHour', 'true');
        if (filters.hasWeeklySpecials) params.append('hasWeeklySpecials', 'true');
        if (filters.hasCurrentDeals) params.append('hasCurrentDeals', 'true');
        if (filters.hasEatClub) params.append('hasEatClub', 'true');
        if (filters.hasFirstTable) params.append('hasFirstTable', 'true');
      }
      // Note: We don't add 'hasDeals' filter by default for admin - we want to see ALL restaurants

      // Admin page should show ALL restaurants (no pagination limit, including inactive)
      params.append('limit', '10000'); // Very high limit to get all restaurants
      params.append('page', '1');
      params.append('includeInactive', 'true'); // Include inactive restaurants for admin

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
          <div className="flex gap-2">
            {activeTab === 'restaurants' && (
              <button
                onClick={async () => {
                  const name = prompt('Enter restaurant name:');
                  if (!name || !name.trim()) return;

                  try {
                    const response = await fetch('/api/admin/restaurants/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: name.trim() }),
                    });

                    if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.error || 'Failed to create restaurant');
                    }

                    const result = await response.json();
                    setEditingRestaurantId(result.restaurantId);
                    fetchRestaurants();
                  } catch (error) {
                    console.error('Error creating restaurant:', error);
                    alert(error instanceof Error ? error.message : 'Failed to create restaurant');
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
              >
                + Create New Restaurant
              </button>
            )}
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'restaurants'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Restaurants
          </button>
          <button
            onClick={() => {
              setActiveTab('submissions');
              if (submissions.length === 0) {
                fetchSubmissions();
              }
            }}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'submissions'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Submissions
            {submissionsCount > 0 && (
              <span className={`ml-2 px-2 py-0.5 text-white text-xs rounded-full ${
                pendingCount > 0 ? 'bg-yellow-500' : 'bg-gray-500'
              }`}>
                {pendingCount > 0 ? pendingCount : submissionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'changes'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Recent Changes
          </button>
        </div>
      </div>

      {/* Update Actions Section */}
      <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Update Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={async () => {
              setUpdating(prev => ({ ...prev, findEatClub: true }));
              setUpdateResults({
                type: 'find-eatclub',
                success: false,
                message: 'Searching EatClub for new restaurants in Canberra...',
              });
              try {
                const response = await fetch('/api/admin/update/find-eatclub', {
                  method: 'POST',
                });
                const data = await response.json();
                if (response.ok) {
                  setUpdateResults({
                    type: 'find-eatclub',
                    success: true,
                    message: data.message || 'Search complete',
                    stats: data.stats,
                    data: data,
                  });
                  // Refresh restaurants list
                  fetchRestaurants();
                } else {
                  setUpdateResults({
                    type: 'find-eatclub',
                    success: false,
                    message: 'Failed to find restaurants',
                    error: data.error || 'Unknown error',
                  });
                }
              } catch (error) {
                setUpdateResults({
                  type: 'find-eatclub',
                  success: false,
                  message: 'Failed to find restaurants',
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              } finally {
                setUpdating(prev => ({ ...prev, findEatClub: false }));
              }
            }}
            disabled={updating.findEatClub || updating.syncEatClub || updating.searchImages}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            {updating.findEatClub ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Finding...</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>Find New EatClub Restaurants</span>
              </>
            )}
          </button>

          <button
            onClick={async () => {
              setUpdating(prev => ({ ...prev, syncEatClub: true }));
              setUpdateResults({
                type: 'sync-eatclub',
                success: false,
                message: 'Syncing EatClub data for existing restaurants...',
              });
              try {
                const response = await fetch('/api/admin/update/sync-eatclub', {
                  method: 'POST',
                });
                const data = await response.json();
                if (response.ok) {
                  setUpdateResults({
                    type: 'sync-eatclub',
                    success: true,
                    message: data.message || 'Sync complete',
                    stats: data.stats,
                    data: data,
                  });
                  // Refresh restaurants list
                  fetchRestaurants();
                } else {
                  setUpdateResults({
                    type: 'sync-eatclub',
                    success: false,
                    message: 'Failed to sync EatClub',
                    error: data.error || 'Unknown error',
                  });
                }
              } catch (error) {
                setUpdateResults({
                  type: 'sync-eatclub',
                  success: false,
                  message: 'Failed to sync EatClub',
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              } finally {
                setUpdating(prev => ({ ...prev, syncEatClub: false }));
              }
            }}
            disabled={updating.findEatClub || updating.syncEatClub || updating.searchImages}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            {updating.syncEatClub ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Sync EatClub</span>
              </>
            )}
          </button>

          <button
            onClick={async () => {
              setUpdating(prev => ({ ...prev, searchImages: true }));
              setUpdateResults({
                type: 'search-images',
                success: false,
                message: 'Searching for images for restaurants without images...',
              });
              try {
                const response = await fetch('/api/admin/update/search-images', {
                  method: 'POST',
                });
                const data = await response.json();
                if (response.ok) {
                  setUpdateResults({
                    type: 'search-images',
                    success: true,
                    message: data.message || 'Image search complete',
                    stats: data.stats,
                    data: data,
                  });
                  // Refresh restaurants list
                  fetchRestaurants();
                } else {
                  setUpdateResults({
                    type: 'search-images',
                    success: false,
                    message: 'Failed to search images',
                    error: data.error || 'Unknown error',
                  });
                }
              } catch (error) {
                setUpdateResults({
                  type: 'search-images',
                  success: false,
                  message: 'Failed to search images',
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              } finally {
                setUpdating(prev => ({ ...prev, searchImages: false }));
              }
            }}
            disabled={updating.findEatClub || updating.syncEatClub || updating.searchImages}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            {updating.searchImages ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <span>🖼️</span>
                <span>Search for Images</span>
              </>
            )}
          </button>
        </div>
        
        {/* Detailed Results Box */}
        {updateResults && (
          <div className={`mt-6 p-6 rounded-lg border-2 shadow-lg ${
            updateResults.success
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <h3 className={`text-lg font-bold ${
                updateResults.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {updateResults.success ? '✅ Process Complete' : '❌ Process Failed'}
              </h3>
              <button
                onClick={() => setUpdateResults(null)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Process Description */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Process:</h4>
                <p className="text-gray-700 text-sm">{updateResults.message}</p>
              </div>
              
              {/* Results */}
              {updateResults.success && updateResults.stats && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Results:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {updateResults.type === 'find-eatclub' && (
                      <>
                        {updateResults.stats.totalEatClubVenues !== undefined && (
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <div className="text-2xl font-bold text-gray-600">{updateResults.stats.totalEatClubVenues}</div>
                            <div className="text-xs text-gray-600 mt-1">Total EatClub Venues</div>
                          </div>
                        )}
                        <div className="bg-white p-3 rounded border border-green-200">
                          <div className="text-2xl font-bold text-green-600">{updateResults.stats.newRestaurants || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">New Restaurants Found</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-blue-200">
                          <div className="text-2xl font-bold text-blue-600">{updateResults.stats.matched || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Matched Existing</div>
                        </div>
                        {updateResults.data?.restaurantsUpdated !== undefined && (
                          <div className="bg-white p-3 rounded border border-purple-200">
                            <div className="text-2xl font-bold text-purple-600">{updateResults.data.restaurantsUpdated}</div>
                            <div className="text-xs text-gray-600 mt-1">Restaurants Updated</div>
                          </div>
                        )}
                        {updateResults.stats.errors > 0 && (
                          <div className="bg-white p-3 rounded border border-red-200">
                            <div className="text-2xl font-bold text-red-600">{updateResults.stats.errors}</div>
                            <div className="text-xs text-gray-600 mt-1">Errors</div>
                          </div>
                        )}
                      </>
                    )}
                    
                    {updateResults.type === 'sync-eatclub' && (
                      <>
                        <div className="bg-white p-3 rounded border border-green-200">
                          <div className="text-2xl font-bold text-green-600">{updateResults.stats.updated || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Restaurants Updated</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-blue-200">
                          <div className="text-2xl font-bold text-blue-600">{updateResults.stats.dealsFound || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Deals Found</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-purple-200">
                          <div className="text-2xl font-bold text-purple-600">{updateResults.stats.imagesFound || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Images Found</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-orange-200">
                          <div className="text-2xl font-bold text-orange-600">{updateResults.stats.removed || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Outdated Removed</div>
                        </div>
                        {updateResults.stats.processed && (
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <div className="text-2xl font-bold text-gray-600">{updateResults.stats.processed}</div>
                            <div className="text-xs text-gray-600 mt-1">Total Processed</div>
                          </div>
                        )}
                        {updateResults.stats.errors > 0 && (
                          <div className="bg-white p-3 rounded border border-red-200">
                            <div className="text-2xl font-bold text-red-600">{updateResults.stats.errors}</div>
                            <div className="text-xs text-gray-600 mt-1">Errors</div>
                          </div>
                        )}
                      </>
                    )}
                    
                    {updateResults.type === 'search-images' && (
                      <>
                        <div className="bg-white p-3 rounded border border-green-200">
                          <div className="text-2xl font-bold text-green-600">{updateResults.stats.updated || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">Restaurants Updated</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-blue-200">
                          <div className="text-2xl font-bold text-blue-600">{updateResults.stats.foundEatClub || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">From EatClub</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-purple-200">
                          <div className="text-2xl font-bold text-purple-600">{updateResults.stats.foundUberEats || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">From UberEats</div>
                        </div>
                        <div className="bg-white p-3 rounded border border-orange-200">
                          <div className="text-2xl font-bold text-orange-600">{updateResults.stats.foundWebsite || 0}</div>
                          <div className="text-xs text-gray-600 mt-1">From Websites</div>
                        </div>
                        {updateResults.stats.total && (
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <div className="text-2xl font-bold text-gray-600">{updateResults.stats.total}</div>
                            <div className="text-xs text-gray-600 mt-1">Total Without Images</div>
                          </div>
                        )}
                        {updateResults.stats.processed && (
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <div className="text-2xl font-bold text-gray-600">{updateResults.stats.processed}</div>
                            <div className="text-xs text-gray-600 mt-1">Processed</div>
                          </div>
                        )}
                        {updateResults.stats.skipped > 0 && (
                          <div className="bg-white p-3 rounded border border-yellow-200">
                            <div className="text-2xl font-bold text-yellow-600">{updateResults.stats.skipped}</div>
                            <div className="text-xs text-gray-600 mt-1">Skipped</div>
                          </div>
                        )}
                        {updateResults.stats.errors > 0 && (
                          <div className="bg-white p-3 rounded border border-red-200">
                            <div className="text-2xl font-bold text-red-600">{updateResults.stats.errors}</div>
                            <div className="text-xs text-gray-600 mt-1">Errors</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {/* Error Display */}
              {!updateResults.success && updateResults.error && (
                <div className="bg-red-100 p-3 rounded border border-red-300">
                  <p className="text-red-800 text-sm font-medium">Error Details:</p>
                  <p className="text-red-700 text-sm mt-1">{updateResults.error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filters - only show for restaurants tab */}
      {activeTab === 'restaurants' && <RestaurantFilters onFilterChange={setFilters} />}

      {/* Content based on active tab */}
      {activeTab === 'restaurants' ? (
        <>
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
                initialEditingId={editingRestaurantId}
                onEditComplete={() => {
                  setEditingRestaurantId(null);
                  fetchRestaurants();
                }}
              />
            </>
          )}
        </>
      ) : activeTab === 'submissions' ? (
        <>
          {/* Submissions */}
          {submissionsLoading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <LoadingSpinner size="lg" />
              <p className="text-gray-900 text-lg font-medium">Loading submissions...</p>
            </div>
          ) : (
            <SubmissionsTable
              submissions={submissions}
              onUpdate={() => {
                fetchSubmissions();
                fetchSubmissionsCount();
              }}
              onNavigateToRestaurant={(restaurantId) => {
                setEditingRestaurantId(restaurantId);
                setActiveTab('restaurants');
                // Refresh restaurants to ensure we have the latest data
                fetchRestaurants();
              }}
            />
          )}
        </>
      ) : (
        <>
          {/* Recent Changes */}
          <RecentChanges
            onRevert={() => {
              fetchRestaurants();
            }}
          />
        </>
      )}
    </div>
  );
}
