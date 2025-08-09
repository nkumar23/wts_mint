import dotenv from 'dotenv';
import { NFTMinter } from './nft-minter.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 WTS Mint NFT - CLI Mode');
  
  // Determine network and RPC URL
  const network = process.env.NETWORK || 'devnet';
  let rpcUrl;
  
  if (process.env.HELIUS_API_KEY) {
    rpcUrl = network === 'mainnet-beta' 
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    console.log('🚀 Using Helius RPC for improved reliability');
  } else {
    rpcUrl = process.env.RPC_URL || (network === 'mainnet-beta' 
      ? 'https://api.mainnet-beta.solana.com' 
      : 'https://api.devnet.solana.com');
  }
  
  const minter = new NFTMinter({
    inboxPath: './inbox',
    processedPath: './processed',
    rpcUrl,
    heliusApiKey: process.env.HELIUS_API_KEY,
    keypairPath: process.env.KEYPAIR_PATH,
    bundlrAddress: process.env.BUNDLR_ADDRESS || (network === 'mainnet-beta' 
      ? 'https://node1.bundlr.network' 
      : 'https://devnet.bundlr.network'),
    apiUrl: process.env.API_URL || 'http://localhost:3001',
    walletsDir: './wallets'
  });

  try {
    // First, ask about web dashboard integration
    const useWebWallet = await minter.promptForWebDashboard();
    
    let webWallet = null;
    if (useWebWallet) {
      webWallet = await minter.waitForWebWallet();
      
      if (webWallet) {
        console.log(`\n🔌 Using web wallet: ${webWallet.walletName}`);
        console.log(`   📊 Monitor activity at: http://localhost:3000`);
        
        // Override keypair path to skip file wallet setup
        minter.keypairPath = null;  // This will be handled differently for web wallet mode
        minter.webWallet = webWallet;
      } else {
        console.log('\n📁 Falling back to file wallet setup...');
      }
    }

    // Initialize with appropriate wallet method
    if (webWallet) {
      await minter.initializeWithWebWallet(webWallet);
    } else {
      await minter.initialize();
    }
    
    const shouldContinue = await minter.promptToContinue();
    
    if (!shouldContinue) {
      console.log('👋 Exiting NFT Minter');
      process.exit(0);
    }
    
    console.log('\n🚀 Starting folder watcher...');
    await minter.startWatching();
    
    console.log('🎉 NFT Minter is running! Drop folders into ./inbox to mint NFTs');
    if (webWallet) {
      console.log('📊 Web dashboard: http://localhost:3000');
    }
    console.log('Press Ctrl+C to stop');
    
  } catch (error) {
    console.error('❌ Failed to start NFT Minter:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down NFT Minter...');
  process.exit(0);
});

main().catch(console.error);