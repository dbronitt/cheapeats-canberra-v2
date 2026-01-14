'use client';

import { useState } from 'react';
import { RestaurantFlag } from '@/src/lib/schema/flags';
import LoadingSpinner from './LoadingSpinner';

interface ReportsTableProps {
  flags: RestaurantFlag[];
  onUpdate: () => void;
  onNavigateToRestaurant?: (restaurantId: number) => void;
}

type StatusFilter = 'all' | 'pending' | 'resolved' | 'dismissed';

export default function ReportsTable({ flags, onUpdate, onNavigateToRestaurant }: ReportsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState<{ [key: number]: string }>({});

  const filteredFlags = flags.filter(flag => {
    if (statusFilter === 'all') return true;
    return flag.status === statusFilter;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  const handleUpdateStatus = async (id: number, status: 'resolved' | 'dismissed' | 'pending') => {
    setLoading(true);
    setUpdatingId(id);
    try {
      const notes = resolutionNotes[id] || '';
      
      const response = await fetch(`/api/admin/flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          resolvedBy: 'admin',
          resolutionNotes: notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${status} report`);
      }

      // Clear resolution notes for this flag
      setResolutionNotes(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      
      onUpdate();
    } catch (error) {
      console.error('Error updating flag:', error);
      alert(error instanceof Error ? error.message : `Failed to ${status} report`);
    } finally {
      setLoading(false);
      setUpdatingId(null);
    }
  };

  const getTimeAgo = (date: Date | string | null): string => {
    if (!date) return '';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  const parseDescription = (description: string) => {
    // Description format: "Deal Type: {type}\nDeal Description: {desc}\nReason: {reason}"
    const lines = description.split('\n');
    const dealType = lines.find(l => l.startsWith('Deal Type:'))?.replace('Deal Type:', '').trim() || '';
    const dealDesc = lines.find(l => l.startsWith('Deal Description:'))?.replace('Deal Description:', '').trim() || '';
    const reason = lines.find(l => l.startsWith('Reason:'))?.replace('Reason:', '').trim() || '';
    
    return { dealType, dealDesc, reason, fullDescription: description };
  };

  const getFlagTypeLabel = (flagType: string) => {
    const labels: { [key: string]: string } = {
      'deal_doesnt_exist': 'Deal Doesn\'t Exist',
      'wrong_hours': 'Wrong Hours',
      'shut_down': 'Shut Down',
      'not_on_eatclub': 'Not on EatClub',
      'other': 'Other',
    };
    return labels[flagType] || flagType;
  };

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="flex items-center gap-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-md border border-white/20">
        <label className="text-sm font-medium text-gray-800">Filter by Status:</label>
        <div className="flex gap-2">
          {(['all', 'pending', 'resolved', 'dismissed'] as StatusFilter[]).map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                statusFilter === filter
                  ? filter === 'all' ? 'bg-blue-600 text-white shadow-md'
                  : filter === 'pending' ? 'bg-yellow-600 text-white shadow-md'
                  : filter === 'resolved' ? 'bg-green-600 text-white shadow-md'
                  : 'bg-gray-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)} ({flags.filter(f => filter === 'all' ? true : f.status === filter).length})
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-600">
          Showing {filteredFlags.length} of {flags.length} reports
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Restaurant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Flag Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deal Information
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reported By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resolution Notes
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFlags.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No reports found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredFlags.map((flag) => {
                  const isUpdating = updatingId === flag.id;
                  const timeAgo = getTimeAgo(flag.createdAt);
                  const { dealType, dealDesc, reason } = parseDescription(flag.description);
                  const notes = resolutionNotes[flag.id] || '';

                  return (
                    <tr 
                      key={flag.id} 
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {flag.restaurantName || `Restaurant ID: ${flag.restaurantId}`}
                        </div>
                        {onNavigateToRestaurant && (
                          <button
                            onClick={() => onNavigateToRestaurant(flag.restaurantId)}
                            className="text-xs text-blue-600 hover:underline mt-1"
                          >
                            View Restaurant →
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                          {getFlagTypeLabel(flag.flagType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {dealType && (
                          <div className="text-sm text-gray-700">
                            <div className="font-medium text-gray-900">{dealType}</div>
                            {dealDesc && (
                              <div className="text-xs text-gray-600 mt-1 line-clamp-2">{dealDesc}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-sm text-gray-700">
                          {reason ? (
                            <div className="line-clamp-3">{reason}</div>
                          ) : (
                            <span className="text-gray-400 italic">No reason provided</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {flag.reportedBy || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            flag.status === 'resolved'
                              ? 'bg-green-100 text-green-800'
                              : flag.status === 'dismissed'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {flag.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {flag.createdAt ? new Date(flag.createdAt).toLocaleDateString() : '-'}
                        </div>
                        {timeAgo && (
                          <div className="text-xs text-gray-500">{timeAgo}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {flag.status === 'pending' ? (
                          <textarea
                            value={notes}
                            onChange={(e) => setResolutionNotes(prev => ({ ...prev, [flag.id]: e.target.value }))}
                            placeholder="Optional notes..."
                            rows={2}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : flag.resolutionNotes ? (
                          <div className="text-xs text-gray-600 line-clamp-2">{flag.resolutionNotes}</div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {flag.status === 'pending' ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to dismiss this report?')) {
                                  handleUpdateStatus(flag.id, 'dismissed');
                                }
                              }}
                              disabled={isUpdating || loading}
                              className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isUpdating ? '...' : 'Dismiss'}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to resolve this report?')) {
                                  handleUpdateStatus(flag.id, 'resolved');
                                }
                              }}
                              disabled={isUpdating || loading}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isUpdating ? '...' : 'Resolve'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to reopen this report?')) {
                                  handleUpdateStatus(flag.id, 'pending');
                                }
                              }}
                              disabled={isUpdating || loading}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isUpdating ? '...' : 'Reopen'}
                            </button>
                          </div>
                        )}
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
