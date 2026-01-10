'use client';

export default function RestaurantCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden animate-pulse">
      {/* Image skeleton */}
      <div className="h-48 w-full bg-gradient-to-br from-gray-200 to-gray-300" />

      <div className="p-4">
        {/* Header skeleton */}
        <div className="flex items-start justify-between mb-2">
          <div className="h-6 bg-gray-200 rounded w-3/4" />
          <div className="h-6 bg-gray-200 rounded w-16" />
        </div>

        {/* Tags skeleton */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-5 bg-gray-200 rounded w-20" />
          <div className="h-5 bg-gray-200 rounded w-12" />
          <div className="h-5 bg-gray-200 rounded w-16" />
        </div>

        {/* Location skeleton */}
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />

        {/* Badges skeleton */}
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="h-6 bg-gray-200 rounded w-24" />
          <div className="h-6 bg-gray-200 rounded w-28" />
        </div>

        {/* Actions skeleton */}
        <div className="flex gap-2 mt-4">
          <div className="h-10 bg-gray-200 rounded flex-1" />
          <div className="h-10 bg-gray-200 rounded w-20" />
          <div className="h-10 bg-gray-200 rounded w-24" />
        </div>
      </div>
    </div>
  );
}
