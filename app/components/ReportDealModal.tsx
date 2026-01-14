'use client';

import { useState } from 'react';

interface ReportDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: number;
  restaurantName: string;
  dealType: string;
  dealDescription: string;
  onReportSubmitted: () => void;
}

export default function ReportDealModal({
  isOpen,
  onClose,
  restaurantId,
  restaurantName,
  dealType,
  dealDescription,
  onReportSubmitted,
}: ReportDealModalProps) {
  const [reason, setReason] = useState('');
  const [reportedBy, setReportedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/report/deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          restaurantName,
          dealType,
          dealDescription,
          reason: reason || 'Deal is incorrect',
          reportedBy: reportedBy || '', // Send empty string instead of null to match schema
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show detailed validation errors if available
        if (data.details && Array.isArray(data.details)) {
          const errorMessages = data.details.map((err: any) => 
            `${err.path.join('.')}: ${err.message}`
          ).join(', ');
          throw new Error(data.error + ': ' + errorMessages);
        }
        throw new Error(data.error || 'Failed to submit report');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setReason('');
        setReportedBy('');
        onReportSubmitted();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Report Incorrect Deal</h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">Restaurant:</span> {restaurantName}
          </p>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">Deal Type:</span> {dealType}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Deal:</span> {dealDescription.substring(0, 100)}
            {dealDescription.length > 100 && '...'}
          </p>
        </div>

        {success ? (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
            <p className="font-semibold">Thank you!</p>
            <p>Your report has been submitted and will be reviewed.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                What's wrong with this deal? *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., This deal no longer exists, wrong price, wrong days, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Your Email (optional)
              </label>
              <input
                type="email"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
