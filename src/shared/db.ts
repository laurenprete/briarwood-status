import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'
import type { Monitor, CheckResult, MonitorState, Group } from './types'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

const MONITORS_TABLE = process.env.MONITORS_TABLE!
const CHECK_RESULTS_TABLE = process.env.CHECK_RESULTS_TABLE!
const MONITOR_STATE_TABLE = process.env.MONITOR_STATE_TABLE!
const GROUPS_TABLE = process.env.GROUPS_TABLE!

// --- Monitors ---

export async function listMonitors(): Promise<Monitor[]> {
  const items: Monitor[] = []
  let lastKey: Record<string, any> | undefined

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: MONITORS_TABLE,
        ExclusiveStartKey: lastKey,
      })
    )
    if (res.Items) items.push(...(res.Items as Monitor[]))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  return items
}

export async function listActiveMonitors(): Promise<Monitor[]> {
  const all = await listMonitors()
  return all.filter((m) => m.isActive)
}

export async function getMonitor(id: string): Promise<Monitor | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: MONITORS_TABLE, Key: { id } })
  )
  return (res.Item as Monitor) ?? null
}

export async function putMonitor(monitor: Monitor): Promise<void> {
  await ddb.send(
    new PutCommand({ TableName: MONITORS_TABLE, Item: monitor })
  )
}

export async function deleteMonitor(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: MONITORS_TABLE, Key: { id } })
  )

  // Clean up orphaned state
  await ddb.send(
    new DeleteCommand({ TableName: MONITOR_STATE_TABLE, Key: { monitorId: id } })
  ).catch(() => {}) // best-effort

  // Clean up orphaned check results (batch delete, paginated)
  await deleteCheckResultsForMonitor(id)
}

async function deleteCheckResultsForMonitor(monitorId: string): Promise<void> {
  try {
    let lastKey: Record<string, any> | undefined

    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: CHECK_RESULTS_TABLE,
          KeyConditionExpression: 'monitorId = :mid',
          ExpressionAttributeValues: { ':mid': monitorId },
          ProjectionExpression: 'monitorId, #ts',
          ExpressionAttributeNames: { '#ts': 'timestamp' },
          ExclusiveStartKey: lastKey,
          Limit: 25, // DynamoDB BatchWrite max is 25
        })
      )

      const items = res.Items ?? []
      if (items.length > 0) {
        // BatchWriteItem supports up to 25 items per call
        const { BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb')
        await ddb.send(
          new BatchWriteCommand({
            RequestItems: {
              [CHECK_RESULTS_TABLE]: items.map((item) => ({
                DeleteRequest: {
                  Key: { monitorId: item.monitorId, timestamp: item.timestamp },
                },
              })),
            },
          })
        )
      }

      lastKey = res.LastEvaluatedKey
    } while (lastKey)
  } catch (err) {
    // Best-effort cleanup — don't fail the delete if this errors
    console.error(`[db] Failed to clean up check results for monitor ${monitorId}`, err)
  }
}

// --- Check Results ---

export async function writeCheckResult(result: CheckResult): Promise<void> {
  await ddb.send(
    new PutCommand({ TableName: CHECK_RESULTS_TABLE, Item: result })
  )
}

export async function queryCheckResults(
  monitorId: string,
  fromTimestamp: string,
  limit?: number
): Promise<CheckResult[]> {
  const items: CheckResult[] = []
  let lastKey: Record<string, any> | undefined

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: CHECK_RESULTS_TABLE,
        KeyConditionExpression:
          'monitorId = :mid AND #ts >= :from',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: {
          ':mid': monitorId,
          ':from': fromTimestamp,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastKey,
        // Use a per-page limit for efficiency, but continue paginating
        ...(limit !== undefined && items.length + 1000 >= limit
          ? { Limit: limit - items.length }
          : { Limit: 1000 }),
      })
    )
    if (res.Items) items.push(...(res.Items as CheckResult[]))
    lastKey = res.LastEvaluatedKey

    // Stop if we've reached the caller's limit
    if (limit !== undefined && items.length >= limit) break
  } while (lastKey)

  return limit !== undefined ? items.slice(0, limit) : items
}

export async function getRecentChecks(
  monitorId: string,
  limit = 20
): Promise<CheckResult[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: CHECK_RESULTS_TABLE,
      KeyConditionExpression: 'monitorId = :mid',
      ExpressionAttributeValues: { ':mid': monitorId },
      ScanIndexForward: false,
      Limit: limit,
    })
  )
  return (res.Items ?? []) as CheckResult[]
}

// --- Monitor State ---

export async function getMonitorState(
  monitorId: string
): Promise<MonitorState | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: MONITOR_STATE_TABLE,
      Key: { monitorId },
    })
  )
  return (res.Item as MonitorState) ?? null
}

export async function putMonitorState(state: MonitorState): Promise<void> {
  await ddb.send(
    new PutCommand({ TableName: MONITOR_STATE_TABLE, Item: state })
  )
}

export async function getAllMonitorStates(): Promise<MonitorState[]> {
  const items: MonitorState[] = []
  let lastKey: Record<string, any> | undefined

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: MONITOR_STATE_TABLE,
        ExclusiveStartKey: lastKey,
      })
    )
    if (res.Items) items.push(...(res.Items as MonitorState[]))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  return items
}

// --- Groups ---

export async function listGroups(): Promise<Group[]> {
  const items: Group[] = []
  let lastKey: Record<string, any> | undefined
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: GROUPS_TABLE,
        ExclusiveStartKey: lastKey,
      })
    )
    if (res.Items) items.push(...(res.Items as Group[]))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)
  return items
}

export async function getGroup(slug: string): Promise<Group | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: GROUPS_TABLE, Key: { slug } })
  )
  return (res.Item as Group) ?? null
}

export async function putGroup(group: Group): Promise<void> {
  await ddb.send(
    new PutCommand({ TableName: GROUPS_TABLE, Item: group })
  )
}

export async function deleteGroup(slug: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: GROUPS_TABLE, Key: { slug } })
  )
}
