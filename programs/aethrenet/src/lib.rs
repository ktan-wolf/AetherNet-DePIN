use anchor_lang::prelude::*;
// use anchor_lang::prelude::Account;

declare_id!("8GKLUg4PFexgK1h4VCbF9KozwjMatNjhj192xoHLSU7U");

/// Accounts required for initializing the network.
/// Creates a global NetworkStats account to track total registered nodes.
#[derive(Accounts)]
pub struct InitializeNetwork<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8, // discriminator + total_nodes (u64)
        seeds = [b"network-stats"],
        bump
    )]
    pub network_stats: Account<'info, NetworkStats>,

    /// The authority that initializes the network.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// System program for account initialization.
    pub system_program: Program<'info, System>,
}

/// Accounts required for registering a new node.
#[derive(Accounts)]
pub struct RegisterNode<'info> {
    /// The authority who owns this node.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        // discriminator (8) + authority pubkey (32) + string prefix (4) + max URI length (200)
        space = 8 + 32 + 4 + 200
    )]
    pub node_device: Account<'info, NodeDevice>,

    #[account(mut)]
    pub network_stats: Account<'info, NetworkStats>,

    pub system_program: Program<'info, System>,
}

/// Accounts required for deregistering a node.
#[derive(Accounts)]
pub struct DeregisterNode<'info> {
    /// The rightful authority who owns this node.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The node device account being closed.
    /// Must belong to the same authority.
    #[account(mut, has_one = authority, close = authority)]
    pub node_device: Account<'info, NodeDevice>,

    #[account(mut)]
    pub network_stats: Account<'info, NetworkStats>,
}

#[program]
pub mod aethernet {
    use super::*;

    /// Initializes the network by creating the NetworkStats account.
    pub fn initialize_network(ctx: Context<InitializeNetwork>) -> Result<()> {
        let stats = &mut ctx.accounts.network_stats;
        stats.total_nodes = 0;
        Ok(())
    }

    /// Registers a new node device with a URI.
    /// Increments the total node count in NetworkStats.
    pub fn register_node(ctx: Context<RegisterNode>, uri: String) -> Result<()> {
        let node_device = &mut ctx.accounts.node_device;
        let authority = &ctx.accounts.authority;
        let network_stats = &mut ctx.accounts.network_stats;

        node_device.authority = authority.key();
        node_device.uri = uri;

        network_stats.total_nodes += 1;

        Ok(())
    }

    /// Deregisters (removes) a node device.
    /// Decrements the total node count in NetworkStats.
    pub fn deregister_node(ctx: Context<DeregisterNode>) -> Result<()> {
        let stats = &mut ctx.accounts.network_stats;

        if stats.total_nodes > 0 {
            stats.total_nodes -= 1;
        }

        msg!("after deregister: {}", stats.total_nodes);

        Ok(())
    }
}

/// Tracks the total number of registered nodes.
#[account]
pub struct NetworkStats {
    total_nodes: u64,
}

/// Represents a registered node device.
#[account]
pub struct NodeDevice {
    /// The authority (owner) of this device.
    pub authority: Pubkey,
    /// The device's URI (metadata location).
    pub uri: String,
}