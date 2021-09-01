use borsh::{BorshDeserialize, BorshSerialize};
use num_derive::FromPrimitive;
use thiserror::Error;
use std::str;
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
    #[error("Incorrect Data Length")]
    IncorrectDataLength,
    #[error("Cannot Parse data")]
    CannotParseData,
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

    if _instruction_data.len() != 66 {
        msg!("Incorrect data length");
        return Err(CustomError::IncorrectDataLength.into());
    }
    let hospitalId: u8 = _instruction_data[0];
    let reportId: u8 = _instruction_data[1];
    let document_hash = match str::from_utf8(&_instruction_data[2..66]) {
        Ok(v) => v,
        Err(e) => return Err(CustomError::CannotParseData.into()),
    };

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
        hash: document_hash.to_string(),
    };
    msg!(&account.hash);
    (&mut hash_account.data.borrow_mut()).clone_from_slice(&_instruction_data[2..66]);
    // account.serialize(&mut &mut hash_account.data.borrow_mut()[..])?;
    // hash_account.data.borrow_mut()[0..64] = _instruction_data[2..66];
    
    Ok(())
}
