import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const body = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const tx_ref = body.tx_ref || body.reference

    if (body.status === 'success' || body.status === 'completed') {
      await supabase
        .from('transactions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('tx_ref', tx_ref)

      const { data: txn } = await supabase
        .from('transactions')
        .select('user_id, amount, type')
        .eq('tx_ref', tx_ref)
        .single()

      if (txn) {
        await supabase.from('user_courses').upsert({
          user_id: txn.user_id,
          course_id: 'ai-engineering-101',
          purchased_at: new Date().toISOString()
        })
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    await supabase
      .from('transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('tx_ref', tx_ref)

    return new Response(JSON.stringify({ success: false }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 })
  }
})