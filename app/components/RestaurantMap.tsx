'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Restaurant } from '@/src/lib/schema/restaurants';

// Component to handle map resize
function MapResizeHandler() {
  const map = useMap();
  
  useEffect(() => {
    // Force map to recalculate size after mount with multiple attempts
    const timers = [
      setTimeout(() => map.invalidateSize(), 100),
      setTimeout(() => map.invalidateSize(), 300),
      setTimeout(() => map.invalidateSize(), 500),
      setTimeout(() => map.invalidateSize(), 1000),
    ];
    
    // Handle window resize
    const handleResize = () => {
      map.invalidateSize();
    };
    
    // Use ResizeObserver to detect container size changes
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => {
      // Force immediate resize
      setTimeout(() => map.invalidateSize(), 0);
    });
    
    if (container) {
      resizeObserver.observe(container);
      // Also observe parent container
      const parent = container.parentElement;
      if (parent) {
        resizeObserver.observe(parent);
      }
    }
    
    window.addEventListener('resize', handleResize);
    
    // Additional resize attempts after longer delays
    const longTimers = [
      setTimeout(() => map.invalidateSize(), 2000),
      setTimeout(() => map.invalidateSize(), 3000),
    ];
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      longTimers.forEach(timer => clearTimeout(timer));
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [map]);
  
  return null;
}

// Fix for default marker icons in Next.js
const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Create colored marker icon based on deal type
function createColoredMarkerIcon(color: string): DivIcon {
  return new DivIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 24px;
      height: 24px;
      background-color: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      position: relative;
    ">
      <div style="
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 8px solid ${color};
      "></div>
    </div>`,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -32],
  });
}

// Determine marker color based on restaurant deal types
function getMarkerColor(restaurant: Restaurant): string {
  // Priority: EatClub > First Table > General deals
  if (restaurant.eatClubUrl) {
    return '#FF8C00'; // Orange for EatClub
  }
  if (restaurant.firstTableUrl) {
    return '#9370DB'; // Purple for First Table
  }
  // General deals (happyHour, weeklySpecials, or deals)
  if (restaurant.happyHour || restaurant.weeklySpecials || restaurant.deals) {
    return '#87CEEB'; // Light blue for general deals
  }
  // Default blue if no deals (shouldn't happen since we filter by deals, but fallback)
  return '#3388FF';
}

interface RestaurantMapProps {
  restaurants: Restaurant[];
  center?: [number, number];
  zoom?: number;
  onRestaurantClick?: (restaurant: Restaurant) => void;
}

// Component to fit map bounds to markers
function FitBounds({ restaurants }: { restaurants: Restaurant[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (restaurants.length > 0) {
      const bounds = restaurants
        .filter(r => r.latitude && r.longitude && r.status === 'active')
        .map(r => [parseFloat(r.latitude!), parseFloat(r.longitude!)] as [number, number]);
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [restaurants, map]);
  
  return null;
}

export default function RestaurantMap({
  restaurants,
  center = [-35.2809, 149.1300], // Canberra center
  zoom = 13,
  onRestaurantClick,
}: RestaurantMapProps) {
  const [mounted, setMounted] = useState(false);
  
  const validRestaurants = restaurants.filter(
    r => r.latitude && r.longitude && r.status === 'active'
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (typeof window === 'undefined' || !mounted) {
    return <div className="h-full w-full bg-gray-200 flex items-center justify-center">Loading map...</div>;
  }

  return (
    <div className="w-full h-full" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="w-full h-full"
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapResizeHandler />
        <FitBounds restaurants={validRestaurants} />
        
        {validRestaurants.map((restaurant) => {
          const lat = parseFloat(restaurant.latitude!);
          const lng = parseFloat(restaurant.longitude!);
          const markerColor = getMarkerColor(restaurant);
          const markerIcon = createColoredMarkerIcon(markerColor);
          
          return (
            <Marker
              key={restaurant.id}
              position={[lat, lng]}
              icon={markerIcon}
              eventHandlers={{
                click: () => {
                  if (onRestaurantClick) {
                    onRestaurantClick(restaurant);
                  }
                },
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <a
                    href={`/?restaurantId=${restaurant.id}`}
                    className="font-bold text-lg mb-1 text-blue-600 hover:text-blue-800 hover:underline block cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = `/?restaurantId=${restaurant.id}`;
                    }}
                  >
                    {restaurant.name}
                  </a>
                  {restaurant.address && (
                    <p className="text-sm text-gray-600 mb-1">{restaurant.address}</p>
                  )}
                  {restaurant.suburb && (
                    <p className="text-sm text-gray-600 mb-1">{restaurant.suburb}</p>
                  )}
                  {restaurant.phone && (
                    <a 
                      href={`tel:${restaurant.phone}`}
                      className="text-blue-600 hover:underline text-sm block"
                    >
                      {restaurant.phone}
                    </a>
                  )}
                  {restaurant.cuisine && (
                    <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {restaurant.cuisine}
                    </span>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      {/* Map Legend */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000] border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Legend</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div 
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: '#FF8C00' }}
            ></div>
            <span className="text-xs text-gray-700">EatClub</span>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: '#9370DB' }}
            ></div>
            <span className="text-xs text-gray-700">First Table</span>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: '#87CEEB' }}
            ></div>
            <span className="text-xs text-gray-700">General Deals</span>
          </div>
        </div>
      </div>
    </div>
  );
}
