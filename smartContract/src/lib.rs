use borsh::{BorshDeserialize, BorshSerialize};
use num_derive::FromPrimitive;
use thiserror::Error;
use solana_program::{
    account_info::next_account_info,
    account_info::AccountInfo,
    decode_error::DecodeError,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::{Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self, Sysvar},
};

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum CustomError {
    #[error("Incorrect Owner")]
    IncorrectOwner,
    #[error("Account Not Rent Exempt")]
    AccountNotRentExempt,
    #[error("Account Not Hash Account")]
    AccountNotHashAccount,
}

impl From<CustomError> for ProgramError {
    fn from(e: CustomError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for CustomError {
    fn type_of() -> &'static str {
        "Custom Error"
    }
}

/// Define the type of state stored in accounts
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct HashAccount {
    pub hash: String,
}

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey, // Public key of the account the hello world program was loaded into
    accounts: &[AccountInfo], // See method for accounts info
    _instruction_data: &[u8], // Format: u8 --> HospitalId   u8 --> ReportId   string(64 hex characters)
) -> ProgramResult {
    // Iterating accounts is safer then indexing
    let accounts_iter = &mut accounts.iter();

    let hospitalId: u8 = 1;
    let reportId: u8 = 2;
    let document_hash: String = "Hash".to_string();

    // The first account is the account where the hash of the document is stored
    // This account must be owned by the program, in order to be able to modify it
    let hash_account = next_account_info(accounts_iter)?;
    if hash_account.owner != program_id {
        msg!("Hash Account not owned by the program");
        return Err(CustomError::IncorrectOwner.into());
    }

    // The Hash account should also be rent exempt, otherwise the hash of the
    // document would disappear after some time
    // For this, we will use the second account, which would be the system account
    let sysvar_account = next_account_info(accounts_iter)?;
    let rent = &Rent::from_account_info(sysvar_account)?;
    if !sysvar::rent::check_id(sysvar_account.key) {
        msg!("Rent system account is not rent system account");
        return Err(ProgramError::InvalidAccountData);
    }
    if !rent.is_exempt( hash_account.lamports(), hash_account.data_len()) {
        msg!("Hash account is not rent exempt");
        return Err(CustomError::AccountNotRentExempt.into());
    }

    // The third account is the account of the SmartContractServer, which must
    // be the signer of the transacion
    let smart_contract_server_account = next_account_info(accounts_iter)?;
    if !smart_contract_server_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // We will have to check if the hash_account was actually derrived by the
    // combination of the hospitalId and reportId given
    let seed: String = format!("{}_{}", hospitalId.to_string(), reportId.to_string());
    let expected_pub_key = Pubkey::create_with_seed(smart_contract_server_account.key, &seed[..], program_id)?;
    if expected_pub_key != *hash_account.key {
        msg!("The public key of hash account doesn't match");
        return Err(CustomError::AccountNotHashAccount.into());
    }

    // We will now store the hash into the account
    let mut account: HashAccount = HashAccount {
        hash: document_hash,
    };
    account.serialize(&mut &mut hash_account.data.borrow_mut()[..])?;

    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;
    use std::mem;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<u32>()];
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data: Vec<u8> = Vec::new();

        let accounts = vec![account];

        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            0
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            1
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            2
        );
    }
}