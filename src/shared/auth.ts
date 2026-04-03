import { jwtVerify, createRemoteJWKSet } from 'jose'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const REGION = requireEnv('COGNITO_REGION')
const USER_POOL_ID = requireEnv('COGNITO_USER_POOL_ID')
const CLIENT_ID = requireEnv('COGNITO_CLIENT_ID')
const JWKS_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`

const JWKS = createRemoteJWKSet(new URL(JWKS_URL))

export async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWKS, {
      issuer: ISSUER,
      audience: CLIENT_ID,
    })

    // Verify token_use is 'id' (not 'access' or other token types)
    if (payload.token_use !== 'id') {
      return c.json({ error: 'Invalid token type' }, 401)
    }

    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
