import * as anchor from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Aethernet } from "../target/types/aethernet";
import { assert } from "chai";

describe("AetherNet Program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Aethernet as Program<Aethernet>;
  const wallet = provider.wallet as anchor.Wallet;

  // PDAs
  let networkStatsPda: PublicKey;
  let vaultPda: PublicKey;

  // Token-related accounts
  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  // Staking amount constant (BigInt)
  const STAKE_AMOUNT = BigInt(10 * 10 ** 6); // 10 tokens with 6 decimals

  before(async () => {
    // 1. Derive PDAs
    [networkStatsPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("network-stats")],
      program.programId
    );

    [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // 2. Airdrop SOL if needed
    const balance = await provider.connection.getBalance(wallet.publicKey);
    if (balance < 2e9) { // 2 SOL
      await provider.connection.requestAirdrop(wallet.publicKey, 2e9);
    }

    // 3. Initialize network (one-time setup)
    try {
      await program.methods
        .initializeNetwork()
        .accounts({
          networkStats: networkStatsPda,
          authority: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // ignore if already initialized
    }

    // 4. Create token mint
    mint = await splToken.createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey, // mint authority
      null, // freeze authority
      6 // decimals
    );

    // 5. Create user's associated token account and mint tokens to it
    userTokenAccount = (await splToken.getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    )).address;

    await splToken.mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userTokenAccount,
      wallet.payer,
      1000 * 10 ** 6 // 1000 tokens
    );

    // 6. Get the address of the vault's ATA (the program will create it)
    vaultTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      vaultPda,
      true // allow owner to be a PDA
    );
  });

  describe("Node Registration and Staking", () => {
    it("Registers a new node and stakes tokens successfully", async () => {
      const nodeDeviceKeypair = anchor.web3.Keypair.generate();
      const uri = "https://mydevice.example/metadata.json";

      const userBalanceBefore = (await splToken.getAccount(provider.connection, userTokenAccount)).amount;
      const vaultBalanceBefore = await provider.connection.getAccountInfo(vaultTokenAccount)
          ? (await splToken.getAccount(provider.connection, vaultTokenAccount)).amount
          : BigInt(0);

      // Register the node
      await program.methods
        .registerNode(uri)
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: nodeDeviceKeypair.publicKey,
          networkStats: networkStatsPda,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nodeDeviceKeypair])
        .rpc();

      // --- Assertions ---
      // 1. Check NodeDevice account data
      const nodeDevice = await program.account.nodeDevice.fetch(
        nodeDeviceKeypair.publicKey
      );
      assert.equal(
        nodeDevice.authority.toBase58(),
        wallet.publicKey.toBase58()
      );
      assert.equal(nodeDevice.uri, uri);

      // 2. Check NetworkStats
      const networkStats = await program.account.networkStats.fetch(
        networkStatsPda
      );
      assert.isTrue(networkStats.totalNodes.toNumber() > 0);

      // 3. Check token balances
      const userBalanceAfter = (await splToken.getAccount(provider.connection, userTokenAccount)).amount;
      const vaultBalanceAfter = (await splToken.getAccount(provider.connection, vaultTokenAccount)).amount;

      assert.strictEqual((vaultBalanceAfter - vaultBalanceBefore).toString(), STAKE_AMOUNT.toString(), "Vault should hold the newly staked tokens");
      assert.strictEqual((userBalanceBefore - userBalanceAfter).toString(), STAKE_AMOUNT.toString(), "User balance should decrease by stake amount");
    });

    it("Fails if URI is too long", async () => {
      const nodeDeviceKeypair = anchor.web3.Keypair.generate();
      // This URI is 257 characters long, which exceeds our limit of 256.
      const oversizedUri = "a".repeat(257); 

      try {
        await program.methods
          .registerNode(oversizedUri)
          .accounts({
            authority: wallet.publicKey,
            nodeDevice: nodeDeviceKeypair.publicKey,
            networkStats: networkStatsPda,
            userTokenAccount,
            vaultTokenAccount,
            vault: vaultPda,
            mint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([nodeDeviceKeypair])
          .rpc();
        assert.fail("Transaction should have failed due to oversized URI.");
      } catch (err: any) {
        // We now assert against the specific custom error defined in the program.
        const errorCode = err?.error?.errorCode?.code;
        assert.equal(errorCode, "UriTooLong", "Expected a UriTooLong error");
      }
    });
  });

  describe("Node Deregistration and Unstaking", () => {
    
    it("Allows rightful authority to deregister their node and get stake back", async () => {
      // --- SETUP FOR THIS TEST ---
      // This test is now self-contained. It registers a node and then deregisters it.
      const nodeDeviceKeypair = anchor.web3.Keypair.generate();
      const uri = "https://deregister-test.com/node.json";
      await program.methods
        .registerNode(uri)
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: nodeDeviceKeypair.publicKey,
          networkStats: networkStatsPda,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nodeDeviceKeypair])
        .rpc();

      // --- STATE BEFORE DEREGISTRATION ---
      const statsBefore = await program.account.networkStats.fetch(networkStatsPda);
      const userBalanceBefore = (await splToken.getAccount(provider.connection, userTokenAccount)).amount;
      const vaultBalanceBefore = (await splToken.getAccount(provider.connection, vaultTokenAccount)).amount;

      // --- EXECUTE DEREGISTRATION ---
      await program.methods
        .deregisterNode()
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: nodeDeviceKeypair.publicKey,
          networkStats: networkStatsPda,
          mint,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .rpc();

      // --- ASSERTIONS ---
      const statsAfter = await program.account.networkStats.fetch(networkStatsPda);
      const userBalanceAfter = (await splToken.getAccount(provider.connection, userTokenAccount)).amount;
      const vaultBalanceAfter = (await splToken.getAccount(provider.connection, vaultTokenAccount)).amount;

      assert.equal(statsAfter.totalNodes.toNumber(), statsBefore.totalNodes.toNumber() - 1, "Total nodes should decrease by one");
      assert.strictEqual((userBalanceAfter - userBalanceBefore).toString(), STAKE_AMOUNT.toString(), "User should get their stake back");
      assert.strictEqual((vaultBalanceBefore - vaultBalanceAfter).toString(), STAKE_AMOUNT.toString(), "Vault balance should decrease by the stake amount");

      // Node device account should be closed (rent returned)
      const nodeDeviceAccountInfo = await provider.connection.getAccountInfo(nodeDeviceKeypair.publicKey);
      assert.isNull(nodeDeviceAccountInfo);
    });

    it("Prevents another user from deregistering the node", async () => {
      const anotherNodeKeypair = Keypair.generate();
      const maliciousUser = Keypair.generate();

      // Give the malicious user SOL to pay for the transaction
      await provider.connection.requestAirdrop(maliciousUser.publicKey, 1e9);

      // Register a node with our main wallet
      await program.methods
        .registerNode("https://another-node.com")
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: anotherNodeKeypair.publicKey,
          networkStats: networkStatsPda,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([anotherNodeKeypair])
        .rpc();

      // Attempt to deregister with the malicious user
      try {
        await program.methods
          .deregisterNode()
          .accounts({
            authority: maliciousUser.publicKey,
            nodeDevice: anotherNodeKeypair.publicKey, // node owned by main wallet
            networkStats: networkStatsPda,
            mint,
            userTokenAccount,
            vaultTokenAccount,
            vault: vaultPda,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([maliciousUser])
          .rpc();
        assert.fail("Malicious user should not be able to deregister the node.");
      } catch (err: any) {
        // The `has_one = authority` constraint should catch this.
        const code = err?.error?.errorCode?.code ?? "";
        assert.equal(code, "ConstraintHasOne", "Expected a has_one constraint violation");
      }
    });
  });


  describe("Node URI Update", () => {
    it("Allows the authority to update the node URI", async () => {
      // --- SETUP: register a new node ---
      const nodeDeviceKeypair = anchor.web3.Keypair.generate();
      const initialUri = "https://initial-node-uri.com/node.json";

      await program.methods
        .registerNode(initialUri)
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: nodeDeviceKeypair.publicKey,
          networkStats: networkStatsPda,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nodeDeviceKeypair])
        .rpc();

      // --- UPDATE URI ---
      const newUri = "https://updated-node-uri.com/node.json";

      await program.methods
        .updateUri(newUri)
        .accounts({
          authority: wallet.publicKey,
          nodes: nodeDeviceKeypair.publicKey,
        })
        .rpc();

      // --- ASSERTIONS ---
      const nodeDevice = await program.account.nodeDevice.fetch(nodeDeviceKeypair.publicKey);
      assert.equal(nodeDevice.uri, newUri, "Node URI should be updated to the new value");
    });

    it("Fails if URI exceeds the maximum length", async () => {
      const nodeDeviceKeypair = anchor.web3.Keypair.generate();
      const initialUri = "https://initial-uri-for-long-test.com/node.json";

      // Register node
      await program.methods
        .registerNode(initialUri)
        .accounts({
          authority: wallet.publicKey,
          nodeDevice: nodeDeviceKeypair.publicKey,
          networkStats: networkStatsPda,
          userTokenAccount,
          vaultTokenAccount,
          vault: vaultPda,
          mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nodeDeviceKeypair])
        .rpc();

      const oversizedUri = "a".repeat(257); // 1 char more than MAX_URI_LENGTH

      try {
        await program.methods
          .updateUri(oversizedUri)
          .accounts({
            authority: wallet.publicKey,
            nodes: nodeDeviceKeypair.publicKey,
          })
          .rpc();
        assert.fail("Transaction should fail due to URI being too long");
      } catch (err: any) {
        const errorCode = err?.error?.errorCode?.code;
        assert.equal(errorCode, "UriTooLong", "Expected a UriTooLong error");
      }
    });
  });

});