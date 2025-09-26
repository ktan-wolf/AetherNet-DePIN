// tests/helpers.ts
import * as anchor from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface TestUser {
  keypair: Keypair;
  tokenAccount: PublicKey;
  publicKey: PublicKey;
}

/**
 * Sets up a test user:
 * - Creates a new keypair
 * - Airdrops SOL
 * - Creates an associated token account
 * - Mints tokens to it
 */
export async function setupTestUser(
  connection: Connection,
  mint: PublicKey,
  mintAuthority: Keypair,
  tokensToMint: number
): Promise<TestUser> {
  const userKeypair = Keypair.generate();

  // Airdrop SOL
  const airdropSig = await connection.requestAirdrop(
    userKeypair.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);

  // Create ATA
  const tokenAccount = (
    await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      userKeypair.publicKey
    )
  ).address;

  // Mint tokens to user
  await splToken.mintTo(
    connection,
    mintAuthority,
    mint,
    tokenAccount,
    mintAuthority,
    tokensToMint
  );

  return {
    keypair: userKeypair,
    publicKey: userKeypair.publicKey,
    tokenAccount,
  };
}
