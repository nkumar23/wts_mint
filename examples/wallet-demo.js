#!/usr/bin/env node

import { NFTMinter } from '../src/nft-minter.js';
import { WalletManager } from '../wallet-manager.js';

async function demonstrateWalletSelection() {
  console.log('🚀 Wallet Selection Demo\n');
  
  // Create wallet manager
  const walletManager = new WalletManager('./wallets');
  
  // List existing wallets
  console.log('📋 Currently stored wallets:');
  const wallets = await walletManager.listStoredWallets();
  
  if (wallets.length === 0) {
    console.log('   No wallets found.\n');
  } else {
    wallets.forEach((wallet, index) => {
      console.log(`   ${index + 1}. ${wallet.name}`);
    });
    console.log('');
  }
  
  // Initialize NFT Minter with wallet selection
  const minter = new NFTMinter({
    rpcUrl: 'https://api.devnet.solana.com',
    bundlrAddress: 'https://devnet.bundlr.network',
    walletsDir: './wallets'
  });
  
  try {
    await minter.initialize();
    
    // Display wallet info
    const walletInfo = await minter.getWalletInfo();
    console.log('\n💼 Selected Wallet Info:');
    console.log(`   Address: ${walletInfo.address}`);
    console.log(`   Balance: ${walletInfo.balance} SOL`);
    console.log(`   Network: ${walletInfo.network}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the demo
demonstrateWalletSelection().catch(console.error);