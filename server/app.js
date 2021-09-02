const express = require('express')
const fs = require('fs')
const path = require('path')
const solanaWeb3 = require('@solana/web3.js')
const app = express()
const port = 3000
const borsh = require('borsh')
const crypto = require('crypto')

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const programPath = path.resolve(__dirname, '../smartContract/dist/program')
const programKeypairPath = path.join(programPath, 'helloworld-keypair.json')

async function createKeypairFromFile(filePath) {
  const secretKeyString = await fs.readFileSync(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return solanaWeb3.Keypair.fromSecretKey(secretKey);
}

const HashAccountSize = 64

let programId
let fromAccount
let connection

async function initializeServer() {
  // Generate Keys for the server
  fromAccount = solanaWeb3.Keypair.generate()
  console.log('Public Key = ' + fromAccount.publicKey.toBase58())
  console.log('Private Key = ' + fromAccount.secretKey.toString())

  // Get programId of the smart Contract
  programId = (await createKeypairFromFile(programKeypairPath)).publicKey
  console.log('Program Id = ' + programId.toBase58())

  // Connect to a solana cluster on devnet
  console.log('Starting a solana connection')
  connection = new solanaWeb3.Connection(
    solanaWeb3.clusterApiUrl('devnet'),
    'confirmed',
  );
  console.log('Connection established')

  // Airdrop SOLs to server account
  var airdropTransaction = await connection.requestAirdrop(
    fromAccount.publicKey,
    solanaWeb3.LAMPORTS_PER_SOL * 5
  )
  var signature = await connection.confirmTransaction(airdropTransaction)
  console.log('Airdrop sucessful')
}

app.post('/addHashToBlockchain', async function (req, res) {
  console.log(req.body)
  var hospitalId = req.body.hospitalId
  var reportId = req.body.reportId
  var documentHash = req.body.documentHash
  var seed = hospitalId.toString() + "_" + reportId.toString()
  res.setHeader('Content-Type', 'application/json');

  try {
    var newPublicKey = await solanaWeb3.PublicKey.createWithSeed(fromAccount.publicKey, seed, programId)
    console.log('New Account Pub Key = ' + newPublicKey.toBase58())
    var createAccountInstructions = await solanaWeb3.SystemProgram.createAccountWithSeed({
      fromPubkey:fromAccount.publicKey, 
      lamports:solanaWeb3.LAMPORTS_PER_SOL * 2, 
      space:HashAccountSize,
      basePubkey:fromAccount.publicKey,
      seed:seed,
      programId:programId,
      newAccountPubkey:newPublicKey})
    var transaction = new solanaWeb3.Transaction().add(createAccountInstructions)
    var signature = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      transaction,
      [fromAccount],
    )
    console.log('New account created with SIGNATURE = ' + signature)

    buff1 = Buffer.from([hospitalId, reportId])
    buff2 = Buffer.from(documentHash, 'utf8')
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
    res.send(JSON.stringify({'status': 'OK'}))
  } catch (e) {
    console.log(e)
    res.send(JSON.stringify({'status': 'Error'}))
  }
})

app.post('/getDocumentHash', async function (req, res) {
  var hospitalId = req.body.hospitalId
  var reportId = req.body.reportId
  var seed = hospitalId.toString() + "_" + reportId.toString()
  res.setHeader('Content-Type', 'application/json');

  try {
    var newPublicKey = await solanaWeb3.PublicKey.createWithSeed(fromAccount.publicKey, seed, programId)
    console.log('New Account Pub Key = ' + newPublicKey.toBase58())
    
    const accountInfo = await connection.getAccountInfo(newPublicKey)
    res.send(JSON.stringify({
      'hospitalId': hospitalId,
      'reportId': reportId,
      'documentHash': accountInfo.data.toString()
    }))

  } catch (e) {
    res.send(JSON.stringify({
      'hospitalId': hospitalId,
      'reportId': reportId,
      'documentHash': ''
    }))
  }
})

app.listen(port, '167.71.205.128' , () => {
  console.log(`Example app listening at http://localhost:${port}`)
  initializeServer()
})
