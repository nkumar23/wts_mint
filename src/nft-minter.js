import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { bundlrUploader } from '@metaplex-foundation/umi-uploader-bundlr';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, keypairIdentity, percentAmount, lamports } from '@metaplex-foundation/umi';
import mime from 'mime-types';
import { WalletManager } from '../wallet-manager.js';

export class NFTMinter {
  constructor(options = {}) {
    this.inboxPath = options.inboxPath || './inbox';
    this.processedPath = options.processedPath || './processed';
    this.rpcUrl = options.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.heliusApiKey = options.heliusApiKey;
    this.keypairPath = options.keypairPath;
    this.bundlrAddress = options.bundlrAddress || 'https://devnet.bundlr.network';
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
    await this.displayWalletInfo();
    console.log('✅ NFT Minter initialized');
  }



  async loadOrCreateKeypair() {
    const defaultKeypairPath = './wallet.json';
    let keypairPath = this.keypairPath || defaultKeypairPath;

    // Initialize UMI early if needed for wallet operations
    if (!this.umi) {
      this.umi = createUmi(this.rpcUrl);
    }

    if (!this.keypairPath && (await this.fileExists(defaultKeypairPath))) {
      // Default wallet exists, show its public key and ask if user wants to use it
      try {
        const publicKey = await this.getWalletPublicKey(defaultKeypairPath);
        const useExisting = await this.promptUseExistingWallet(publicKey, defaultKeypairPath);
        
        if (!useExisting) {
          keypairPath = await this.promptForWallet();
        }
      } catch (error) {
        console.log(`⚠️  Error reading default wallet (${error.message})`);
        console.log('Creating new wallet...');
        keypairPath = await this.promptForWallet();
      }
    } else if (!this.keypairPath && !(await this.fileExists(defaultKeypairPath))) {
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

  async getWalletPublicKey(walletPath) {
    const keypairData = await fs.readFile(walletPath);
    const keypairArray = JSON.parse(keypairData.toString());
    
    if (!Array.isArray(keypairArray) || keypairArray.length !== 64) {
      throw new Error('Invalid keypair format - expected array of 64 bytes');
    }
    
    // Create temporary UMI instance if not initialized yet
    const umi = this.umi || createUmi(this.rpcUrl);
    
    const secretKey = new Uint8Array(keypairArray);
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    return keypair.publicKey.toString();
  }

  async promptUseExistingWallet(publicKey, walletPath) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`\n🔑 Found existing wallet: ${publicKey}`);
    
    // Get balance for this wallet
    try {
      // Temporarily set up UMI with this keypair to get balance
      const tempUmi = createUmi(this.rpcUrl);
      const keypairData = await fs.readFile(walletPath);
      const keypairArray = JSON.parse(keypairData.toString());
      const secretKey = new Uint8Array(keypairArray);
      const keypair = tempUmi.eddsa.createKeypairFromSecretKey(secretKey);
      
      console.log('   📊 Fetching wallet balance...');
      const balance = await this.getWalletBalanceForAddress(tempUmi, keypair.publicKey);
      
      if (balance.error) {
        console.log(`   💰 Balance: Unable to fetch (${balance.error})`);
      } else {
        console.log(`   💰 Balance: ${balance.sol.toFixed(4)} SOL`);
        
        if (balance.sol < 0.01) {
          console.log('   ⚠️  Low balance detected - you may need to fund this wallet');
        }
      }
    } catch (error) {
      console.log('   ⚠️  Could not fetch balance for this wallet');
    }
    
    console.log('\n   Options:');
    console.log('   - "use" (or press Enter) to use this wallet');
    console.log('   - "new" to create/select a different wallet');
    
    return new Promise((resolve) => {
      rl.question('\n   Your choice (use/new): ', (answer) => {
        const useExisting = answer.toLowerCase() === 'use' || answer.toLowerCase() === 'u' || answer.toLowerCase() === '' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
        rl.close();
        resolve(useExisting);
      });
    });
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

  async getWalletBalanceForAddress(umi, walletAddress, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const account = await umi.rpc.getAccount(walletAddress);
        
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
        if (attempt === retries) {
          return { 
            sol: 0, 
            lamports: 0, 
            error: `Failed after ${retries} attempts: ${error.message}` 
          };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
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
      });

    console.log('🎯 Watcher started successfully');
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('🛑 Folder watcher stopped');
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

    try {
      const { mediaFile, metadata } = await this.loadFolderContents(folderPath);
      
      if (!this.validateMetadata(metadata)) {
        console.error(`❌ Invalid metadata in folder: ${folderName}`);
        this.stats.errors++;
        return;
      }

      console.log(`📤 Uploading media and metadata for: ${metadata.name}`);
      const { mediaUri, metadataUri } = await this.uploadToArweave(mediaFile, metadata);
      
      console.log(`🪙 Minting NFT: ${metadata.name}`);
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
      
      await this.markFolderProcessed(folderPath);
      await this.moveFolderToProcessed(folderPath);
      
      this.processedFolders.add(folderName);
      this.stats.totalProcessed++;
      
    } catch (error) {
      console.error(`❌ Error processing folder ${folderName}:`, error.message);
      this.stats.errors++;
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
    
    // Upload media with retry logic
    const mediaUri = await this.uploadWithRetry(async () => {
      const [uri] = await this.umi.uploader.upload([{
        buffer: mediaBuffer,
        fileName: mediaFile.name,
        contentType: mediaFile.type,
        tags: [
          { name: 'Content-Type', value: mediaFile.type },
          { name: 'App-Name', value: 'WTS-NFT-Minter' },
          { name: 'File-Size', value: mediaBuffer.length.toString() }
        ]
      }]);
      return uri;
    }, `media file ${mediaFile.name}`);
    
    // Verify media upload with content integrity check
    await this.verifyArweaveUpload(mediaUri, mediaBuffer, mediaFile.type);
    console.log(`✅ Media upload verified: ${mediaUri}`);
    
    // Upload metadata with retry logic
    console.log(`📤 Uploading metadata`);
    const metadataWithImage = {
      ...metadata,
      image: mediaUri
    };
    
    const metadataBuffer = Buffer.from(JSON.stringify(metadataWithImage, null, 2));
    const metadataUri = await this.uploadWithRetry(async () => {
      const [uri] = await this.umi.uploader.upload([{
        buffer: metadataBuffer,
        fileName: 'metadata.json',
        contentType: 'application/json',
        tags: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'App-Name', value: 'WTS-NFT-Minter' },
          { name: 'NFT-Name', value: metadata.name }
        ]
      }]);
      return uri;
    }, 'metadata');
    
    // Verify metadata upload
    await this.verifyArweaveUpload(metadataUri, metadataBuffer, 'application/json');
    console.log(`✅ Metadata upload verified: ${metadataUri}`);
    
    return { mediaUri, metadataUri };
  }

  async uploadWithRetry(uploadFn, description, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   Uploading ${description} (attempt ${attempt}/${maxRetries})`);
        const result = await uploadFn();
        console.log(`✅ ${description} uploaded: ${result}`);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`❌ Upload attempt ${attempt} failed: ${error.message}`);
        
        // Check if it's a specific Bundlr/Arweave error
        if (error.message.includes('insufficient funds')) {
          throw new Error(`Insufficient funds for upload. Please fund your wallet with AR tokens.`);
        }
        
        if (attempt < maxRetries) {
          const delayMs = Math.min(5000 * attempt, 30000); // Exponential backoff, max 30s
          console.log(`   Waiting ${delayMs/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    throw new Error(`Failed to upload ${description} after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  async verifyArweaveUpload(uri, expectedBuffer, expectedContentType, maxWaitMinutes = 15) {
    const startTime = Date.now();
    const maxWaitMs = maxWaitMinutes * 60 * 1000;
    const checkIntervals = [3000, 5000, 10000, 30000, 60000]; // Progressive intervals
    let intervalIndex = 0;
    
    console.log(`🔍 Verifying upload availability: ${uri}`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(uri, { 
          method: 'GET',
          timeout: 10000 // 10 second timeout
        });
        
        if (response.ok) {
          // Verify content type
          const actualContentType = response.headers.get('content-type');
          if (actualContentType && !actualContentType.includes(expectedContentType.split('/')[0])) {
            throw new Error(`Content type mismatch. Expected: ${expectedContentType}, Got: ${actualContentType}`);
          }
          
          // Verify content integrity for smaller files (< 10MB)
          if (expectedBuffer.length < 10 * 1024 * 1024) {
            const actualBuffer = Buffer.from(await response.arrayBuffer());
            if (!actualBuffer.equals(expectedBuffer)) {
              throw new Error(`Content integrity check failed. Expected ${expectedBuffer.length} bytes, got ${actualBuffer.length} bytes`);
            }
            console.log(`   Content integrity verified (${actualBuffer.length} bytes)`);
          } else {
            // For larger files, just verify size
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) !== expectedBuffer.length) {
              throw new Error(`File size mismatch. Expected: ${expectedBuffer.length}, Got: ${contentLength}`);
            }
            console.log(`   File size verified (${expectedBuffer.length} bytes)`);
          }
          
          return true; // Upload verified successfully
        } else if (response.status === 404) {
          // Not found yet, continue waiting
          console.log(`   Upload not yet available (${response.status}), continuing to wait...`);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          console.log(`   Network error accessing upload, continuing to wait...`);
        } else {
          console.log(`   Verification error: ${error.message}`);
        }
      }
      
      // Wait before next check with progressive intervals
      const waitTime = checkIntervals[Math.min(intervalIndex, checkIntervals.length - 1)];
      intervalIndex++;
      
      const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
      console.log(`   Waiting ${waitTime/1000}s before next check (${elapsedMinutes}/${maxWaitMinutes} minutes elapsed)...`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    throw new Error(`Upload verification timeout after ${maxWaitMinutes} minutes. The upload may still succeed later.`);
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