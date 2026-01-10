'use client';

import { useState } from 'react';
import { RestaurantSubmission } from '@/src/lib/schema/submissions';
import LoadingSpinner from './LoadingSpinner';

interface SubmissionsTableProps {
  submissions: RestaurantSubmission[];
  onUpdate: () => void;
  onNavigateToRestaurant?: (restaurantId: number) => void;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function SubmissionsTable({ submissions, onUpdate, onNavigateToRestaurant }: SubmissionsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filteredSubmissions = submissions.filter(submission => {
    if (statusFilter === 'all') return true;
    return submission.status === statusFilter;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  const handleEdit = async (submission: RestaurantSubmission) => {
    setLoading(true);
    setEditingId(submission.id);
    try {
      const response = await fetch(`/api/admin/submissions/${submission.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process submission');
      }

      const result = await response.json();
      const restaurantId = result.restaurantId;

      if (!restaurantId) {
        throw new Error('Restaurant ID not returned');
      }

      onUpdate();
      
      if (onNavigateToRestaurant) {
        onNavigateToRestaurant(restaurantId);
      }
    } catch (error) {
      console.error('Error editing submission:', error);
      alert(error instanceof Error ? error.message : 'Failed to process submission');
    } finally {
      setLoading(false);
      setEditingId(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm('Are you sure you want to reject this submission?')) {
      return;
    }

    setLoading(true);
    setRejectingId(id);
    try {
      const response = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          reviewedBy: 'admin',
          notes: 'Rejected by admin',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject submission');
      }

      onUpdate();
    } catch (error) {
      console.error('Error rejecting submission:', error);
      alert(error instanceof Error ? error.message : 'Failed to reject submission');
    } finally {
      setLoading(false);
      setRejectingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const response = await fetch(`/api/admin/submissions/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete submission');
      }

      setSelectedIds(prev => {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
      onUpdate();
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete submission');
    } finally {
      setLoading(false);
      setDeletingIds(prev => {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
    }
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${idsToDelete.length} submission(s)? This action cannot be undone.`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const response = await fetch('/api/admin/submissions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete submissions');
      }

      const result = await response.json();
      setSelectedIds(new Set());
      onUpdate();
      alert(`Successfully deleted ${result.deletedCount} submission(s)`);
    } catch (error) {
      console.error('Error bulk deleting:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete submissions');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  };

  const toggleSelectAll = () => {
    const allIds = filteredSubmissions.map(s => s.id);
    if (allIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
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

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="flex items-center gap-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-md border border-white/20">
        <label className="text-sm font-medium text-gray-800">Filter by Status:</label>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                statusFilter === filter
                  ? filter === 'all' ? 'bg-blue-600 text-white shadow-md'
                  : filter === 'pending' ? 'bg-yellow-600 text-white shadow-md'
                  : filter === 'approved' ? 'bg-green-600 text-white shadow-md'
                  : 'bg-red-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)} ({submissions.filter(s => filter === 'all' ? true : s.status === filter).length})
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedCount} selected</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount}`}
              </button>
            </div>
          )}
          <div className="text-sm text-gray-600">
            Showing {filteredSubmissions.length} of {submissions.length} submissions
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={filteredSubmissions.length > 0 && filteredSubmissions.every(s => selectedIds.has(s.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Restaurant Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No submissions found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((submission) => {
                  const isRejecting = rejectingId === submission.id;
                  const isEditing = editingId === submission.id;
                  const isDeleting = deletingIds.has(submission.id);
                  const isSelected = selectedIds.has(submission.id);
                  const timeAgo = getTimeAgo(submission.createdAt);

                  return (
                    <tr 
                      key={submission.id} 
                      className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(submission.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{submission.name}</div>
                        {submission.cuisine && (
                          <div className="text-xs text-gray-500 mt-1">Cuisine: {submission.cuisine}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-sm text-gray-700">
                          {submission.description ? (
                            <div className="line-clamp-3">{submission.description}</div>
                          ) : (
                            <span className="text-gray-400 italic">No description</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {submission.address && <div>{submission.address}</div>}
                          {submission.suburb && <div className="text-gray-500">{submission.suburb}</div>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {submission.phone && <div>{submission.phone}</div>}
                          {submission.websiteUrl && (
                            <a href={submission.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                              Website
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {submission.submittedBy || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            submission.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : submission.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {submission.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : '-'}
                        </div>
                        {timeAgo && (
                          <div className="text-xs text-gray-500">{timeAgo}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {submission.status === 'pending' ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleDelete(submission.id)}
                              disabled={isDeleting || isRejecting || isEditing || loading}
                              className="px-3 py-1 bg-red-700 text-white text-xs rounded hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete submission"
                            >
                              {isDeleting ? 'Deleting...' : '🗑️'}
                            </button>
                            <button
                              onClick={() => handleReject(submission.id)}
                              disabled={isDeleting || isRejecting || isEditing || loading}
                              className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isRejecting ? 'Rejecting...' : 'Reject'}
                            </button>
                            <button
                              onClick={() => handleEdit(submission)}
                              disabled={isDeleting || isRejecting || isEditing || loading}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                              {isEditing ? 'Processing...' : 'Edit'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleDelete(submission.id)}
                              disabled={isDeleting || loading}
                              className="px-3 py-1 bg-red-700 text-white text-xs rounded hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete submission"
                            >
                              {isDeleting ? 'Deleting...' : '🗑️'}
                            </button>
                            <span className="text-gray-500 text-xs">
                              {submission.status === 'approved' ? 'Approved' : 'Rejected'}
                            </span>
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
