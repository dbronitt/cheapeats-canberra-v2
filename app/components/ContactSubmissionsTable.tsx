'use client';

import { useState } from 'react';
import { ContactSubmission } from '@/src/lib/schema/contact-submissions';
import LoadingSpinner from './LoadingSpinner';

interface ContactSubmissionsTableProps {
  submissions: ContactSubmission[];
  onUpdate: () => void;
}

type StatusFilter = 'all' | 'pending' | 'responded' | 'archived';

export default function ContactSubmissionsTable({ submissions, onUpdate }: ContactSubmissionsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredSubmissions = submissions.filter(submission => {
    if (statusFilter === 'all') return true;
    return submission.status === statusFilter;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  const handleStatusUpdate = async (id: number, newStatus: 'pending' | 'responded' | 'archived') => {
    setLoading(true);
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/admin/contact/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update status');
      }

      onUpdate();
    } catch (error) {
      console.error('Error updating contact submission:', error);
      alert(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setLoading(false);
      setUpdatingId(null);
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Contact Submissions</h2>
          <div className="text-sm text-gray-600">
            Total: {submissions.length} | Pending: {pendingCount}
          </div>
        </div>
        
        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'pending', 'responded', 'archived'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="text-lg">No contact submissions found.</p>
          {statusFilter !== 'all' && (
            <p className="text-sm mt-2">Try selecting a different status filter.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSubmissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {submission.createdAt
                      ? new Date(submission.createdAt).toLocaleString('en-AU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <a
                      href={`mailto:${submission.email}`}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {submission.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                    <div className="line-clamp-3">{submission.query}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        submission.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : submission.status === 'responded'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {submission.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center gap-2 justify-end">
                      {submission.status !== 'responded' && (
                        <button
                          onClick={() => handleStatusUpdate(submission.id, 'responded')}
                          disabled={loading && updatingId === submission.id}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          {loading && updatingId === submission.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            'Mark Responded'
                          )}
                        </button>
                      )}
                      {submission.status !== 'archived' && (
                        <button
                          onClick={() => handleStatusUpdate(submission.id, 'archived')}
                          disabled={loading && updatingId === submission.id}
                          className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          {loading && updatingId === submission.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            'Archive'
                          )}
                        </button>
                      )}
                      {submission.status === 'archived' && (
                        <button
                          onClick={() => handleStatusUpdate(submission.id, 'pending')}
                          disabled={loading && updatingId === submission.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          {loading && updatingId === submission.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            'Restore'
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
