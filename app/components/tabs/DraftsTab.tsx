'use client';

import { useState } from 'react';
import Markdown from 'react-markdown';
import {
  Clock,
  Send,
  Loader2,
  Rocket,
  Calendar,
  MessageSquare,
  PackageCheck,
  Inbox,
} from 'lucide-react';
import { useApp, DraftItem } from '../../context/AppContext';

// Static optimal listing windows based on historical eBay traffic data
const OPTIMAL_WINDOWS = [
  { day: 'Sunday', time: '7:00 PM – 9:00 PM EST', score: 'Peak' },
  { day: 'Thursday', time: '8:00 PM – 10:00 PM EST', score: 'High' },
  { day: 'Saturday', time: '6:00 PM – 8:00 PM EST', score: 'High' },
  { day: 'Monday', time: '7:30 PM – 9:30 PM EST', score: 'Medium' },
];

function ScoreBadge({ score }: { score: string }) {
  const cls =
    score === 'Peak'
      ? 'bg-green-100 text-green-800 border-green-200'
      : score === 'High'
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {score}
    </span>
  );
}

function DraftCard({ draft }: { draft: DraftItem }) {
  const { userId, currentItemId, uploadedImages, updateDraft, moveDraftToActive } = useApp();
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [listingNow, setListingNow] = useState(false);
  const [listError, setListError] = useState('');
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);

  const runRevision = async () => {
    if (!instruction.trim()) return;
    const userMsg = instruction.trim();
    setInstruction('');
    setRevising(true);
    setChatLog(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const res = await fetch('/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: { title: draft.title, description: draft.description, pricingFloor: draft.pricingFloor },
          instruction: userMsg,
        }),
      });
      const data = await res.json();

      if (data.title) updateDraft(draft.id, { title: data.title });
      if (data.description) updateDraft(draft.id, { description: data.description });
      if (data.pricingFloor !== undefined) updateDraft(draft.id, { pricingFloor: data.pricingFloor });

      const summary = data.summary ?? 'Revision applied.';
      setChatLog(prev => [...prev, { role: 'ai', text: summary }]);
    } catch {
      setChatLog(prev => [...prev, { role: 'ai', text: 'Revision failed. Check API connection.' }]);
    } finally {
      setRevising(false);
    }
  };

  const handleList = () => {
    const run = async () => {
      setListingNow(true);
      setListError('');
      try {
        const sku = `${currentItemId || 'item'}-${draft.id}`.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 50);
        const createRes = await fetch('/api/ebay/create-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sku,
            title: draft.title,
            description: draft.description,
            categoryId: '222',
            pricingFloor: draft.pricingFloor,
            quantity: 1,
            imageUrls: uploadedImages,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.offerId) {
          throw new Error(createData.error ?? 'Failed to create eBay draft offer.');
        }

        updateDraft(draft.id, {
          ebayOfferId: createData.offerId,
          ebaySku: sku,
          publishError: undefined,
        });

        const publishRes = await fetch('/api/ebay/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, offerId: createData.offerId }),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || !publishData.listingId) {
          throw new Error(publishData.error ?? 'Failed to publish eBay offer.');
        }

        moveDraftToActive(draft.id, publishData.listingId, sku, createData.offerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Listing failed.';
        setListError(message);
        updateDraft(draft.id, { publishError: message });
      } finally {
        setListingNow(false);
      }
    };

    void run();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-900 text-sm truncate">{draft.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Created {new Date(draft.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className="text-sm font-mono font-bold text-green-700 whitespace-nowrap">
            ${draft.pricingFloor.toFixed(2)}
          </span>
        </div>
        {draft.description && (
          <div className="mt-3 text-xs text-zinc-900 bg-gray-50 rounded p-3 max-h-28 overflow-y-auto
            [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mt-1 [&_strong]:font-semibold">
            <Markdown>{draft.description}</Markdown>
          </div>
        )}
      </div>

      {/* Item Specifics summary */}
      {Object.keys(draft.itemSpecifics).length > 0 && (
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
          {Object.entries(draft.itemSpecifics)
            .filter(([, v]) => v)
            .slice(0, 6)
            .map(([k, v]) => (
              <span key={k} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-zinc-900">
                <span className="text-gray-400">{k}:</span> {v}
              </span>
            ))}
        </div>
      )}

      {/* Inline Revision Chat */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={13} className="text-purple-500" />
          <span className="text-xs font-semibold text-zinc-900">Inline Revision</span>
        </div>

        {chatLog.length > 0 && (
          <div className="mb-2 space-y-1 max-h-32 overflow-y-auto">
            {chatLog.map((msg, i) => (
              <div
                key={i}
                className={`text-xs rounded px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-blue-50 text-blue-900 text-right'
                    : 'bg-gray-50 text-zinc-900'
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runRevision()}
            placeholder='e.g. "Change pricing floor to $19.99"'
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
          <button
            onClick={runRevision}
            disabled={revising || !instruction.trim()}
            className="bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {revising ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>

      {/* List Now Button */}
      <div className="p-4">
        <button
          onClick={handleList}
          disabled={listingNow}
          className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-2.5 rounded-md font-semibold text-sm hover:bg-green-700 transition shadow-sm"
        >
          {listingNow ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
          {listingNow ? 'Publishing...' : 'List This Item Now'}
        </button>
        {(listError || draft.publishError) && (
          <p className="mt-2 text-xs text-red-600">{listError || draft.publishError}</p>
        )}
      </div>
    </div>
  );
}

export function DraftsTab() {
  const { drafts } = useApp();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-zinc-900">Staged Drafts Workspace</h2>

      {/* Smart Scheduling Engine */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-blue-600" />
          <h3 className="font-semibold text-sm text-zinc-900">Smart Scheduling Engine</h3>
          <span className="ml-auto text-xs text-gray-400">Historical traffic windows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-zinc-900">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 text-gray-500 font-medium">Day</th>
                <th className="text-left py-1.5 text-gray-500 font-medium">Window (EST)</th>
                <th className="text-left py-1.5 text-gray-500 font-medium">Traffic Score</th>
              </tr>
            </thead>
            <tbody>
              {OPTIMAL_WINDOWS.map(row => (
                <tr key={row.day} className="border-b border-gray-50">
                  <td className="py-2 font-medium">{row.day}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-gray-400" />
                      {row.time}
                    </div>
                  </td>
                  <td className="py-2">
                    <ScoreBadge score={row.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Schedule items to list during Peak windows to maximize early Cassini velocity.
          Live eBay traffic API integration is a future upgrade.
        </p>
      </div>

      {/* Draft Cards */}
      {drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Inbox size={40} />
          <p className="text-sm">No staged drafts yet.</p>
          <p className="text-xs text-center max-w-xs">
            Complete the Upload and Optimize tabs, then push items here before listing.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <PackageCheck size={16} className="text-green-600" />
            <span className="text-sm font-semibold text-zinc-900">{drafts.length} item{drafts.length !== 1 ? 's' : ''} staged</span>
          </div>
          {drafts.map(draft => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}
