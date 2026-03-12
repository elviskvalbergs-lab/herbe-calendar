import SetupClient from './SetupClient'

const AUTHORIZE_URL = 'https://standard-id.hansaworld.com/oauth-authorize'

export default function SetupPage() {
  const base = (process.env.NEXTAUTH_URL ?? 'https://herbe-calendar.vercel.app').replace(/\/$/, '')
  const redirectUri = `${base}/api/herbe/callback`
  const clientId = process.env.HERBE_CLIENT_ID ?? ''

  const authUrl =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&type=web_server`

  return <SetupClient authUrl={authUrl} />
}
