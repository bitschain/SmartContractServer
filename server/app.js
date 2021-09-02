const express = require('express')
const fs = require('fs')
const path = require('path')
const solanaWeb3 = require('@solana/web3.js')
const app = express()
const port = 5000
const borsh = require('borsh')
const crypto = require('crypto')
const { response } = require('express')

const programPath = path.resolve(__dirname, '../smartContract/dist/program')
const programKeypairPath = path.join(programPath, 'helloworld-keypair.json')

async function createKeypairFromFile(filePath) {
  const secretKeyString = await fs.readFileSync(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return solanaWeb3.Keypair.fromSecretKey(secretKey);
}

class HashAccount {
  hash = ''
  constructor(documentHash) {
    this.hash = documentHash
  }
}

const HashAccountSchema = new Map([
  [HashAccount, {kind: 'struct', fields: [['hash', 'string']]}]
]);

// TODO: Update based on new size
const HashAccountSize = 64

const fromAccount = solanaWeb3.Keypair.generate()
console.log('Public Key = ' + fromAccount.publicKey.toBase58())
console.log('Private Key = ' + fromAccount.secretKey.toString())

let programId

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)

  testContract()
})

app.post("/store_on_bc", (request, response) => {
  const json = request.body
  const report_id = json['report_id']
  const hospital_id = json['hospital_id']
  const hashed_document = json['hashed_document']
  // send transaction - store hashed doc on BC
  

  response.sendStatus(200)
})

app.post("/", (request, response) => {
  const json = request.body
  const report_id = json['report_id']
  const hospital_id = json['hospital_id']
  //get hashed document from BC
  let hashed_document

  response.send({'result': hashed_document})
})

async function testContract() {
  console.log('Starting a solana connection')
  programId = (await createKeypairFromFile(programKeypairPath)).publicKey
  console.log('Program Id = ' + programId.toBase58())

  var connection = new solanaWeb3.Connection(
    solanaWeb3.clusterApiUrl('devnet'),
    'confirmed',
  );
  console.log('Connection established')

  var airdropTransaction = await connection.requestAirdrop(
    fromAccount.publicKey,
    solanaWeb3.LAMPORTS_PER_SOL * 5
  )
  var signature = await connection.confirmTransaction(airdropTransaction)
  console.log('Airdrop sucessful')

  var newPublicKey = await solanaWeb3.PublicKey.createWithSeed(fromAccount.publicKey, "1_2", programId)
  console.log('New Account Pub Key = ' + newPublicKey.toBase58())

  console.log(fromAccount.publicKey.toBuffer())
  var createAccountInstructions = await solanaWeb3.SystemProgram.createAccountWithSeed({
    fromPubkey:fromAccount.publicKey, 
    lamports:solanaWeb3.LAMPORTS_PER_SOL * 2, 
    space:HashAccountSize,
    basePubkey:fromAccount.publicKey,
    seed:"1_2",
    programId:programId,
    newAccountPubkey:newPublicKey})
  var transaction = new solanaWeb3.Transaction().add(createAccountInstructions)
  var signature = await solanaWeb3.sendAndConfirmTransaction(
    connection,
    transaction,
    [fromAccount],
  )
  console.log('SIGNATURE ' + signature)

  const documentHashString = await crypto.createHash('sha256').update('Hello').digest('hex')
  // const documentHashString = "newString"
  console.log('Hash sent = ' + documentHashString, 'utf8')
  buff1 = Buffer.from([1, 2])
  buff2 = Buffer.from(documentHashString, 'utf8')
  buffer = Buffer.concat([buff1, buff2])
  console.log(buffer.length)

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: newPublicKey, isSigner: false, isWritable: true },  // Hash Account Public Key
      { pubkey: solanaWeb3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // System Account Public Key
      { pubkey: fromAccount.publicKey, isSigner: true, isWritable: false }  // Public key of self
    ],
    programId,
    data: buffer
  })
  transaction = new solanaWeb3.Transaction().add(instruction)
  signature = await solanaWeb3.sendAndConfirmTransaction(
    connection,
    transaction,
    [fromAccount],
  )
  console.log('SIGNATURE ' + signature)
  
  const accountInfo = await connection.getAccountInfo(newPublicKey)
  console.log('Data in account = ' + accountInfo.data.toString())
}
