use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, Transfer},
};

declare_id!("5LzZhK83HbsJPTC877hRcfCZLg1cZvqDUQgLL3BxLYb4");

// Define a constant for the maximum URI length for consistency.
const MAX_URI_LENGTH: usize = 256;

#[program]
pub mod aethernet {
    use super::*;

    /// Initializes the network by creating the NetworkStats account.
    pub fn initialize_network(ctx: Context<InitializeNetwork>) -> Result<()> {
        let stats = &mut ctx.accounts.network_stats;
        stats.total_nodes = 0;
        msg!("Network initialized with total_nodes = 0");
        Ok(())
    }

    /// Registers a new node device with a URI and stakes tokens.
    pub fn register_node(ctx: Context<RegisterNode>, uri: String) -> Result<()> {
        // Add a check to ensure the URI isn't too long. This gives a clean, predictable error.
        require!(uri.len() <= MAX_URI_LENGTH, AethernetError::UriTooLong);

        let stake_amount = 10 * 10u64.pow(ctx.accounts.mint.decimals as u32);

        // CPI transfer: user → vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_interface::transfer(cpi_ctx, stake_amount)?;

        // Initialize node device
        let node_device = &mut ctx.accounts.node_device;
        node_device.authority = ctx.accounts.authority.key();
        node_device.uri = uri;

        // Update network stats
        let network_stats = &mut ctx.accounts.network_stats;
        network_stats.total_nodes += 1;

        msg!(
            "Node registered. Authority: {}, Total nodes: {}",
            node_device.authority,
            network_stats.total_nodes
        );

        Ok(())
    }

    /// Deregisters (removes) a node device and unstakes tokens.
    pub fn deregister_node(ctx: Context<DeregisterNode>) -> Result<()> {
        let stake_amount = 10 * 10u64.pow(ctx.accounts.mint.decimals as u32);

        // Define PDA signer seeds properly
        let vault_seeds: &[&[u8]] = &[b"vault", &[ctx.bumps.vault]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        // CPI transfer: vault → user
        let cpi_accounts_transfer = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program_transfer = ctx.accounts.token_program.to_account_info();
        let cpi_ctx_transfer =
            CpiContext::new_with_signer(cpi_program_transfer, cpi_accounts_transfer, signer_seeds);

        token_interface::transfer(cpi_ctx_transfer, stake_amount)?;

        // Update stats
        let stats = &mut ctx.accounts.network_stats;
        if stats.total_nodes > 0 {
            stats.total_nodes -= 1;
        }

        msg!(
            "Node deregistered. Authority: {}, Total nodes: {}",
            ctx.accounts.authority.key(),
            stats.total_nodes
        );

        Ok(())
    }

    pub fn update_uri(ctx: Context<UpdateUri> , new_uri : String) -> Result<()> {
        require!(new_uri.len() <= MAX_URI_LENGTH , AethernetError::UriTooLong);

        let nodes = &mut ctx.accounts.nodes;
        nodes.uri = new_uri;

        msg!("URI update for node of pubkey : {}" , nodes.authority);
        Ok(())
    }
}

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

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterNode<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"vault"],
        bump
    )]
    /// PDA vault, authority of vault_token_account
    pub vault: SystemAccount<'info>,

    #[account(
        init,
        payer = authority,
        // Use the constant here for space calculation
        space = 8 + 32 + 4 + MAX_URI_LENGTH
    )]
    pub node_device: Account<'info, NodeDevice>,

    #[account(mut, seeds = [b"network-stats"], bump)]
    pub network_stats: Account<'info, NetworkStats>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DeregisterNode<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority, close = authority)]
    pub node_device: Account<'info, NodeDevice>,

    #[account(mut, seeds = [b"network-stats"], bump)]
    pub network_stats: Account<'info, NetworkStats>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"vault"],
        bump
    )]
    pub vault: SystemAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct UpdateUri<'info> {
    #[account(mut)]
    pub authority : Signer<'info>,

    #[account(mut , has_one = authority)]
    pub nodes : Account<'info , NodeDevice>,
}

#[account]
pub struct NetworkStats {
    pub total_nodes: u64,
}

#[account]
pub struct NodeDevice {
    pub authority: Pubkey,
    pub uri: String,
}

// Define a custom error enum for cleaner error handling.
#[error_code]
pub enum AethernetError {
    #[msg("The provided URI is too long.")]
    UriTooLong,
}