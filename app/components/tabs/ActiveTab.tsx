'use client';

import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import {
  Eye,
  Heart,
  RefreshCw,
  Megaphone,
  Loader2,
  Activity,
  ToggleLeft,
  ToggleRight,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import { useApp, ListingItem } from '../../context/AppContext';

function ListingCard({ listing }: { listing: ListingItem }) {
  const { userId, toggleAutoRelist, updateActiveListing } = useApp();
  const [views, setViews] = useState(listing.views);
  const [watchers, setWatchers] = useState(listing.watchers);
  const [priceDraft, setPriceDraft] = useState(listing.pricingFloor.toFixed(2));
  const [socialCopy, setSocialCopy] = useState('');
  const [socialLoading, setSocialLoading] = useState(false);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryNote, setTelemetryNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [relistLoading, setRelistLoading] = useState(false);

  useEffect(() => {
    setViews(listing.views);
    setWatchers(listing.watchers);
    setPriceDraft(listing.pricingFloor.toFixed(2));
  }, [listing.views, listing.watchers, listing.pricingFloor]);

  const generateSocialCopy = async () => {
    setSocialLoading(true);
    setSocialCopy('');
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingTitle: listing.title,
          description: listing.title,
          price: listing.pricingFloor,
        }),
      });
      const data = await res.json();
      setSocialCopy(data.result ?? data.error ?? 'No response.');
    } catch {
      setSocialCopy('Error generating social copy. Check console.');
    } finally {
      setSocialLoading(false);
    }
  };

  const daysSinceListed = Math.floor(
    (Date.now() - new Date(listing.listedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const refreshTelemetry = async () => {
    setTelemetryLoading(true);
    setTelemetryNote('');
    setActionError('');
    try {
      const sku = listing.sku ?? listing.id;
      const res = await fetch(`/api/ebay/telemetry?userId=${encodeURIComponent(userId)}&sku=${encodeURIComponent(sku)}`);
      const data = await res.json();
      if (res.ok) {
        const quantity = Number(data?.availability?.shipToLocationAvailability?.quantity ?? 0);
        // Placeholder mapping until analytics endpoints are wired.
        setViews(prev => Math.max(prev, quantity));
        setWatchers(prev => Math.max(prev, Math.floor(quantity / 2)));
        setTelemetryNote('Telemetry refreshed from eBay inventory endpoint.');
      } else {
        setTelemetryNote(data.error ?? 'Telemetry refresh failed.');
      }
    } catch {
      setTelemetryNote('Telemetry refresh failed.');
    } finally {
      setTelemetryLoading(false);
    }
  };

  const updatePrice = async () => {
    setActionError('');
    if (!listing.ebayOfferId) {
      setActionError('No eBay offer ID on this listing. Publish from Drafts again to sync offer metadata.');
      return;
    }

    const parsed = Number(priceDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setActionError('Enter a valid positive price.');
      return;
    }

    setPriceLoading(true);
    try {
      const res = await fetch('/api/ebay/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          offerId: listing.ebayOfferId,
          price: parsed,
          currency: 'USD',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update price.');
      }

      updateActiveListing(listing.id, { pricingFloor: parsed });
      setTelemetryNote(`Price updated to $${parsed.toFixed(2)}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to update listing price.');
    } finally {
      setPriceLoading(false);
    }
  };

  const relistNow = async () => {
    setActionError('');
    if (!listing.ebayOfferId) {
      setActionError('No eBay offer ID on this listing. Publish from Drafts again to sync offer metadata.');
      return;
    }

    setRelistLoading(true);
    try {
      const res = await fetch('/api/ebay/relist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, offerId: listing.ebayOfferId }),
      });
      const data = await res.json();
      if (!res.ok || !data.listingId) {
        throw new Error(data.error ?? 'Relist failed.');
      }

      updateActiveListing(listing.id, {
        ebayListingId: data.listingId,
        listedAt: new Date().toISOString(),
      });
      setTelemetryNote(`Relisted successfully as ${data.listingId}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to relist offer.');
    } finally {
      setRelistLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-900 text-sm truncate">{listing.title}</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{listing.ebayListingId}</p>
          </div>
          <span className="text-sm font-mono font-bold text-green-700 whitespace-nowrap">
            ${listing.pricingFloor.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-blue-600 mb-1">
            <Eye size={14} />
            <span className="text-xs font-medium">Views</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{views}</p>
        </div>
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-red-500 mb-1">
            <Heart size={14} />
            <span className="text-xs font-medium">Watchers</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{watchers}</p>
        </div>
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
            <Activity size={14} />
            <span className="text-xs font-medium">Day</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{daysSinceListed}</p>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <button
          onClick={refreshTelemetry}
          disabled={telemetryLoading}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {telemetryLoading ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
        {telemetryNote && <span className="text-xs text-gray-500">{telemetryNote}</span>}
      </div>

      {/* 7-Day Relist Toggle */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className="text-teal-600" />
            <span className="text-xs font-semibold text-zinc-900">7-Day End &amp; Relist Automation</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Ends on day 7 and relists as a fresh ID for Cassini boost.
          </p>
          {listing.autoRelistEnabled && (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle size={10} className="text-yellow-600" />
              <span className="text-xs text-yellow-700">
                Requires eBay API OAuth — placeholder mode active.
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => toggleAutoRelist(listing.id)}
          className="flex-shrink-0 focus:outline-none"
          title={listing.autoRelistEnabled ? 'Disable auto-relist' : 'Enable auto-relist'}
        >
          {listing.autoRelistEnabled ? (
            <ToggleRight size={32} className="text-teal-600" />
          ) : (
            <ToggleLeft size={32} className="text-gray-400" />
          )}
        </button>
      </div>

      {/* Social Copy Generator */}
      <div className="p-5">
        <button
          onClick={generateSocialCopy}
          disabled={socialLoading}
          className="flex items-center justify-center gap-2 w-full bg-orange-500 text-white py-2.5 rounded-md font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50 shadow-sm"
        >
          {socialLoading ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
          {socialLoading ? 'Generating Social Copy...' : 'Generate Social Copy'}
        </button>

        {socialCopy && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded p-4 text-zinc-900 text-xs
            [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:text-orange-900
            [&_h4]:text-xs [&_h4]:font-bold [&_h4]:mt-3
            [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mt-1
            [&_strong]:font-semibold [&_hr]:border-orange-200 [&_hr]:my-3">
            <Markdown>{socialCopy}</Markdown>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={priceDraft}
            onChange={e => setPriceDraft(e.target.value)}
            className="w-36 border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
          <button
            onClick={updatePrice}
            disabled={priceLoading}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {priceLoading ? 'Updating...' : 'Update Price'}
          </button>
          <button
            onClick={relistNow}
            disabled={relistLoading}
            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {relistLoading ? 'Relisting...' : 'Relist Now'}
          </button>
        </div>
        {actionError && <p className="text-xs text-red-600">{actionError}</p>}
      </div>
    </div>
  );
}

export function ActiveTab() {
  const { userId, activeListings, updateActiveListing } = useApp();
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepMessage, setSweepMessage] = useState('');

  const runAutoRelistSweep = async () => {
    setSweepLoading(true);
    setSweepMessage('');

    try {
      const res = await fetch('/api/ebay/auto-relist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Auto-relist sweep failed.');
      }

      if (data.relisted > 0) {
        for (const listing of activeListings) {
          if (!listing.ebayOfferId || !listing.autoRelistEnabled) continue;
          updateActiveListing(listing.id, { listedAt: new Date().toISOString() });
        }
      }

      setSweepMessage(`Sweep complete: ${data.relisted} relisted out of ${data.processed} processed.`);
    } catch (error) {
      setSweepMessage(error instanceof Error ? error.message : 'Auto-relist sweep failed.');
    } finally {
      setSweepLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900">Active Telemetry Workspace</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {activeListings.length} live listing{activeListings.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={runAutoRelistSweep}
            disabled={sweepLoading || activeListings.length === 0}
            className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded hover:bg-zinc-800 disabled:opacity-50"
          >
            {sweepLoading ? 'Running Sweep...' : 'Run Auto-Relist Sweep'}
          </button>
        </div>
      </div>

      {sweepMessage && (
        <div className="text-xs border border-gray-200 bg-gray-50 text-zinc-700 rounded px-3 py-2">
          {sweepMessage}
        </div>
      )}

      {activeListings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Inbox size={40} />
          <p className="text-sm">No active listings yet.</p>
          <p className="text-xs text-center max-w-xs">
            Go to Drafts and click "List This Item Now" to push an item live.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {activeListings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
