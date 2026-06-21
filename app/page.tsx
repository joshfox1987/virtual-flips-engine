'use client';

import { useState, useRef } from 'react';

export default function CameraTriage() {
  const [image, setImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [research, setResearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [researchLoading, setResearchLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setAnalysis('');
    setResearch('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      setAnalysis(data.result);
    } catch (error) {
      console.error('Failed to analyze image:', error);
      setAnalysis('Error analyzing image. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const runMarketResearch = async () => {
    if (!analysis) return;
    setResearchLoading(true);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemDetails: analysis }),
      });
      const data = await res.json();
      setResearch(data.result);
    } catch (error) {
      console.error('Failed to run research:', error);
      setResearch('Error running market research. Check console.');
    } finally {
      setResearchLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Virtual Flips: Triage Agent</h1>

      <div className="flex flex-col gap-4 border-2 border-dashed border-gray-300 p-8 rounded-lg text-center">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          ref={fileInputRef}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition"
        >
          Capture / Upload Item
        </button>
      </div>

      {image && (
        <div className="flex flex-col gap-4">
          <img src={image} alt="Triage Item" className="w-full h-auto rounded-md shadow-md" />
          <button
            onClick={analyzeImage}
            disabled={loading}
            className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Run Triage Analysis'}
          </button>
        </div>
      )}

      {analysis && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-100 text-zinc-900 p-6 rounded-md shadow-inner whitespace-pre-wrap">
            <h2 className="font-bold mb-2 text-lg border-b pb-1 border-gray-300">Triage Report:</h2>
            {analysis}
          </div>
          
          <button
            onClick={runMarketResearch}
            disabled={researchLoading}
            className="bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition disabled:opacity-50 font-semibold shadow-md"
          >
            {researchLoading ? 'Searching Comps & Market Value...' : 'Run Market Research Pipeline'}
          </button>
        </div>
      )}

      {research && (
        <div className="bg-purple-50 text-zinc-900 p-6 rounded-md shadow-inner border border-purple-200 whitespace-pre-wrap">
          <h2 className="font-bold mb-2 text-lg text-purple-900 border-b pb-1 border-purple-200">
            Market Intelligence Report:
          </h2>
          {research}
        </div>
      )}
    </main>
  );
}