'use client';

import { useState } from 'react';
import Markdown from 'react-markdown';
import {
  AlertTriangle,
  PackageCheck,
  ShieldCheck,
  Tag,
  Truck,
  BarChart2,
  Loader2,
  CheckCircle,
  Fingerprint,
} from 'lucide-react';
import { useApp, ListingDraft, ReturnRisk } from '../../context/AppContext';

// Detects zero-sell / dead-stock signals in the market intelligence text
function detectDeadStock(text: string): boolean {
  const signals = [
    'zero sold',
    '0 sold',
    'no sales',
    'no items sold',
    'not sold',
    'dead stock',
    'no recent sales',
    'unsold',
  ];
  const lower = text.toLowerCase();
  return signals.some(s => lower.includes(s));
}

function charCountColor(len: number): string {
  if (len <= 60) return 'text-green-600';
  if (len <= 75) return 'text-yellow-600';
  return 'text-red-600';
}

// Generates a SHA-256 visual hash from a Blob URL or base64 image string.
async function generateVisualHash(imageRef: string): Promise<string> {
  let bytes: Uint8Array;
  if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) {
    const res = await fetch(imageRef);
    const buffer = await res.arrayBuffer();
    bytes = new Uint8Array((buffer as ArrayBuffer).slice(0, 512));
  } else {
    const raw = imageRef.split(',')[1] ?? imageRef;
    bytes = Uint8Array.from(atob(raw.slice(0, 512)), c => c.charCodeAt(0));
  }
  const digestInput = new Uint8Array(bytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', digestInput);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
    .toUpperCase();
}

const RETURN_RISK_COLORS: Record<ReturnRisk, string> = {
  Low: 'bg-green-100 text-green-800 border-green-200',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  High: 'bg-red-100 text-red-800 border-red-200',
};

export function InfoTab() {
  const {
    uploadedImages,
    triageReport,
    marketIntelligence,
    setMarketIntelligence,
    listingDraft,
    setListingDraft,
    updateListingDraft,
    addDraft,
    setActiveTab,
  } = useApp();

  const [researchLoading, setResearchLoading] = useState(false);
  const [buildingDraft, setBuildingDraft] = useState(false);
  const [verification, setVerification] = useState<{ pass: boolean; score: number; issues: string[]; fixes: string[] } | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [fingerprintDone, setFingerprintDone] = useState(false);

  const runMarketResearch = async () => {
    if (!triageReport) return;
    setResearchLoading(true);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemDetails: triageReport }),
      });
      const data = await res.json();
      setMarketIntelligence(data.result ?? data.error ?? 'No response.');

      // Auto-build a draft from the triage + research results.
      await buildListingDraft(data.result ?? '');
    } catch {
      setMarketIntelligence('Error running market research. Check console.');
    } finally {
      setResearchLoading(false);
    }
  };

  const buildListingDraft = async (intel: string) => {
    setBuildingDraft(true);
    try {
      let hash = '';
      if (uploadedImages.length > 0) {
        hash = await generateVisualHash(uploadedImages[0]);
        setFingerprint(hash);
        setFingerprintDone(true);
      }

      const buildRes = await fetch('/api/build-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triageReport,
          marketIntelligence: intel,
        }),
      });
      const buildData = await buildRes.json();
      if (!buildRes.ok || !buildData.result) {
        throw new Error(buildData.error ?? 'Build listing failed.');
      }

      const built = buildData.result;
      const draft: ListingDraft = {
        title: built.title ?? '',
        description: built.description ?? '',
        itemSpecifics: built.itemSpecifics ?? {},
        shippingEstimate: built.shippingEstimate ?? { l: 12, w: 9, h: 6, weight: '1-2 lbs' },
        categoryId: built.categoryId ?? '',
        returnRisk: (built.returnRisk as ReturnRisk) ?? 'Low',
        pricingFloor: Number(built.pricingFloor ?? 0),
        visualHash: hash,
      };
      setListingDraft(draft);

      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triageReport,
          marketIntelligence: intel,
          listingDraft: draft,
        }),
      });
      const verifyData = await verifyRes.json();
      if (verifyRes.ok && verifyData.result) {
        setVerification(verifyData.result);
      } else {
        setVerification({
          pass: false,
          score: 0,
          issues: ['Verification failed.'],
          fixes: ['Re-run Market Research Pipeline.'],
        });
      }
    } finally {
      setBuildingDraft(false);
    }
  };

  const pushToDrafts = () => {
    if (!listingDraft) return;
    const draft = {
      id: crypto.randomUUID(),
      title: listingDraft.title || 'Untitled Item',
      description: listingDraft.description || triageReport,
      pricingFloor: listingDraft.pricingFloor,
      itemSpecifics: listingDraft.itemSpecifics,
      scheduledFor: null,
      createdAt: new Date().toISOString(),
    };
    addDraft(draft);
    setActiveTab('done');
  };

  const isDeadStock = listingDraft !== null && (
    listingDraft.pricingFloor < 15 || detectDeadStock(marketIntelligence)
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-zinc-900">Information & Optimization Terminal</h2>

      {/* Dead-Stock Warning Banner */}
      {isDeadStock && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-300 text-red-800 px-5 py-4 rounded-lg shadow-sm">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">Low Margin / Dead Stock Flag</p>
            <p className="text-sm mt-1">
              Highly difficult to clear, low profitability. Listing not recommended.
            </p>
          </div>
        </div>
      )}

      {/* Run Market Research */}
      {!marketIntelligence && (
        <button
          onClick={runMarketResearch}
          disabled={researchLoading || !triageReport}
          className="flex items-center justify-center gap-2 w-full bg-purple-600 text-white py-3 rounded-md font-semibold hover:bg-purple-700 transition disabled:opacity-50 shadow-md"
        >
          {researchLoading ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
          {researchLoading ? 'Searching Comps & Market Value...' : 'Run Market Research Pipeline'}
        </button>
      )}

      {!triageReport && (
        <p className="text-sm text-gray-400 italic text-center">
          No triage report yet. Go to Upload tab and submit images first.
        </p>
      )}

      {/* Triage Report */}
      {triageReport && (
        <div className="bg-gray-100 text-zinc-900 p-5 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="font-bold text-sm mb-3 border-b pb-2 border-gray-300">Triage Report</h3>
          <div className="text-sm space-y-2
            [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4
            [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1
            [&_strong]:font-semibold">
            <Markdown>{triageReport}</Markdown>
          </div>
        </div>
      )}

      {/* Market Intelligence */}
      {marketIntelligence && (
        <div className="bg-purple-50 text-zinc-900 p-5 rounded-lg border border-purple-200 shadow-sm">
          <h3 className="font-bold text-sm mb-3 text-purple-900 border-b pb-2 border-purple-200">
            Market Intelligence Report
          </h3>
          <div className="text-sm space-y-2 text-zinc-900
            [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4
            [&_h4]:text-sm [&_h4]:font-bold [&_h4]:mt-3
            [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1.5
            [&_strong]:font-semibold">
            <Markdown>{marketIntelligence}</Markdown>
          </div>
        </div>
      )}

      {/* Listing Draft Builder */}
      {listingDraft && (
        <div className="flex flex-col gap-4">
          {verification && (
            <div className={`rounded-lg border p-4 ${verification.pass ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">Verification</h3>
                <span className="text-xs font-mono text-zinc-700">Score: {verification.score}/100</span>
              </div>
              <p className={`text-xs mt-1 ${verification.pass ? 'text-green-700' : 'text-yellow-800'}`}>
                {verification.pass ? 'Passed integrity checks.' : 'Warnings detected; review below before publishing.'}
              </p>
              {verification.issues.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-zinc-900">
                  {verification.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Cassini Title Builder */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={16} className="text-blue-600" />
              <h3 className="font-semibold text-sm text-zinc-900">Cassini Title Builder</h3>
              <span className="ml-auto text-xs text-gray-500">80-char max</span>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={80}
                value={listingDraft.title}
                onChange={e => updateListingDraft({ title: e.target.value })}
                placeholder="Write Cassini-optimized eBay title here..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 pr-12"
              />
              <span className={`absolute right-3 top-2.5 text-xs font-mono ${charCountColor(listingDraft.title.length)}`}>
                {listingDraft.title.length}/80
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-zinc-900 mb-3">Listing Description</h3>
            <textarea
              rows={6}
              value={listingDraft.description}
              onChange={e => updateListingDraft({ description: e.target.value })}
              placeholder="Structured listing description — condition, unique identifiers, authenticity notes..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
          </div>

          {/* Universal Item Specifics */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <PackageCheck size={16} className="text-green-600" />
              <h3 className="font-semibold text-sm text-zinc-900">Universal Item Specifics</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['Brand', 'Model', 'Year', 'MPN', 'Material', 'Theme', 'Color', 'Size', 'Condition', 'Country/Region of Manufacture', 'UPC', 'ISBN'].map(field => (
                <div key={field}>
                  <label className="text-xs text-gray-500 font-medium block mb-1">{field}</label>
                  <input
                    type="text"
                    value={listingDraft.itemSpecifics[field] ?? ''}
                    onChange={e => updateListingDraft({
                      itemSpecifics: { ...listingDraft.itemSpecifics, [field]: e.target.value }
                    })}
                    placeholder="Auto-fill or type..."
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Optimization Badges */}
          <div className="grid grid-cols-2 gap-3">
            {/* Shipping Estimator */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Truck size={14} className="text-blue-500" />
                <span className="text-xs font-semibold text-zinc-900">Shipping Estimate</span>
              </div>
              <div className="flex gap-3 text-xs text-zinc-900 font-mono">
                {(['l', 'w', 'h'] as const).map(dim => (
                  <div key={dim} className="flex flex-col items-center">
                    <span className="text-gray-400 uppercase">{dim}</span>
                    <input
                      type="number"
                      min={1}
                      value={listingDraft.shippingEstimate[dim]}
                      onChange={e => updateListingDraft({
                        shippingEstimate: {
                          ...listingDraft.shippingEstimate,
                          [dim]: Number(e.target.value),
                        }
                      })}
                      className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-gray-400">in</span>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className="text-xs text-gray-400 block mb-1">Est. Weight</label>
                <select
                  value={listingDraft.shippingEstimate.weight}
                  onChange={e => updateListingDraft({
                    shippingEstimate: { ...listingDraft.shippingEstimate, weight: e.target.value }
                  })}
                  className="text-xs border border-gray-300 rounded px-2 py-1 text-zinc-900 bg-white w-full"
                >
                  {['Under 1 lb', '1-2 lbs', '2-5 lbs', '5-10 lbs', '10+ lbs'].map(w => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Return Risk Badge */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={14} className="text-purple-500" />
                <span className="text-xs font-semibold text-zinc-900">Return Risk</span>
              </div>
              <div className="flex gap-2">
                {(['Low', 'Medium', 'High'] as ReturnRisk[]).map(risk => (
                  <button
                    key={risk}
                    onClick={() => updateListingDraft({ returnRisk: risk })}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition ${
                      listingDraft.returnRisk === risk
                        ? RETURN_RISK_COLORS[risk]
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}
                  >
                    {risk}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Category return liability rating</p>
            </div>

            {/* Category Matcher */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 size={14} className="text-orange-500" />
                <span className="text-xs font-semibold text-zinc-900">eBay Category ID</span>
              </div>
              <input
                type="text"
                value={listingDraft.categoryId}
                onChange={e => updateListingDraft({ categoryId: e.target.value })}
                placeholder="e.g. 11450 (Clothing)"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">Lowest FVF% category ID</p>
            </div>

            {/* Visual Fingerprint */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Fingerprint size={14} className="text-teal-600" />
                <span className="text-xs font-semibold text-zinc-900">Visual Fingerprint</span>
              </div>
              {buildingDraft ? (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Generating hash...
                </p>
              ) : fingerprintDone ? (
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-green-600" />
                  <span className="text-xs font-mono text-zinc-900">{fingerprint}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Run research to generate.</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Anti-swap surface hash</p>
            </div>
          </div>

          {/* Pricing Floor */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-4">
            <span className="text-sm font-semibold text-zinc-900">Pricing Floor</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-900">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={listingDraft.pricingFloor}
                onChange={e => updateListingDraft({ pricingFloor: parseFloat(e.target.value) || 0 })}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {listingDraft.pricingFloor < 15 && (
              <span className="ml-auto text-xs text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle size={12} /> Below $15 threshold
              </span>
            )}
          </div>

          {/* Push to Drafts */}
          <button
            onClick={pushToDrafts}
            className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 transition shadow-md"
          >
            <CheckCircle size={16} />
            Push to Drafts (Hidden eBay Draft)
          </button>
        </div>
      )}
    </div>
  );
}
