import React from 'react';
import { ExternalLink, Calendar, FolderOpen } from 'lucide-react';

function NFTList({ nfts }) {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateAddress = (address) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (nfts.length === 0) {
    return (
      <div className="p-8 text-center">
        <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No NFTs minted yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Drop folders in the inbox directory or use manual upload
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="max-h-96 overflow-y-auto">
        <div className="divide-y divide-gray-200">
          {nfts.map((nft, index) => (
            <div key={index} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {nft.name}
                    </h3>
                    {nft.source === 'api' && (
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                        Manual
                      </span>
                    )}
                    {nft.folder && (
                      <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                        Auto
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-1 flex items-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(nft.timestamp)}
                    {nft.folder && (
                      <>
                        <span className="mx-2">•</span>
                        <span>Folder: {nft.folder}</span>
                      </>
                    )}
                  </div>
                  
                  <div className="mt-2 flex flex-col space-y-1">
                    <div className="text-xs text-gray-500">
                      <span className="font-medium">Mint:</span>
                      <span className="ml-1 font-mono">{truncateAddress(nft.mint)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <a
                    href={nft.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Transaction
                  </a>
                  <a
                    href={nft.mintUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-1 bg-solana-purple text-white text-xs rounded-full hover:bg-purple-600 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    NFT
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default NFTList;