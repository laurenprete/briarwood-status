/**
 * Publishes a new Lambda version and updates the "live" alias.
 * Called automatically by `npm run deploy:api`.
 */
const { execSync } = require('child_process')

const fn = 'briarwood-status-api'
const profile = 'cdk-admin'

console.log('Waiting for function update to complete...')
execSync(`aws lambda wait function-updated --function-name ${fn} --profile ${profile}`, { stdio: 'inherit' })

console.log('Publishing new version...')
const result = execSync(`aws lambda publish-version --function-name ${fn} --profile ${profile} --query Version --output text`)
const version = result.toString().trim()
console.log(`Published version ${version}`)

console.log('Updating live alias...')
execSync(`aws lambda update-alias --function-name ${fn} --name live --function-version ${version} --profile ${profile}`, { stdio: 'inherit' })
console.log('Done — live alias updated')
