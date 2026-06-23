'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { ensureLocalUserId } from '@/lib/identity';

export type TabId = 'upload' | 'info' | 'done' | 'active';

export type ReturnRisk = 'Low' | 'Medium' | 'High';

export interface ShippingEstimate {
  l: number;
  w: number;
  h: number;
  weight: string;
}

export interface ListingDraft {
  title: string;
  description: string;
  itemSpecifics: Record<string, string>;
  shippingEstimate: ShippingEstimate;
  categoryId: string;
  returnRisk: ReturnRisk;
  pricingFloor: number;
  visualHash: string;
}

export interface DraftItem {
  id: string;
  title: string;
  description: string;
  pricingFloor: number;
  itemSpecifics: Record<string, string>;
  scheduledFor: string | null;
  ebayOfferId?: string;
  ebaySku?: string;
  publishError?: string;
  createdAt: string;
}

export interface ListingItem {
  id: string;
  title: string;
  ebayListingId: string;
  ebayOfferId?: string;
  sku?: string;
  pricingFloor: number;
  views: number;
  watchers: number;
  listedAt: string;
  autoRelistEnabled: boolean;
}

interface AppState {
  userId: string;
  currentItemId: string;
  itemQueue: Array<{ id: string; title: string; stage: string; updatedAt: string }>;
  isHydrating: boolean;
  activeTab: TabId;
  uploadedImages: string[];
  triageReport: string;
  marketIntelligence: string;
  listingDraft: ListingDraft | null;
  drafts: DraftItem[];
  activeListings: ListingItem[];
  pausedJobs: Array<{ id: string; type: string; runAt: string; status: string }>;
}

interface AppContextType extends AppState {
  createNewItem: () => Promise<void>;
  switchItem: (id: string) => Promise<void>;
  setActiveTab: (tab: TabId) => void;
  setUploadedImages: (images: string[]) => void;
  addUploadedImage: (image: string) => void;
  removeUploadedImage: (index: number) => void;
  setTriageReport: (report: string) => void;
  setMarketIntelligence: (data: string) => void;
  setListingDraft: (draft: ListingDraft | null) => void;
  updateListingDraft: (partial: Partial<ListingDraft>) => void;
  addDraft: (draft: DraftItem) => void;
  updateDraft: (id: string, partial: Partial<DraftItem>) => void;
  removeDraft: (id: string) => void;
  moveDraftToActive: (id: string, ebayListingId: string, sku?: string, ebayOfferId?: string) => void;
  updateActiveListing: (id: string, partial: Partial<ListingItem>) => void;
  toggleAutoRelist: (id: string) => void;
  resetItem: () => void;
}

interface ApiItem {
  id: string;
  title: string | null;
  stage: string;
  images?: Array<{ blobUrl: string; variant: string }>;
  triageReport: string | null;
  marketIntelligence: string | null;
  listingDraft: ListingDraft | null;
  verification: {
    uploadedImages?: string[];
    drafts?: DraftItem[];
    activeListings?: ListingItem[];
  } | null;
  updatedAt: string;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState('');
  const [currentItemId, setCurrentItemId] = useState('');
  const [itemQueue, setItemQueue] = useState<Array<{ id: string; title: string; stage: string; updatedAt: string }>>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('upload');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [triageReport, setTriageReport] = useState('');
  const [marketIntelligence, setMarketIntelligence] = useState('');
  const [listingDraft, setListingDraft] = useState<ListingDraft | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeListings, setActiveListings] = useState<ListingItem[]>([]);
  const [pausedJobs, setPausedJobs] = useState<Array<{ id: string; type: string; runAt: string; status: string }>>([]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runnerLock = useRef(false);

  const hydrateFromItem = (item: ApiItem) => {
    setCurrentItemId(item.id);
    setTriageReport(item.triageReport ?? '');
    setMarketIntelligence(item.marketIntelligence ?? '');
    setListingDraft(item.listingDraft ?? null);
    const fallbackImages = (item.images ?? [])
      .filter(img => img.variant === 'enhanced' || img.variant === 'original')
      .map(img => img.blobUrl);
    setUploadedImages(item.verification?.uploadedImages ?? fallbackImages);
    setDrafts(item.verification?.drafts ?? []);
    setActiveListings(item.verification?.activeListings ?? []);
  };

  const createRemoteItem = async (uid: string, title?: string): Promise<ApiItem | null> => {
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, title }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.item as ApiItem;
    } catch {
      return null;
    }
  };

  const loadItems = async (uid: string) => {
    try {
      const res = await fetch(`/api/items?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) return [] as ApiItem[];
      const data = await res.json();
      return (data.items ?? []) as ApiItem[];
    } catch {
      return [] as ApiItem[];
    }
  };

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      const uid = ensureLocalUserId();
      if (!mounted) return;
      setUserId(uid);

      try {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: uid }),
        });
      } catch {
        // Ignore bootstrapping failure; app can still function locally.
      }

      let items = await loadItems(uid);
      if (items.length === 0) {
        const created = await createRemoteItem(uid, 'Untitled Item');
        if (created) items = [created];
      }

      if (!mounted) return;

      setItemQueue(items.map(item => ({
        id: item.id,
        title: item.title ?? 'Untitled Item',
        stage: item.stage,
        updatedAt: item.updatedAt,
      })));

      if (items.length > 0) {
        hydrateFromItem(items[0]);
      }

      setIsHydrating(false);
    };

    boot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentItemId || isHydrating) return;

    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
    }

    persistTimer.current = setTimeout(async () => {
      const stage =
        activeListings.length > 0 ? 'ACTIVE' :
        drafts.length > 0 ? 'DRAFT' :
        listingDraft ? 'BUILD' :
        marketIntelligence ? 'RESEARCH' :
        triageReport ? 'TRIAGE' :
        uploadedImages.length > 0 ? 'UPLOAD' :
        'UPLOAD';

      try {
        await fetch(`/api/items/${currentItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage,
            triageReport,
            marketIntelligence,
            listingDraft,
            verification: {
              uploadedImages,
              drafts,
              activeListings,
            },
          }),
        });
      } catch {
        // Ignore transient persistence errors; keep local state responsive.
      }
    }, 350);

    return () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
      }
    };
  }, [currentItemId, isHydrating, triageReport, marketIntelligence, listingDraft, uploadedImages, drafts, activeListings]);

  useEffect(() => {
    if (!userId || isHydrating) return;

    let alive = true;
    const runJobs = async () => {
      if (runnerLock.current) return;
      runnerLock.current = true;

      try {
        const res = await fetch(`/api/jobs/ready?userId=${encodeURIComponent(userId)}&limit=5`);
        const data = await res.json();
        const jobs = (data.jobs ?? []) as Array<{ id: string; type: string; status: string; payload?: any; runAt: string }>;

        if (!alive) return;
        setPausedJobs(jobs.map(j => ({ id: j.id, type: j.type, runAt: j.runAt, status: j.status })));

        for (const job of jobs) {
          try {
            if (job.type === 'build-listing' && job.payload) {
              const payload = job.payload as { userId?: string; itemId?: string; triageReport: string; marketIntelligence: string };
              const buildRes = await fetch('/api/build-listing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const buildData = await buildRes.json();

              if (buildRes.ok && buildData.result && payload.itemId === currentItemId) {
                setListingDraft(prev => ({
                  ...(prev ?? {
                    title: '',
                    description: '',
                    itemSpecifics: {},
                    shippingEstimate: { l: 12, w: 9, h: 6, weight: '1-2 lbs' },
                    categoryId: '',
                    returnRisk: 'Low',
                    pricingFloor: 0,
                    visualHash: '',
                  }),
                  ...buildData.result,
                }));
              }

              await fetch('/api/jobs/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId: job.id,
                  status: buildRes.ok ? 'COMPLETED' : 'FAILED',
                  result: buildData,
                  error: buildRes.ok ? undefined : (buildData?.error ?? 'Job failed'),
                }),
              });
            } else if (job.type === 'verify-listing' && job.payload) {
              const verifyRes = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(job.payload),
              });
              const verifyData = await verifyRes.json();

              await fetch('/api/jobs/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId: job.id,
                  status: verifyRes.ok ? 'COMPLETED' : 'FAILED',
                  result: verifyData,
                  error: verifyRes.ok ? undefined : (verifyData?.error ?? 'Job failed'),
                }),
              });
            }
          } catch {
            await fetch('/api/jobs/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: job.id,
                status: 'FAILED',
                error: 'Auto-resume execution failed',
              }),
            });
          }
        }
      } finally {
        runnerLock.current = false;
      }
    };

    const interval = setInterval(runJobs, 15000);
    void runJobs();

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [userId, isHydrating, currentItemId]);

  const createNewItem = async () => {
    if (!userId) return;
    const item = await createRemoteItem(userId, 'Untitled Item');
    if (!item) return;

    setItemQueue(prev => [{
      id: item.id,
      title: item.title ?? 'Untitled Item',
      stage: item.stage,
      updatedAt: item.updatedAt,
    }, ...prev]);

    hydrateFromItem(item);
    setActiveTab('upload');
  };

  const switchItem = async (id: string) => {
    try {
      const res = await fetch(`/api/items/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      hydrateFromItem(data.item as ApiItem);
    } catch {
      // Ignore switching error.
    }
  };

  const addUploadedImage = (image: string) => {
    setUploadedImages(prev => prev.length < 24 ? [...prev, image] : prev);
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const updateListingDraft = (partial: Partial<ListingDraft>) => {
    setListingDraft(prev => prev ? { ...prev, ...partial } : null);
  };

  const addDraft = (draft: DraftItem) => {
    setDrafts(prev => [...prev, draft]);
  };

  const updateDraft = (id: string, partial: Partial<DraftItem>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...partial } : d));
  };

  const removeDraft = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const moveDraftToActive = (id: string, ebayListingId: string, sku?: string, ebayOfferId?: string) => {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    const newListing: ListingItem = {
      id: draft.id,
      title: draft.title,
      ebayListingId,
      ebayOfferId,
      sku,
      pricingFloor: draft.pricingFloor,
      views: 0,
      watchers: 0,
      listedAt: new Date().toISOString(),
      autoRelistEnabled: false,
    };
    setActiveListings(prev => [...prev, newListing]);
    removeDraft(id);
    setActiveTab('active');
  };

  const toggleAutoRelist = (id: string) => {
    setActiveListings(prev =>
      prev.map(l => l.id === id ? { ...l, autoRelistEnabled: !l.autoRelistEnabled } : l)
    );
  };

  const updateActiveListing = (id: string, partial: Partial<ListingItem>) => {
    setActiveListings(prev => prev.map(l => (l.id === id ? { ...l, ...partial } : l)));
  };

  const resetItem = () => {
    setUploadedImages([]);
    setTriageReport('');
    setMarketIntelligence('');
    setListingDraft(null);
    setDrafts([]);
    setActiveListings([]);
    setActiveTab('upload');
  };

  return (
    <AppContext.Provider value={{
      userId,
      currentItemId,
      itemQueue,
      isHydrating,
      createNewItem,
      switchItem,
      activeTab, setActiveTab,
      uploadedImages, setUploadedImages, addUploadedImage, removeUploadedImage,
      triageReport, setTriageReport,
      marketIntelligence, setMarketIntelligence,
      listingDraft, setListingDraft, updateListingDraft,
      drafts, addDraft, updateDraft, removeDraft, moveDraftToActive,
      activeListings, updateActiveListing, toggleAutoRelist,
      pausedJobs,
      resetItem,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
