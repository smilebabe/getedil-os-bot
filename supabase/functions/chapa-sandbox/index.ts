import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    const { amount, email, first_name, last_name, tx_ref, user_id } = await req.json()

    const response = await fetch("https://api.chapa.co/v1/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("CHAPA_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "ETB",
        email,
        first_name,
        last_name,
        tx_ref,
        callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/chapa-webhook`,
        return_url: "https://t.me/GETEDILOSBOT",
        "customization[title]": "Get'Edil Course",
        "customization[description]": "AI Engineering 101 - Full Access",
      }),
    })

    const data = await response.json()
    
    return new Response(JSON.stringify(data), { 
      headers: { "Content-Type": "application/json" },
      status: 200 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 })
  }
})