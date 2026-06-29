import fs from 'fs'
import path from 'path'
import chromeWebstoreUpload from 'chrome-webstore-upload'

const ZIP_PATH = path.join(process.cwd(), 'dist', 'CRMPG-by-KEM.zip')

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

async function main() {
  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Zip not found at ${ZIP_PATH}. Run npm run extension:build first.`)
  }

  const extensionId = requiredEnv('CHROME_EXTENSION_ID')
  const clientId = requiredEnv('CHROME_CLIENT_ID')
  const clientSecret = requiredEnv('CHROME_CLIENT_SECRET')
  const refreshToken = requiredEnv('CHROME_REFRESH_TOKEN')

  const store = chromeWebstoreUpload({
    extensionId,
    clientId,
    clientSecret,
    refreshToken,
  })

  console.log(`Uploading ${ZIP_PATH}...`)

  const uploadResult = await store.uploadExisting(fs.createReadStream(ZIP_PATH))
  console.log('Upload complete:', uploadResult)

  const publishResult = await store.publish()
  console.log('Publish complete:', publishResult)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
