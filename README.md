# WTS Mint NFT

A Node.js script that watches a designated "inbox" directory for new subfolders and automatically mints NFTs on Solana using Metaplex Umi.

## Features

- 📁 **Directory Watching**: Monitors inbox folder for new subfolders
- 🔒 **Resilient Processing**: Only processes folders once, waits for file stability
- ☁️ **Decentralized Storage**: Uploads to Arweave via Bundlr
- 🪙 **NFT Minting**: Creates Token Metadata NFTs on Solana using Metaplex Umi
- 🔗 **Explorer URLs**: Prints transaction and NFT URLs for easy verification
- ✅ **Validation**: Ensures metadata has required fields

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment (optional):
```bash
cp .env.example .env
# Edit .env with your settings
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

### Integrated CLI + Web Mode (Recommended)

**Step 1: Start the API server**
```bash
npm run server
```

**Step 2: Start the web interface** (in another terminal)
```bash
npm run install-web  # First time only
npm run web
```

**Step 3: Start the CLI** (in another terminal)
```bash
npm start
```

**New CLI Flow:**
1. **Web Dashboard Prompt**: Option to wait for browser wallet connection
2. **Browser Wallet Integration**: Connect Phantom/Solflare via web dashboard
3. **Wallet Configuration**: Uses web wallet for monitoring, server wallet for signing
4. **Folder Watching**: Automated processing with web dashboard monitoring

### CLI-Only Mode
```bash
npm start
```

Traditional flow:
1. Initialize wallet (interactive prompt on first run)
2. Display wallet address and balance  
3. Ask for confirmation to continue
4. Create `inbox/` and `processed/` directories
5. Watch folders and mint NFTs

### Web Interface Mode
Start the API server:
```bash
npm run server
```

Start the web interface:
```bash
npm run install-web  # First time only
npm run web
```

Access the web dashboard at: http://localhost:3000

**Web Features:**
- 🔌 **Browser Wallet Connection** (Phantom, Solflare, etc.)
- 📊 **Real-time Dashboard** with server status and statistics  
- 📤 **Manual NFT Upload** with drag-and-drop interface
- 🎯 **Live Activity Feed** showing real-time minting progress
- ▶️ **Start/Stop Folder Watcher** remotely
- 📋 **NFT History** with explorer links

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
- `RPC_URL`: Solana RPC endpoint (default: mainnet)
- `KEYPAIR_PATH`: Path to keypair file
- `BUNDLR_ADDRESS`: Bundlr network address

Web interface environment variables (create `web/.env.local`):
- `REACT_APP_API_URL`: API server URL (default: http://localhost:3001)
- `REACT_APP_SOLANA_NETWORK`: Solana network (mainnet-beta or devnet)
- `REACT_APP_RPC_URL`: Custom RPC URL for web interface

## Switching to Devnet

To use devnet for testing (recommended for development):

1. **Set environment variable:**
```bash
RPC_URL=https://api.devnet.solana.com npm start
```

2. **Or create .env file:**
```bash
cp .env.example .env
# Edit .env and change RPC_URL to devnet
```

3. **Fund devnet wallet:**
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
