import * as anchor from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
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

  // ------------------ Helpers ------------------
  async function registerTestNode(uri: string, signer: Keypair) {
    await program.methods
      .registerNode(uri)
      .accounts({
        authority: wallet.publicKey,
        nodeDevice: signer.publicKey,
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
      .signers([signer])
      .rpc();
  }

  async function getTokenBalance(account: PublicKey) {
    return (await splToken.getAccount(provider.connection, account)).amount;
  }

  // ------------------ Setup ------------------
  before(async () => {
    // 1. Derive PDAs
    [networkStatsPda] = await PublicKey.findProgramAddress(
      [Buffer.from("network-stats")],
      program.programId
    );

    [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // 2. Airdrop SOL if needed
    const balance = await provider.connection.getBalance(wallet.publicKey);
    if (balance < 2e9) {
      await provider.connection.requestAirdrop(wallet.publicKey, 2e9);
    }

    // 3. Initialize network
    try {
      await program.methods
        .initializeNetwork()
        .accounts({
          networkStats: networkStatsPda,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch {
      // ignore if already initialized
    }

    // 4. Create token mint (PublicKey)
    mint = await splToken.createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // 5. Create user's associated token account and mint tokens
    userTokenAccount = (
      await splToken.getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mint,
        wallet.publicKey
      )
    ).address;

    await splToken.mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userTokenAccount,
      wallet.payer,
      1000 * 10 ** 6
    );

    // 6. Vault ATA (owned by PDA)
    vaultTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      vaultPda,
      true
    );
  });

  // ------------------ Tests ------------------

  describe("Node Registration and Staking", () => {
    it("Registers a new node and stakes tokens successfully", async () => {
      const nodeDeviceKeypair = Keypair.generate();
      const uri = "https://mydevice.example/metadata.json";

      const userBalanceBefore = await getTokenBalance(userTokenAccount);
      const vaultBalanceBefore = await provider.connection.getAccountInfo(
        vaultTokenAccount
      )
        ? await getTokenBalance(vaultTokenAccount)
        : BigInt(0);

      await registerTestNode(uri, nodeDeviceKeypair);

      const nodeDevice = await program.account.nodeDevice.fetch(
        nodeDeviceKeypair.publicKey
      );
      assert.equal(
        nodeDevice.authority.toBase58(),
        wallet.publicKey.toBase58()
      );
      assert.equal(nodeDevice.uri, uri);

      const networkStats = await program.account.networkStats.fetch(
        networkStatsPda
      );
      assert.isTrue(networkStats.totalNodes.toNumber() > 0);

      const userBalanceAfter = await getTokenBalance(userTokenAccount);
      const vaultBalanceAfter = await getTokenBalance(vaultTokenAccount);

      assert.strictEqual(
        (vaultBalanceAfter - vaultBalanceBefore).toString(),
        STAKE_AMOUNT.toString()
      );
      assert.strictEqual(
        (userBalanceBefore - userBalanceAfter).toString(),
        STAKE_AMOUNT.toString()
      );
    });

    it("Fails if URI is too long", async () => {
      const nodeDeviceKeypair = Keypair.generate();
      const oversizedUri = "a".repeat(257);

      try {
        await registerTestNode(oversizedUri, nodeDeviceKeypair);
        assert.fail("Transaction should have failed due to oversized URI.");
      } catch (err: any) {
        const errorCode = err?.error?.errorCode?.code;
        assert.equal(errorCode, "UriTooLong");
      }
    });
  });

  describe("Node Deregistration and Unstaking", () => {
    it("Allows rightful authority to deregister and unstake", async () => {
      const nodeDeviceKeypair = Keypair.generate();
      await registerTestNode("https://deregister-test.com/node.json", nodeDeviceKeypair);

      const statsBefore = await program.account.networkStats.fetch(networkStatsPda);
      const userBalanceBefore = await getTokenBalance(userTokenAccount);
      const vaultBalanceBefore = await getTokenBalance(vaultTokenAccount);

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

      const statsAfter = await program.account.networkStats.fetch(networkStatsPda);
      const userBalanceAfter = await getTokenBalance(userTokenAccount);
      const vaultBalanceAfter = await getTokenBalance(vaultTokenAccount);

      assert.equal(
        statsAfter.totalNodes.toNumber(),
        statsBefore.totalNodes.toNumber() - 1
      );
      assert.strictEqual(
        (userBalanceAfter - userBalanceBefore).toString(),
        STAKE_AMOUNT.toString()
      );
      assert.strictEqual(
        (vaultBalanceBefore - vaultBalanceAfter).toString(),
        STAKE_AMOUNT.toString()
      );

      const nodeDeviceAccountInfo = await provider.connection.getAccountInfo(
        nodeDeviceKeypair.publicKey
      );
      assert.isNull(nodeDeviceAccountInfo);
    });

    it("Prevents another user from deregistering the node", async () => {
      const anotherNodeKeypair = Keypair.generate();
      const maliciousUser = Keypair.generate();

      await provider.connection.requestAirdrop(maliciousUser.publicKey, 1e9);

      await registerTestNode("https://another-node.com", anotherNodeKeypair);

      try {
        await program.methods
          .deregisterNode()
          .accounts({
            authority: maliciousUser.publicKey,
            nodeDevice: anotherNodeKeypair.publicKey,
            networkStats: networkStatsPda,
            mint,
            userTokenAccount,
            vaultTokenAccount,
            vault: vaultPda,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([maliciousUser])
          .rpc();
        assert.fail("Malicious user should not be able to deregister");
      } catch (err: any) {
        const code = err?.error?.errorCode?.code ?? "";
        assert.equal(code, "ConstraintHasOne");
      }
    });
  });

  describe("Node URI Update", () => {
    it("Allows authority to update URI", async () => {
      const nodeDeviceKeypair = Keypair.generate();
      await registerTestNode("https://initial-node.com", nodeDeviceKeypair);

      const newUri = "https://updated-node.com";

      await program.methods
        .updateUri(newUri)
        .accounts({
          authority: wallet.publicKey,
          nodes: nodeDeviceKeypair.publicKey,
        })
        .rpc();

      const nodeDevice = await program.account.nodeDevice.fetch(
        nodeDeviceKeypair.publicKey
      );
      assert.equal(nodeDevice.uri, newUri);
    });

    it("Fails if URI exceeds max length", async () => {
      const nodeDeviceKeypair = Keypair.generate();
      await registerTestNode("https://initial-long.com", nodeDeviceKeypair);

      const oversizedUri = "a".repeat(257);

      try {
        await program.methods
          .updateUri(oversizedUri)
          .accounts({
            authority: wallet.publicKey,
            nodes: nodeDeviceKeypair.publicKey,
          })
          .rpc();
        assert.fail("Should fail due to oversized URI");
      } catch (err: any) {
        const errorCode = err?.error?.errorCode?.code;
        assert.equal(errorCode, "UriTooLong");
      }
    });
  });
});
