import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { bundlrUploader } from '@metaplex-foundation/umi-uploader-bundlr';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, keypairIdentity, percentAmount, lamports } from '@metaplex-foundation/umi';
import mime from 'mime-types';
import axios from 'axios';
import { WalletManager } from '../wallet-manager.js';

export class NFTMinter {
  constructor(options = {}) {
    this.inboxPath = options.inboxPath || './inbox';
    this.processedPath = options.processedPath || './processed';
    this.rpcUrl = options.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.heliusApiKey = options.heliusApiKey;
    this.keypairPath = options.keypairPath;
    this.bundlrAddress = options.bundlrAddress || 'https://devnet.bundlr.network';
    this.eventEmitter = options.eventEmitter; // For web interface events
    this.isAPIMode = options.eventEmitter ? true : false;
    this.apiUrl = options.apiUrl || 'http://localhost:3001';
    this.walletManager = new WalletManager(options.walletsDir);
    
    // Use Helius RPC if API key provided
    if (this.heliusApiKey) {
      if (this.rpcUrl.includes('mainnet')) {
        this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
      } else if (this.rpcUrl.includes('devnet')) {
        this.rpcUrl = `https://devnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
      }
    }
    
    this.umi = null;
    this.watcher = null;
    this.processedFolders = new Set();
    this.pendingFolders = new Map();
    this.mintedNFTs = [];
    this.stats = {
      totalProcessed: 0,
      totalMinted: 0,
      errors: 0,
      startTime: new Date()
    };
  }

  async initialize() {
    console.log('🚀 Initializing NFT Minter...');
    
    this.umi = createUmi(this.rpcUrl);
    this.umi.use(mplTokenMetadata());
    this.umi.use(bundlrUploader({ address: this.bundlrAddress }));

    await this.loadOrCreateKeypair();
    await fs.mkdir(this.processedPath, { recursive: true });
    
    if (!this.isAPIMode) {
      await this.displayWalletInfo();
    }
    
    console.log('✅ NFT Minter initialized');
  }

  async initializeWithWebWallet(webWallet) {
    console.log('🚀 Initializing NFT Minter with Web Wallet...');
    
    this.umi = createUmi(this.rpcUrl);
    this.umi.use(mplTokenMetadata());
    this.umi.use(bundlrUploader({ address: this.bundlrAddress }));

    // For now, we still need a keypair for signing transactions
    // The web wallet is used for display and monitoring, but server wallet signs
    console.log('⚠️  Note: Web wallet is for monitoring. Server will use file wallet for signing.');
    
    const defaultKeypairPath = './wallet.json';
    const keypairPath = this.keypairPath || defaultKeypairPath;

    try {
      const keypairData = await fs.readFile(keypairPath);
      const keypairArray = JSON.parse(keypairData.toString());
      
      if (!Array.isArray(keypairArray) || keypairArray.length !== 64) {
        throw new Error('Invalid keypair format - expected array of 64 bytes');
      }
      
      const secretKey = new Uint8Array(keypairArray);
      const keypair = this.umi.eddsa.createKeypairFromSecretKey(secretKey);
      
      this.umi.use(keypairIdentity(keypair));
      console.log(`✅ Using server wallet for signing: ${keypairPath}`);
    } catch (error) {
      console.log(`🔑 Creating server wallet for signing: ${keypairPath} (${error.message})`);
      const signer = generateSigner(this.umi);
      this.umi.use(keypairIdentity(signer));
      
      const keypairArray = Array.from(signer.secretKey);
      await fs.writeFile(keypairPath, JSON.stringify(keypairArray, null, 2));
      console.log('✅ Server wallet created and saved');
    }

    await fs.mkdir(this.processedPath, { recursive: true });
    
    // Display both wallet info
    console.log('\n💼 Wallet Configuration:');
    console.log(`   🌐 Web Wallet: ${webWallet.walletName} (${webWallet.publicKey})`);
    
    const serverWallet = this.umi.identity.publicKey;
    console.log(`   🖥️  Server Wallet: ${serverWallet} (for signing)`);
    
    try {
      const account = await this.umi.rpc.getAccount(serverWallet);
      const balanceSOL = account.exists ? Number(account.lamports) / 1e9 : 0;
      console.log(`   💰 Server Balance: ${balanceSOL.toFixed(4)} SOL`);
      
      if (balanceSOL < 0.01) {
        console.log('   ⚠️  Low server wallet balance! Fund the server wallet to mint NFTs.');
      }
    } catch (error) {
      console.log('   ❌ Could not fetch server wallet balance');
    }
    
    this.webWallet = webWallet;
    console.log('✅ NFT Minter initialized with Web Wallet integration');
  }

  // Separate initialization for API mode (no prompts)
  async initializeForAPI() {
    console.log('🚀 Initializing NFT Minter (API Mode)...');
    
    this.umi = createUmi(this.rpcUrl);
    this.umi.use(mplTokenMetadata());
    this.umi.use(bundlrUploader({ address: this.bundlrAddress }));

    const defaultKeypairPath = './wallet.json';
    const keypairPath = this.keypairPath || defaultKeypairPath;

    try {
      const keypairData = await fs.readFile(keypairPath);
      const keypairArray = JSON.parse(keypairData.toString());
      
      if (!Array.isArray(keypairArray) || keypairArray.length !== 64) {
        throw new Error('Invalid keypair format - expected array of 64 bytes');
      }
      
      const secretKey = new Uint8Array(keypairArray);
      const keypair = this.umi.eddsa.createKeypairFromSecretKey(secretKey);
      
      this.umi.use(keypairIdentity(keypair));
      console.log(`✅ Loaded existing wallet: ${keypairPath}`);
    } catch (error) {
      console.log(`🔑 Creating new wallet: ${keypairPath} (${error.message})`);
      const signer = generateSigner(this.umi);
      this.umi.use(keypairIdentity(signer));
      
      const keypairArray = Array.from(signer.secretKey);
      await fs.writeFile(keypairPath, JSON.stringify(keypairArray, null, 2));
      console.log('✅ Wallet saved for future sessions');
    }

    await fs.mkdir(this.processedPath, { recursive: true });
    console.log('✅ NFT Minter initialized (API Mode)');
  }

  async loadOrCreateKeypair() {
    const defaultKeypairPath = './wallet.json';
    let keypairPath = this.keypairPath || defaultKeypairPath;

    if (!this.keypairPath && !(await this.fileExists(defaultKeypairPath))) {
      keypairPath = await this.promptForWallet();
    }

    try {
      const keypairData = await fs.readFile(keypairPath);
      const keypairArray = JSON.parse(keypairData.toString());
      
      // Ensure we have a valid array of 64 bytes
      if (!Array.isArray(keypairArray) || keypairArray.length !== 64) {
        throw new Error('Invalid keypair format - expected array of 64 bytes');
      }
      
      // Convert array to Uint8Array for Umi
      const secretKey = new Uint8Array(keypairArray);
      const keypair = this.umi.eddsa.createKeypairFromSecretKey(secretKey);
      
      this.umi.use(keypairIdentity(keypair));
      console.log(`✅ Loaded existing wallet: ${keypairPath}`);
      
      // Update last used timestamp and save wallet info
      await this.walletManager.updateLastUsed(keypairPath);
      await this.walletManager.saveWalletInfo(keypairPath, keypair.publicKey);
    } catch (error) {
      console.log(`🔑 Creating new wallet: ${keypairPath} (${error.message})`);
      const signer = generateSigner(this.umi);
      this.umi.use(keypairIdentity(signer));
      
      const keypairArray = Array.from(signer.secretKey);
      await fs.writeFile(keypairPath, JSON.stringify(keypairArray, null, 2));
      console.log('✅ Wallet saved for future sessions');
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async promptForWallet() {
    // Use the new WalletManager for wallet selection
    return await this.walletManager.promptWalletSelection();
  }

  async displayWalletInfo() {
    try {
      const walletAddress = this.umi.identity.publicKey;
      console.log(`\n💼 Wallet Address: ${walletAddress.toString()}`);
      
      const balance = await this.getWalletBalance(walletAddress);
      
      if (balance.error) {
        console.log(`💰 Balance: Unable to fetch (${balance.error})`);
        console.log('   This might be due to network issues or RPC rate limiting.');
      } else {
        console.log(`💰 Balance: ${balance.sol.toFixed(4)} SOL`);
        
        if (balance.sol < 0.01) {
          console.log('⚠️  Low balance detected! You may need to fund your wallet.');
          if (this.rpcUrl.includes('devnet')) {
            console.log('   For devnet: solana airdrop 2 --keypair wallet.json --url devnet');
          }
        }
      }
    } catch (error) {
      console.log('❌ Wallet address error:', error.message);
      console.log('   The wallet keypair might be corrupted. Try deleting wallet.json to regenerate.');
    }
  }

  async getWalletBalance(walletAddress, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`   Fetching balance (attempt ${attempt}/${retries})...`);
        
        const account = await this.umi.rpc.getAccount(walletAddress);
        
        if (account.exists) {
          let lamports = account.lamports;
          
          // Handle different lamport formats from different RPC providers
          if (typeof lamports === 'object' && lamports.basisPoints !== undefined) {
            // UMI format: { basisPoints: BigInt, identifier: 'SOL', decimals: 9 }
            lamports = Number(lamports.basisPoints);
          } else if (typeof lamports === 'object' && lamports.value !== undefined) {
            lamports = lamports.value;
          } else if (typeof lamports === 'object' && lamports.amount !== undefined) {
            lamports = lamports.amount;
          }
          
          if (typeof lamports === 'string') {
            lamports = Number(lamports);
          }
          if (typeof lamports === 'bigint') {
            lamports = Number(lamports);
          }
          
          const sol = Number(lamports) / 1e9;
          
          // Validate the balance is a proper number
          if (isNaN(sol) || !isFinite(sol)) {
            const lamportsStr = typeof account.lamports === 'bigint' 
              ? account.lamports.toString() 
              : JSON.stringify(account.lamports);
            throw new Error(`Invalid balance received: ${lamportsStr} lamports`);
          }
          
          return { sol, lamports: Number(lamports), error: null };
        } else {
          return { sol: 0, lamports: 0, error: null };
        }
      } catch (error) {
        console.log(`   Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === retries) {
          return { 
            sol: 0, 
            lamports: 0, 
            error: `Failed after ${retries} attempts: ${error.message}` 
          };
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async getWalletInfo() {
    try {
      const walletAddress = this.umi.identity.publicKey;
      const balance = await this.getWalletBalance(walletAddress);
      
      return {
        address: walletAddress.toString(),
        balance: balance.sol,
        network: this.rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet',
        error: balance.error
      };
    } catch (walletError) {
      return {
        address: 'Unknown',
        balance: 0,
        network: this.rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet',
        error: 'Wallet keypair error: ' + walletError.message
      };
    }
  }

  async getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
      watcherActive: this.watcher ? true : false
    };
  }

  async getProcessedNFTs() {
    return this.mintedNFTs;
  }

  async promptForWebDashboard() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🌐 Web Dashboard Integration');
    console.log('You can connect a browser wallet via the web dashboard for easier management.');
    console.log('\n📋 To use web dashboard:');
    console.log('   1. Run: npm run server (in another terminal)');
    console.log('   2. Run: npm run web (in another terminal)');
    console.log('   3. Open: http://localhost:3000');
    console.log('   4. Connect your wallet (Phantom, Solflare, etc.)');

    return new Promise((resolve) => {
      rl.question('\n🤔 Wait for web wallet connection? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  async waitForWebWallet() {
    console.log('\n⏳ Waiting for web wallet connection...');
    console.log('   💡 Connect a wallet at: http://localhost:3000');
    console.log('   ⌨️  Press Ctrl+C to skip and use file wallet');

    const maxAttempts = 60; // 60 seconds timeout
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${this.apiUrl}/api/wallet/status`, { timeout: 1000 });
        
        if (response.data.connected) {
          const wallet = response.data.wallet;
          console.log(`\n✅ Web wallet connected: ${wallet.walletName}`);
          console.log(`   Address: ${wallet.publicKey}`);
          return wallet;
        }
      } catch (error) {
        // Server not available or no wallet connected yet
        if (attempts === 0) {
          console.log('   ⚠️  Web server not available. Make sure to run: npm run server');
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      // Show progress every 10 seconds
      if (attempts % 10 === 0) {
        console.log(`   ⏱️  Still waiting... (${60 - attempts}s remaining)`);
      }
    }

    console.log('\n⏰ Timeout waiting for web wallet connection');
    return null;
  }

  async promptToContinue() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\n🤔 Continue to start watching for folders? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  async startWatching() {
    console.log(`👀 Watching inbox directory: ${this.inboxPath}`);
    
    // First, scan for existing folders to process
    try {
      const items = await fs.readdir(this.inboxPath);
      console.log(`📂 Found ${items.length} existing items in inbox`);
      
      for (const item of items) {
        const itemPath = path.join(this.inboxPath, item);
        try {
          const stats = await fs.stat(itemPath);
          if (stats.isDirectory() && !item.startsWith('.')) {
            console.log(`📁 Processing existing folder: ${item}`);
            setTimeout(() => this.handleNewFolder(itemPath), 1000);
          }
        } catch (error) {
          // Skip items that can't be accessed
        }
      }
    } catch (error) {
      console.log('⚠️  Could not scan existing folders:', error.message);
    }
    
    this.watcher = chokidar.watch(this.inboxPath, {
      ignored: [/^\./, /\.DS_Store$/, /Thumbs\.db$/],
      persistent: true,
      ignoreInitial: true, // We manually scan above
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      depth: 2
    });

    this.watcher
      .on('addDir', (dirPath) => {
        if (dirPath !== this.inboxPath) {
          this.handleNewFolder(dirPath);
        }
      })
      .on('add', (filePath) => {
        this.handleFileChange(filePath);
      })
      .on('error', (error) => {
        console.error('❌ Watcher error:', error);
        this.emitEvent('error', { message: 'Watcher error', error: error.message });
      });

    console.log('🎯 Watcher started successfully');
    this.emitEvent('watcherStarted', { message: 'Folder watcher started' });
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('🛑 Folder watcher stopped');
      this.emitEvent('watcherStopped', { message: 'Folder watcher stopped' });
    }
  }

  emitEvent(event, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, data);
    }
  }

  async handleNewFolder(folderPath) {
    const folderName = path.basename(folderPath);
    
    // Skip the inbox directory itself (multiple ways it could be matched)
    if (folderPath === this.inboxPath || 
        path.resolve(folderPath) === path.resolve(this.inboxPath) ||
        folderName === path.basename(this.inboxPath)) {
      return;
    }
    
    // Skip system files and already processed folders
    if (folderName.startsWith('.') || this.processedFolders.has(folderName)) {
      return;
    }

    const doneFilePath = path.join(folderPath, '.done');
    try {
      await fs.access(doneFilePath);
      console.log(`⏭️  Skipping already processed folder: ${folderName}`);
      this.processedFolders.add(folderName);
      return;
    } catch (error) {
      // .done file doesn't exist, continue processing
    }

    console.log(`📁 New folder detected: ${folderName}`);
    this.emitEvent('folderDetected', { folder: folderName });
    
    setTimeout(() => {
      this.processFolder(folderPath);
    }, 3000);
  }

  async handleFileChange(filePath) {
    const folderPath = path.dirname(filePath);
    const folderName = path.basename(folderPath);
    
    if (folderPath === this.inboxPath || this.processedFolders.has(folderName)) {
      return;
    }

    if (this.pendingFolders.has(folderPath)) {
      clearTimeout(this.pendingFolders.get(folderPath));
    }

    this.pendingFolders.set(folderPath, setTimeout(() => {
      this.processFolder(folderPath);
      this.pendingFolders.delete(folderPath);
    }, 3000));
  }

  async processFolder(folderPath) {
    const folderName = path.basename(folderPath);
    
    if (this.processedFolders.has(folderName)) {
      return;
    }

    console.log(`🔄 Processing folder: ${folderName}`);
    this.emitEvent('processingStarted', { folder: folderName });

    try {
      const { mediaFile, metadata } = await this.loadFolderContents(folderPath);
      
      if (!this.validateMetadata(metadata)) {
        console.error(`❌ Invalid metadata in folder: ${folderName}`);
        this.stats.errors++;
        this.emitEvent('error', { folder: folderName, message: 'Invalid metadata' });
        return;
      }

      console.log(`📤 Uploading media and metadata for: ${metadata.name}`);
      this.emitEvent('uploading', { folder: folderName, nftName: metadata.name });
      const { mediaUri, metadataUri } = await this.uploadToArweave(mediaFile, metadata);
      
      console.log(`🪙 Minting NFT: ${metadata.name}`);
      this.emitEvent('minting', { folder: folderName, nftName: metadata.name });
      const { signature, mint } = await this.mintNFT(metadataUri, metadata);
      
      const nftData = {
        name: metadata.name,
        mint: mint.toString(),
        signature: signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        mintUrl: `https://explorer.solana.com/address/${mint}`,
        timestamp: new Date(),
        folder: folderName
      };
      
      this.mintedNFTs.push(nftData);
      this.stats.totalMinted++;
      
      console.log(`✅ Successfully minted NFT: ${metadata.name}`);
      console.log(`🔗 Transaction: ${nftData.explorerUrl}`);
      console.log(`🎨 NFT: ${nftData.mintUrl}`);
      
      this.emitEvent('nftMinted', nftData);
      
      await this.markFolderProcessed(folderPath);
      await this.moveFolderToProcessed(folderPath);
      
      this.processedFolders.add(folderName);
      this.stats.totalProcessed++;
      
    } catch (error) {
      console.error(`❌ Error processing folder ${folderName}:`, error.message);
      this.stats.errors++;
      this.emitEvent('error', { folder: folderName, message: error.message });
    }
  }

  // Method for manual NFT minting via API
  async mintNFTFromUpload(mediaFile, metadata) {
    try {
      if (!this.validateMetadata(metadata)) {
        throw new Error('Invalid metadata');
      }

      console.log(`📤 Uploading media and metadata for: ${metadata.name}`);
      this.emitEvent('uploading', { nftName: metadata.name, source: 'api' });
      
      const { mediaUri, metadataUri } = await this.uploadFileToArweave(mediaFile, metadata);
      
      console.log(`🪙 Minting NFT: ${metadata.name}`);
      this.emitEvent('minting', { nftName: metadata.name, source: 'api' });
      
      const { signature, mint } = await this.mintNFT(metadataUri, metadata);
      
      const nftData = {
        name: metadata.name,
        mint: mint.toString(),
        signature: signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        mintUrl: `https://explorer.solana.com/address/${mint}`,
        timestamp: new Date(),
        source: 'api'
      };
      
      this.mintedNFTs.push(nftData);
      this.stats.totalMinted++;
      
      console.log(`✅ Successfully minted NFT via API: ${metadata.name}`);
      this.emitEvent('nftMinted', nftData);
      
      // Clean up uploaded file
      await fs.unlink(mediaFile.path);
      
      return { signature, mint: mint.toString() };
      
    } catch (error) {
      this.stats.errors++;
      this.emitEvent('error', { message: error.message, source: 'api' });
      throw error;
    }
  }

  async uploadFileToArweave(mediaFile, metadata) {
    const mediaBuffer = await fs.readFile(mediaFile.path);
    const contentType = mediaFile.mimetype || mime.lookup(mediaFile.filename) || 'application/octet-stream';
    
    console.log(`📤 Uploading API media file: ${mediaFile.filename || mediaFile.originalname} (${(mediaBuffer.length / 1024).toFixed(1)}KB)`);
    
    try {
      const [mediaUri] = await this.umi.uploader.upload([{
        buffer: mediaBuffer,
        fileName: mediaFile.filename || mediaFile.originalname,
        contentType,
        tags: [
          { name: 'Content-Type', value: contentType },
          { name: 'App-Name', value: 'WTS-NFT-Minter-API' }
        ]
      }]);
      
      console.log(`✅ API media uploaded successfully: ${mediaUri}`);
      
      const metadataWithImage = {
        ...metadata,
        image: mediaUri
      };
      
      const metadataBuffer = Buffer.from(JSON.stringify(metadataWithImage, null, 2));
      const [metadataUri] = await this.umi.uploader.upload([{
        buffer: metadataBuffer,
        fileName: 'metadata.json',
        contentType: 'application/json',
        tags: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'App-Name', value: 'WTS-NFT-Minter-API' }
        ]
      }]);
      
      console.log(`✅ API metadata uploaded successfully: ${metadataUri}`);
      
      return { mediaUri, metadataUri };
      
    } catch (uploadError) {
      console.error(`❌ API upload failed: ${uploadError.message}`);
      throw new Error(`Arweave API upload failed: ${uploadError.message}`);
    }
  }

  async loadFolderContents(folderPath) {
    const files = await fs.readdir(folderPath);
    
    let mediaFile = null;
    let metadata = null;

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const ext = path.extname(file).toLowerCase();
      
      if (ext === '.json') {
        const jsonContent = await fs.readFile(filePath, 'utf-8');
        metadata = JSON.parse(jsonContent);
      } else if (this.isMediaFile(ext)) {
        mediaFile = {
          path: filePath,
          name: file,
          type: mime.lookup(ext) || 'application/octet-stream'
        };
      }
    }

    if (!mediaFile) {
      throw new Error('No media file found in folder');
    }
    
    if (!metadata) {
      throw new Error('No metadata JSON file found in folder');
    }

    return { mediaFile, metadata };
  }

  isMediaFile(ext) {
    const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webm', '.mp4', '.webp'];
    return mediaExtensions.includes(ext);
  }

  validateMetadata(metadata) {
    return metadata && typeof metadata.name === 'string' && metadata.name.trim().length > 0;
  }

  async uploadToArweave(mediaFile, metadata) {
    const mediaBuffer = await fs.readFile(mediaFile.path);
    
    console.log(`📤 Uploading media file: ${mediaFile.name} (${(mediaBuffer.length / 1024).toFixed(1)}KB)`);
    
    try {
      const [mediaUri] = await this.umi.uploader.upload([{
        buffer: mediaBuffer,
        fileName: mediaFile.name,
        contentType: mediaFile.type,
        tags: [
          { name: 'Content-Type', value: mediaFile.type },
          { name: 'App-Name', value: 'WTS-NFT-Minter' }
        ]
      }]);
      
      console.log(`✅ Media uploaded successfully: ${mediaUri}`);
      
      // Wait a moment for Bundlr to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify upload by attempting to fetch
      try {
        const response = await fetch(mediaUri, { method: 'HEAD' });
        if (!response.ok) {
          console.log(`⚠️  Media file not immediately accessible (${response.status}), but this is normal for new uploads`);
        } else {
          console.log(`✅ Media file verified accessible`);
        }
      } catch (verifyError) {
        console.log(`⚠️  Could not verify media upload immediately (normal for new uploads)`);
      }
      
      console.log(`📤 Uploading metadata`);
      const metadataWithImage = {
        ...metadata,
        image: mediaUri
      };
      
      const metadataBuffer = Buffer.from(JSON.stringify(metadataWithImage, null, 2));
      const [metadataUri] = await this.umi.uploader.upload([{
        buffer: metadataBuffer,
        fileName: 'metadata.json',
        contentType: 'application/json',
        tags: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'App-Name', value: 'WTS-NFT-Minter' }
        ]
      }]);
      
      console.log(`✅ Metadata uploaded successfully: ${metadataUri}`);
      
      return { mediaUri, metadataUri };
      
    } catch (uploadError) {
      console.error(`❌ Upload failed: ${uploadError.message}`);
      throw new Error(`Arweave upload failed: ${uploadError.message}`);
    }
  }

  async mintNFT(metadataUri, metadata) {
    const mint = generateSigner(this.umi);
    
    // Ensure seller fee basis points is a valid number and convert to percentage
    const sellerFeeBasisPoints = metadata.seller_fee_basis_points || 0;
    const basisPoints = typeof sellerFeeBasisPoints === 'number' ? sellerFeeBasisPoints : 0;
    
    // Validate basis points (0-10000, where 10000 = 100%)
    const validBasisPoints = Math.max(0, Math.min(10000, basisPoints));
    const validSellerFeePercent = validBasisPoints / 100; // Convert basis points to percentage
    
    console.log(`Creating NFT with seller fee: ${validBasisPoints} basis points (${validSellerFeePercent}%)`);
    
    // Validate and filter creators - only include those with valid addresses
    let validCreators = undefined;
    if (metadata.creators && metadata.creators.length > 0) {
      validCreators = metadata.creators.filter(creator => 
        creator.address && 
        creator.address.trim().length >= 32 && 
        creator.address.trim().length <= 44
      );
      
      // If no valid creators, set to undefined (will use default)
      if (validCreators.length === 0) {
        validCreators = undefined;
        console.log('   No valid creator addresses found, using default');
      } else {
        console.log(`   Using ${validCreators.length} valid creator(s)`);
      }
    }
    
    const transaction = await createNft(this.umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol || '',
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(validSellerFeePercent),
      creators: validCreators
    });

    const result = await transaction.sendAndConfirm(this.umi);
    
    return {
      signature: result.signature,
      mint: mint.publicKey
    };
  }

  async markFolderProcessed(folderPath) {
    const doneFilePath = path.join(folderPath, '.done');
    await fs.writeFile(doneFilePath, new Date().toISOString());
  }

  async moveFolderToProcessed(folderPath) {
    const folderName = path.basename(folderPath);
    const processedFolderPath = path.join(this.processedPath, folderName);
    
    let counter = 0;
    let finalPath = processedFolderPath;
    
    while (true) {
      try {
        await fs.access(finalPath);
        counter++;
        finalPath = `${processedFolderPath}_${counter}`;
      } catch (error) {
        break;
      }
    }
    
    await fs.rename(folderPath, finalPath);
    console.log(`📦 Moved folder to: ${finalPath}`);
  }
}