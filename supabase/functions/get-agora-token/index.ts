// agora-access-token@2.0.6 – pinned so the build never breaks on an upstream update.
import { RtcTokenBuilder, RtcRole } from "https://esm.sh/agora-access-token@2.0.6"

// 1. Define the shape of the request body
interface TokenRequest {
  channelName: string;
  uid?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Deno.serve is the idiomatic API in Deno 1.35+ / Supabase Edge Runtime v1.
// The old `serve` helper from deno.land/std is deprecated and no longer needed.
Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Explicitly type the parsed JSON
    const { channelName, uid }: TokenRequest = await req.json()

    if (!channelName) {
      throw new Error('channelName is required')
    }

    // 3. Get secrets and ensure they are strings
    const appId = Deno.env.get('AGORA_APP_ID')
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')

    if (!appId || !appCertificate) {
      throw new Error('Agora configuration missing on server')
    }

    // 4. Constants for token expiration
    const expirationTimeInSeconds = 3600 * 24
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds

    // 5. Build the token
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid ?? 0,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    )

    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})