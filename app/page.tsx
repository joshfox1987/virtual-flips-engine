'use client';

import { AppProvider, useApp, TabId } from './context/AppContext';
import { UploadTab } from './components/tabs/UploadTab';
import { InfoTab } from './components/tabs/InfoTab';
import { DraftsTab } from './components/tabs/DraftsTab';
import { ActiveTab } from './components/tabs/ActiveTab';
import { Upload, BarChart2, Archive, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'upload', label: 'Upload', icon: <Upload size={16} /> },
  { id: 'info', label: 'Optimize', icon: <BarChart2 size={16} /> },
  { id: 'done', label: 'Drafts', icon: <Archive size={16} /> },
  { id: 'active', label: 'Active', icon: <Activity size={16} /> },
];

function AppShell() {
  const {
    userId,
    pausedJobs,
    activeTab,
    setActiveTab,
    itemQueue,
    currentItemId,
    switchItem,
    createNewItem,
    isHydrating,
  } = useApp();
  const [ebayConnected, setEbayConnected] = useState(false);
  const [ebayEnv, setEbayEnv] = useState('sandbox');
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayCode, setEbayCode] = useState('');
  const [ebayExchangeLoading, setEbayExchangeLoading] = useState(false);

  const refreshEbayStatus = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/ebay/status?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setEbayConnected(Boolean(data.connected));
      setEbayEnv(data.environment ?? 'sandbox');
    } catch {
      setEbayConnected(false);
    }
  };

  useEffect(() => {
    refreshEbayStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const connectEbay = async () => {
    if (!userId) return;
    setEbayLoading(true);
    try {
      const res = await fetch('/api/ebay/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setEbayLoading(false);
    }
  };

  const exchangeEbayCode = async () => {
    if (!userId || !ebayCode.trim()) return;
    setEbayExchangeLoading(true);
    try {
      const res = await fetch('/api/ebay/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: ebayCode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setEbayCode('');
        await refreshEbayStatus();
      }
    } finally {
      setEbayExchangeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Virtual Flips Engine</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono">eBay Automation Workspace</span>
          <span className={`text-xs px-2 py-1 rounded border ${ebayConnected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
            eBay: {ebayConnected ? `Connected (${ebayEnv})` : 'Not Connected'}
          </span>
          <button
            onClick={connectEbay}
            disabled={ebayLoading}
            className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {ebayLoading ? 'Loading...' : 'Connect eBay'}
          </button>
          <input
            value={ebayCode}
            onChange={e => setEbayCode(e.target.value)}
            placeholder="Paste eBay auth code"
            className="text-xs border border-gray-300 rounded px-2 py-1.5 w-44 text-zinc-900 bg-white"
          />
          <button
            onClick={exchangeEbayCode}
            disabled={ebayExchangeLoading || !ebayCode.trim()}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {ebayExchangeLoading ? 'Exchanging...' : 'Exchange Code'}
          </button>
          <span className={`text-xs px-2 py-1 rounded border ${pausedJobs.length > 0 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
            Jobs: {pausedJobs.length > 0 ? `${pausedJobs.length} waiting` : 'clear'}
          </span>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <ul className="flex gap-1">
          {TABS.map(tab => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-zinc-900 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Item Queue */}
      <section className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={createNewItem}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            + New Item
          </button>
          {isHydrating ? (
            <span className="text-xs text-gray-400">Loading queue...</span>
          ) : (
            itemQueue.map(item => (
              <button
                key={item.id}
                onClick={() => switchItem(item.id)}
                className={`px-3 py-1.5 rounded border text-xs whitespace-nowrap transition ${
                  item.id === currentItemId
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-zinc-700 hover:bg-gray-50'
                }`}
              >
                {item.title || 'Untitled Item'}
              </button>
            ))
          )}
        </div>
      </section>

      {/* Tab Content */}
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
        {activeTab === 'upload' && <UploadTab />}
        {activeTab === 'info' && <InfoTab />}
        {activeTab === 'done' && <DraftsTab />}
        {activeTab === 'active' && <ActiveTab />}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}