import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Aethernet } from "../target/types/aethernet";
import { assert } from "chai";

describe("aethernet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Aethernet as Program<Aethernet>;

  let networkStatsPda;
  let bump;

  before(async () => {
    // Derive PDA for global stats account
    [networkStatsPda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("network-stats")],
      program.programId
    );

    // Airdrop SOL to payer
    await provider.connection.requestAirdrop(provider.wallet.publicKey, 2e9);

    // ✅ Initialize network (creates the PDA account)
    await program.methods
      .initializeNetwork()
      .accounts({
        networkStats: networkStatsPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("Registers a node", async () => {
    const nodeDeviceKeypair = anchor.web3.Keypair.generate();
    const uri = "https://mydevice.example/metadata.json";

    await program.methods
      .registerNode(uri)
      .accounts({
        authority: provider.wallet.publicKey,
        nodeDevice: nodeDeviceKeypair.publicKey,
        networkStats: networkStatsPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([nodeDeviceKeypair])
      .rpc();

    // Fetch accounts
    const nodeDevice = await program.account.nodeDevice.fetch(
      nodeDeviceKeypair.publicKey
    );
    const networkStats = await program.account.networkStats.fetch(
      networkStatsPda
    );

    // Assertions
    assert.equal(
      nodeDevice.authority.toBase58(),
      provider.wallet.publicKey.toBase58()
    );
    assert.equal(nodeDevice.uri, uri);
    assert.equal(networkStats.totalNodes.toNumber(), 1);
  });
});
