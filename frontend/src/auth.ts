const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1'
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID

const ID_TOKEN_KEY = 'briarwood_id_token'
const ACCESS_TOKEN_KEY = 'briarwood_access_token'
const REFRESH_TOKEN_KEY = 'briarwood_refresh_token'

function parseJwt(token: string): Record<string, unknown> {
  const segment = token.split('.')[1]
  if (!segment) throw new Error('Invalid token format')
  // Convert base64url to base64 and add padding
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return JSON.parse(atob(padded))
}

export function isLoggedIn(): boolean {
  const token = localStorage.getItem(ID_TOKEN_KEY)
  if (!token) return false
  try {
    const payload = parseJwt(token)
    const exp = payload.exp as number
    return Date.now() < exp * 1000
  } catch {
    return false
  }
}

export function getToken(): string | null {
  if (!isLoggedIn()) return null
  return localStorage.getItem(ID_TOKEN_KEY)
}

interface AuthSuccess {
  type: 'success'
}

interface AuthChallenge {
  type: 'NEW_PASSWORD_REQUIRED'
  session: string
}

export type LoginResult = AuthSuccess | AuthChallenge

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || data.__type || 'Authentication failed')
  }

  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    return { type: 'NEW_PASSWORD_REQUIRED', session: data.Session }
  }

  const result = data.AuthenticationResult
  localStorage.setItem(ID_TOKEN_KEY, result.IdToken)
  localStorage.setItem(ACCESS_TOKEN_KEY, result.AccessToken)
  if (result.RefreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.RefreshToken)
  }

  return { type: 'success' }
}

export async function respondToNewPasswordChallenge(
  session: string,
  email: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
    },
    body: JSON.stringify({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: CLIENT_ID,
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
      },
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || data.__type || 'Password change failed')
  }

  const result = data.AuthenticationResult
  localStorage.setItem(ID_TOKEN_KEY, result.IdToken)
  localStorage.setItem(ACCESS_TOKEN_KEY, result.AccessToken)
  if (result.RefreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.RefreshToken)
  }
}

export function logout(): void {
  localStorage.removeItem(ID_TOKEN_KEY)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  window.location.href = '/'
}
