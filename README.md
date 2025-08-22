# WTS Mint NFT - CLI Tool

A Node.js CLI tool that watches a designated "inbox" directory for new subfolders and automatically mints NFTs on Solana using Metaplex Umi.

## Features

- 📁 **Directory Watching**: Monitors inbox folder for new subfolders
- 🔒 **Resilient Processing**: Only processes folders once, waits for file stability
- ☁️ **Decentralized Storage**: Uploads to IPFS via NFT.Storage
- 🪙 **NFT Minting**: Creates Token Metadata NFTs on Solana using Metaplex Umi
- 🔗 **Explorer URLs**: Prints transaction and NFT URLs for easy verification
- ✅ **Validation**: Ensures metadata has required fields

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with:
   # - Your Helius API key for better RPC performance (optional)
   # - Your NFT.Storage token (required) - get one at https://nft.storage
   ```

3. Wallet Management:
   - **First run**: Interactive prompt to create new or use existing wallet
   - **Environment**: Set `KEYPAIR_PATH=./my-wallet.json` to skip prompts
   - **Manual creation**: `solana-keygen new --outfile wallet.json`
   
   Interactive options:
   - Option 1: Create new wallet (`./wallet.json`)
   - Option 2: Use existing wallet (specify file path)

4. Fund your wallet:
```bash
# For devnet testing (free):
solana airdrop 2 --keypair wallet.json --url devnet

# For mainnet (requires real SOL):
# Transfer SOL to your wallet address shown on startup
```

## Usage

Start the NFT minter:
```bash
npm start
```

**CLI Flow:**
1. Initialize wallet (interactive multi-wallet selection on first run)
2. Display wallet address and balance  
3. Ask for confirmation to continue
4. Create `inbox/` and `processed/` directories
5. Watch folders and mint NFTs automatically

### Wallet Setup Flow
On first run without `KEYPAIR_PATH` set:
```
🔑 Wallet Setup
1. Create new wallet (./wallet.json)
2. Use existing wallet file

Choose option (1 or 2): 2
Enter path to existing wallet file: /path/to/my-wallet.json
```

## Folder Structure

Each folder in `inbox/` should contain:
- **Media file**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webm`, `.mp4`, `.webp`
- **Metadata file**: `metadata.json`

### Example metadata.json:
```json
{
  "name": "My NFT",
  "description": "This is my awesome NFT",
  "symbol": "MNT",
  "seller_fee_basis_points": 500,
  "attributes": [
    {
      "trait_type": "Color",
      "value": "Blue"
    }
  ],
  "creators": [
    {
      "address": "YourPublicKeyHere",
      "verified": false,
      "share": 100
    }
  ]
}
```

## Configuration

Environment variables:
- `NETWORK`: Solana network (mainnet-beta or devnet, default: devnet)
- `HELIUS_API_KEY`: Helius API key for improved RPC reliability
- `RPC_URL`: Custom Solana RPC endpoint (optional)
- `KEYPAIR_PATH`: Path to keypair file (optional)
- `BUNDLR_ADDRESS`: Bundlr network address (optional)

## Switching Networks

**To use devnet for testing:**
```bash
# Set in .env file
NETWORK=devnet
HELIUS_API_KEY=your-helius-key  # Optional but recommended
```

**To use mainnet:**
```bash
# Set in .env file  
NETWORK=mainnet-beta
HELIUS_API_KEY=your-helius-key  # Optional but recommended
```

**Fund devnet wallet:**
```bash
solana airdrop 2 --keypair wallet.json --url devnet
```

## How It Works

1. **Folder Detection**: New subfolders trigger processing
2. **File Stability**: Waits for files to stop changing (awaitWriteFinish)
3. **Media Upload**: Uploads media file to Arweave via Bundlr
4. **Metadata Upload**: Creates metadata JSON with image URI and uploads
5. **NFT Minting**: Creates NFT using Metaplex Token Metadata standard
6. **Completion**: Marks folder as processed and moves to `processed/`

## Resilience Features

- **One-time processing**: Creates `.done` files to prevent reprocessing
- **File stability waiting**: Uses chokidar's awaitWriteFinish option
- **Validation**: Requires minimum metadata fields (name)
- **Error handling**: Logs errors but continues watching
- **Duplicate handling**: Moves folders to uniquely named processed directories

## Explorer URLs

After successful minting, the script prints:
- Transaction URL: `https://explorer.solana.com/tx/{signature}`
- NFT URL: `https://explorer.solana.com/address/{mint}`

(Add `?cluster=devnet` to URLs when using devnet)# wts_mint
