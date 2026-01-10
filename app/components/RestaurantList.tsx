'use client';

import { Restaurant } from '@/src/lib/schema/restaurants';
import RestaurantCard from './RestaurantCard';

interface RestaurantListProps {
  restaurants: Restaurant[];
}

export default function RestaurantList({ restaurants }: RestaurantListProps) {
  console.log('[DEBUG] RestaurantList rendering with', restaurants.length, 'restaurants');
  console.log('[DEBUG] First restaurant:', restaurants[0]);
  
  if (restaurants.length === 0) {
    console.log('[DEBUG] RestaurantList: No restaurants, showing empty state');
    return (
      <div className="text-center py-16 animate-fadeIn">
        <div className="inline-block p-6 bg-white/90 backdrop-blur-sm rounded-full mb-4">
          <span className="text-4xl">🔍</span>
        </div>
        <p className="text-gray-700 text-xl font-semibold mb-2">No restaurants found.</p>
        <p className="text-gray-600 text-sm">Try adjusting your filters or submit a new restaurant!</p>
      </div>
    );
  }

  console.log('[DEBUG] RestaurantList: Rendering grid with', restaurants.length, 'restaurants');
  
  // Visual test - add a test div to verify rendering
  if (restaurants.length > 0) {
    console.log('[DEBUG] RestaurantList: First restaurant data:', JSON.stringify(restaurants[0], null, 2));
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ minHeight: '200px', backgroundColor: 'rgba(255,0,0,0.1)' }}>
      {restaurants.map((restaurant, index) => {
        console.log('[DEBUG] RestaurantList: Rendering restaurant', index, restaurant.name, 'ID:', restaurant.id);
        return (
          <div
            id={`restaurant-${restaurant.id}`}
            key={restaurant.id}
            className="animate-fadeIn"
            style={{
              animationDelay: `${index * 0.1}s`,
              animationFillMode: 'both',
            }}
          >
            <RestaurantCard restaurant={restaurant} />
          </div>
        );
      })}
    </div>
  );
}

