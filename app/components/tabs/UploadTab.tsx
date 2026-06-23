'use client';

import { useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Trash2, ImagePlus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function UploadTab() {
  const {
    currentItemId,
    uploadedImages,
    addUploadedImage,
    removeUploadedImage,
    setUploadedImages,
    setTriageReport,
    setActiveTab,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiFeedback, setAiFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [enhanceLog, setEnhanceLog] = useState<string[]>([]);
  const [qaLog, setQaLog] = useState<string[]>([]);
  const [qaError, setQaError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentItemId) {
      setQaError('Item queue is still loading. Try again in a moment.');
      return;
    }

    const files = Array.from(e.target.files ?? []);
    const remaining = 24 - uploadedImages.length;
    const toProcess = files.slice(0, remaining);
    setUploadLoading(true);

    for (const [index, file] of toProcess.entries()) {
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: currentItemId,
            filename: file.name || `upload-${Date.now()}-${index}.jpg`,
            contentType: file.type || 'image/jpeg',
            dataUrl: base64,
            variant: 'original',
          }),
        });
        const data = await res.json();
        if (data.url) {
          addUploadedImage(data.url);
        }
      } catch {
        setQaError(`Failed to upload ${file.name}.`);
      }
    }

    setUploadLoading(false);

    // Reset input so the same files can be re-selected if needed
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const runAiFeedback = async () => {
    if (uploadedImages.length === 0) return;
    setFeedbackLoading(true);
    setAiFeedback('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: uploadedImages }),
      });
      const data = await res.json();
      setAiFeedback(data.result ?? data.error ?? 'No response.');
    } catch {
      setAiFeedback('Error contacting analysis engine. Check console.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const enhanceUploadedImages = async () => {
    if (!currentItemId || uploadedImages.length === 0) return;
    setEnhanceLoading(true);
    const logs: string[] = [];
    const enhancedUrls: string[] = [];

    for (const [idx, imageUrl] of uploadedImages.entries()) {
      try {
        logs.push(`Enhancing image ${idx + 1}/${uploadedImages.length}...`);
        setEnhanceLog([...logs]);

        const enhanceRes = await fetch('/api/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: currentItemId, imageUrl }),
        });
        const enhanceData = await enhanceRes.json();
        if (!enhanceRes.ok || !enhanceData.url) {
          logs.push(`✗ Enhancement failed for image ${idx + 1}; keeping original.`);
          enhancedUrls.push(imageUrl);
          setEnhanceLog([...logs]);
          continue;
        }

        const verifyRes = await fetch('/api/verify-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalUrl: imageUrl, enhancedUrl: enhanceData.url }),
        });
        const verifyData = await verifyRes.json();
        const approved = Boolean(verifyData?.result?.approved);

        if (approved) {
          logs.push(`✓ Image ${idx + 1} enhanced and verified.`);
          enhancedUrls.push(enhanceData.url);
        } else {
          logs.push(`⚠ Image ${idx + 1} enhancement not approved; using original.`);
          enhancedUrls.push(imageUrl);
        }
      } catch {
        logs.push(`✗ Image ${idx + 1} enhancement error; using original.`);
        enhancedUrls.push(imageUrl);
      }
      setEnhanceLog([...logs]);
    }

    setUploadedImages(enhancedUrls);
    setEnhanceLoading(false);
  };

  const submitIngestion = async () => {
    const log: string[] = [];
    setQaError('');

    if (uploadedImages.length === 0) {
      setQaError('No images uploaded. Please add at least one image.');
      return;
    }
    if (uploadedImages.length < 3) {
      log.push('⚠ Fewer than 3 images uploaded. Recommend adding more angles for accuracy.');
    } else {
      log.push(`✓ Image count: ${uploadedImages.length} / 24`);
    }

    if (!aiFeedback) {
      log.push('⚠ AI feedback not yet generated. Running analysis now...');
      setQaLog(log);

      setFeedbackLoading(true);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: uploadedImages }),
        });
        const data = await res.json();
        setAiFeedback(data.result ?? '');
        setTriageReport(data.result ?? '');
        log.push('✓ Analysis complete. Proceeding to Optimize tab.');
        setQaLog([...log]);
        setActiveTab('info');
      } catch {
        log.push('✗ Analysis failed. Check your API key and connection.');
        setQaLog([...log]);
      } finally {
        setFeedbackLoading(false);
      }
      return;
    }

    log.push('✓ AI feedback confirmed.');
    log.push('✓ QA passed. Releasing to Optimize tab.');
    setQaLog(log);
    setTriageReport(aiFeedback);
    setTimeout(() => setActiveTab('info'), 600);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900">Upload Terminal</h2>
        <span className="text-sm text-gray-500">{uploadedImages.length} / 24 images</span>
      </div>

      {/* Drop Zone */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-white cursor-pointer hover:border-blue-400 transition"
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mx-auto mb-3 text-gray-400" size={36} />
        <p className="text-sm text-gray-500">
          Click to capture or select up to 24 images.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPEG, PNG, WEBP — all angles, labels, serial numbers, flaws.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {uploadLoading && (
        <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded">
          Uploading images to Blob storage...
        </div>
      )}

      {/* Image Preview Grid */}
      {uploadedImages.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {uploadedImages.map((src, i) => (
            <div key={i} className="relative group rounded-md overflow-hidden shadow border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Upload ${i + 1}`} className="w-full h-24 object-cover" />
              <button
                onClick={() => removeUploadedImage(i)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                title="Remove image"
              >
                <Trash2 size={12} />
              </button>
              <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1 rounded">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {uploadedImages.length > 0 && (
        <button
          onClick={enhanceUploadedImages}
          disabled={enhanceLoading}
          className="flex items-center justify-center gap-2 w-full bg-zinc-900 text-white py-2.5 rounded-md font-semibold hover:bg-zinc-800 transition disabled:opacity-50"
        >
          {enhanceLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {enhanceLoading ? 'Enhancing Photos...' : 'Enhance Photos (Deterministic + Verify)'}
        </button>
      )}

      {enhanceLog.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-zinc-900 space-y-1">
          {enhanceLog.map((line, i) => (
            <div key={i} className={line.startsWith('✓') ? 'text-green-700' : line.startsWith('✗') ? 'text-red-600' : 'text-yellow-700'}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* AI Feedback Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-zinc-900 text-sm">AI Guidance Feed</h3>
          <button
            onClick={runAiFeedback}
            disabled={feedbackLoading || uploadedImages.length === 0}
            className="flex items-center gap-2 text-xs bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {feedbackLoading ? <Loader2 size={12} className="animate-spin" /> : null}
            {feedbackLoading ? 'Analyzing...' : 'Analyze Images'}
          </button>
        </div>

        {aiFeedback ? (
          <div className="text-zinc-900 text-sm bg-blue-50 rounded p-4 border border-blue-100 space-y-2
            [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4
            [&_h4]:text-sm [&_h4]:font-bold [&_h4]:mt-3
            [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1
            [&_strong]:font-semibold">
            <Markdown>{aiFeedback}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            {uploadedImages.length === 0
              ? 'Upload images to enable analysis.'
              : 'Click "Analyze Images" to receive adaptive guidance from the AI.'}
          </p>
        )}
      </div>

      {/* QA Log */}
      {qaLog.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-zinc-900 space-y-1">
          {qaLog.map((line, i) => (
            <div key={i} className={line.startsWith('✓') ? 'text-green-700' : line.startsWith('✗') ? 'text-red-600' : 'text-yellow-700'}>
              {line}
            </div>
          ))}
        </div>
      )}

      {qaError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {qaError}
        </div>
      )}

      {/* Submit Ingestion */}
      <button
        onClick={submitIngestion}
        disabled={feedbackLoading || uploadedImages.length === 0}
        className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-3 rounded-md font-semibold hover:bg-green-700 transition disabled:opacity-50 shadow-md"
      >
        {feedbackLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        Submit Ingestion & Proceed to Optimize
      </button>
    </div>
  );
}
