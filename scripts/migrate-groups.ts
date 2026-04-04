/**
 * One-off migration: convert freeform monitor.group strings into
 * Group records and backfill groupSlug on monitors.
 *
 * Run: npx ts-node scripts/migrate-groups.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

const MONITORS_TABLE = 'briarwood-status-monitors'
const GROUPS_TABLE = 'briarwood-status-groups'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  // 1. Scan all monitors
  const monitors: any[] = []
  let lastKey: any
  do {
    const res = await ddb.send(new ScanCommand({ TableName: MONITORS_TABLE, ExclusiveStartKey: lastKey }))
    if (res.Items) monitors.push(...res.Items)
    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  console.log(`Found ${monitors.length} monitors`)

  // 2. Collect unique group names
  const groupNames = new Set<string>()
  for (const m of monitors) {
    if (m.group && typeof m.group === 'string' && m.group.trim()) {
      groupNames.add(m.group.trim())
    }
  }

  console.log(`Found ${groupNames.size} unique groups: ${[...groupNames].join(', ')}`)

  // 3. Create group records
  const now = new Date().toISOString()
  const nameToSlug = new Map<string, string>()

  for (const name of groupNames) {
    const slug = slugify(name)
    nameToSlug.set(name, slug)

    await ddb.send(new PutCommand({
      TableName: GROUPS_TABLE,
      Item: {
        slug,
        name,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(slug)',
    })).catch((err: any) => {
      if (err.name === 'ConditionalCheckFailedException') {
        console.log(`  Group "${slug}" already exists, skipping`)
      } else {
        throw err
      }
    })

    console.log(`  Created group: ${name} -> ${slug}`)
  }

  // 4. Backfill monitors
  for (const m of monitors) {
    const legacyGroup = m.group?.trim()
    if (!legacyGroup) continue

    const slug = nameToSlug.get(legacyGroup)
    if (!slug) continue

    await ddb.send(new UpdateCommand({
      TableName: MONITORS_TABLE,
      Key: { id: m.id },
      UpdateExpression: 'SET groupSlug = :slug, groupName = :name',
      ExpressionAttributeValues: {
        ':slug': slug,
        ':name': legacyGroup,
      },
    }))

    console.log(`  Updated monitor "${m.name}": groupSlug=${slug}`)
  }

  console.log('Migration complete')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
