#!/usr/bin/env node

/**
 * Script to generate VAPID keys for web push notifications
 * 
 * Usage:
 *   node scripts/generate-vapid-keys.js
 * 
 * This will generate a VAPID key pair and display instructions
 * for adding them to your .env.local file
 */

const webpush = require('web-push')

console.log('\n🔑 Generating VAPID keys for web push notifications...\n')

try {
  const vapidKeys = webpush.generateVAPIDKeys()

  console.log('✅ VAPID keys generated successfully!\n')
  console.log('📋 Add these to your .env.local file:\n')
  console.log('=' .repeat(60))
  console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + vapidKeys.publicKey)
  console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey)
  console.log('VAPID_SUBJECT=mailto:your-email@example.com')
  console.log('=' .repeat(60))
  console.log('\n📝 Notes:')
  console.log('  - Replace "your-email@example.com" with your actual email')
  console.log('  - The VAPID_SUBJECT can be any mailto: URL')
  console.log('  - Keep VAPID_PRIVATE_KEY secret - never commit it to git!')
  console.log('  - Restart your development server after adding these variables\n')
} catch (error) {
  console.error('❌ Error generating VAPID keys:', error.message)
  process.exit(1)
}

