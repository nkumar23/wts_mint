import React, { useState } from 'react';
import axios from 'axios';
import { Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function NFTUpload({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [metadata, setMetadata] = useState({
    name: '',
    description: '',
    symbol: '',
    seller_fee_basis_points: 500,
    attributes: []
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
      if (allowedTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: 'Please select a valid media file (PNG, JPG, GIF, WebP, MP4, WebM)' });
      }
    }
  };

  const handleMetadataChange = (field, value) => {
    setMetadata(prev => ({
      ...prev,
      [field]: field === 'seller_fee_basis_points' ? Number(value) : value
    }));
  };

  const addAttribute = () => {
    setMetadata(prev => ({
      ...prev,
      attributes: [...prev.attributes, { trait_type: '', value: '' }]
    }));
  };

  const removeAttribute = (index) => {
    setMetadata(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }));
  };

  const updateAttribute = (index, field, value) => {
    setMetadata(prev => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => 
        i === index ? { ...attr, [field]: value } : attr
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file || !metadata.name.trim()) {
      setMessage({ type: 'error', text: 'Please select a file and enter an NFT name' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('media', file);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await axios.post(`${API_BASE}/api/mint`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setMessage({ 
        type: 'success', 
        text: 'NFT minted successfully!',
        explorerUrl: response.data.explorerUrl
      });

      // Reset form
      setFile(null);
      setMetadata({
        name: '',
        description: '',
        symbol: '',
        seller_fee_basis_points: 500,
        attributes: []
      });

      if (onSuccess) {
        onSuccess(response.data);
      }

    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to mint NFT' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Media File
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
          <input
            type="file"
            onChange={handleFileChange}
            accept="image/*,video/mp4,video/webm"
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <Upload className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm text-gray-600">
              {file ? file.name : 'Click to select media file'}
            </span>
          </label>
        </div>
      </div>

      {/* NFT Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          NFT Name *
        </label>
        <input
          type="text"
          value={metadata.name}
          onChange={(e) => handleMetadataChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-transparent"
          placeholder="My Awesome NFT"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={metadata.description}
          onChange={(e) => handleMetadataChange('description', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-transparent"
          rows="3"
          placeholder="Describe your NFT..."
        />
      </div>

      {/* Symbol and Royalties */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Symbol
          </label>
          <input
            type="text"
            value={metadata.symbol}
            onChange={(e) => handleMetadataChange('symbol', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-transparent"
            placeholder="NFT"
            maxLength="10"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Royalties (%)
          </label>
          <input
            type="number"
            value={metadata.seller_fee_basis_points / 100}
            onChange={(e) => {
              const percentage = parseFloat(e.target.value) || 0;
              const basisPoints = Math.max(0, Math.min(10000, percentage * 100)); // Clamp between 0 and 10000
              handleMetadataChange('seller_fee_basis_points', basisPoints);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-transparent"
            min="0"
            max="100"
            step="0.1"
          />
        </div>
      </div>

      {/* Attributes */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Attributes
          </label>
          <button
            type="button"
            onClick={addAttribute}
            className="text-sm text-solana-purple hover:text-purple-600"
          >
            + Add Attribute
          </button>
        </div>
        {metadata.attributes.map((attr, index) => (
          <div key={index} className="grid grid-cols-5 gap-2 mb-2">
            <div className="col-span-2">
              <input
                type="text"
                value={attr.trait_type}
                onChange={(e) => updateAttribute(index, 'trait_type', e.target.value)}
                placeholder="Trait Type"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-solana-purple"
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                value={attr.value}
                onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                placeholder="Value"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-solana-purple"
              />
            </div>
            <button
              type="button"
              onClick={() => removeAttribute(index)}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-md flex items-start ${
          message.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
        }`}>
          {message.type === 'error' ? (
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="text-sm">{message.text}</p>
            {message.explorerUrl && (
              <a
                href={message.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline hover:no-underline mt-1 inline-block"
              >
                View on Explorer
              </a>
            )}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || !file || !metadata.name.trim()}
        className="w-full bg-solana-purple text-white py-2 px-4 rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {loading ? (
          <>
            <Loader className="animate-spin h-4 w-4 mr-2" />
            Minting NFT...
          </>
        ) : (
          'Mint NFT'
        )}
      </button>
    </form>
  );
}

export default NFTUpload;