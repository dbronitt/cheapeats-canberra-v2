'use client';

import { useState, useEffect } from 'react';
import { Restaurant } from '@/src/lib/schema/restaurants';
import AdminRestaurantCard from './AdminRestaurantCard';

interface AdminRestaurantTableProps {
  restaurants: Restaurant[];
  onUpdate: (id: number, updates: Partial<Restaurant>) => Promise<void>;
  initialEditingId?: number | null;
  onEditComplete?: () => void;
}

type StatusFilter = 'all' | 'active' | 'inactive';

export default function AdminRestaurantTable({ restaurants, onUpdate, initialEditingId, onEditComplete }: AdminRestaurantTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingId, setEditingId] = useState<number | null>(initialEditingId || null);
  
  // Update editingId when initialEditingId changes
  useEffect(() => {
    if (initialEditingId !== undefined) {
      setEditingId(initialEditingId);
    }
  }, [initialEditingId]);

  // Ensure restaurants is an array
  const restaurantsArray = Array.isArray(restaurants) ? restaurants : [];

  // Helper function to check if restaurant has deals
  const hasDeals = (restaurant: Restaurant): boolean => {
    const happyHour = restaurant.happyHour;
    const weeklySpecials = restaurant.weeklySpecials;
    const deals = restaurant.deals;
    const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
    const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
    
    return (
      (happyHour !== null && happyHour !== undefined) ||
      (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
      (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0) ||
      hasEatClubUrl ||
      hasFirstTableUrl
    );
  };

  // Filter restaurants based on status
  const filteredRestaurants = restaurantsArray.filter(restaurant => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') {
      // Active: restaurants with deals OR explicitly set to active status
      return restaurant.status === 'active' || hasDeals(restaurant);
    }
    // Inactive: restaurants without deals AND not explicitly active
    return restaurant.status !== 'active' && !hasDeals(restaurant);
  }).sort((a, b) => {
    // Sort: restaurants with images first, those without images last
    const aHasImages = a.imageUrls !== null && Array.isArray(a.imageUrls) && a.imageUrls.length > 0;
    const bHasImages = b.imageUrls !== null && Array.isArray(b.imageUrls) && b.imageUrls.length > 0;
    
    // If both have images or both don't have images, sort by name
    if (aHasImages === bHasImages) {
      return a.name.localeCompare(b.name);
    }
    
    // Restaurants with images come first
    return aHasImages ? -1 : 1;
  });

  const handleEditClick = (id: number) => {
    setEditingId(id);
  };

  const handleEditComplete = () => {
    setEditingId(null);
    if (onEditComplete) {
      onEditComplete();
    }
  };

  const handleUpdate = async (id: number, updates: Partial<Restaurant>) => {
    await onUpdate(id, updates);
    handleEditComplete();
  };

  // If editing, show the card view
  if (editingId !== null) {
    const restaurant = restaurantsArray.find(r => r.id === editingId);
    if (restaurant) {
      return (
        <div className="mb-6">
          <button
            onClick={handleEditComplete}
            className="mb-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back to Table
          </button>
          <AdminRestaurantCard
            restaurant={restaurant}
            onUpdate={handleUpdate}
            initialEditMode={true}
          />
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="flex items-center gap-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-md border border-white/20">
        <label className="text-sm font-medium text-gray-800">Filter by Status:</label>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({restaurantsArray.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              statusFilter === 'active'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active ({restaurantsArray.filter(r => r.status === 'active' || hasDeals(r)).length})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              statusFilter === 'inactive'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive ({restaurantsArray.filter(r => r.status !== 'active' && !hasDeals(r)).length})
          </button>
        </div>
        <div className="ml-auto text-sm text-gray-600">
          Showing {filteredRestaurants.length} of {restaurantsArray.length} restaurants
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cuisine
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deals
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Images
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRestaurants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No restaurants found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredRestaurants.map((restaurant) => {
                  const imageUrls = (restaurant.imageUrls as string[] | null) || [];
                  const hasHappyHour = restaurant.happyHour !== null;
                  const hasWeeklySpecials = Array.isArray(restaurant.weeklySpecials) && restaurant.weeklySpecials.length > 0;
                  const hasDeals = Array.isArray(restaurant.deals) && restaurant.deals.length > 0;
                  const hasAnyDeal = hasHappyHour || hasWeeklySpecials || hasDeals || restaurant.eatClubUrl || restaurant.firstTableUrl;

                  return (
                    <tr
                      key={restaurant.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{restaurant.name}</div>
                        {restaurant.phone && (
                          <div className="text-xs text-gray-500">{restaurant.phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {restaurant.address && (
                            <div>{restaurant.address}</div>
                          )}
                          {restaurant.suburb && (
                            <div className="text-gray-500">{restaurant.suburb}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{restaurant.cuisine || '-'}</div>
                        {restaurant.businessType && (
                          <div className="text-xs text-gray-500">{restaurant.businessType}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{restaurant.priceRange || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            restaurant.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : restaurant.status === 'inactive'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {restaurant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {hasHappyHour && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded">
                              HH
                            </span>
                          )}
                          {hasWeeklySpecials && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-teal-100 text-teal-800 rounded">
                              WS
                            </span>
                          )}
                          {hasDeals && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                              D
                            </span>
                          )}
                          {restaurant.eatClubUrl && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                              EC
                            </span>
                          )}
                          {restaurant.firstTableUrl && (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                              FT
                            </span>
                          )}
                          {!hasAnyDeal && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {imageUrls.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {imageUrls.length} image{imageUrls.length !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No images</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEditClick(restaurant.id)}
                          className="text-blue-600 hover:text-blue-900 transition-colors px-3 py-1 rounded hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
