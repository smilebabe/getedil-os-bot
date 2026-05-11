import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CHAPA_SECRET_KEY = Deno.env.get('CHAPA_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const { amount, email, first_name, last_name, user_id, type } = await req.json()

    const tx_ref = `GETEDIL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { error: dbError } = await supabase
      .from('transactions')
      .insert([{ 
        user_id, 
        amount, 
        tx_ref, 
        status: 'pending', 
        type: type || 'course_purchase' 
      }])

    if (dbError) throw new Error(`Database Error: ${dbError.message}`)

    const response = await fetch("https://api.chapa.co/v1/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "ETB",
        email,
        first_name,
        last_name,
        tx_ref,
        callback_url: `${SUPABASE_URL}/functions/v1/payment-webhook`,
        return_url: "https://t.me/GETEDILOSBOT",
        "customization[title]": "Get'Edil Payment",
        "customization[description]": "AI Engineering Course",
      }),
    })

    const chapaData = await response.json()

    if (chapaData.status !== 'success') {
      throw new Error(chapaData.message || 'Chapa initialization failed')
    }

    return new Response(
      JSON.stringify({ checkout_url: chapaData.data.checkout_url, tx_ref }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 })
  }
})
