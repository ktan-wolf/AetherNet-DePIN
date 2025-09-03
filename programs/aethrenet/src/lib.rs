use anchor_lang::prelude::*;
// use anchor_lang::prelude::Account;

declare_id!("4fgBUTa1mBSzTfwznhQtXTbQxnBtLzmg5vWHaaUoQBuf");

#[derive(Accounts)]
pub struct InitializeNetwork<'info>{
    #[account(
        init ,
        payer = authority , 
        space = 8 + 8,
        seeds = [b"network-stats"],
        bump
    )]
    pub network_stats : Account<'info , NetworkStats>,

    #[account(mut)]
    pub authority : Signer<'info>,

    pub system_program : Program<'info , System>,
}

#[derive(Accounts)]
pub struct RegisterNode<'info>{
    #[account(mut)]
    pub authority : Signer<'info>,

    #[account(
        init ,
        payer = authority , 
        space = 8 + 32 + 4 + 200
    )]
    pub node_device : Account<'info , NodeDevice>,

    #[account(mut)]
    pub network_stats : Account<'info , NetworkStats>,

    pub system_program : Program<'info , System>,
}

#[derive(Accounts)]
pub struct DeregisterNode<'info>{
    #[account(mut , has_one = authority , close = authority)]
    pub node_device : Account<'info , NodeDevice>,

    #[account(mut)]
    pub network_stats : Account<'info , NetworkStats>,

    pub authority : Signer<'info>
}

#[program]
pub mod aethernet {
    use super::*;
    pub fn initialize_network(ctx : Context<InitializeNetwork>) -> Result<()>{
        let stats = &mut ctx.accounts.network_stats;
        stats.total_nodes = 0;
        Ok(())
    }

    pub fn register_node(ctx : Context<RegisterNode> , uri : String) -> Result<()>{
        let node_device = &mut ctx.accounts.node_device;
        let authority = &ctx.accounts.authority;
        let network_stats = &mut ctx.accounts.network_stats;

        node_device.authority = authority.key();
        node_device.uri = uri;

        network_stats.total_nodes += 1;
        
        Ok(())
    }

    pub fn deregister_node(ctx : Context<DeregisterNode> , uri : String) -> Result<()>{
        Ok(())
    }
    
}

#[account]
pub struct NetworkStats{
    total_nodes : u64,
}

#[account]
pub struct NodeDevice{
    authority : Pubkey,
    uri : String
}