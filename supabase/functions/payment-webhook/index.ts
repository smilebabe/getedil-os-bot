import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CHAPA_SECRET_KEY = Deno.env.get('CHAPA_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const body = await req.json()
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Verify this is from Chapa
    const chapaSignature = req.headers.get('x-chapa-signature')
    // In production: verify the signature using CHAPA_SECRET_KEY

    const tx_ref = body.tx_ref || body.reference

    if (body.status === 'success') {
      // Update transaction status
      await supabase
        .from('transactions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('tx_ref', tx_ref)

      // Get user_id to notify them
      const { data: txn } = await supabase
        .from('transactions')
        .select('user_id, amount')
        .eq('tx_ref', tx_ref)
        .single()

      if (txn) {
        // Grant course access (example: mark a premium course as purchased)
        await supabase
          .from('user_courses')
          .upsert({ 
            user_id: txn.user_id, 
            course_id: 'ai-engineering-101',
            purchased_at: new Date().toISOString()
          })

        // Send notification via Telegram (optional)
        console.log(`Payment confirmed: ${txn.amount} ETB from user ${txn.user_id}`)
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    return new Response(JSON.stringify({ success: false, message: 'Payment not successful' }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 })
  }
})
