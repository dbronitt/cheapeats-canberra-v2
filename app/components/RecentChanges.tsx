'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ChangeLog {
  id: number;
  restaurantId: number;
  restaurantName: string | null;
  action: string;
  changedBy: string | null;
  changes: Record<string, { old: any; new: any }>;
  previousState: any;
  createdAt: Date | string;
}

interface RecentChangesProps {
  onRevert?: () => void;
}

export default function RecentChanges({ onRevert }: RecentChangesProps) {
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [bulkReverting, setBulkReverting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);

  useEffect(() => {
    fetchChanges();
  }, []);

  const fetchChanges = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/audit-log?limit=20');
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
        // Drop selections that are no longer visible
        setSelectedIds(prev => {
          const visible = new Set<number>((data.logs || []).map((l: ChangeLog) => l.id));
          const next = new Set<number>();
          prev.forEach(id => {
            if (visible.has(id)) next.add(id);
          });
          return next;
        });
      }
    } catch (error) {
      console.error('Error fetching changes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (logId: number) => {
    if (!confirm('Are you sure you want to revert this change?')) {
      return;
    }

    setRevertingId(logId);
    try {
      const response = await fetch('/api/admin/audit-log/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revert change');
      }

      alert('Change reverted successfully');
      setExpandedId(null);
      await fetchChanges();
      if (onRevert) {
        onRevert();
      }
    } catch (error) {
      console.error('Error reverting change:', error);
      alert(error instanceof Error ? error.message : 'Failed to revert change');
    } finally {
      setRevertingId(null);
    }
  };

  const toggleSelected = (logId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  const toggleSelectedWithShift = (logId: number, checked: boolean, isShift: boolean) => {
    // If shift is held and we have an anchor, select a range in the current visible order.
    if (isShift && lastSelectedId !== null) {
      const idsInOrder = logs.map(l => l.id);
      const startIdx = idsInOrder.indexOf(lastSelectedId);
      const endIdx = idsInOrder.indexOf(logId);

      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const range = idsInOrder.slice(from, to + 1);

        setSelectedIds(prev => {
          const next = new Set(prev);
          for (const id of range) {
            if (checked) next.add(id);
            else next.delete(id);
          }
          return next;
        });

        setLastSelectedId(logId);
        return;
      }
    }

    // Fallback: normal single toggle
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(logId);
      else next.delete(logId);
      return next;
    });
    setLastSelectedId(logId);
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(logs.map(l => l.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkRevert = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (!confirm(`Revert ${ids.length} selected change(s)?`)) {
      return;
    }

    setBulkReverting(true);
    try {
      console.log('[DEBUG] Bulk revert selected logIds:', ids);
      const response = await fetch('/api/admin/audit-log/revert-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds: ids }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to bulk revert');
      }

      const successCount = Array.isArray(data.results) ? data.results.filter((r: any) => r.success).length : 0;
      const failCount = Array.isArray(data.results) ? data.results.filter((r: any) => !r.success).length : 0;

      alert(`Bulk revert complete: ${successCount} succeeded, ${failCount} failed`);
      clearSelection();
      setExpandedId(null);
      await fetchChanges();
      if (onRevert) onRevert();
    } catch (error) {
      console.error('Error bulk reverting changes:', error);
      alert(error instanceof Error ? error.message : 'Failed to bulk revert');
    } finally {
      setBulkReverting(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const formatTimeAgo = (date: Date | string): string => {
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

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'revert':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Changes</h2>
          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-600">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={selectAllVisible}
            disabled={logs.length === 0}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select all
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={handleBulkRevert}
            disabled={selectedIds.size === 0 || bulkReverting}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkReverting ? 'Reverting…' : 'Revert selected'}
          </button>
          <button
            onClick={fetchChanges}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No changes recorded yet
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const changeCount = Object.keys(log.changes || {}).length;
            const isSelected = selectedIds.has(log.id);

            return (
              <div key={log.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={isSelected}
                        onChange={(e) => {
                          toggleSelectedWithShift(log.id, e.target.checked, (e as any).nativeEvent?.shiftKey === true);
                        }}
                        aria-label={`Select change ${log.id}`}
                      />
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {log.restaurantName || `Restaurant #${log.restaurantId}`}
                      </span>
                      {changeCount > 0 && (
                        <span className="text-xs text-gray-500">
                          ({changeCount} field{changeCount !== 1 ? 's' : ''} changed)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{formatTimeAgo(log.createdAt)}</span>
                      {log.changedBy && <span>By: {log.changedBy}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.action !== 'revert' && log.previousState && (
                      <button
                        onClick={() => handleRevert(log.id)}
                        disabled={revertingId === log.id}
                        className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {revertingId === log.id ? 'Reverting...' : 'Revert'}
                      </button>
                    )}
                    {changeCount > 0 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        {isExpanded ? 'Hide' : 'Show'} Details
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && changeCount > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="space-y-3">
                      {Object.entries(log.changes).map(([field, change]) => (
                        <div key={field} className="bg-gray-50 rounded p-3">
                          <div className="font-medium text-sm text-gray-900 mb-2">
                            {field}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="text-gray-500 mb-1">Old Value:</div>
                              <div className="bg-red-50 p-2 rounded font-mono text-xs break-words max-h-32 overflow-y-auto">
                                {formatValue(change.old)}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-1">New Value:</div>
                              <div className="bg-green-50 p-2 rounded font-mono text-xs break-words max-h-32 overflow-y-auto">
                                {formatValue(change.new)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
