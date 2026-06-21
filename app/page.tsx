'use client';

import { useState, useRef } from 'react';

export default function CameraTriage() {
  const [image, setImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
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
        <div className="bg-gray-100 text-zinc-900 p-6 rounded-md shadow-inner whitespace-pre-wrap">
          <h2 className="font-bold mb-2">Triage Report:</h2>
          {analysis}
        </div>
      )}
    </main>
  );
}