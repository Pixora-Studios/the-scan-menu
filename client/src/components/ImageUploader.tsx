import React, { useState, useRef } from 'react';
import axios from 'axios';
import { apiClient } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, RefreshCw, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface ImageUploaderProps {
  restaurantId: string;
  value?: string;
  onChange: (url: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  restaurantId,
  value,
  onChange,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      // 1. Fetch signed signature from backend (using the configured apiClient!)
      const sigResponse = await apiClient.post(`/restaurants/${restaurantId}/uploads/signature`);

      const { signature, timestamp, folder, apiKey, cloudName } = sigResponse.data.data;

      // 2. Direct upload to Cloudinary using FormData (direct to Cloudinary endpoint via standard axios)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('folder', folder);

      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

      const uploadResponse = await axios.post(cloudinaryUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percent);
          }
        },
      });

      const uploadedUrl = uploadResponse.data.secure_url;
      onChange(uploadedUrl);
    } catch (err: any) {
      console.error(err);
      setError('Upload failed. Please check credentials or retry.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3 w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all min-h-40 bg-slate-50/50 hover:bg-slate-50 ${
          value ? 'border-slate-100 bg-white' : 'border-slate-200 hover:border-amber-400'
        } ${isUploading ? 'pointer-events-none' : ''}`}
      >
        <AnimatePresence mode="wait">
          {value ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center p-2"
            >
              <img
                src={value}
                alt="Upload preview"
                className="w-full h-full object-cover rounded-xl"
              />
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-3 right-3 bg-slate-900/80 hover:bg-slate-900 text-white p-1.5 rounded-full shadow-sm transition"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 bg-slate-900/70 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 font-semibold backdrop-blur-sm">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Replace</span>
              </div>
            </motion.div>
          ) : isUploading ? (
            <div className="w-full text-center space-y-4 px-4">
              <Upload className="w-8 h-8 text-amber-500 animate-bounce mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">Uploading Image...</p>
                <p className="text-xs text-slate-400">{progress}% completed</p>
              </div>

              {/* Animated Progress Bar using Framer Motion width */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="bg-amber-500 h-full rounded-full"
                />
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-center space-y-2.5"
            >
              <div className="h-11 w-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                <ImageIcon className="w-5.5 h-5.5" strokeWidth={1.75} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">Upload menu image</p>
                <p className="text-xs text-slate-400">Supports PNG, JPG, or WEBP formats</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-xs text-red-600 animate-shake">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-red-700 underline font-bold hover:text-red-900"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
export const ImageSkeletonLoader: React.FC = () => (
  <div className="w-full h-40 bg-slate-100 rounded-2xl animate-pulse flex items-center justify-center text-slate-300">
    <ImageIcon className="w-8 h-8" />
  </div>
);
