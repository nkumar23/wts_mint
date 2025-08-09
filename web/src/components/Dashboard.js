import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import io from 'socket.io-client';
import axios from 'axios';
import { 
  Upload, 
  Folder, 
  Coins, 
  Activity, 
  AlertCircle,
  CheckCircle,
  Clock,
  Play,
  Pause
} from 'lucide-react';

import NFTUpload from './NFTUpload';
import StatusCard from './StatusCard';
import NFTList from './NFTList';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function Dashboard() {
  const wallet = useWallet();
  const [socket, setSocket] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [mintedNFTs, setMintedNFTs] = useState([]);
  const [realtimeEvents, setRealtimeEvents] = useState([]);
  const [watcherActive, setWatcherActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Notify server of wallet connection changes
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      axios.post(`${API_BASE}/api/wallet/connect`, {
        publicKey: wallet.publicKey.toString(),
        walletName: wallet.wallet?.adapter?.name || 'Unknown'
      }).catch(error => {
        console.error('Failed to notify server of wallet connection:', error);
      });
    } else if (!wallet.connected) {
      axios.post(`${API_BASE}/api/wallet/disconnect`).catch(error => {
        console.error('Failed to notify server of wallet disconnection:', error);
      });
    }
  }, [wallet.connected, wallet.publicKey, wallet.wallet]);

  const addRealtimeEvent = (type, message, data = null) => {
    const event = {
      id: Date.now(),
      type,
      message,
      timestamp: new Date(),
      data
    };
    
    setRealtimeEvents(prev => [event, ...prev.slice(0, 49)]); // Keep last 50 events
  };

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/status`);
      setServerStatus(response.data);
      setWatcherActive(response.data.stats?.watcherActive || false);
      
      const nftsResponse = await axios.get(`${API_BASE}/api/nfts`);
      setMintedNFTs(nftsResponse.data);
    } catch (error) {
      console.error('Failed to fetch server status:', error);
      addRealtimeEvent('error', 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Connect to WebSocket
    const newSocket = io(API_BASE);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      fetchServerStatus();
    });

    newSocket.on('status', (data) => {
      setServerStatus(data);
      setWatcherActive(data.stats?.watcherActive || false);
    });

    newSocket.on('nftMinted', (nftData) => {
      setMintedNFTs(prev => [nftData, ...prev]);
      addRealtimeEvent('success', `NFT Minted: ${nftData.name}`, nftData);
    });

    newSocket.on('processingStarted', (data) => {
      addRealtimeEvent('info', `Processing: ${data.folder}`, data);
    });

    newSocket.on('uploading', (data) => {
      addRealtimeEvent('info', `Uploading: ${data.nftName}`, data);
    });

    newSocket.on('minting', (data) => {
      addRealtimeEvent('info', `Minting: ${data.nftName}`, data);
    });

    newSocket.on('error', (data) => {
      addRealtimeEvent('error', `Error: ${data.message}`, data);
    });

    newSocket.on('folderDetected', (data) => {
      addRealtimeEvent('info', `New folder detected: ${data.folder}`, data);
    });

    newSocket.on('watcherStarted', () => {
      setWatcherActive(true);
      addRealtimeEvent('success', 'Folder watcher started');
    });

    newSocket.on('watcherStopped', () => {
      setWatcherActive(false);
      addRealtimeEvent('info', 'Folder watcher stopped');
    });

    return () => newSocket.close();
  }, [fetchServerStatus]);

  const toggleWatcher = async () => {
    try {
      const action = watcherActive ? 'stop' : 'start';
      await axios.post(`${API_BASE}/api/watcher/${action}`);
    } catch (error) {
      addRealtimeEvent('error', `Failed to ${watcherActive ? 'stop' : 'start'} watcher`);
    }
  };

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-solana-purple mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to NFT Minting Server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Coins className="h-8 w-8 text-solana-purple mr-3" />
              <h1 className="text-xl font-bold text-gray-900">WTS Mint NFT</h1>
              <span className="ml-3 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                {serverStatus?.network || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleWatcher}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  watcherActive
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {watcherActive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {watcherActive ? 'Stop Watcher' : 'Start Watcher'}
              </button>
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatusCard
            title="Server Wallet"
            value={serverStatus?.wallet?.address ? 
              `${serverStatus.wallet.address.slice(0, 4)}...${serverStatus.wallet.address.slice(-4)}` : 
              'Unknown'
            }
            subtitle={`${serverStatus?.wallet?.balance?.toFixed(4) || '0'} SOL`}
            icon={Coins}
            color="blue"
          />
          <StatusCard
            title="Total Minted"
            value={serverStatus?.stats?.totalMinted || 0}
            subtitle="NFTs created"
            icon={CheckCircle}
            color="green"
          />
          <StatusCard
            title="Errors"
            value={serverStatus?.stats?.errors || 0}
            subtitle="Failed attempts"
            icon={AlertCircle}
            color="red"
          />
          <StatusCard
            title="Uptime"
            value={serverStatus?.stats?.uptime ? formatUptime(serverStatus.stats.uptime) : '0s'}
            subtitle="Server running"
            icon={Clock}
            color="purple"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Manual Upload */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center mb-4">
                <Upload className="h-5 w-5 text-gray-400 mr-2" />
                <h2 className="text-lg font-medium text-gray-900">Manual Upload</h2>
              </div>
              <NFTUpload onSuccess={(nft) => addRealtimeEvent('success', `Manual NFT created: ${nft.name}`)} />
            </div>

            {/* Realtime Events */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Activity className="h-5 w-5 text-gray-400 mr-2" />
                  <h2 className="text-lg font-medium text-gray-900">Activity</h2>
                </div>
                <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {realtimeEvents.length === 0 ? (
                  <p className="text-gray-500 text-sm">No recent activity</p>
                ) : (
                  realtimeEvents.map((event) => (
                    <div key={event.id} className="flex items-start space-x-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        event.type === 'success' ? 'bg-green-500' :
                        event.type === 'error' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{event.message}</p>
                        <p className="text-xs text-gray-500">
                          {event.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* NFT List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center">
                  <Folder className="h-5 w-5 text-gray-400 mr-2" />
                  <h2 className="text-lg font-medium text-gray-900">Minted NFTs</h2>
                  <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {mintedNFTs.length}
                  </span>
                </div>
              </div>
              <NFTList nfts={mintedNFTs} />
            </div>
          </div>
        </div>

        {/* Connected Wallet Info */}
        {wallet.connected && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Browser Wallet</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Connected Wallet</p>
                <p className="font-medium">{wallet.wallet?.adapter?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="font-medium font-mono text-sm">
                  {wallet.publicKey?.toString()}
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>💡 Browser wallet is connected but NFTs are minted using the server wallet for automation.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;