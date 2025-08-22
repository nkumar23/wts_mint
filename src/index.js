import dotenv from "dotenv";
import { NFTMinter } from "./nft-minter.js";
import { Connection } from "@solana/web3.js";
import fetch from "node-fetch";
// Load environment variables
dotenv.config();

async function main() {
  console.log("🚀 WTS Mint NFT - CLI Tool");

  // Determine network and RPC URL
  const network = process.env.NETWORK || "devnet";
  let rpcUrl;

  if (process.env.HELIUS_API_KEY) {
    rpcUrl =
      network === "mainnet-beta"
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    console.log("🚀 Using Helius RPC for improved reliability");
  } else {
    rpcUrl =
      process.env.RPC_URL ||
      (network === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com");
  }

  const minter = new NFTMinter({
    inboxPath: "./inbox",
    processedPath: "./processed",
    rpcUrl,
    keypairPath: process.env.KEYPAIR_PATH,
    nftStorageToken: process.env.NFT_STORAGE_TOKEN,
    walletsDir: "./wallets",
  });

  try {
    // Initialize the minter
    await minter.initialize();

    const shouldContinue = await minter.promptToContinue();

    if (!shouldContinue) {
      console.log("👋 Exiting NFT Minter");
      process.exit(0);
    }

    console.log("\n🚀 Starting folder watcher...");
    await minter.startWatching();

    console.log(
      "🎉 NFT Minter is running! Drop folders into ./inbox to mint NFTs"
    );
    console.log("Press Ctrl+C to stop");
  } catch (error) {
    console.error("❌ Failed to start NFT Minter:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down NFT Minter...");
  process.exit(0);
});

main().catch(console.error);
