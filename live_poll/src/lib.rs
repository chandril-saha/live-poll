#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contract]
pub struct LivePollContract;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// Vote count for a specific option (0..3)
    VoteCount(u32),
    /// Whether a given address has already voted
    HasVoted(Address),
    /// Total number of votes across all options
    TotalVotes,
}

#[contractimpl]
impl LivePollContract {
    /// Initialize the contract. Sets all vote counts to zero.
    pub fn init(env: Env) {
        for i in 0u32..4 {
            env.storage().persistent().set(&DataKey::VoteCount(i), &0u32);
        }
        env.storage().persistent().set(&DataKey::TotalVotes, &0u32);
    }

    /// Cast a vote for an option (0-3). Each address can only vote once.
    /// Requires sender authorization and emits a "vote" event on success.
    pub fn cast_vote(env: Env, voter: Address, option_id: u32) {
        // Require authorization from the voter
        voter.require_auth();

        // Validate option range (4 options: 0, 1, 2, 3)
        assert!(option_id < 4, "Invalid option");

        // Prevent double voting
        let voted_key = DataKey::HasVoted(voter.clone());
        let has_voted: bool = env.storage().persistent().get(&voted_key).unwrap_or(false);
        assert!(!has_voted, "Already voted");

        // Mark voter
        env.storage().persistent().set(&voted_key, &true);

        // Increment option vote count
        let count_key = DataKey::VoteCount(option_id);
        let current: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        env.storage().persistent().set(&count_key, &(current + 1));

        // Increment total votes
        let total: u32 = env.storage()
            .persistent()
            .get(&DataKey::TotalVotes)
            .unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalVotes, &(total + 1));

        // Emit event for real-time frontend tracking
        env.events().publish(
            (symbol_short!("vote"), voter),
            (option_id, current + 1, total + 1),
        );
    }

    /// Get the vote count for a specific option.
    pub fn get_votes(env: Env, option_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::VoteCount(option_id))
            .unwrap_or(0)
    }

    /// Get the total number of votes across all options.
    pub fn get_total(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalVotes)
            .unwrap_or(0)
    }

    /// Check whether a specific address has already voted.
    pub fn has_voted(env: Env, voter: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::HasVoted(voter))
            .unwrap_or(false)
    }
}
