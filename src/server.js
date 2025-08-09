import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import { NFTMinter } from './nft-minter.js';

class NFTMintingServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    
    this.minter = new NFTMinter({
      inboxPath: './inbox',
      processedPath: './processed',
      rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
      bundlrAddress: process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network',
      eventEmitter: this.io
    });

    // Web wallet connection state
    this.connectedWebWallet = null;
    this.webWalletWaiters = [];

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use('/uploads', express.static('uploads'));
    
    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, './uploads/temp');
      },
      filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
      }
    });
    
    this.upload = multer({ storage });
  }

  setupRoutes() {
    // Status endpoint
    this.app.get('/api/status', async (req, res) => {
      try {
        const walletInfo = await this.minter.getWalletInfo();
        const stats = await this.minter.getStats();
        
        res.json({
          status: 'running',
          wallet: walletInfo,
          stats: stats,
          network: this.minter.rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Manual NFT creation endpoint
    this.app.post('/api/mint', this.upload.single('media'), async (req, res) => {
      try {
        const { metadata } = req.body;
        const mediaFile = req.file;
        
        if (!mediaFile || !metadata) {
          return res.status(400).json({ error: 'Media file and metadata required' });
        }

        let parsedMetadata;
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch (parseError) {
          return res.status(400).json({ error: 'Invalid metadata JSON format' });
        }

        // Validate and sanitize metadata
        if (!parsedMetadata.name || typeof parsedMetadata.name !== 'string') {
          return res.status(400).json({ error: 'NFT name is required and must be a string' });
        }

        // Ensure numeric fields are properly formatted
        if (parsedMetadata.seller_fee_basis_points !== undefined) {
          parsedMetadata.seller_fee_basis_points = Number(parsedMetadata.seller_fee_basis_points);
          if (isNaN(parsedMetadata.seller_fee_basis_points)) {
            parsedMetadata.seller_fee_basis_points = 0;
          }
        }

        // Filter out empty attributes
        if (parsedMetadata.attributes) {
          parsedMetadata.attributes = parsedMetadata.attributes.filter(attr => 
            attr.trait_type && attr.trait_type.trim() !== '' && 
            attr.value !== undefined && attr.value !== ''
          );
        }

        console.log('Processing NFT mint request:', {
          name: parsedMetadata.name,
          symbol: parsedMetadata.symbol,
          sellerFee: parsedMetadata.seller_fee_basis_points,
          attributesCount: parsedMetadata.attributes?.length || 0
        });

        const result = await this.minter.mintNFTFromUpload(mediaFile, parsedMetadata);
        
        const network = this.minter.rpcUrl.includes('mainnet') ? '' : '?cluster=devnet';
        
        res.json({
          success: true,
          transaction: result.signature,
          mint: result.mint,
          explorerUrl: `https://explorer.solana.com/tx/${result.signature}${network}`,
          mintUrl: `https://explorer.solana.com/address/${result.mint}${network}`
        });
      } catch (error) {
        console.error('NFT minting error:', error);
        res.status(500).json({ 
          error: error.message || 'Failed to mint NFT',
          details: error.stack ? error.stack.substring(0, 200) : 'No details available'
        });
      }
    });

    // Get processed NFTs
    this.app.get('/api/nfts', async (req, res) => {
      try {
        const nfts = await this.minter.getProcessedNFTs();
        res.json(nfts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Start/stop folder watching
    this.app.post('/api/watcher/:action', async (req, res) => {
      try {
        const { action } = req.params;
        
        if (action === 'start') {
          await this.minter.startWatching();
          res.json({ message: 'Folder watcher started' });
        } else if (action === 'stop') {
          this.minter.stopWatching();
          res.json({ message: 'Folder watcher stopped' });
        } else {
          res.status(400).json({ error: 'Invalid action' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Web wallet connection endpoints
    this.app.post('/api/wallet/connect', (req, res) => {
      const { publicKey, walletName } = req.body;
      
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey is required' });
      }

      this.connectedWebWallet = {
        publicKey,
        walletName,
        connectedAt: new Date()
      };

      console.log(`🔌 Web wallet connected: ${walletName} (${publicKey})`);
      
      // Notify any waiting CLI processes
      this.webWalletWaiters.forEach(resolve => resolve(this.connectedWebWallet));
      this.webWalletWaiters = [];

      // Emit to all connected clients
      this.io.emit('walletConnected', this.connectedWebWallet);

      res.json({ success: true, wallet: this.connectedWebWallet });
    });

    this.app.post('/api/wallet/disconnect', (req, res) => {
      const previousWallet = this.connectedWebWallet;
      this.connectedWebWallet = null;
      
      console.log(`🔌 Web wallet disconnected: ${previousWallet?.walletName}`);
      
      this.io.emit('walletDisconnected');
      res.json({ success: true });
    });

    this.app.get('/api/wallet/status', (req, res) => {
      res.json({
        connected: !!this.connectedWebWallet,
        wallet: this.connectedWebWallet
      });
    });

    // CLI wallet waiting endpoint
    this.app.get('/api/wallet/wait', (req, res) => {
      if (this.connectedWebWallet) {
        return res.json({ wallet: this.connectedWebWallet });
      }

      // Wait for wallet connection with timeout
      const timeout = setTimeout(() => {
        const index = this.webWalletWaiters.findIndex(resolve => resolve === resolver);
        if (index > -1) this.webWalletWaiters.splice(index, 1);
        res.status(408).json({ error: 'Timeout waiting for wallet connection' });
      }, 60000); // 60 second timeout

      const resolver = (wallet) => {
        clearTimeout(timeout);
        res.json({ wallet });
      };

      this.webWalletWaiters.push(resolver);
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('📱 Web client connected');
      
      // Send current status on connection
      this.sendCurrentStatus(socket);
      
      socket.on('disconnect', () => {
        console.log('📱 Web client disconnected');
      });
    });
  }

  async sendCurrentStatus(socket) {
    try {
      const walletInfo = await this.minter.getWalletInfo();
      const stats = await this.minter.getStats();
      
      socket.emit('status', {
        wallet: walletInfo,
        stats: stats,
        network: this.minter.rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet'
      });
    } catch (error) {
      socket.emit('error', error.message);
    }
  }

  async start(port = 3001) {
    try {
      // Create necessary directories
      await fs.mkdir('./uploads/temp', { recursive: true });
      
      // Initialize the NFT minter
      await this.minter.initializeForAPI();
      
      // Start server
      this.server.listen(port, () => {
        console.log('🚀 NFT Minting Server running on:');
        console.log(`   API: http://localhost:${port}`);
        console.log('   WebSocket: Connected for real-time updates');
        console.log('\n📱 Start the web interface with: npm run web');
      });
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new NFTMintingServer();
  
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
  });
  
  server.start();
}